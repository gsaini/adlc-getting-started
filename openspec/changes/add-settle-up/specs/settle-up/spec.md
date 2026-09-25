# Spec Delta

## Purpose

Tell a group the transfers that would settle every member's balance, in as few steps as a simple, predictable method allows.

## ADDED Requirements

### Requirement: Suggest settle-up transfers
`GET /groups/{id}/settlements` SHALL return `200` with `{"transfers": [{from, to, cents}, ...]}`. The transfers SHALL bring every member's balance (as defined by the `expense-groups` capability) to exactly zero. There SHALL be at most one fewer transfer than the group has members, and each `cents` SHALL be a positive integer. The result SHALL be deterministic: repeatedly, the member who owes the most pays the member who is owed the most the smaller of the two amounts; ties go to the member earlier in the group's member order.

#### Scenario: Two debtors, one creditor
- **WHEN** a group of Asha, Ben, Chen has balances Asha `6000`, Ben `-1500`, Chen `-4500`
- **THEN** the response is `200` with `transfers` `[{"from":"Chen","to":"Asha","cents":4500},{"from":"Ben","to":"Asha","cents":1500}]`

#### Scenario: Ties follow member order
- **WHEN** the balances are Asha `2000`, Ben `-1000`, Chen `-1000`
- **THEN** `transfers` is `[{"from":"Ben","to":"Asha","cents":1000},{"from":"Chen","to":"Asha","cents":1000}]`

#### Scenario: Already settled
- **WHEN** every member's balance is `0`, including a group with no expenses
- **THEN** the response is `200` with `{"transfers":[]}`

#### Scenario: Transfers always settle the group
- **WHEN** a group has any mix of expenses
- **THEN** applying the returned transfers to the balances leaves every member at exactly `0`, using at most `members − 1` transfers

#### Scenario: Unknown group
- **WHEN** a client sends `GET /groups/{id}/settlements` for an ID that does not exist
- **THEN** the response is `404` with `title` `"Group not found"`
