-- ============================================================
-- Genyx POC v2 — Postgres + TimescaleDB init
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Users -------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT UNIQUE NOT NULL,
  pw_hash    TEXT,                              -- nullable for OAuth-only
  created_at TIMESTAMPTZ DEFAULT now()
);

-- OAuth accounts ---------------------------------------------
CREATE TABLE IF NOT EXISTS oauth_accounts (
  provider         TEXT NOT NULL,              -- 'google'
  provider_user_id TEXT NOT NULL,
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  email            TEXT,
  raw_profile      JSONB,
  PRIMARY KEY (provider, provider_user_id)
);

-- Refresh token store (jti-based) ----------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  jti        UUID PRIMARY KEY,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN DEFAULT false,
  rotated_to UUID
);

-- Sessions ---------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id),
  exercise   TEXT NOT NULL,                    -- squat|pushup|bicep_curl|shoulder_press|deadlift
  state      TEXT NOT NULL DEFAULT 'INIT',     -- INIT|ACTIVE|STOPPED
  started_at TIMESTAMPTZ,
  ended_at   TIMESTAMPTZ
);

-- Rep events (TimescaleDB hypertable) ------------------------
CREATE TABLE IF NOT EXISTS rep_events (
  session_id UUID    NOT NULL,
  rep_id     TEXT    NOT NULL,
  phase      TEXT    NOT NULL,                 -- start|peak|end
  exercise   TEXT,
  ts         TIMESTAMPTZ NOT NULL,
  quality    REAL,
  angles     JSONB,
  PRIMARY KEY (session_id, rep_id, phase)
);
SELECT create_hypertable('rep_events', 'ts', if_not_exists => true);
CREATE INDEX IF NOT EXISTS rep_events_sid_ts ON rep_events (session_id, ts);

-- Flags -------------------------------------------------------
CREATE TABLE IF NOT EXISTS flags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID,
  rep_id     TEXT,
  reason     TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Session summaries ------------------------------------------
CREATE TABLE IF NOT EXISTS session_summaries (
  session_id  UUID PRIMARY KEY,
  exercise    TEXT,
  reps        INT,
  sets        INT,
  avg_quality REAL,
  duration_ms BIGINT,
  payload     JSONB
);

-- ── Dev seed: one test user for D1/D2 acceptance gates ──────
INSERT INTO users (email, pw_hash)
VALUES ('bharath@genyx.local', '$2b$12$PLACEHOLDER_HASH_DO_NOT_USE')
ON CONFLICT (email) DO NOTHING;
