import { z } from "zod";
import type { FieldError } from "./problems";

export const MAX_MEMBERS = 20;
export const MAX_EXPENSES_PER_GROUP = 500;

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const memberName = trimmed(40);

/** Case-insensitive key used for matching and uniqueness. */
export const nameKey = (name: string) => name.trim().toLowerCase();

const distinctIgnoringCase = (names: string[]) => new Set(names.map(nameKey)).size === names.length;

export const createGroupSchema = z.object({
	name: trimmed(80),
	members: z
		.array(memberName)
		.min(2)
		.max(MAX_MEMBERS)
		.refine(distinctIgnoringCase, "member names must be unique, ignoring case"),
});

export const createExpenseSchema = z.object({
	payer: memberName,
	amountCents: z.number().int().min(1).max(10_000_000),
	description: trimmed(200),
	splitAmong: z
		.array(memberName)
		.min(1)
		.max(MAX_MEMBERS)
		.refine(distinctIgnoringCase, "participants must be distinct, ignoring case")
		.optional(),
});

export type CreateGroup = z.infer<typeof createGroupSchema>;
export type CreateExpense = z.infer<typeof createExpenseSchema>;

export function fieldErrors(error: z.ZodError): FieldError[] {
	return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}
