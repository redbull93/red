-- StandUp Supabase Schema
-- Run this migration in Supabase SQL editor or via Supabase CLI

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('slack', 'discord')),
  team_id TEXT,
  channel_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users / Teammates
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT DEFAULT 'engineer',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_workspace_platform ON users(workspace_id, platform_user_id);

-- Standup Sessions
CREATE TABLE IF NOT EXISTS standups (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'missed')),
  summary TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_standups_workspace_date ON standups(workspace_id, date);

-- Standup Responses from Teammates
CREATE TABLE IF NOT EXISTS standup_responses (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  standup_id TEXT NOT NULL REFERENCES standups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('slack', 'discord')),
  finished TEXT,
  working_on TEXT,
  blocked_by TEXT,
  raw_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_responses_standup ON standup_responses(standup_id);

-- Cross-Referenced Dependencies and Blockers
CREATE TABLE IF NOT EXISTS dependencies (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  standup_id TEXT NOT NULL REFERENCES standups(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  blocker_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  blocked_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  blocker_name TEXT,
  blocked_name TEXT,
  subject TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'explicit' CHECK (type IN ('explicit', 'implicit', 'dependency', 'recurring', 'risk')),
  status TEXT NOT NULL DEFAULT 'detected' CHECK (status IN ('detected', 'investigating', 'waiting_hitl', 'action_taken', 'resolved')),
  confidence NUMERIC NOT NULL DEFAULT 1.0,
  evidence TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dependencies_standup_status ON dependencies(standup_id, status);

-- Pending Actions (HITL Queue)
CREATE TABLE IF NOT EXISTS pending_actions (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  standup_id TEXT NOT NULL REFERENCES standups(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('notify', 'ask_clarification', 'post_summary', 'request_approval', 'stop', 'follow_up')),
  target_user_id TEXT,
  platform TEXT CHECK (platform IN ('slack', 'discord')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  payload JSONB DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_actions_status ON pending_actions(workspace_id, status);

-- Standup Summaries & Channel Receipts
CREATE TABLE IF NOT EXISTS standup_summaries (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  standup_id TEXT NOT NULL REFERENCES standups(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  message_ts TEXT,
  content TEXT NOT NULL,
  blockers_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agent Trace & Audit Events
CREATE TABLE IF NOT EXISTS agent_events (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_workspace_created ON agent_events(workspace_id, created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE standups ENABLE ROW LEVEL SECURITY;
ALTER TABLE standup_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE standup_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;

-- Allow read/write access for anon/service_role
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_workspaces') THEN
    CREATE POLICY allow_all_workspaces ON workspaces FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_users') THEN
    CREATE POLICY allow_all_users ON users FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_standups') THEN
    CREATE POLICY allow_all_standups ON standups FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_responses') THEN
    CREATE POLICY allow_all_responses ON standup_responses FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_dependencies') THEN
    CREATE POLICY allow_all_dependencies ON dependencies FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_pending_actions') THEN
    CREATE POLICY allow_all_pending_actions ON pending_actions FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_standup_summaries') THEN
    CREATE POLICY allow_all_standup_summaries ON standup_summaries FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_agent_events') THEN
    CREATE POLICY allow_all_agent_events ON agent_events FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
