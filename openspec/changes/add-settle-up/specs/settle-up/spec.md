# Spec Delta

## Purpose

Tell a group the transfers that would settle every member's balance, in as few steps as a simple, predictable method allows.

## ADDED Requirements

### Requirement: Suggest settle-up transfers
`GET /groups/{id}/settle-up` SHALL return `200` with `{"transfers": [{"from": <name>, "to": <name>, "cents": <integer>}, ...]}`.
- `from` is the member who pays (a negative balance) and `to` is the member who receives. Both are display names as stored, the same as `member` in balances.
- The transfers SHALL bring every member's balance (as defined by the `expense-groups` capability) to exactly zero. There SHALL be at most one fewer transfer than the group has members, and each `cents` SHALL be a positive integer.
- The result SHALL be deterministic. Repeatedly, using the balances that remain after the transfers so far, the member who owes the most pays the member who is owed the most the smaller of the two amounts. Ties on either side go to the member earlier in the group's member order.
- Transfers SHALL be listed in the order this method produces them. A member whose balance is zero never appears in a transfer.

#### Scenario: Two debtors, one creditor
- **WHEN** a group of Asha, Ben, Chen has balances Asha `6000`, Ben `-1500`, Chen `-4500`
- **THEN** the response is `200` with `{"transfers":[{"from":"Chen","to":"Asha","cents":4500},{"from":"Ben","to":"Asha","cents":1500}]}`

#### Scenario: Ties follow member order
- **WHEN** a group of Asha, Ben, Chen has balances Asha `2000`, Ben `-1000`, Chen `-1000`
- **THEN** the response is `200` with `{"transfers":[{"from":"Ben","to":"Asha","cents":1000},{"from":"Chen","to":"Asha","cents":1000}]}`

#### Scenario: Several creditors
- **WHEN** a group of Asha, Ben, Chen, Dev has balances Asha `500`, Ben `1500`, Chen `-1000`, Dev `-1000`
- **THEN** the response is `200` with `{"transfers":[{"from":"Chen","to":"Ben","cents":1000},{"from":"Dev","to":"Asha","cents":500},{"from":"Dev","to":"Ben","cents":500}]}`
  - Chen beats Dev on the debtor tie.
  - Ben, the largest creditor, is paid first even though Asha is earlier in member order.
  - After that first transfer, Asha and Ben are both owed 500, and Asha wins that tie.

#### Scenario: Already settled
- **WHEN** every member's balance is `0`, including a group with no expenses
- **THEN** the response is `200` with `{"transfers":[]}`

#### Scenario: Transfers always settle the group
- **WHEN** groups of 2–20 members are built through the API from a fixed-seed random mix of expenses, and each is queried
- **THEN** each response is `200`
- **AND** applying its transfers to that group's `GET /groups/{id}/balances` leaves every member at exactly `0`
- **AND** there are at most `members − 1` transfers, and every `cents` is a positive integer

#### Scenario: Worst-case group
- **WHEN** a group with 20 members and 500 expenses is queried
- **THEN** the response is `200` with at most 19 transfers that settle the group

#### Scenario: Unknown group
- **WHEN** a client sends `GET /groups/{id}/settle-up` for an ID that does not exist
- **THEN** the response is `404` `application/problem+json` with `title` `"Group not found"`
