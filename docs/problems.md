# Problem types

Every error from the Split API is an [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) `application/problem+json` object:

```json
{
  "type": "https://github.com/gsaini/adlc-getting-started/blob/main/docs/problems.md#unknown-member",
  "title": "Unknown member",
  "status": 422,
  "errors": [{ "path": "splitAmong.1", "message": "\"Zed\" is not a member" }]
}
```

Match on `type` (or `title`); it never changes for a given problem. When a request has several problems, the first one in this list wins.

## not-found
**404 · Not found** — no route matches the method and path (a wrong method on a known path is also `404`).

## payload-too-large
**413 · Payload too large** — the body of a `POST` is larger than 16,384 bytes, with or without a `Content-Length` header.

## malformed-json
**400 · Malformed JSON** — the body is not valid JSON.

## validation-failed
**400 · Validation failed** — the JSON breaks a field rule. `errors` lists each problem with a dotted `path` (`name`, `members`, `members.2`, `amountCents`, `splitAmong`, …).

## group-not-found
**404 · Group not found** — the group ID in the path does not exist.

## unknown-member
**422 · Unknown member** — `payer` or an entry of `splitAmong` is not a member of the group. `errors` names each one (`payer`, `splitAmong.1`, …). Names match ignoring case and surrounding whitespace.

## expense-limit-reached
**409 · Expense limit reached** — the group already holds 500 expenses.

## internal-error
**500 · Internal error** — something failed on our side. The response never includes internal details; the cause is in Workers Logs.
