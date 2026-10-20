-- Sliding-window rate limits (ING-8). Holds a SHA-256 of the IP, never the IP, and at most one
-- hour of events (pruned on insert and by the minute job).
CREATE TABLE rate_events (
  kind TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE INDEX rate_events_lookup ON rate_events (kind, ip_hash, at);
CREATE INDEX rate_events_at ON rate_events (at);
