-- Domain blocklist (SEC-5). Entries are stored in canonical host form.
CREATE TABLE blocklist (
  domain TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
