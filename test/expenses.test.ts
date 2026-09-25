// Requirement: Record an expense · Requirement: List expenses (tasks 4.1, 4.2)
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { addExpense, api, createGroup, ISO_8601, problemPaths } from "./helpers";

const countExpenses = async () =>
	(await env.DB.prepare("SELECT COUNT(*) AS n FROM expenses").first<{ n: number }>())?.n ?? 0;
const countShares = async () =>
	(await env.DB.prepare("SELECT COUNT(*) AS n FROM expense_shares").first<{ n: number }>())?.n ?? 0;

describe("Record an expense", () => {
	it("Even split across all members", async () => {
		const g = await createGroup();
		const res = await addExpense(g.id, { payer: "Asha", amountCents: 9000, description: "Dinner" });
		expect(res.status).toBe(201);
		expect(res.json).toMatchObject({ payer: "Asha", amountCents: 9000, description: "Dinner" });
		expect(res.json?.id).toEqual(expect.any(String));
		expect(res.json?.id).not.toBe("");
		expect(res.json?.createdAt).toMatch(ISO_8601);
		expect(Object.keys(res.json ?? {}).sort()).toEqual([
			"amountCents",
			"createdAt",
			"description",
			"id",
			"payer",
			"shares",
		]);
		expect(res.json?.shares).toEqual([
			{ member: "Asha", cents: 3000 },
			{ member: "Ben", cents: 3000 },
			{ member: "Chen", cents: 3000 },
		]);
	});

	it("Leftover cents are assigned deterministically", async () => {
		const g = await createGroup();
		const res = await addExpense(g.id, { payer: "Ben", amountCents: 1000, description: "Snacks" });
		expect(res.json?.shares).toEqual([
			{ member: "Asha", cents: 334 },
			{ member: "Ben", cents: 333 },
			{ member: "Chen", cents: 333 },
		]);
	});

	it("Split among a subset", async () => {
		const g = await createGroup();
		const res = await addExpense(g.id, {
			payer: "Asha",
			amountCents: 5000,
			description: "Museum",
			splitAmong: ["Ben", "Chen"],
		});
		expect(res.status).toBe(201);
		expect(res.json?.shares).toEqual([
			{ member: "Ben", cents: 2500 },
			{ member: "Chen", cents: 2500 },
		]);
	});

	it("Leftovers follow member order, not request order", async () => {
		const g = await createGroup();
		const res = await addExpense(g.id, {
			payer: "Ben",
			amountCents: 1001,
			description: "Tickets",
			splitAmong: ["Chen", "Asha"],
		});
		expect(res.json?.shares).toEqual([
			{ member: "Asha", cents: 501 },
			{ member: "Chen", cents: 500 },
		]);
	});

	it("Names match ignoring case and whitespace", async () => {
		const g = await createGroup();
		const res = await addExpense(g.id, {
			payer: " asha ",
			amountCents: 700,
			description: "Coffee",
			splitAmong: ["BEN"],
		});
		expect(res.status).toBe(201);
		expect(res.json?.payer).toBe("Asha");
		expect(res.json?.shares).toEqual([{ member: "Ben", cents: 700 }]);
	});

	it("Payer is not a member", async () => {
		const g = await createGroup();
		const res = await addExpense(g.id, { payer: "Zed", amountCents: 100, description: "x" });
		expect(res.status).toBe(422);
		expect(res.json).toMatchObject({ title: "Unknown member", status: 422 });
		expect(problemPaths(res.json)).toEqual(["payer"]);
		expect(await countExpenses()).toBe(0);
	});

	it("a non-member name of any length is an unknown member, not a validation error", async () => {
		const g = await createGroup();
		const res = await addExpense(g.id, {
			payer: "Z".repeat(41),
			amountCents: 100,
			description: "x",
		});
		expect(res.status).toBe(422);
		expect(problemPaths(res.json)).toEqual(["payer"]);
		expect(JSON.stringify(res.json)).not.toContain("Z".repeat(41)); // input is not echoed back
	});

	it("Unknown participant", async () => {
		const g = await createGroup();
		const res = await addExpense(g.id, {
			payer: "Asha",
			amountCents: 100,
			description: "x",
			splitAmong: ["Ben", "Zed"],
		});
		expect(res.status).toBe(422);
		expect(res.json).toMatchObject({ title: "Unknown member", status: 422 });
		expect(problemPaths(res.json)).toEqual(["splitAmong.1"]);
		expect(await countExpenses()).toBe(0);
		expect(await countShares()).toBe(0);
	});

	it.each([
		["empty list", []],
		["duplicate ignoring case", ["Ben", "ben"]],
	])("Empty or duplicate participants: %s", async (_label, splitAmong) => {
		const g = await createGroup();
		const res = await addExpense(g.id, {
			payer: "Asha",
			amountCents: 100,
			description: "x",
			splitAmong,
		});
		expect(res.status).toBe(400);
		expect(res.json).toMatchObject({ title: "Validation failed", status: 400 });
		expect(problemPaths(res.json)).toContain("splitAmong");
		expect(await countExpenses()).toBe(0);
	});

	it.each([0, -5, 12.5, "100", 10_000_001])("Invalid amount: %s", async (amountCents) => {
		const g = await createGroup();
		const res = await addExpense(g.id, { payer: "Asha", amountCents, description: "x" });
		expect(res.status).toBe(400);
		expect(res.json).toMatchObject({ title: "Validation failed", status: 400 });
		expect(problemPaths(res.json)).toContain("amountCents");
	});

	it("accepts the largest allowed amount", async () => {
		const g = await createGroup();
		const res = await addExpense(g.id, {
			payer: "Asha",
			amountCents: 10_000_000,
			description: "Car",
		});
		expect(res.status).toBe(201);
	});

	it.each([
		["empty", "   "],
		["201 characters", "x".repeat(201)],
	])("Invalid description: %s", async (_label, description) => {
		const g = await createGroup();
		const res = await addExpense(g.id, { payer: "Asha", amountCents: 100, description });
		expect(res.status).toBe(400);
		expect(res.json).toMatchObject({ title: "Validation failed", status: 400 });
		expect(problemPaths(res.json)).toContain("description");
	});

	it("Expense for an unknown group", async () => {
		const res = await addExpense("does-not-exist", {
			payer: "Asha",
			amountCents: 100,
			description: "x",
		});
		expect(res.status).toBe(404);
		expect(res.json).toMatchObject({ title: "Group not found" });
	});

	it("Expense limit", async () => {
		const g = await createGroup();
		// Seed 500 expenses straight into D1 — this scenario is about the cap, not the API.
		const seed = env.DB.prepare(
			"INSERT INTO expenses (id, group_id, payer_key, amount_cents, description, created_at) VALUES (?, ?, 'asha', 1, 'seed', '2026-01-01T00:00:00.000Z')",
		);
		await env.DB.batch(Array.from({ length: 500 }, () => seed.bind(crypto.randomUUID(), g.id)));

		const res = await addExpense(g.id, {
			payer: "Asha",
			amountCents: 100,
			description: "One too many",
		});
		expect(res.status).toBe(409);
		expect(res.json).toMatchObject({ title: "Expense limit reached", status: 409 });
		expect(await countExpenses()).toBe(500);
		expect(await countShares()).toBe(0);
	});

	it("reports an unknown member before the expense limit (422 before 409)", async () => {
		const g = await createGroup();
		const seed = env.DB.prepare(
			"INSERT INTO expenses (id, group_id, payer_key, amount_cents, description, created_at) VALUES (?, ?, 'asha', 1, 'seed', '2026-01-01T00:00:00.000Z')",
		);
		await env.DB.batch(Array.from({ length: 500 }, () => seed.bind(crypto.randomUUID(), g.id)));
		const res = await addExpense(g.id, { payer: "Zed", amountCents: 100, description: "x" });
		expect(res.status).toBe(422);
	});

	it("allows the 500th expense", async () => {
		const g = await createGroup();
		const seed = env.DB.prepare(
			"INSERT INTO expenses (id, group_id, payer_key, amount_cents, description, created_at) VALUES (?, ?, 'asha', 1, 'seed', '2026-01-01T00:00:00.000Z')",
		);
		await env.DB.batch(Array.from({ length: 499 }, () => seed.bind(crypto.randomUUID(), g.id)));
		const res = await addExpense(g.id, {
			payer: "Asha",
			amountCents: 100,
			description: "The 500th",
		});
		expect(res.status).toBe(201);
	});
});

