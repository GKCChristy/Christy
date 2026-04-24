-- ============================================================
-- CHRISTY CCM AGENT — SUPABASE SCHEMA
-- Cura Community Connections
-- HIPAA aligned | SOC 2 aligned
-- Version: 1.0.0
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- CONFIG TABLE — no hardcoded thresholds anywhere in the codebase
-- ------------------------------------------------------------
CREATE TABLE christy_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT DEFAULT 'christy-ccm-v1'
);

INSERT INTO christy_config (key, value, description) VALUES
  ('flag_window_short_days',   '7',  'Short silence window in days'),
  ('flag_window_long_days',    '30', 'Long silence window in days'),
  ('new_enrollee_grace_days',  '7',  'Days before a new patient can be flagged'),
  ('min_unanswered_calls',     '3',  'Minimum unanswered calls to trigger a flag'),
  ('batch_size',               '50', 'Patients processed per API batch');

-- ------------------------------------------------------------
-- PATIENTS — synced from Chronic Care IQ
-- ------------------------------------------------------------
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cciq_patient_id TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE,
  enrollment_date DATE NOT NULL,
  conditions TEXT[],           -- ['CKD','HTN','CHF','COPD','DM2']
  program_type TEXT NOT NULL,  -- 'CCM', 'RPM', 'BHI'
  care_manager_id TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- AGENT RUNS — SOC 2 audit trail (who/what/when/why/where)
-- ------------------------------------------------------------
CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id TEXT UNIQUE NOT NULL,  -- christy-run-{date}-{uuid}
  agent_id TEXT NOT NULL DEFAULT 'christy-ccm-v1',
  run_date DATE NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running', -- running | completed | failed
  patients_evaluated INTEGER DEFAULT 0,
  flags_created INTEGER DEFAULT 0,
  alerts_sent INTEGER DEFAULT 0,
  error_log JSONB,
  run_metadata JSONB  -- model, env, version, config snapshot
);

-- ------------------------------------------------------------
-- ENGAGEMENT SNAPSHOTS — every patient, every run, always logged
-- ------------------------------------------------------------
CREATE TABLE engagement_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id),
  snapshot_date DATE NOT NULL,
  last_device_transmission_at TIMESTAMPTZ,
  days_since_device_data INTEGER,
  call_attempts_7d INTEGER DEFAULT 0,
  call_attempts_30d INTEGER DEFAULT 0,
  unanswered_calls_7d INTEGER DEFAULT 0,
  unanswered_calls_30d INTEGER DEFAULT 0,
  enrollment_day_number INTEGER,
  raw_data JSONB,  -- full CCIQ API response preserved for audit
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- PATIENT FLAGS — idempotent by patient + date + level
-- ------------------------------------------------------------
CREATE TABLE patient_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id),
  flag_date DATE NOT NULL,
  flag_level TEXT NOT NULL CHECK (flag_level IN ('7_day','30_day','monitor_only')),
  reason TEXT CHECK (reason IN ('no_device_data','unanswered_calls','both')),
  priority INTEGER CHECK (priority BETWEEN 1 AND 5),
  haiku_reasoning TEXT,  -- Haiku's plain-English explanation
  is_active BOOLEAN DEFAULT TRUE,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(patient_id, flag_date, flag_level)  -- prevents double-flagging
);

-- ------------------------------------------------------------
-- ALERTS — idempotent by patient + date + type
-- ------------------------------------------------------------
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flag_id UUID REFERENCES patient_flags(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id),
  alert_date DATE NOT NULL,
  recipient_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,  -- '7_day_gap' | '30_day_gap'
  delivery_status TEXT DEFAULT 'pending' CHECK (delivery_status IN ('pending','sent','failed')),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(patient_id, alert_date, alert_type)  -- prevents duplicate alerts
);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY — anon gets nothing, service role gets all
-- ------------------------------------------------------------
ALTER TABLE patients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_flags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE christy_config      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON patients            FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON agent_runs          FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON engagement_snapshots FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON patient_flags       FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON alerts              FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON christy_config      FOR ALL TO service_role USING (true);

-- ------------------------------------------------------------
-- INDEXES
-- ------------------------------------------------------------
CREATE INDEX idx_patients_cciq       ON patients(cciq_patient_id);
CREATE INDEX idx_patients_active     ON patients(is_active);
CREATE INDEX idx_flags_patient_date  ON patient_flags(patient_id, flag_date);
CREATE INDEX idx_flags_active        ON patient_flags(is_active);
CREATE INDEX idx_alerts_date         ON alerts(alert_date);
CREATE INDEX idx_runs_date           ON agent_runs(run_date);
CREATE INDEX idx_snapshots_run       ON engagement_snapshots(run_id);
CREATE INDEX idx_snapshots_patient   ON engagement_snapshots(patient_id);
