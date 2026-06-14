-- Migration: 20260611_ownership_overrides.sql
-- Adds ownership_overrides table for record-level (row-level) ownership-based access control.
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT DO NOTHING.

CREATE TABLE IF NOT EXISTS ownership_overrides (
  id            serial PRIMARY KEY,
  module        text NOT NULL,
  relationship  text NOT NULL,
  granted_access text NOT NULL,
  description   text,
  created_at    timestamp DEFAULT now(),
  updated_at    timestamp DEFAULT now(),
  UNIQUE (module, relationship)
);

-- Seed defaults
INSERT INTO ownership_overrides (module, relationship, granted_access, description) VALUES
  ('publications',        'is_author',        'edit', 'Authors can edit their own publications'),
  ('research-activities', 'is_budget_holder',  'edit', 'Budget holders can edit their SDR'),
  ('research-activities', 'is_team_member',    'edit', 'Team members can edit their SDR'),
  ('projects',            'is_pi',             'edit', 'PI can edit their project'),
  ('projects',            'is_team_member',    'view', 'Project team members get view access'),
  ('irb-applications',    'is_pi',             'edit', 'PI can edit their IRB application'),
  ('ibc-applications',    'is_pi',             'edit', 'PI can edit their IBC application'),
  ('contracts',           'is_lead_pi',        'edit', 'Lead PI can edit their contract'),
  ('data-management',     'is_team_member',    'edit', 'Team members can edit their DMP (inherits SDR membership)')
ON CONFLICT (module, relationship) DO NOTHING;
