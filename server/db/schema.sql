PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
  source_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  adapter_key TEXT NOT NULL DEFAULT 'html-notices',
  config_json TEXT NOT NULL DEFAULT '{}',
  approved INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0, 1)),
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  adapter_status TEXT NOT NULL DEFAULT 'not_configured',
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scholarships (
  notice_id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(source_id),
  canonical_key TEXT NOT NULL,
  title TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'Unknown provider',
  url TEXT NOT NULL,
  notice_type TEXT NOT NULL DEFAULT 'scholarship',
  education_level TEXT,
  programme TEXT,
  discipline TEXT,
  region TEXT,
  residency_rule TEXT,
  benefit_text TEXT,
  eligibility_excerpt TEXT,
  due_at TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  captured_at TEXT NOT NULL,
  verified_at TEXT,
  content_hash TEXT NOT NULL,
  notice_status TEXT NOT NULL DEFAULT 'active' CHECK (notice_status IN ('active', 'withdrawn', 'closed', 'unknown')),
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_id, canonical_key)
);

CREATE INDEX IF NOT EXISTS idx_scholarships_due ON scholarships(due_at);
CREATE INDEX IF NOT EXISTS idx_scholarships_status ON scholarships(notice_status);
CREATE INDEX IF NOT EXISTS idx_scholarships_source ON scholarships(source_id);
CREATE INDEX IF NOT EXISTS idx_scholarships_updated ON scholarships(updated_at);

CREATE TABLE IF NOT EXISTS change_history (
  change_id INTEGER PRIMARY KEY AUTOINCREMENT,
  notice_id INTEGER NOT NULL REFERENCES scholarships(notice_id),
  change_type TEXT NOT NULL CHECK (change_type IN ('deadline_revised', 'withdrawn', 'reopened', 'content_updated')),
  previous_deadline TEXT,
  updated_deadline TEXT,
  previous_status TEXT,
  updated_status TEXT,
  captured_at TEXT NOT NULL,
  details TEXT
);

CREATE INDEX IF NOT EXISTS idx_changes_notice ON change_history(notice_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS alerts (
  alert_id INTEGER PRIMARY KEY AUTOINCREMENT,
  notice_id INTEGER REFERENCES scholarships(notice_id),
  alert_type TEXT NOT NULL CHECK (alert_type IN ('new_notice', 'deadline_approaching', 'deadline_revised', 'withdrawn')),
  event_key TEXT NOT NULL UNIQUE,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);

CREATE TABLE IF NOT EXISTS collection_runs (
  run_id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER REFERENCES sources(source_id),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed', 'skipped')),
  records_seen INTEGER NOT NULL DEFAULT 0,
  records_changed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_started ON collection_runs(started_at DESC);