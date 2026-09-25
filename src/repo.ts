// All D1 access. Every query uses bound parameters and is bounded by a group's caps.
import { MAX_EXPENSES_PER_GROUP, nameKey } from "./schemas";
import type { Share } from "./split";

export type Group = { id: string; name: string; members: string[]; createdAt: string };
export type Expense = {
	id: string;
	payer: string;
	amountCents: number;
	description: string;
	createdAt: string;
	shares: Share[];
};

export async function insertGroup(db: D1Database, name: string, members: string[]): Promise<Group> {
	const group: Group = {
		id: crypto.randomUUID(),
		name,
		members,
		createdAt: new Date().toISOString(),
	};
	const addMember = db.prepare(
		"INSERT INTO members (group_id, name_key, name, position) VALUES (?, ?, ?, ?)",
	);
	await db.batch([
		db
			.prepare("INSERT INTO groups (id, name, created_at) VALUES (?, ?, ?)")
			.bind(group.id, name, group.createdAt),
		...members.map((member, position) =>
			addMember.bind(group.id, nameKey(member), member, position),
		),
	]);
	return group;
}

export async function findGroup(db: D1Database, id: string): Promise<Group | null> {
	const [groupRows, memberRows] = await db.batch([
		db.prepare("SELECT id, name, created_at FROM groups WHERE id = ?").bind(id),
		db.prepare("SELECT name FROM members WHERE group_id = ? ORDER BY position").bind(id),
	]);
	const row = groupRows?.results[0] as { id: string; name: string; created_at: string } | undefined;
	if (!row) return null;
	const members = ((memberRows?.results ?? []) as { name: string }[]).map((m) => m.name);
	return { id: row.id, name: row.name, members, createdAt: row.created_at };
}

/**
 * Writes the expense and its shares in one transaction. The 500-expense cap is
 * checked inside the same batch, so concurrent requests can't both slip past
 * it. Returns null (and writes nothing) when the group is full.
 */
export async function insertExpense(
	db: D1Database,
	group: Group,
	payer: string,
	amountCents: number,
	description: string,
	shares: Share[],
): Promise<Expense | null> {
	const expense: Expense = {
		id: crypto.randomUUID(),
		payer,
		amountCents,
		description,
		createdAt: new Date().toISOString(),
		shares,
	};
	const addShare = db.prepare(
		`INSERT INTO expense_shares (expense_id, group_id, member_key, cents)
		 SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM expenses WHERE id = ?1)`,
	);
	const [inserted] = await db.batch([
		db
			.prepare(
				`INSERT INTO expenses (id, group_id, payer_key, amount_cents, description, created_at)
				 SELECT ?1, ?2, ?3, ?4, ?5, ?6
				 WHERE (SELECT COUNT(*) FROM expenses WHERE group_id = ?2) < ?7`,
			)
			.bind(
				expense.id,
				group.id,
				nameKey(payer),
				amountCents,
				description,
				expense.createdAt,
				MAX_EXPENSES_PER_GROUP,
			),
		...shares.map((s) => addShare.bind(expense.id, group.id, nameKey(s.member), s.cents)),
	]);
	return inserted?.meta.changes === 1 ? expense : null;
}

export async function listExpenses(db: D1Database, groupId: string): Promise<Expense[]> {
	// Shares are reached through their expense (primary-key prefix), never by scanning shares.
	const [expenseRows, shareRows] = await db.batch([
		db
			.prepare(
				`SELECT e.id, m.name AS payer, e.amount_cents, e.description, e.created_at
				 FROM expenses e JOIN members m ON m.group_id = e.group_id AND m.name_key = e.payer_key
				 WHERE e.group_id = ? ORDER BY e.rowid DESC`,
			)
			.bind(groupId),
		db
			.prepare(
				`SELECT s.expense_id, m.name AS member, s.cents
				 FROM expenses e
				 JOIN expense_shares s ON s.expense_id = e.id
				 JOIN members m ON m.group_id = s.group_id AND m.name_key = s.member_key
				 WHERE e.group_id = ? ORDER BY m.position`,
			)
			.bind(groupId),
	]);

	const sharesByExpense = new Map<string, Share[]>();
	for (const s of (shareRows?.results ?? []) as {
		expense_id: string;
		member: string;
		cents: number;
	}[]) {
		const list = sharesByExpense.get(s.expense_id) ?? [];
		list.push({ member: s.member, cents: s.cents });
		sharesByExpense.set(s.expense_id, list);
	}
	type Row = {
		id: string;
		payer: string;
		amount_cents: number;
		description: string;
		created_at: string;
	};
	return ((expenseRows?.results ?? []) as Row[]).map((e) => ({
		id: e.id,
		payer: e.payer,
		amountCents: e.amount_cents,
		description: e.description,
		createdAt: e.created_at,
		shares: sharesByExpense.get(e.id) ?? [],
	}));
}

export async function balances(
	db: D1Database,
	groupId: string,
): Promise<{ member: string; netCents: number }[]> {
	const { results } = await db
		.prepare(
			`SELECT m.name AS member, COALESCE(p.paid, 0) - COALESCE(o.owed, 0) AS net_cents
			 FROM members m
			 LEFT JOIN (SELECT payer_key AS k, SUM(amount_cents) AS paid
			            FROM expenses WHERE group_id = ?1 GROUP BY payer_key) p ON p.k = m.name_key
			 LEFT JOIN (SELECT s.member_key AS k, SUM(s.cents) AS owed
			            FROM expenses e JOIN expense_shares s ON s.expense_id = e.id
			            WHERE e.group_id = ?1 GROUP BY s.member_key) o ON o.k = m.name_key
			 WHERE m.group_id = ?1
			 ORDER BY m.position`,
		)
		.bind(groupId)
		.all<{ member: string; net_cents: number }>();
	return results.map((r) => ({ member: r.member, netCents: r.net_cents }));
}
