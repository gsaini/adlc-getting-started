// Task 1.1 — the database itself enforces the data model.
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

async function seedTwoGroups() {
	await env.DB.batch([
		env.DB.prepare(
			"INSERT INTO groups (id, name, created_at) VALUES ('g1', 'One', 'now'), ('g2', 'Two', 'now')",
		),
		env.DB.prepare(
			"INSERT INTO members (group_id, name_key, name, position) VALUES ('g1', 'asha', 'Asha', 0), ('g2', 'zed', 'Zed', 0)",
		),
		env.DB.prepare(
			"INSERT INTO expenses (id, group_id, payer_key, amount_cents, description, created_at) VALUES ('e1', 'g1', 'asha', 100, 'x', 'now')",
		),
	]);
}

describe("migration 0001", () => {
	it("rejects a share whose member is not in the group", async () => {
		await seedTwoGroups();
		const insert = env.DB.prepare(
			"INSERT INTO expense_shares (expense_id, group_id, member_key, cents) VALUES ('e1', 'g1', 'nobody', 100)",
		);
		await expect(insert.run()).rejects.toThrow(/FOREIGN KEY/i);
	});

	it("rejects a share that mixes one group's expense with another group's member", async () => {
		await seedTwoGroups();
		// Claim group g2 so the member key 'zed' resolves — the expense e1 belongs to g1.
		const insert = env.DB.prepare(
			"INSERT INTO expense_shares (expense_id, group_id, member_key, cents) VALUES ('e1', 'g2', 'zed', 100)",
		);
		await expect(insert.run()).rejects.toThrow(/FOREIGN KEY/i);
	});

	it("rejects a payer from another group", async () => {
		await seedTwoGroups();
		const insert = env.DB.prepare(
			"INSERT INTO expenses (id, group_id, payer_key, amount_cents, description, created_at) VALUES ('e2', 'g1', 'zed', 100, 'x', 'now')",
		);
		await expect(insert.run()).rejects.toThrow(/FOREIGN KEY/i);
	});

	it("rejects amounts outside 1..10,000,000 cents", async () => {
		await seedTwoGroups();
		const insert = (cents: number) =>
			env.DB.prepare(
				"INSERT INTO expenses (id, group_id, payer_key, amount_cents, description, created_at) VALUES (?, 'g1', 'asha', ?, 'x', 'now')",
			)
				.bind(crypto.randomUUID(), cents)
				.run();
		await expect(insert(0)).rejects.toThrow(/CHECK/i);
		await expect(insert(10_000_001)).rejects.toThrow(/CHECK/i);
	});
});
