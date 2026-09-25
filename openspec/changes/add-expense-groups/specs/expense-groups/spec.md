# Spec Delta

## Purpose

Let a small group of people record shared expenses and see, at any time, how much each member is owed or owes, with amounts that always add up to the cent.

## ADDED Requirements

### Requirement: Health check
The system SHALL expose `GET /health` for deployment smoke tests.

#### Scenario: Service is up
- **WHEN** a client sends `GET /health`
- **THEN** the response is `200` with JSON body `{"status":"ok"}`

### Requirement: Create a group
The system SHALL create a group from a name (1–80 characters after trimming) and 2–20 member names (each 1–40 characters after trimming, unique ignoring case), and return it with a generated ID. Members keep the order in which they were given.

#### Scenario: Valid group
- **WHEN** a client sends `POST /groups` with `{"name":"Lisbon trip","members":["Asha","Ben","Chen"]}`
- **THEN** the response is `201` with a JSON body containing a non-empty `id`, `name` `"Lisbon trip"`, `members` `["Asha","Ben","Chen"]`, and an ISO-8601 `createdAt`

#### Scenario: Too few members
- **WHEN** the `members` list has fewer than 2 names
- **THEN** the response is `400` `application/problem+json` with `title` `"Validation failed"` and an `errors` list naming the `members` field

#### Scenario: Duplicate member names
- **WHEN** two member names differ only by case or surrounding whitespace, such as `"Ben"` and `" ben "`
- **THEN** the response is `400` `application/problem+json` and no group is created

### Requirement: Read a group
The system SHALL return a group by ID.

#### Scenario: Existing group
- **WHEN** a client sends `GET /groups/{id}` for a group that exists
- **THEN** the response is `200` with the same `id`, `name`, `members`, and `createdAt` returned at creation

#### Scenario: Unknown group
- **WHEN** a client sends `GET /groups/{id}` for an ID that does not exist
- **THEN** the response is `404` `application/problem+json` with `title` `"Group not found"`

### Requirement: Record an expense
The system SHALL record an expense with a `payer` who is a member, a positive integer `amountCents` no larger than 10,000,000, a `description` of 1–200 characters after trimming, and an optional `splitAmong` list of distinct members (default: all members). The amount SHALL be split equally among the participants in whole cents; when it does not divide evenly, the leftover cents go one each to the first participants in the group's member order, so the shares always sum exactly to `amountCents`.

#### Scenario: Even split across all members
- **WHEN** a client posts `{"payer":"Asha","amountCents":9000,"description":"Dinner"}` to `POST /groups/{id}/expenses` in a group with members Asha, Ben, Chen
- **THEN** the response is `201` and `shares` is `[{"member":"Asha","cents":3000},{"member":"Ben","cents":3000},{"member":"Chen","cents":3000}]`

#### Scenario: Leftover cents are assigned deterministically
- **WHEN** the same group records an expense of `1000` cents split among all three members
- **THEN** the shares are `334`, `333`, `333` cents for Asha, Ben, Chen respectively, summing to `1000`

#### Scenario: Split among a subset
- **WHEN** an expense of `5000` cents includes `"splitAmong":["Ben","Chen"]`
- **THEN** only Ben and Chen receive shares, `2500` cents each

#### Scenario: Payer is not a member
- **WHEN** the `payer` is not a member of the group
- **THEN** the response is `422` `application/problem+json` and no expense is recorded

#### Scenario: Unknown participant
- **WHEN** `splitAmong` names someone who is not a member
- **THEN** the response is `422` `application/problem+json` and no expense is recorded

#### Scenario: Invalid amount
- **WHEN** `amountCents` is zero, negative, fractional, or above 10,000,000
- **THEN** the response is `400` `application/problem+json`

#### Scenario: Expense for an unknown group
- **WHEN** a client posts an expense to a group ID that does not exist
- **THEN** the response is `404` `application/problem+json`

### Requirement: List expenses
The system SHALL list a group's expenses, newest first, each with its shares.

#### Scenario: Newest first
- **WHEN** a group has expenses "Taxi" then "Museum" recorded in that order and a client sends `GET /groups/{id}/expenses`
- **THEN** the response is `200` with `expenses` ordered "Museum", "Taxi"

### Requirement: Show balances
The system SHALL report each member's net balance in cents — the total they paid minus the total of their shares — in the group's member order. The balances of a group SHALL always sum to zero.

#### Scenario: Balances after two expenses
- **WHEN** in a group of Asha, Ben, Chen, Asha pays `9000` split among all, and Ben pays `3000` split among Ben and Chen
- **THEN** `GET /groups/{id}/balances` returns `200` with `balances` `[{"member":"Asha","netCents":6000},{"member":"Ben","netCents":-1500},{"member":"Chen","netCents":-4500}]`

#### Scenario: New group
- **WHEN** a group has no expenses
- **THEN** every member's `netCents` is `0`

### Requirement: Consistent error responses
The system SHALL return errors as `application/problem+json` objects with `title` and `status`, reject malformed JSON with `400`, reject request bodies larger than 16 KB with `413`, and answer unknown routes with `404`.

#### Scenario: Malformed JSON
- **WHEN** a client posts a body that is not valid JSON to `POST /groups`
- **THEN** the response is `400` `application/problem+json`

#### Scenario: Oversized body
- **WHEN** a request body is larger than 16 KB
- **THEN** the response is `413` `application/problem+json` and nothing is stored

#### Scenario: Unknown route
- **WHEN** a client requests a path the API does not define
- **THEN** the response is `404` `application/problem+json`
