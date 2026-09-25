import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

// Every problem type is documented in docs/problems.md (RFC 9457 `type` URIs).
// Forks: point this at your own copy.
const DOCS = "https://github.com/gsaini/adlc-getting-started/blob/main/docs/problems.md";

export type FieldError = { path: string; message: string };

type Problem = { slug: string; title: string; status: ContentfulStatusCode };

export const PROBLEMS = {
	notFound: { slug: "not-found", title: "Not found", status: 404 },
	payloadTooLarge: { slug: "payload-too-large", title: "Payload too large", status: 413 },
	malformedJson: { slug: "malformed-json", title: "Malformed JSON", status: 400 },
	validationFailed: { slug: "validation-failed", title: "Validation failed", status: 400 },
	groupNotFound: { slug: "group-not-found", title: "Group not found", status: 404 },
	unknownMember: { slug: "unknown-member", title: "Unknown member", status: 422 },
	expenseLimitReached: {
		slug: "expense-limit-reached",
		title: "Expense limit reached",
		status: 409,
	},
	internalError: { slug: "internal-error", title: "Internal error", status: 500 },
} as const satisfies Record<string, Problem>;

export function problem(c: Context, p: Problem, errors?: FieldError[]): Response {
	const body = {
		type: `${DOCS}#${p.slug}`,
		title: p.title,
		status: p.status,
		...(errors ? { errors } : {}),
	};
	return c.body(JSON.stringify(body), p.status, { "content-type": "application/problem+json" });
}
