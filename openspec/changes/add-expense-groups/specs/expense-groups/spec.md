# Spec Delta

## Purpose

Let a small group of people record shared expenses and see, at any time, how much each member is owed or owes, with amounts that always add up to the cent.

## ADDED Requirements

### Requirement: Health check
The system SHALL expose `GET /health` for deployment smoke tests.

#### Scenario: Service is up
- **WHEN** a client sends `GET /health`
- **THEN** the response is `200` with JSON body `{"status":"ok"}`

### Requirement: Error responses
Every error response SHALL be an RFC 9457 `application/problem+json` object with a `type` URI identifying the problem, a `title`, and the numeric `status`, using exactly these values (`<docs>` is the API's problem documentation, `docs/problems.md`):

| Status | `type` | `title` | When | Extra field |
| ------ | ------ | ------- | ---- | ----------- |
| 404 | `<docs>#not-found` | `Not found` | no route matches the method and path | — |
| 413 | `<docs>#payload-too-large` | `Payload too large` | the body of a `POST` is larger than 16,384 bytes | — |
| 400 | `<docs>#malformed-json` | `Malformed JSON` | the body is not valid JSON | — |
| 400 | `<docs>#validation-failed` | `Validation failed` | the JSON violates a field rule | `errors`: list of `{path, message}` |
| 404 | `<docs>#group-not-found` | `Group not found` | the group ID does not exist | — |
| 422 | `<docs>#unknown-member` | `Unknown member` | `payer` or `splitAmong` names a non-member | `errors`: list of `{path, message}` |
| 409 | `<docs>#expense-limit-reached` | `Expense limit reached` | the group already has 500 expenses | — |

When a request has several problems, the first applicable row, in the table's order, SHALL decide the response: route matching first, then body size, JSON syntax, field validation, group lookup, member references, and the expense cap. An error SHALL NOT store anything.

#### Scenario: Malformed JSON
- **WHEN** a client posts `{"name":` to `POST /groups`
- **THEN** the response is `400` `application/problem+json` with `title` `"Malformed JSON"`

#### Scenario: Oversized body
- **WHEN** a request body is larger than 16,384 bytes, whether or not it sends a `Content-Length` header
- **THEN** the response is `413` with `title` `"Payload too large"` and nothing is stored

#### Scenario: Unknown route
- **WHEN** a client sends `GET /nope`
- **THEN** the response is `404` with `title` `"Not found"`

#### Scenario: Unknown route wins over a bad body
- **WHEN** a client sends `POST /nope` with the body `{`
- **THEN** the response is `404` with `title` `"Not found"`

#### Scenario: Wrong method on a known path
- **WHEN** a client sends `DELETE /groups/{id}`
- **THEN** the response is `404` with `title` `"Not found"`

#### Scenario: Validation runs before the group lookup
- **WHEN** a client posts an invalid expense body to a group ID that does not exist
- **THEN** the response is `400` with `title` `"Validation failed"`, not `404`

### Requirement: Create a group
The system SHALL create a group from a `name` (1–80 characters after trimming) and `members`, a list of 2–20 names (each 1–40 characters after trimming, unique ignoring case). It SHALL return `201` with the group object `{id, name, members, createdAt}`: `id` is an opaque string, `name` and `members` are the trimmed values in the order given, and `createdAt` is an ISO-8601 UTC timestamp.

#### Scenario: Valid group
- **WHEN** a client sends `POST /groups` with `{"name":" Lisbon trip ","members":["Asha","Ben","Chen"]}`
- **THEN** the response is `201` with a non-empty `id`, `name` `"Lisbon trip"`, `members` `["Asha","Ben","Chen"]`, and an ISO-8601 `createdAt`

#### Scenario: Too few or too many members
- **WHEN** `members` has 1 name, or 21 names
- **THEN** the response is `400` `"Validation failed"` with an `errors` entry whose `path` is `"members"`

#### Scenario: Duplicate member names
- **WHEN** two member names differ only by case or surrounding whitespace, such as `"Ben"` and `" ben "`
- **THEN** the response is `400` `"Validation failed"` with an `errors` entry whose `path` is `"members"`, and no group is created

#### Scenario: Blank or overlong names
- **WHEN** the group `name` is empty after trimming or longer than 80 characters, or a member name is empty after trimming (such as `"   "`) or longer than 40 characters
- **THEN** the response is `400` `"Validation failed"` with an `errors` entry whose `path` names the offending field (`"name"` or `"members.N"`)

### Requirement: Read a group
The system SHALL return the group object for an existing group ID.

#### Scenario: Existing group
- **WHEN** a client sends `GET /groups/{id}` for a group that exists
- **THEN** the response is `200` with the same `id`, `name`, `members`, and `createdAt` returned at creation

#### Scenario: Unknown group
- **WHEN** a client sends `GET /groups/{id}` for an ID that does not exist
- **THEN** the response is `404` with `title` `"Group not found"`

### Requirement: Record an expense
`POST /groups/{id}/expenses` SHALL record an expense from:
- `payer`: a member of the group
- `amountCents`: an integer from 1 to 10,000,000
- `description`: 1–200 characters after trimming
- `splitAmong` (optional): 1–20 distinct members; defaults to all members

`payer` and `splitAmong` names SHALL match members after trimming and ignoring case. Responses SHALL use the members' display names as stored.

The amount SHALL be split equally among the participants in whole cents. Any leftover cents SHALL go one each to the participants who come first in the group's member order, whatever order `splitAmong` lists them in. The shares SHALL always sum exactly to `amountCents`.

The response SHALL be `201` with the expense object `{id, payer, amountCents, description, createdAt, shares}`. `shares` is a list of `{member, cents}` in group member order.

A group SHALL hold at most 500 expenses.

#### Scenario: Even split across all members
- **WHEN** a client posts `{"payer":"Asha","amountCents":9000,"description":"Dinner"}` in a group with members Asha, Ben, Chen
- **THEN** the response is `201` with `payer` `"Asha"`, `amountCents` `9000`, `description` `"Dinner"`, a non-empty `id`, an ISO-8601 `createdAt`, and `shares` `[{"member":"Asha","cents":3000},{"member":"Ben","cents":3000},{"member":"Chen","cents":3000}]`

#### Scenario: Leftover cents are assigned deterministically
- **WHEN** the same group records an expense of `1000` cents split among all three members
- **THEN** the shares are `334`, `333`, `333` cents for Asha, Ben, Chen, summing to `1000`

#### Scenario: Split among a subset
- **WHEN** an expense of `5000` cents includes `"splitAmong":["Ben","Chen"]`
- **THEN** `shares` is `[{"member":"Ben","cents":2500},{"member":"Chen","cents":2500}]`

#### Scenario: Leftovers follow member order, not request order
- **WHEN** an expense of `1001` cents includes `"splitAmong":["Chen","Asha"]`
- **THEN** `shares` is `[{"member":"Asha","cents":501},{"member":"Chen","cents":500}]`

#### Scenario: Names match ignoring case and whitespace
- **WHEN** an expense of `700` cents has `"payer":" asha "` and `"splitAmong":["BEN"]`
- **THEN** the response is `201` with `payer` `"Asha"` and `shares` `[{"member":"Ben","cents":700}]`

#### Scenario: Payer is not a member
- **WHEN** `payer` is `"Zed"`, who is not in the group
- **THEN** the response is `422` `"Unknown member"` with an `errors` entry whose `path` is `"payer"`, and no expense is recorded

#### Scenario: Unknown participant
- **WHEN** `splitAmong` is `["Ben","Zed"]`
- **THEN** the response is `422` `"Unknown member"` with an `errors` entry whose `path` is `"splitAmong.1"`, and no expense is recorded

#### Scenario: Empty or duplicate participants
- **WHEN** `splitAmong` is `[]`, or `["Ben","ben"]`
- **THEN** the response is `400` `"Validation failed"` with an `errors` entry whose `path` is `"splitAmong"`

#### Scenario: Invalid amount
- **WHEN** `amountCents` is `0`, `-5`, `12.5`, `"100"`, or `10000001`
- **THEN** the response is `400` `"Validation failed"` with an `errors` entry whose `path` is `"amountCents"`

#### Scenario: Invalid description
- **WHEN** `description` is empty after trimming or longer than 200 characters
- **THEN** the response is `400` `"Validation failed"` with an `errors` entry whose `path` is `"description"`

#### Scenario: Expense for an unknown group
- **WHEN** a client posts a valid expense to a group ID that does not exist
- **THEN** the response is `404` with `title` `"Group not found"`

#### Scenario: Expense limit
- **WHEN** a group already has 500 expenses and a client posts another valid expense
- **THEN** the response is `409` with `title` `"Expense limit reached"` and no expense is recorded

### Requirement: List expenses
`GET /groups/{id}/expenses` SHALL return `200` with `{"expenses": [...]}`, containing the group's expense objects newest first — that is, in reverse order of recording, regardless of `createdAt` timestamps.

#### Scenario: Newest first
- **WHEN** a group has expenses "Taxi" then "Museum" recorded in that order, possibly within the same millisecond
- **THEN** the response is `200` with `expenses` ordered "Museum", "Taxi", each a full expense object including `shares`

#### Scenario: No expenses yet
- **WHEN** a group has no expenses
- **THEN** the response is `200` with `{"expenses":[]}`

#### Scenario: Unknown group
- **WHEN** a client sends `GET /groups/{id}/expenses` for an ID that does not exist
- **THEN** the response is `404` with `title` `"Group not found"`

### Requirement: Show balances
`GET /groups/{id}/balances` SHALL return `200` with `{"balances": [{member, netCents}, ...]}` in group member order. `netCents` is the total the member paid minus the total of their shares. A group's balances SHALL always sum to zero.

#### Scenario: Balances after two expenses
- **WHEN** in a group of Asha, Ben, Chen, Asha pays `9000` split among all, and Ben pays `3000` split among Ben and Chen
- **THEN** the response is `200` with `balances` `[{"member":"Asha","netCents":6000},{"member":"Ben","netCents":-1500},{"member":"Chen","netCents":-4500}]`

#### Scenario: New group
- **WHEN** a group has no expenses
- **THEN** every member's `netCents` is `0`

#### Scenario: Unknown group
- **WHEN** a client sends `GET /groups/{id}/balances` for an ID that does not exist
- **THEN** the response is `404` with `title` `"Group not found"`