describe("List expenses", () => {
	it("Newest first", async () => {
		const g = await createGroup();
		const taxi = await addExpense(g.id, { payer: "Asha", amountCents: 1200, description: "Taxi" });
		const museum = await addExpense(g.id, {
			payer: "Ben",
			amountCents: 3000,
			description: "Museum",
			splitAmong: ["Ben", "Chen"],
		});
		const res = await api("GET", `/groups/${g.id}/expenses`);
		expect(res.status).toBe(200);
		// Each listed expense is exactly what was returned when it was recorded.
		expect(res.json).toEqual({ expenses: [museum.json, taxi.json], nextCursor: null });
	});

	it("orders by recording, even when timestamps are equal or out of order", async () => {
		const g = await createGroup();
		const insert = env.DB.prepare(
			"INSERT INTO expenses (id, group_id, payer_key, amount_cents, description, created_at) VALUES (?, ?, 'asha', 1, ?, ?)",
		);
		// Recorded first but stamped *later* (a clock running ahead), then two with the same timestamp.
		await insert.bind(crypto.randomUUID(), g.id, "first", "2026-01-01T00:00:09.000Z").run();
		await insert.bind(crypto.randomUUID(), g.id, "second", "2026-01-01T00:00:01.000Z").run();
		await insert.bind(crypto.randomUUID(), g.id, "third", "2026-01-01T00:00:01.000Z").run();
		const res = await api("GET", `/groups/${g.id}/expenses`);
		const names = ((res.json?.expenses ?? []) as { description: string }[]).map(
			(e) => e.description,
		);
		expect(names).toEqual(["third", "second", "first"]);
	});

	it("Pages of 50", async () => {
		const g = await createGroup();
		const insert = env.DB.prepare(
			"INSERT INTO expenses (id, group_id, payer_key, amount_cents, description, created_at) VALUES (?, ?, 'asha', 1, ?, '2026-01-01T00:00:00.000Z')",
		);
		await env.DB.batch(
			Array.from({ length: 120 }, (_, i) => insert.bind(crypto.randomUUID(), g.id, `e${i}`)),
		);

		const pages: string[][] = [];
		let cursor: string | null = null;
		do {
			const query: string = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
			const res = await api("GET", `/groups/${g.id}/expenses${query}`);
			expect(res.status).toBe(200);
			pages.push(
				((res.json?.expenses ?? []) as { description: string }[]).map((e) => e.description),
			);
			cursor = res.json?.nextCursor as string | null;
		} while (cursor !== null && pages.length < 10);

		expect(pages.map((p) => p.length)).toEqual([50, 50, 20]);
		expect(pages.flat()).toEqual(Array.from({ length: 120 }, (_, i) => `e${119 - i}`));
	});

	it.each(["abc", "12.5", "-3", "0", "", "1"])("Invalid cursor (malformed): %j", async (cursor) => {
		const g = await createGroup();
		const res = await api("GET", `/groups/${g.id}/expenses?cursor=${encodeURIComponent(cursor)}`);
		expect(res.status).toBe(400);
		expect(res.json).toMatchObject({ title: "Validation failed", status: 400 });
		expect(problemPaths(res.json)).toEqual(["cursor"]);
	});

	it("validates the cursor before looking up the group", async () => {
		const res = await api("GET", "/groups/does-not-exist/expenses?cursor=abc");
		expect(res.status).toBe(400);
		expect(res.json).toMatchObject({ title: "Validation failed" });
		expect(problemPaths(res.json)).toEqual(["cursor"]);
	});

	it("Invalid cursor: well-formed but from another group, or unknown", async () => {
		const a = await createGroup();
		const b = await createGroup(["Asha", "Ben"], "Other");
		const other = await addExpense(b.id, { payer: "Asha", amountCents: 100, description: "B's" });
		for (const cursor of [other.json?.id as string, crypto.randomUUID()]) {
			const res = await api("GET", `/groups/${a.id}/expenses?cursor=${cursor}`);
			expect(res.status).toBe(400);
			expect(problemPaths(res.json)).toEqual(["cursor"]);
		}
	});

	it("Exactly one full page", async () => {
		const g = await createGroup();
		const insert = env.DB.prepare(
			"INSERT INTO expenses (id, group_id, payer_key, amount_cents, description, created_at) VALUES (?, ?, 'asha', 1, 'x', '2026-01-01T00:00:00.000Z')",
		);
		await env.DB.batch(Array.from({ length: 50 }, () => insert.bind(crypto.randomUUID(), g.id)));
		const res = await api("GET", `/groups/${g.id}/expenses`);
		expect(res.json?.expenses).toHaveLength(50);
		expect(res.json?.nextCursor).toBeNull();
	});

	it("keeps each expense's shares intact across a page boundary", async () => {
		const g = await createGroup();
		const recorded = [];
		for (let i = 0; i < 51; i++) {
			const res = await addExpense(g.id, {
				payer: "Asha",
				amountCents: 1000 + i,
				description: `e${i}`,
			});
			recorded.push(res.json);
		}
		const first = await api("GET", `/groups/${g.id}/expenses`);
		const cursor = first.json?.nextCursor as string;
		expect(cursor).toBe(recorded[1]?.id); // the 50th newest is the second one recorded
		const second = await api("GET", `/groups/${g.id}/expenses?cursor=${cursor}`);
		expect(first.json?.expenses).toEqual(recorded.slice(1).reverse());
		expect(second.json).toEqual({ expenses: [recorded[0]], nextCursor: null });
	});

	it("No expenses yet", async () => {
		const g = await createGroup();
		const res = await api("GET", `/groups/${g.id}/expenses`);
		expect(res.status).toBe(200);
		expect(res.json).toEqual({ expenses: [], nextCursor: null });
	});

	it("Unknown group", async () => {
		const res = await api("GET", "/groups/does-not-exist/expenses");
		expect(res.status).toBe(404);
		expect(res.json).toMatchObject({ title: "Group not found" });
	});

	it("never mixes in another group's expenses", async () => {
		const a = await createGroup();
		const b = await createGroup(["Asha", "Ben"], "Other");
		await addExpense(a.id, { payer: "Asha", amountCents: 100, description: "A's" });
		await addExpense(b.id, { payer: "Asha", amountCents: 100, description: "B's" });
		const res = await api("GET", `/groups/${a.id}/expenses`);
		expect(
			((res.json?.expenses ?? []) as { description: string }[]).map((e) => e.description),
		).toEqual(["A's"]);
	});
});
