-- Seed default global application settings into system_configurations.
-- These are managed via the admin Settings page and read by all clients on boot.
-- Safe to re-run (INSERT ... ON CONFLICT DO NOTHING).

INSERT INTO system_configurations (key, value, description, category, is_user_configurable)
VALUES
  ('app_theme_name',          '"sidra"',        'Active institution theme (sidra | hbku | wcmq)', 'appearance', true),
  ('app_institution_labels',  'null',           'Custom tier labels per institution (JSON object)', 'appearance', true),
  ('app_section_visibility',  '{}',             'Sidebar section rollout flags (JSON object, false = hidden)', 'appearance', true),
  ('color_mode_default',      '"light"',        'Global default color mode for users who have not set their own preference', 'appearance', true)
ON CONFLICT (key) DO NOTHING;
