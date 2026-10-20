-- Leaderboard (LB-1, LB-2). One board per difficulty for all sites. No IP and no domain.
CREATE TABLE scores (
  id INTEGER PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  difficulty TEXT NOT NULL,
  initials TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX scores_rank ON scores (difficulty, time_ms, created_at);
