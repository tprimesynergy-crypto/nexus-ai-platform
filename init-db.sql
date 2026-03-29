-- ═══════════════════════════════════════════════════════════════
-- TANGER NEXUS 2026 — PostgreSQL Init
-- Prime Synergy Group
-- ═══════════════════════════════════════════════════════════════

-- Create n8n database if needed
CREATE DATABASE n8n_db;

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(50) PRIMARY KEY,
  project_name VARCHAR(255) NOT NULL,
  project_type VARCHAR(50),
  owner VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active',
  deadline DATE,
  approved_to_send BOOLEAN DEFAULT false,
  approved_to_publish BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Targets (CRM) table
CREATE TABLE IF NOT EXISTS targets (
  id VARCHAR(50) PRIMARY KEY,
  project_id VARCHAR(50) REFERENCES projects(id),
  company_name VARCHAR(255) NOT NULL,
  sector VARCHAR(100),
  website VARCHAR(255),
  status VARCHAR(50) DEFAULT 'identified',
  priority VARCHAR(20) DEFAULT 'cold',
  offer_type VARCHAR(100),
  contact_name VARCHAR(255),
  contact_title VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  last_contact_date TIMESTAMP,
  next_action VARCHAR(50),
  days_since_last_action INTEGER DEFAULT 0,
  notes TEXT,
  research_file_path TEXT,
  research_status VARCHAR(50) DEFAULT 'pending',
  score INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id VARCHAR(50) PRIMARY KEY,
  project_id VARCHAR(50) REFERENCES projects(id),
  campaign_type VARCHAR(50),
  segment VARCHAR(100),
  subject VARCHAR(255),
  status VARCHAR(50) DEFAULT 'draft',
  brevo_template_id INTEGER,
  brevo_list_id INTEGER,
  sent_count INTEGER DEFAULT 0,
  open_rate DECIMAL(5,2),
  click_rate DECIMAL(5,2),
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Deliverables table
CREATE TABLE IF NOT EXISTS deliverables (
  id VARCHAR(50) PRIMARY KEY,
  project_id VARCHAR(50) REFERENCES projects(id),
  target_id VARCHAR(50),
  deliverable_type VARCHAR(50),
  file_path TEXT,
  status VARCHAR(50) DEFAULT 'pending_review',
  approved_by VARCHAR(100),
  approved_at TIMESTAMP,
  rejection_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Run logs table
CREATE TABLE IF NOT EXISTS run_logs (
  id SERIAL PRIMARY KEY,
  run_id VARCHAR(100),
  workflow_id VARCHAR(20),
  workflow_name VARCHAR(100),
  status VARCHAR(50),
  payload JSONB,
  result JSONB,
  error TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration_ms INTEGER
);

-- Approvals table (WF-12 Gate)
CREATE TABLE IF NOT EXISTS approvals (
  id SERIAL PRIMARY KEY,
  deliverable_id VARCHAR(50) REFERENCES deliverables(id),
  action VARCHAR(20),
  comment TEXT,
  decided_by VARCHAR(100),
  decided_at TIMESTAMP DEFAULT NOW()
);

-- Insert default project
INSERT INTO projects (id, project_name, project_type, owner, deadline)
VALUES (
  'TNG-NEXUS-2026',
  'TANGER NEXUS EXPO & SUMMIT 2026',
  'event',
  'Badr Messaoudi',
  '2026-10-21'
) ON CONFLICT (id) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_targets_project ON targets(project_id);
CREATE INDEX IF NOT EXISTS idx_targets_status ON targets(status);
CREATE INDEX IF NOT EXISTS idx_targets_priority ON targets(priority);
CREATE INDEX IF NOT EXISTS idx_run_logs_workflow ON run_logs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_run_logs_status ON run_logs(status);

-- KPI view
CREATE OR REPLACE VIEW vw_kpis AS
SELECT
  p.id as project_id,
  p.project_name,
  COUNT(t.id) FILTER (WHERE t.status != 'lost') AS cibles_identifiees,
  COUNT(t.id) FILTER (WHERE t.research_status = 'validated') AS fiches_creees,
  COUNT(t.id) FILTER (WHERE t.status IN ('contacted','replied','meeting','proposal','negotiating','won')) AS emails_envoyes,
  COUNT(t.id) FILTER (WHERE t.status IN ('meeting','proposal','negotiating','won')) AS rdv_obtenus,
  COUNT(t.id) FILTER (WHERE t.status = 'won' AND t.offer_type LIKE '%Sponsor%') AS sponsors_confirmes,
  COUNT(t.id) FILTER (WHERE t.status = 'won' AND t.offer_type = 'Exposant') AS exposants_confirmes
FROM projects p
LEFT JOIN targets t ON t.project_id = p.id
GROUP BY p.id, p.project_name;

COMMENT ON TABLE targets IS 'Pipeline CRM TANGER NEXUS 2026';
COMMENT ON TABLE run_logs IS 'Historique executions agents IA';
