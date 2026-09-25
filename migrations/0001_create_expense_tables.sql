-- add-expense-groups: groups, members, expenses, and shares.
-- Additive only, so it is safe to apply before the Worker that uses it is deployed.
-- D1 enforces foreign keys by default.

CREATE TABLE groups (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	created_at TEXT NOT NULL
);

CREATE TABLE members (
	group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
	name_key TEXT NOT NULL, -- trimmed, lower-cased: "unique ignoring case" lives here
	name TEXT NOT NULL, -- display name, as given
	position INTEGER NOT NULL,
	PRIMARY KEY (group_id, name_key)
);

CREATE TABLE expenses (
	-- INTEGER PRIMARY KEY aliases the rowid, so recording order survives VACUUM.
	seq INTEGER PRIMARY KEY,
	id TEXT NOT NULL UNIQUE,
	group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
	payer_key TEXT NOT NULL,
	amount_cents INTEGER NOT NULL CHECK (amount_cents BETWEEN 1 AND 10000000),
	description TEXT NOT NULL,
	created_at TEXT NOT NULL,
	-- Target of the shares' foreign key, and the index for a group's expenses.
	UNIQUE (group_id, id),
	FOREIGN KEY (group_id, payer_key) REFERENCES members (group_id, name_key)
);

-- Lists a group's expenses newest-first without a sort (seq is the rowid).
CREATE INDEX expenses_by_group ON expenses (group_id, seq);

CREATE TABLE expense_shares (
	expense_id TEXT NOT NULL,
	group_id TEXT NOT NULL,
	member_key TEXT NOT NULL,
	cents INTEGER NOT NULL CHECK (cents >= 0),
	PRIMARY KEY (expense_id, member_key),
	-- One group_id column in both keys: a share's expense and member share a group.
	FOREIGN KEY (group_id, expense_id) REFERENCES expenses (group_id, id) ON DELETE CASCADE,
	FOREIGN KEY (group_id, member_key) REFERENCES members (group_id, name_key)
);
