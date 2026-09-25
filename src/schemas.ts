import { z } from "zod";
import type { FieldError } from "./problems";

export const MAX_MEMBERS = 20;
export const MAX_EXPENSES_PER_GROUP = 500;
export const EXPENSES_PAGE_SIZE = 50;

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const memberName = trimmed(40);
// A reference to an existing member: any non-member, however long, is a 422, not a 400.
const memberRef = z.string().trim().min(1);

/**
 * Key used for matching and uniqueness: Unicode-normalized (so "José" typed as
 * one code point or as "e" + accent is the same name), trimmed, and lower-cased.
 */
export const nameKey = (name: string) => name.normalize("NFC").trim().toLowerCase();

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
	payer: memberRef,
	amountCents: z.number().int().min(1).max(10_000_000),
	description: trimmed(200),
	splitAmong: z
		.array(memberRef)
		.min(1)
		.max(MAX_MEMBERS)
		.refine(distinctIgnoringCase, "participants must be distinct, ignoring case")
		.optional(),
});

/** A list cursor: the ID of the last expense on the previous page (resolved within its group). */
export const cursorSchema = z.uuid("not a cursor issued by this API");

export type CreateGroup = z.infer<typeof createGroupSchema>;
export type CreateExpense = z.infer<typeof createExpenseSchema>;

export function fieldErrors(error: z.ZodError): FieldError[] {
	return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}
