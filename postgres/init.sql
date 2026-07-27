CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  public_key TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS repositories (
  repo_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_public_key TEXT NOT NULL REFERENCES users(public_key),
  leader_node TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_public_key, name)
);

CREATE TABLE IF NOT EXISTS repo_contributors (
  repo_id TEXT NOT NULL REFERENCES repositories(repo_id) ON DELETE CASCADE,
  public_key TEXT NOT NULL REFERENCES users(public_key),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (repo_id, public_key)
);

CREATE TABLE IF NOT EXISTS repo_updates (
  update_id BIGSERIAL PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repositories(repo_id) ON DELETE CASCADE,
  actor_public_key TEXT NOT NULL REFERENCES users(public_key),
  head TEXT,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repositories_name ON repositories(name);
CREATE INDEX IF NOT EXISTS idx_repo_updates_repo ON repo_updates(repo_id, created_at DESC);