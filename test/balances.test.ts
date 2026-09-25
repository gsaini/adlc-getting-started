// Requirement: Show balances (task 5.1)
import { describe, expect, it } from "vitest";
import { addExpense, api, createGroup } from "./helpers";

describe("Show balances", () => {
	it("Balances after two expenses", async () => {
		const g = await createGroup();
		await addExpense(g.id, { payer: "Asha", amountCents: 9000, description: "Dinner" });
		await addExpense(g.id, {
			payer: "Ben",
			amountCents: 3000,
			description: "Taxi",
			splitAmong: ["Ben", "Chen"],
		});
		const res = await api("GET", `/groups/${g.id}/balances`);
		expect(res.status).toBe(200);
		expect(res.json).toEqual({
			balances: [
				{ member: "Asha", netCents: 6000 },
				{ member: "Ben", netCents: -1500 },
				{ member: "Chen", netCents: -4500 },
			],
		});
	});

	it("New group", async () => {
		const g = await createGroup();
		const res = await api("GET", `/groups/${g.id}/balances`);
		expect(res.json).toEqual({
			balances: [
				{ member: "Asha", netCents: 0 },
				{ member: "Ben", netCents: 0 },
				{ member: "Chen", netCents: 0 },
			],
		});
	});

	it("Unknown group", async () => {
		const res = await api("GET", "/groups/does-not-exist/balances");
		expect(res.status).toBe(404);
		expect(res.json).toMatchObject({ title: "Group not found" });
	});

	it("always sums to zero after many random expenses", async () => {
		const members = ["Asha", "Ben", "Chen", "Dev", "Eli"];
		const g = await createGroup(members);
		let seed = 7;
		const next = () => {
			seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
			return seed;
		};
		for (let i = 0; i < 40; i++) {
			const splitAmong = members.filter(() => next() % 2 === 0);
			const res = await addExpense(g.id, {
				payer: members[next() % members.length],
				amountCents: 1 + (next() % 50_000),
				description: `e${i}`,
				...(splitAmong.length > 0 ? { splitAmong } : {}),
			});
			expect(res.status).toBe(201);
		}
		const res = await api("GET", `/groups/${g.id}/balances`);
		const balances = res.json?.balances as { netCents: number }[];
		expect(balances.reduce((sum, b) => sum + b.netCents, 0)).toBe(0);
	});
});
