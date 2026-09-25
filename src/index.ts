import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { z } from "zod";
import { PROBLEMS, problem } from "./problems";
import { balances, cursorSeq, findGroup, insertExpense, insertGroup, listExpenses } from "./repo";
import {
	createExpenseSchema,
	createGroupSchema,
	cursorSchema,
	fieldErrors,
	nameKey,
} from "./schemas";
import { splitEqually } from "./split";

const app = new Hono<{ Bindings: Env }>();

// Deliberately doesn't echo the submitted name back to the client.
const NOT_A_MEMBER = "not a member of this group";

// Only routes that take a body get the limit; unmatched routes fall straight through to 404.
const limitBody = bodyLimit({
	maxSize: 16_384,
	onError: (c) => problem(c, PROBLEMS.payloadTooLarge),
});

/** Parse and validate a JSON body: 400 Malformed JSON, then 400 Validation failed. */
async function readBody<T extends z.ZodType>(
	req: Request,
	schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; malformed: boolean; error?: z.ZodError }> {
	let json: unknown;
	try {
		json = JSON.parse(await req.text());
	} catch {
		return { ok: false, malformed: true };
	}
	const parsed = schema.safeParse(json);
	return parsed.success
		? { ok: true, data: parsed.data }
		: { ok: false, malformed: false, error: parsed.error };
}

app.get("/health", (c) => c.json({ status: "ok" }));

app.post("/groups", limitBody, async (c) => {
	const body = await readBody(c.req.raw, createGroupSchema);
	if (!body.ok) {
		return body.malformed
			? problem(c, PROBLEMS.malformedJson)
			: problem(c, PROBLEMS.validationFailed, body.error && fieldErrors(body.error));
	}
	const group = await insertGroup(c.env.DB, body.data.name, body.data.members);
	return c.json(group, 201);
});

app.get("/groups/:groupId", async (c) => {
	const group = await findGroup(c.env.DB, c.req.param("groupId"));
	return group ? c.json(group) : problem(c, PROBLEMS.groupNotFound);
});

app.post("/groups/:groupId/expenses", limitBody, async (c) => {
	const body = await readBody(c.req.raw, createExpenseSchema);
	if (!body.ok) {
		return body.malformed
			? problem(c, PROBLEMS.malformedJson)
			: problem(c, PROBLEMS.validationFailed, body.error && fieldErrors(body.error));
	}
	const group = await findGroup(c.env.DB, c.req.param("groupId"));
	if (!group) return problem(c, PROBLEMS.groupNotFound);

	// Resolve names to members, ignoring case and whitespace; respond with display names.
	const byKey = new Map(group.members.map((m) => [nameKey(m), m]));
	const { payer, amountCents, description, splitAmong } = body.data;
	const unknown = [
		...(byKey.has(nameKey(payer)) ? [] : [{ path: "payer", message: NOT_A_MEMBER }]),
		...(splitAmong ?? []).flatMap((name, i) =>
			byKey.has(nameKey(name)) ? [] : [{ path: `splitAmong.${i}`, message: NOT_A_MEMBER }],
		),
	];
	if (unknown.length > 0) return problem(c, PROBLEMS.unknownMember, unknown);

	// Participants in group member order, whatever order the request listed them in.
	const chosen = new Set((splitAmong ?? group.members).map(nameKey));
	const participants = group.members.filter((m) => chosen.has(nameKey(m)));
	const shares = splitEqually(amountCents, participants);

	const payerName = byKey.get(nameKey(payer)) ?? payer;
	const expense = await insertExpense(c.env.DB, group, payerName, amountCents, description, shares);
	return expense ? c.json(expense, 201) : problem(c, PROBLEMS.expenseLimitReached);
});

app.get("/groups/:groupId/expenses", async (c) => {
	const invalidCursor = () =>
		problem(c, PROBLEMS.validationFailed, [
			{ path: "cursor", message: "not a cursor issued by this API" },
		]);

	// Malformed cursors are rejected before touching D1 (400 before 404, like request bodies).
	const raw = c.req.query("cursor");
	if (raw !== undefined && !cursorSchema.safeParse(raw).success) return invalidCursor();

	const id = c.req.param("groupId");
	if (!(await findGroup(c.env.DB, id))) return problem(c, PROBLEMS.groupNotFound);

	// A well-formed cursor must belong to this group.
	let afterSeq: number | null = null;
	if (raw !== undefined) {
		afterSeq = await cursorSeq(c.env.DB, id, raw);
		if (afterSeq === null) return invalidCursor();
	}
	return c.json(await listExpenses(c.env.DB, id, afterSeq));
});

app.get("/groups/:groupId/balances", async (c) => {
	const id = c.req.param("groupId");
	if (!(await findGroup(c.env.DB, id))) return problem(c, PROBLEMS.groupNotFound);
	return c.json({ balances: await balances(c.env.DB, id) });
});

app.notFound((c) => problem(c, PROBLEMS.notFound));

app.onError((err, c) => {
	console.error(err); // Workers Logs; the client gets no internals
	return problem(c, PROBLEMS.internalError);
});

export default app;
