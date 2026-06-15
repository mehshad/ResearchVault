-- Create all tables that were previously managed by drizzle-kit push
-- but are missing from the explicit migration files.
-- All statements use IF NOT EXISTS so they are safe to re-run.

-- Projects
CREATE TABLE IF NOT EXISTS "projects" (
  "id" serial PRIMARY KEY,
  "project_id" text NOT NULL UNIQUE,
  "program_id" integer,
  "name" text NOT NULL,
  "description" text,
  "principal_investigator_id" integer,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Publication Authors
CREATE TABLE IF NOT EXISTS "publication_authors" (
  "id" serial PRIMARY KEY,
  "publication_id" integer NOT NULL,
  "scientist_id" integer NOT NULL,
  "authorship_type" text NOT NULL,
  "author_position" integer
);
CREATE UNIQUE INDEX IF NOT EXISTS "publication_scientist_idx" ON "publication_authors" ("publication_id", "scientist_id");

-- Manuscript History
CREATE TABLE IF NOT EXISTS "manuscript_history" (
  "id" serial PRIMARY KEY,
  "publication_id" integer NOT NULL,
  "from_status" text,
  "to_status" text NOT NULL,
  "changed_field" text,
  "old_value" text,
  "new_value" text,
  "changed_by" integer NOT NULL,
  "change_reason" text,
  "note" text,
  "created_at" timestamp DEFAULT now()
);

-- IRB Submissions
CREATE TABLE IF NOT EXISTS "irb_submissions" (
  "id" serial PRIMARY KEY,
  "application_id" integer NOT NULL,
  "submission_type" text NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "submitted_by" integer NOT NULL,
  "submission_date" timestamp DEFAULT now(),
  "due_date" timestamp,
  "form_data" json,
  "changes" text,
  "documents" json,
  "workflow_status" text NOT NULL DEFAULT 'submitted',
  "reviewer_assignments" json,
  "review_comments" json,
  "pi_responses" json,
  "final_decision" text,
  "decision_date" timestamp,
  "decision_rationale" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- IRB Documents
CREATE TABLE IF NOT EXISTS "irb_documents" (
  "id" serial PRIMARY KEY,
  "application_id" integer,
  "submission_id" integer,
  "document_type" text NOT NULL,
  "file_name" text NOT NULL,
  "file_path" text NOT NULL,
  "file_size" integer,
  "mime_type" text,
  "version" integer DEFAULT 1,
  "uploaded_by" integer NOT NULL,
  "is_required" boolean DEFAULT false,
  "status" text DEFAULT 'active',
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- IBC Application Comments
CREATE TABLE IF NOT EXISTS "ibc_application_comments" (
  "id" serial PRIMARY KEY,
  "application_id" integer NOT NULL,
  "comment_type" text NOT NULL,
  "author_type" text NOT NULL,
  "author_id" integer,
  "author_name" text NOT NULL,
  "comment" text NOT NULL,
  "recommendation" text,
  "status_from" text,
  "status_to" text,
  "is_internal" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now()
);

-- IBC Application Research Activities (junction)
CREATE TABLE IF NOT EXISTS "ibc_application_research_activities" (
  "id" serial PRIMARY KEY,
  "ibc_application_id" integer NOT NULL,
  "research_activity_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ibc_app_ra_unique_idx" ON "ibc_application_research_activities" ("ibc_application_id", "research_activity_id");

-- Research Contract Scope Items
CREATE TABLE IF NOT EXISTS "research_contract_scope_items" (
  "id" serial PRIMARY KEY,
  "contract_id" integer NOT NULL,
  "party" text NOT NULL,
  "description" text NOT NULL,
  "due_date" date,
  "acceptance_criteria" text,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Research Contract Extensions
CREATE TABLE IF NOT EXISTS "research_contract_extensions" (
  "id" serial PRIMARY KEY,
  "contract_id" integer NOT NULL,
  "sequence_number" integer NOT NULL,
  "requested_at" timestamp DEFAULT now(),
  "approved_at" timestamp,
  "new_end_date" date NOT NULL,
  "signature_date" date,
  "notes" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Research Contract Documents
CREATE TABLE IF NOT EXISTS "research_contract_documents" (
  "id" serial PRIMARY KEY,
  "contract_id" integer,
  "extension_id" integer,
  "document_type" text NOT NULL,
  "object_key" text NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text,
  "file_size" integer,
  "uploaded_by_user_id" integer NOT NULL,
  "uploaded_at" timestamp DEFAULT now(),
  "notes" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Buildings
CREATE TABLE IF NOT EXISTS "buildings" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "address" text,
  "description" text,
  "totalFloors" integer,
  "maxOccupancy" integer,
  "emergencyContact" text,
  "safetyNotes" text
);

-- Rooms
CREATE TABLE IF NOT EXISTS "rooms" (
  "id" serial PRIMARY KEY,
  "buildingId" integer NOT NULL,
  "roomNumber" text NOT NULL,
  "floor" integer,
  "roomType" text,
  "capacity" integer,
  "area" numeric,
  "biosafetyLevel" text,
  "roomSupervisorId" integer,
  "roomManagerId" integer,
  "certifications" json,
  "availablePpe" json,
  "equipment" text,
  "specialFeatures" text,
  "accessRestrictions" text,
  "maintenanceNotes" text
);

-- IBC Application Rooms
CREATE TABLE IF NOT EXISTS "ibc_application_rooms" (
  "id" serial PRIMARY KEY,
  "application_id" integer NOT NULL,
  "room_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now()
);

-- IBC Backbone Source Rooms
CREATE TABLE IF NOT EXISTS "ibc_backbone_source_rooms" (
  "id" serial PRIMARY KEY,
  "application_id" integer NOT NULL,
  "backbone_source" text NOT NULL,
  "room_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now()
);

-- IBC Application PPE
CREATE TABLE IF NOT EXISTS "ibc_application_ppe" (
  "id" serial PRIMARY KEY,
  "application_id" integer NOT NULL,
  "room_id" integer NOT NULL,
  "ppe_item" text NOT NULL,
  "created_at" timestamp DEFAULT now()
);

-- Role Permissions
CREATE TABLE IF NOT EXISTS "role_permissions" (
  "id" serial PRIMARY KEY,
  "job_title" text NOT NULL,
  "navigation_item" text NOT NULL,
  "access_level" text NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
-- Index only created if job_title column still exists (dropped by 20260611_role_groups.sql)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'role_permissions' AND column_name = 'job_title'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "unique_job_title_nav_item"
      ON "role_permissions" ("job_title", "navigation_item");
  END IF;
END $$;

-- IRB Board Members
CREATE TABLE IF NOT EXISTS "irb_board_members" (
  "id" serial PRIMARY KEY,
  "scientist_id" integer NOT NULL,
  "role" text NOT NULL,
  "expertise" text[],
  "appointment_date" timestamp DEFAULT now(),
  "term_end_date" timestamp NOT NULL,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- IBC Board Members
CREATE TABLE IF NOT EXISTS "ibc_board_members" (
  "id" serial PRIMARY KEY,
  "scientist_id" integer NOT NULL,
  "role" text NOT NULL,
  "expertise" text[],
  "biosafety_training" json,
  "appointment_date" timestamp DEFAULT now(),
  "term_end_date" timestamp NOT NULL,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- IBC Submissions
CREATE TABLE IF NOT EXISTS "ibc_submissions" (
  "id" serial PRIMARY KEY,
  "application_id" integer NOT NULL,
  "submission_type" text NOT NULL,
  "submission_date" timestamp DEFAULT now(),
  "submitted_by" integer NOT NULL,
  "documents" json,
  "review_status" text NOT NULL DEFAULT 'pending',
  "review_date" timestamp,
  "reviewed_by" integer,
  "review_comments" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- IBC Documents
CREATE TABLE IF NOT EXISTS "ibc_documents" (
  "id" serial PRIMARY KEY,
  "application_id" integer,
  "submission_id" integer,
  "document_type" text NOT NULL,
  "file_name" text NOT NULL,
  "file_size" integer,
  "mime_type" text,
  "uploaded_by" integer NOT NULL,
  "upload_date" timestamp DEFAULT now(),
  "version" integer NOT NULL DEFAULT 1,
  "is_current_version" boolean DEFAULT true,
  "review_status" text DEFAULT 'pending',
  "review_comments" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Journals
CREATE TABLE IF NOT EXISTS "journals" (
  "id" serial PRIMARY KEY,
  "journal_name" text NOT NULL,
  "abbreviated_journal" text,
  "publisher" text,
  "issn" text,
  "eissn" text,
  "field" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "journals_name_lower_idx" ON "journals" (lower("journal_name"));

-- Journal Impact Factor Metrics
CREATE TABLE IF NOT EXISTS "journal_impact_factor_metrics" (
  "id" serial PRIMARY KEY,
  "journal_id" integer NOT NULL REFERENCES "journals"("id") ON DELETE CASCADE,
  "year" integer NOT NULL,
  "total_cites" integer,
  "total_articles" integer,
  "citable_items" integer,
  "cited_half_life" numeric(10,3),
  "citing_half_life" numeric(10,3),
  "impact_factor" numeric(10,3),
  "five_year_jif" numeric(10,3),
  "jif_without_self_cites" numeric(10,3),
  "jci" numeric(10,3),
  "quartile" text,
  "rank" integer,
  "total_citations" integer,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "journal_metrics_journal_year_idx" ON "journal_impact_factor_metrics" ("journal_id", "year");

-- Grants
CREATE TABLE IF NOT EXISTS "grants" (
  "id" serial PRIMARY KEY,
  "cycle" text,
  "project_number" text NOT NULL UNIQUE,
  "lpi_id" integer,
  "investigator_type" text,
  "title" text NOT NULL,
  "requested_amount" numeric(12,2),
  "awarded_amount" numeric(12,2),
  "submitted_year" integer,
  "awarded" boolean DEFAULT false,
  "awarded_year" integer,
  "running_time_years" integer,
  "current_grant_year" text,
  "status" text NOT NULL DEFAULT 'submitted',
  "grant_type" text DEFAULT 'Local',
  "start_date" date,
  "end_date" date,
  "reporting_interval_months" integer,
  "collaborators" text[],
  "description" text,
  "funding_agency" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Grant Progress Reports
CREATE TABLE IF NOT EXISTS "grant_progress_reports" (
  "id" serial PRIMARY KEY,
  "grant_id" integer NOT NULL,
  "report_title" text NOT NULL,
  "report_period" text,
  "submission_date" date,
  "acceptance_date" date,
  "file_path" text,
  "file_name" text,
  "file_size" integer,
  "uploaded_by" integer NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Grant Research Activities (junction)
CREATE TABLE IF NOT EXISTS "grant_research_activities" (
  "id" serial PRIMARY KEY,
  "grant_id" integer NOT NULL,
  "research_activity_id" integer NOT NULL,
  "linked_date" timestamp DEFAULT now(),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Certification Modules
CREATE TABLE IF NOT EXISTS "certification_modules" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "description" text,
  "is_core" boolean NOT NULL DEFAULT false,
  "expiration_months" integer NOT NULL DEFAULT 36,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Certifications
CREATE TABLE IF NOT EXISTS "certifications" (
  "id" serial PRIMARY KEY,
  "scientist_id" integer NOT NULL,
  "module_id" integer NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "certificate_file_path" text,
  "certificate_file_name" text,
  "report_file_path" text,
  "report_file_name" text,
  "extracted_data" json,
  "uploaded_by" integer NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Certification Configurations
CREATE TABLE IF NOT EXISTS "certification_configurations" (
  "id" serial PRIMARY KEY,
  "institution_name" text,
  "citi_api_key" text,
  "citi_api_secret" text,
  "citi_api_endpoint" text,
  "notification_recipients" json DEFAULT '[]',
  "notification_days" json DEFAULT '[30,7]',
  "email_enabled" boolean NOT NULL DEFAULT true,
  "auto_import_enabled" boolean NOT NULL DEFAULT false,
  "last_sync_date" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- System Configurations
CREATE TABLE IF NOT EXISTS "system_configurations" (
  "id" serial PRIMARY KEY,
  "key" text NOT NULL UNIQUE,
  "value" json NOT NULL,
  "description" text,
  "category" text NOT NULL DEFAULT 'general',
  "is_user_configurable" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- PDF Import History
CREATE TABLE IF NOT EXISTS "pdf_import_history" (
  "id" serial PRIMARY KEY,
  "file_name" text NOT NULL,
  "file_url" text NOT NULL,
  "file_size" integer,
  "uploaded_by" integer NOT NULL,
  "processing_status" text NOT NULL DEFAULT 'processing',
  "ocr_provider" text,
  "document_type" text,
  "extracted_text" text,
  "parsed_data" json,
  "error_message" text,
  "processing_duration" integer,
  "save_status" text,
  "certificate_person_name" text,
  "course_name" text,
  "completion_date" date,
  "expiration_date" date,
  "record_id" text,
  "institution" text,
  "assigned_scientist_id" integer,
  "notes" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Feature Requests
CREATE TABLE IF NOT EXISTS "feature_requests" (
  "id" serial PRIMARY KEY,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "priority" text NOT NULL DEFAULT 'medium',
  "category" text NOT NULL DEFAULT 'feature',
  "original_request" text NOT NULL,
  "enhanced_prompt" text,
  "approved_prompt" text,
  "ai_provider" text,
  "implementation_notes" text,
  "estimated_effort" text,
  "tags" text[],
  "requested_by" text NOT NULL DEFAULT 'Anonymous User',
  "upvotes" integer NOT NULL DEFAULT 0,
  "upvoted_by" text[] DEFAULT '{}',
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- RA-200 Applications
CREATE TABLE IF NOT EXISTS "ra200_applications" (
  "id" serial PRIMARY KEY,
  "application_id" text NOT NULL UNIQUE,
  "status" text NOT NULL DEFAULT 'draft',
  "title" text NOT NULL,
  "lead_scientist_id" integer REFERENCES "scientists"("id"),
  "project_id" integer REFERENCES "projects"("id"),
  "budget_holder_id" integer REFERENCES "scientists"("id"),
  "budget_source" text,
  "abstract" text,
  "background_rationale" text,
  "objectives_preliminary" text,
  "approach_methods" text,
  "discussion_conclusion" text,
  "ethics_requirements" json,
  "collaboration_requirements" json,
  "budget_requirements" json,
  "sample_data_processing" json,
  "duration_months" integer,
  "core_labs" json,
  "study_design_methods" text,
  "proposal_objectives" text,
  "preliminary_data" text,
  "submitted_by" integer REFERENCES "scientists"("id"),
  "office_comments" json DEFAULT '[]',
  "pi_comments" json DEFAULT '[]',
  "review_history" json DEFAULT '[]',
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- RA-205A Applications
CREATE TABLE IF NOT EXISTS "ra205a_applications" (
  "id" serial PRIMARY KEY,
  "application_id" text NOT NULL UNIQUE,
  "status" text NOT NULL DEFAULT 'draft',
  "title" text NOT NULL,
  "lead_scientist_id" integer REFERENCES "scientists"("id"),
  "project_id" integer REFERENCES "projects"("id"),
  "budget_holder_id" integer REFERENCES "scientists"("id"),
  "budget_source" text,
  "sdr_number" text,
  "current_title" text,
  "activity_type" text,
  "change_category" json,
  "change_reason" text,
  "change_request_number" text,
  "current_pi_id" integer REFERENCES "scientists"("id"),
  "new_pi_id" integer REFERENCES "scientists"("id"),
  "current_pi_signature" json,
  "new_pi_signature" json,
  "stakeholder_certifications" json,
  "submitted_by" integer REFERENCES "scientists"("id"),
  "office_comments" json DEFAULT '[]',
  "pi_comments" json DEFAULT '[]',
  "review_history" json DEFAULT '[]',
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Team Members
CREATE TABLE IF NOT EXISTS "team_members" (
  "id" serial PRIMARY KEY,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "title" text,
  "bio" text,
  "photo_url" text,
  "categories" text[] NOT NULL DEFAULT '{}',
  "element_type" text,
  "institution" text,
  "email" text,
  "linkedin_url" text,
  "display_order" integer DEFAULT 0,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
