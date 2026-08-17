-- Fix column type mismatches between schema.ts and earlier migrations.
-- All casts are safe: existing text values cast to json, text[] or boolean to json.

-- ibc_applications: text → json
ALTER TABLE ibc_applications
  ALTER COLUMN nih_section_abc      TYPE json USING CASE WHEN nih_section_abc IS NULL THEN NULL ELSE to_json(nih_section_abc) END,
  ALTER COLUMN nih_section_d        TYPE json USING CASE WHEN nih_section_d IS NULL THEN NULL ELSE to_json(nih_section_d) END,
  ALTER COLUMN nih_section_e        TYPE json USING CASE WHEN nih_section_e IS NULL THEN NULL ELSE to_json(nih_section_e) END,
  ALTER COLUMN nih_section_f        TYPE json USING CASE WHEN nih_section_f IS NULL THEN NULL ELSE to_json(nih_section_f) END,
  ALTER COLUMN nih_appendix_c       TYPE json USING CASE WHEN nih_appendix_c IS NULL THEN NULL ELSE to_json(nih_appendix_c) END,
  ALTER COLUMN hazardous_procedures TYPE json USING CASE WHEN hazardous_procedures IS NULL THEN NULL ELSE to_json(hazardous_procedures) END,
  ALTER COLUMN synthetic_experiments TYPE json USING CASE WHEN synthetic_experiments IS NULL THEN NULL ELSE to_json(synthetic_experiments) END;

-- ibc_applications: boolean → json
ALTER TABLE ibc_applications
  ALTER COLUMN dual_use_agents_and_toxins TYPE json USING CASE WHEN dual_use_agents_and_toxins IS NULL THEN NULL ELSE to_json(dual_use_agents_and_toxins) END;

-- ibc_applications: text → text[]
ALTER TABLE ibc_applications
  ALTER COLUMN human_materials TYPE text[] USING CASE WHEN human_materials IS NULL THEN NULL ELSE ARRAY[human_materials] END,
  ALTER COLUMN stem_cells       TYPE text[] USING CASE WHEN stem_cells IS NULL THEN NULL ELSE ARRAY[stem_cells] END,
  ALTER COLUMN laundry_method   TYPE text[] USING CASE WHEN laundry_method IS NULL THEN NULL ELSE ARRAY[laundry_method] END;

-- research_activities: text → text[]
ALTER TABLE research_activities
  ALTER COLUMN budget_source TYPE text[] USING CASE WHEN budget_source IS NULL THEN NULL ELSE ARRAY[budget_source] END;
