-- #7: real foreign keys on the core relationship columns. Until now sixty-odd
-- columns had only a "references X.id" comment; the database let a link
-- point at nothing. Each constraint follows one of three rules, chosen per
-- column in shared/schema.ts (which declares the same references):
--   CASCADE   pure link rows and children go with their parent
--   SET NULL  a nullable assignment of a person, or a who-did-it column,
--             is cleared when that person or account goes
--   RESTRICT  structural parents and NOT NULL people: the application
--             refuses the delete first (#6), the database second
-- Orphans are removed (CASCADE) or cleared (SET NULL) before the constraint
-- is added; a RESTRICT column with an orphan is reported and left for a hand
-- fix rather than guessed at. Safe to re-run: every block is skipped once its
-- constraint exists. Constraint names are the ones Drizzle generates, cut to
-- Postgres's 63 characters, so a pushed development database matches.

-- Drift from earlier migrations: publications.created_by_user_id carried two
-- identical constraints, and ibc_application_research_activities two identical
-- unique indexes. One of each remains, under the name the schema declares.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'publications_created_by_user_id_fk') THEN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'publications_created_by_user_id_users_id_fk') THEN
      ALTER TABLE publications DROP CONSTRAINT publications_created_by_user_id_fk;
    ELSE
      ALTER TABLE publications RENAME CONSTRAINT publications_created_by_user_id_fk TO publications_created_by_user_id_users_id_fk;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ibc_application_research_activities_ibc_application_id_research')
     AND EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ibc_app_ra_unique_idx') THEN
    DROP INDEX ibc_application_research_activities_ibc_application_id_research;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_members_research_activity_id_research_activities_id_fk') THEN
    DELETE FROM project_members t WHERE t.research_activity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM research_activities r WHERE r.id = t.research_activity_id);
    ALTER TABLE project_members ADD CONSTRAINT project_members_research_activity_id_research_activities_id_fk
      FOREIGN KEY (research_activity_id) REFERENCES research_activities(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key project_members_research_activity_id_research_activities_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_members_scientist_id_scientists_id_fk') THEN
    DELETE FROM project_members t WHERE t.scientist_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scientists r WHERE r.id = t.scientist_id);
    ALTER TABLE project_members ADD CONSTRAINT project_members_scientist_id_scientists_id_fk
      FOREIGN KEY (scientist_id) REFERENCES scientists(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key project_members_scientist_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'publication_authors_publication_id_publications_id_fk') THEN
    DELETE FROM publication_authors t WHERE t.publication_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM publications r WHERE r.id = t.publication_id);
    ALTER TABLE publication_authors ADD CONSTRAINT publication_authors_publication_id_publications_id_fk
      FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key publication_authors_publication_id_publications_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'publication_authors_scientist_id_scientists_id_fk') THEN
    DELETE FROM publication_authors t WHERE t.scientist_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scientists r WHERE r.id = t.scientist_id);
    ALTER TABLE publication_authors ADD CONSTRAINT publication_authors_scientist_id_scientists_id_fk
      FOREIGN KEY (scientist_id) REFERENCES scientists(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key publication_authors_scientist_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'publication_research_activities_publication_id_publications_id_') THEN
    DELETE FROM publication_research_activities t WHERE t.publication_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM publications r WHERE r.id = t.publication_id);
    ALTER TABLE publication_research_activities ADD CONSTRAINT publication_research_activities_publication_id_publications_id_
      FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key publication_research_activities_publication_id_publications_id_ NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'publication_research_activities_research_activity_id_research_a') THEN
    DELETE FROM publication_research_activities t WHERE t.research_activity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM research_activities r WHERE r.id = t.research_activity_id);
    ALTER TABLE publication_research_activities ADD CONSTRAINT publication_research_activities_research_activity_id_research_a
      FOREIGN KEY (research_activity_id) REFERENCES research_activities(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key publication_research_activities_research_activity_id_research_a NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grant_research_activities_grant_id_grants_id_fk') THEN
    DELETE FROM grant_research_activities t WHERE t.grant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM grants r WHERE r.id = t.grant_id);
    ALTER TABLE grant_research_activities ADD CONSTRAINT grant_research_activities_grant_id_grants_id_fk
      FOREIGN KEY (grant_id) REFERENCES grants(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key grant_research_activities_grant_id_grants_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grant_research_activities_research_activity_id_research_activit') THEN
    DELETE FROM grant_research_activities t WHERE t.research_activity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM research_activities r WHERE r.id = t.research_activity_id);
    ALTER TABLE grant_research_activities ADD CONSTRAINT grant_research_activities_research_activity_id_research_activit
      FOREIGN KEY (research_activity_id) REFERENCES research_activities(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key grant_research_activities_research_activity_id_research_activit NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ibc_application_research_activities_ibc_application_id_ibc_appl') THEN
    DELETE FROM ibc_application_research_activities t WHERE t.ibc_application_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ibc_applications r WHERE r.id = t.ibc_application_id);
    ALTER TABLE ibc_application_research_activities ADD CONSTRAINT ibc_application_research_activities_ibc_application_id_ibc_appl
      FOREIGN KEY (ibc_application_id) REFERENCES ibc_applications(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key ibc_application_research_activities_ibc_application_id_ibc_appl NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ibc_application_research_activities_research_activity_id_resear') THEN
    DELETE FROM ibc_application_research_activities t WHERE t.research_activity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM research_activities r WHERE r.id = t.research_activity_id);
    ALTER TABLE ibc_application_research_activities ADD CONSTRAINT ibc_application_research_activities_research_activity_id_resear
      FOREIGN KEY (research_activity_id) REFERENCES research_activities(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key ibc_application_research_activities_research_activity_id_resear NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ibc_application_rooms_application_id_ibc_applications_id_fk') THEN
    DELETE FROM ibc_application_rooms t WHERE t.application_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ibc_applications r WHERE r.id = t.application_id);
    ALTER TABLE ibc_application_rooms ADD CONSTRAINT ibc_application_rooms_application_id_ibc_applications_id_fk
      FOREIGN KEY (application_id) REFERENCES ibc_applications(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key ibc_application_rooms_application_id_ibc_applications_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ibc_application_rooms_room_id_rooms_id_fk') THEN
    DELETE FROM ibc_application_rooms t WHERE t.room_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM rooms r WHERE r.id = t.room_id);
    ALTER TABLE ibc_application_rooms ADD CONSTRAINT ibc_application_rooms_room_id_rooms_id_fk
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key ibc_application_rooms_room_id_rooms_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ibc_backbone_source_rooms_application_id_ibc_applications_id_fk') THEN
    DELETE FROM ibc_backbone_source_rooms t WHERE t.application_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ibc_applications r WHERE r.id = t.application_id);
    ALTER TABLE ibc_backbone_source_rooms ADD CONSTRAINT ibc_backbone_source_rooms_application_id_ibc_applications_id_fk
      FOREIGN KEY (application_id) REFERENCES ibc_applications(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key ibc_backbone_source_rooms_application_id_ibc_applications_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ibc_backbone_source_rooms_room_id_rooms_id_fk') THEN
    DELETE FROM ibc_backbone_source_rooms t WHERE t.room_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM rooms r WHERE r.id = t.room_id);
    ALTER TABLE ibc_backbone_source_rooms ADD CONSTRAINT ibc_backbone_source_rooms_room_id_rooms_id_fk
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key ibc_backbone_source_rooms_room_id_rooms_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ibc_application_ppe_application_id_ibc_applications_id_fk') THEN
    DELETE FROM ibc_application_ppe t WHERE t.application_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ibc_applications r WHERE r.id = t.application_id);
    ALTER TABLE ibc_application_ppe ADD CONSTRAINT ibc_application_ppe_application_id_ibc_applications_id_fk
      FOREIGN KEY (application_id) REFERENCES ibc_applications(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key ibc_application_ppe_application_id_ibc_applications_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ibc_application_ppe_room_id_rooms_id_fk') THEN
    DELETE FROM ibc_application_ppe t WHERE t.room_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM rooms r WHERE r.id = t.room_id);
    ALTER TABLE ibc_application_ppe ADD CONSTRAINT ibc_application_ppe_room_id_rooms_id_fk
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key ibc_application_ppe_room_id_rooms_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'manuscript_history_publication_id_publications_id_fk') THEN
    DELETE FROM manuscript_history t WHERE t.publication_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM publications r WHERE r.id = t.publication_id);
    ALTER TABLE manuscript_history ADD CONSTRAINT manuscript_history_publication_id_publications_id_fk
      FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key manuscript_history_publication_id_publications_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'data_management_plans_research_activity_id_research_activities_') THEN
    DELETE FROM data_management_plans t WHERE t.research_activity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM research_activities r WHERE r.id = t.research_activity_id);
    ALTER TABLE data_management_plans ADD CONSTRAINT data_management_plans_research_activity_id_research_activities_
      FOREIGN KEY (research_activity_id) REFERENCES research_activities(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key data_management_plans_research_activity_id_research_activities_ NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_contract_scope_items_contract_id_research_contracts_id') THEN
    DELETE FROM research_contract_scope_items t WHERE t.contract_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM research_contracts r WHERE r.id = t.contract_id);
    ALTER TABLE research_contract_scope_items ADD CONSTRAINT research_contract_scope_items_contract_id_research_contracts_id
      FOREIGN KEY (contract_id) REFERENCES research_contracts(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key research_contract_scope_items_contract_id_research_contracts_id NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_contract_extensions_contract_id_research_contracts_id_') THEN
    DELETE FROM research_contract_extensions t WHERE t.contract_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM research_contracts r WHERE r.id = t.contract_id);
    ALTER TABLE research_contract_extensions ADD CONSTRAINT research_contract_extensions_contract_id_research_contracts_id_
      FOREIGN KEY (contract_id) REFERENCES research_contracts(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key research_contract_extensions_contract_id_research_contracts_id_ NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_contract_documents_contract_id_research_contracts_id_f') THEN
    DELETE FROM research_contract_documents t WHERE t.contract_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM research_contracts r WHERE r.id = t.contract_id);
    ALTER TABLE research_contract_documents ADD CONSTRAINT research_contract_documents_contract_id_research_contracts_id_f
      FOREIGN KEY (contract_id) REFERENCES research_contracts(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key research_contract_documents_contract_id_research_contracts_id_f NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_contract_documents_extension_id_research_contract_exte') THEN
    DELETE FROM research_contract_documents t WHERE t.extension_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM research_contract_extensions r WHERE r.id = t.extension_id);
    ALTER TABLE research_contract_documents ADD CONSTRAINT research_contract_documents_extension_id_research_contract_exte
      FOREIGN KEY (extension_id) REFERENCES research_contract_extensions(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key research_contract_documents_extension_id_research_contract_exte NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grant_progress_reports_grant_id_grants_id_fk') THEN
    DELETE FROM grant_progress_reports t WHERE t.grant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM grants r WHERE r.id = t.grant_id);
    ALTER TABLE grant_progress_reports ADD CONSTRAINT grant_progress_reports_grant_id_grants_id_fk
      FOREIGN KEY (grant_id) REFERENCES grants(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key grant_progress_reports_grant_id_grants_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'irb_submissions_application_id_irb_applications_id_fk') THEN
    DELETE FROM irb_submissions t WHERE t.application_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM irb_applications r WHERE r.id = t.application_id);
    ALTER TABLE irb_submissions ADD CONSTRAINT irb_submissions_application_id_irb_applications_id_fk
      FOREIGN KEY (application_id) REFERENCES irb_applications(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key irb_submissions_application_id_irb_applications_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'irb_documents_application_id_irb_applications_id_fk') THEN
    DELETE FROM irb_documents t WHERE t.application_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM irb_applications r WHERE r.id = t.application_id);
    ALTER TABLE irb_documents ADD CONSTRAINT irb_documents_application_id_irb_applications_id_fk
      FOREIGN KEY (application_id) REFERENCES irb_applications(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key irb_documents_application_id_irb_applications_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'irb_documents_submission_id_irb_submissions_id_fk') THEN
    DELETE FROM irb_documents t WHERE t.submission_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM irb_submissions r WHERE r.id = t.submission_id);
    ALTER TABLE irb_documents ADD CONSTRAINT irb_documents_submission_id_irb_submissions_id_fk
      FOREIGN KEY (submission_id) REFERENCES irb_submissions(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key irb_documents_submission_id_irb_submissions_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ibc_submissions_application_id_ibc_applications_id_fk') THEN
    DELETE FROM ibc_submissions t WHERE t.application_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ibc_applications r WHERE r.id = t.application_id);
    ALTER TABLE ibc_submissions ADD CONSTRAINT ibc_submissions_application_id_ibc_applications_id_fk
      FOREIGN KEY (application_id) REFERENCES ibc_applications(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key ibc_submissions_application_id_ibc_applications_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ibc_documents_application_id_ibc_applications_id_fk') THEN
    DELETE FROM ibc_documents t WHERE t.application_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ibc_applications r WHERE r.id = t.application_id);
    ALTER TABLE ibc_documents ADD CONSTRAINT ibc_documents_application_id_ibc_applications_id_fk
      FOREIGN KEY (application_id) REFERENCES ibc_applications(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key ibc_documents_application_id_ibc_applications_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ibc_documents_submission_id_ibc_submissions_id_fk') THEN
    DELETE FROM ibc_documents t WHERE t.submission_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ibc_submissions r WHERE r.id = t.submission_id);
    ALTER TABLE ibc_documents ADD CONSTRAINT ibc_documents_submission_id_ibc_submissions_id_fk
      FOREIGN KEY (submission_id) REFERENCES ibc_submissions(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key ibc_documents_submission_id_ibc_submissions_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ibc_application_comments_application_id_ibc_applications_id_fk') THEN
    DELETE FROM ibc_application_comments t WHERE t.application_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ibc_applications r WHERE r.id = t.application_id);
    ALTER TABLE ibc_application_comments ADD CONSTRAINT ibc_application_comments_application_id_ibc_applications_id_fk
      FOREIGN KEY (application_id) REFERENCES ibc_applications(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key ibc_application_comments_application_id_ibc_applications_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'certifications_scientist_id_scientists_id_fk') THEN
    DELETE FROM certifications t WHERE t.scientist_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scientists r WHERE r.id = t.scientist_id);
    ALTER TABLE certifications ADD CONSTRAINT certifications_scientist_id_scientists_id_fk
      FOREIGN KEY (scientist_id) REFERENCES scientists(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key certifications_scientist_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_scientist_id_scientists_id_fk') THEN
    UPDATE users t SET scientist_id = NULL WHERE t.scientist_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scientists r WHERE r.id = t.scientist_id);
    ALTER TABLE users ADD CONSTRAINT users_scientist_id_scientists_id_fk
      FOREIGN KEY (scientist_id) REFERENCES scientists(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key users_scientist_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scientists_department_id_departments_id_fk') THEN
    UPDATE scientists t SET department_id = NULL WHERE t.department_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM departments r WHERE r.id = t.department_id);
    ALTER TABLE scientists ADD CONSTRAINT scientists_department_id_departments_id_fk
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key scientists_department_id_departments_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scientists_section_id_sections_id_fk') THEN
    UPDATE scientists t SET section_id = NULL WHERE t.section_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sections r WHERE r.id = t.section_id);
    ALTER TABLE scientists ADD CONSTRAINT scientists_section_id_sections_id_fk
      FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key scientists_section_id_sections_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scientists_supervisor_id_scientists_id_fk') THEN
    UPDATE scientists t SET supervisor_id = NULL WHERE t.supervisor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scientists r WHERE r.id = t.supervisor_id);
    ALTER TABLE scientists ADD CONSTRAINT scientists_supervisor_id_scientists_id_fk
      FOREIGN KEY (supervisor_id) REFERENCES scientists(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key scientists_supervisor_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branches_head_id_scientists_id_fk') THEN
    UPDATE branches t SET head_id = NULL WHERE t.head_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scientists r WHERE r.id = t.head_id);
    ALTER TABLE branches ADD CONSTRAINT branches_head_id_scientists_id_fk
      FOREIGN KEY (head_id) REFERENCES scientists(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key branches_head_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_head_id_scientists_id_fk') THEN
    UPDATE departments t SET head_id = NULL WHERE t.head_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scientists r WHERE r.id = t.head_id);
    ALTER TABLE departments ADD CONSTRAINT departments_head_id_scientists_id_fk
      FOREIGN KEY (head_id) REFERENCES scientists(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key departments_head_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sections_head_id_scientists_id_fk') THEN
    UPDATE sections t SET head_id = NULL WHERE t.head_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scientists r WHERE r.id = t.head_id);
    ALTER TABLE sections ADD CONSTRAINT sections_head_id_scientists_id_fk
      FOREIGN KEY (head_id) REFERENCES scientists(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key sections_head_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programs_program_director_id_scientists_id_fk') THEN
    UPDATE programs t SET program_director_id = NULL WHERE t.program_director_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scientists r WHERE r.id = t.program_director_id);
    ALTER TABLE programs ADD CONSTRAINT programs_program_director_id_scientists_id_fk
      FOREIGN KEY (program_director_id) REFERENCES scientists(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key programs_program_director_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programs_research_co_lead_id_scientists_id_fk') THEN
    UPDATE programs t SET research_co_lead_id = NULL WHERE t.research_co_lead_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scientists r WHERE r.id = t.research_co_lead_id);
    ALTER TABLE programs ADD CONSTRAINT programs_research_co_lead_id_scientists_id_fk
      FOREIGN KEY (research_co_lead_id) REFERENCES scientists(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key programs_research_co_lead_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programs_clinical_co_lead_1_id_scientists_id_fk') THEN
    UPDATE programs t SET clinical_co_lead_1_id = NULL WHERE t.clinical_co_lead_1_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scientists r WHERE r.id = t.clinical_co_lead_1_id);
    ALTER TABLE programs ADD CONSTRAINT programs_clinical_co_lead_1_id_scientists_id_fk
      FOREIGN KEY (clinical_co_lead_1_id) REFERENCES scientists(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key programs_clinical_co_lead_1_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programs_clinical_co_lead_2_id_scientists_id_fk') THEN
    UPDATE programs t SET clinical_co_lead_2_id = NULL WHERE t.clinical_co_lead_2_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scientists r WHERE r.id = t.clinical_co_lead_2_id);
    ALTER TABLE programs ADD CONSTRAINT programs_clinical_co_lead_2_id_scientists_id_fk
      FOREIGN KEY (clinical_co_lead_2_id) REFERENCES scientists(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key programs_clinical_co_lead_2_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_principal_investigator_id_scientists_id_fk') THEN
    UPDATE projects t SET principal_investigator_id = NULL WHERE t.principal_investigator_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scientists r WHERE r.id = t.principal_investigator_id);
    ALTER TABLE projects ADD CONSTRAINT projects_principal_investigator_id_scientists_id_fk
      FOREIGN KEY (principal_investigator_id) REFERENCES scientists(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key projects_principal_investigator_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_activities_budget_holder_id_scientists_id_fk') THEN
    UPDATE research_activities t SET budget_holder_id = NULL WHERE t.budget_holder_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scientists r WHERE r.id = t.budget_holder_id);
    ALTER TABLE research_activities ADD CONSTRAINT research_activities_budget_holder_id_scientists_id_fk
      FOREIGN KEY (budget_holder_id) REFERENCES scientists(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key research_activities_budget_holder_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'publication_authors_linked_by_user_id_users_id_fk') THEN
    UPDATE publication_authors t SET linked_by_user_id = NULL WHERE t.linked_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users r WHERE r.id = t.linked_by_user_id);
    ALTER TABLE publication_authors ADD CONSTRAINT publication_authors_linked_by_user_id_users_id_fk
      FOREIGN KEY (linked_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key publication_authors_linked_by_user_id_users_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_contracts_lead_pi_id_scientists_id_fk') THEN
    UPDATE research_contracts t SET lead_pi_id = NULL WHERE t.lead_pi_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scientists r WHERE r.id = t.lead_pi_id);
    ALTER TABLE research_contracts ADD CONSTRAINT research_contracts_lead_pi_id_scientists_id_fk
      FOREIGN KEY (lead_pi_id) REFERENCES scientists(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key research_contracts_lead_pi_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_contracts_requested_by_user_id_users_id_fk') THEN
    UPDATE research_contracts t SET requested_by_user_id = NULL WHERE t.requested_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users r WHERE r.id = t.requested_by_user_id);
    ALTER TABLE research_contracts ADD CONSTRAINT research_contracts_requested_by_user_id_users_id_fk
      FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key research_contracts_requested_by_user_id_users_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_roomSupervisorId_scientists_id_fk') THEN
    UPDATE rooms t SET "roomSupervisorId" = NULL WHERE t."roomSupervisorId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scientists r WHERE r.id = t."roomSupervisorId");
    ALTER TABLE rooms ADD CONSTRAINT "rooms_roomSupervisorId_scientists_id_fk"
      FOREIGN KEY ("roomSupervisorId") REFERENCES scientists(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key rooms_roomSupervisorId_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_roomManagerId_scientists_id_fk') THEN
    UPDATE rooms t SET "roomManagerId" = NULL WHERE t."roomManagerId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scientists r WHERE r.id = t."roomManagerId");
    ALTER TABLE rooms ADD CONSTRAINT "rooms_roomManagerId_scientists_id_fk"
      FOREIGN KEY ("roomManagerId") REFERENCES scientists(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key rooms_roomManagerId_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ibc_application_comments_author_id_scientists_id_fk') THEN
    UPDATE ibc_application_comments t SET author_id = NULL WHERE t.author_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scientists r WHERE r.id = t.author_id);
    ALTER TABLE ibc_application_comments ADD CONSTRAINT ibc_application_comments_author_id_scientists_id_fk
      FOREIGN KEY (author_id) REFERENCES scientists(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key ibc_application_comments_author_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ibc_submissions_reviewed_by_scientists_id_fk') THEN
    UPDATE ibc_submissions t SET reviewed_by = NULL WHERE t.reviewed_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scientists r WHERE r.id = t.reviewed_by);
    ALTER TABLE ibc_submissions ADD CONSTRAINT ibc_submissions_reviewed_by_scientists_id_fk
      FOREIGN KEY (reviewed_by) REFERENCES scientists(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key ibc_submissions_reviewed_by_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grants_lpi_id_scientists_id_fk') THEN
    UPDATE grants t SET lpi_id = NULL WHERE t.lpi_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scientists r WHERE r.id = t.lpi_id);
    ALTER TABLE grants ADD CONSTRAINT grants_lpi_id_scientists_id_fk
      FOREIGN KEY (lpi_id) REFERENCES scientists(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key grants_lpi_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pdf_import_history_assigned_scientist_id_scientists_id_fk') THEN
    UPDATE pdf_import_history t SET assigned_scientist_id = NULL WHERE t.assigned_scientist_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scientists r WHERE r.id = t.assigned_scientist_id);
    ALTER TABLE pdf_import_history ADD CONSTRAINT pdf_import_history_assigned_scientist_id_scientists_id_fk
      FOREIGN KEY (assigned_scientist_id) REFERENCES scientists(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key pdf_import_history_assigned_scientist_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_program_id_programs_id_fk') THEN
    -- RESTRICT: an orphan here is a data fault to fix by hand; the ALTER below reports it
    ALTER TABLE projects ADD CONSTRAINT projects_program_id_programs_id_fk
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key projects_program_id_programs_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_activities_project_id_projects_id_fk') THEN
    -- RESTRICT: an orphan here is a data fault to fix by hand; the ALTER below reports it
    ALTER TABLE research_activities ADD CONSTRAINT research_activities_project_id_projects_id_fk
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key research_activities_project_id_projects_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'publications_research_activity_id_research_activities_id_fk') THEN
    -- RESTRICT: an orphan here is a data fault to fix by hand; the ALTER below reports it
    ALTER TABLE publications ADD CONSTRAINT publications_research_activity_id_research_activities_id_fk
      FOREIGN KEY (research_activity_id) REFERENCES research_activities(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key publications_research_activity_id_research_activities_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patents_research_activity_id_research_activities_id_fk') THEN
    -- RESTRICT: an orphan here is a data fault to fix by hand; the ALTER below reports it
    ALTER TABLE patents ADD CONSTRAINT patents_research_activity_id_research_activities_id_fk
      FOREIGN KEY (research_activity_id) REFERENCES research_activities(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key patents_research_activity_id_research_activities_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'irb_applications_research_activity_id_research_activities_id_fk') THEN
    -- RESTRICT: an orphan here is a data fault to fix by hand; the ALTER below reports it
    ALTER TABLE irb_applications ADD CONSTRAINT irb_applications_research_activity_id_research_activities_id_fk
      FOREIGN KEY (research_activity_id) REFERENCES research_activities(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key irb_applications_research_activity_id_research_activities_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_contracts_research_activity_id_research_activities_id_') THEN
    -- RESTRICT: an orphan here is a data fault to fix by hand; the ALTER below reports it
    ALTER TABLE research_contracts ADD CONSTRAINT research_contracts_research_activity_id_research_activities_id_
      FOREIGN KEY (research_activity_id) REFERENCES research_activities(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key research_contracts_research_activity_id_research_activities_id_ NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_branch_id_branches_id_fk') THEN
    -- RESTRICT: an orphan here is a data fault to fix by hand; the ALTER below reports it
    ALTER TABLE departments ADD CONSTRAINT departments_branch_id_branches_id_fk
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key departments_branch_id_branches_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sections_department_id_departments_id_fk') THEN
    -- RESTRICT: an orphan here is a data fault to fix by hand; the ALTER below reports it
    ALTER TABLE sections ADD CONSTRAINT sections_department_id_departments_id_fk
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key sections_department_id_departments_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_buildingId_buildings_id_fk') THEN
    -- RESTRICT: an orphan here is a data fault to fix by hand; the ALTER below reports it
    ALTER TABLE rooms ADD CONSTRAINT "rooms_buildingId_buildings_id_fk"
      FOREIGN KEY ("buildingId") REFERENCES buildings(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key rooms_buildingId_buildings_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'irb_applications_principal_investigator_id_scientists_id_fk') THEN
    -- RESTRICT: an orphan here is a data fault to fix by hand; the ALTER below reports it
    ALTER TABLE irb_applications ADD CONSTRAINT irb_applications_principal_investigator_id_scientists_id_fk
      FOREIGN KEY (principal_investigator_id) REFERENCES scientists(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key irb_applications_principal_investigator_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ibc_applications_principal_investigator_id_scientists_id_fk') THEN
    -- RESTRICT: an orphan here is a data fault to fix by hand; the ALTER below reports it
    ALTER TABLE ibc_applications ADD CONSTRAINT ibc_applications_principal_investigator_id_scientists_id_fk
      FOREIGN KEY (principal_investigator_id) REFERENCES scientists(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key ibc_applications_principal_investigator_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'irb_submissions_submitted_by_scientists_id_fk') THEN
    -- RESTRICT: an orphan here is a data fault to fix by hand; the ALTER below reports it
    ALTER TABLE irb_submissions ADD CONSTRAINT irb_submissions_submitted_by_scientists_id_fk
      FOREIGN KEY (submitted_by) REFERENCES scientists(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key irb_submissions_submitted_by_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'irb_documents_uploaded_by_scientists_id_fk') THEN
    -- RESTRICT: an orphan here is a data fault to fix by hand; the ALTER below reports it
    ALTER TABLE irb_documents ADD CONSTRAINT irb_documents_uploaded_by_scientists_id_fk
      FOREIGN KEY (uploaded_by) REFERENCES scientists(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key irb_documents_uploaded_by_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ibc_submissions_submitted_by_scientists_id_fk') THEN
    -- RESTRICT: an orphan here is a data fault to fix by hand; the ALTER below reports it
    ALTER TABLE ibc_submissions ADD CONSTRAINT ibc_submissions_submitted_by_scientists_id_fk
      FOREIGN KEY (submitted_by) REFERENCES scientists(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key ibc_submissions_submitted_by_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ibc_documents_uploaded_by_scientists_id_fk') THEN
    -- RESTRICT: an orphan here is a data fault to fix by hand; the ALTER below reports it
    ALTER TABLE ibc_documents ADD CONSTRAINT ibc_documents_uploaded_by_scientists_id_fk
      FOREIGN KEY (uploaded_by) REFERENCES scientists(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key ibc_documents_uploaded_by_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'irb_board_members_scientist_id_scientists_id_fk') THEN
    -- RESTRICT: an orphan here is a data fault to fix by hand; the ALTER below reports it
    ALTER TABLE irb_board_members ADD CONSTRAINT irb_board_members_scientist_id_scientists_id_fk
      FOREIGN KEY (scientist_id) REFERENCES scientists(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key irb_board_members_scientist_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ibc_board_members_scientist_id_scientists_id_fk') THEN
    -- RESTRICT: an orphan here is a data fault to fix by hand; the ALTER below reports it
    ALTER TABLE ibc_board_members ADD CONSTRAINT ibc_board_members_scientist_id_scientists_id_fk
      FOREIGN KEY (scientist_id) REFERENCES scientists(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key ibc_board_members_scientist_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grant_progress_reports_uploaded_by_scientists_id_fk') THEN
    -- RESTRICT: an orphan here is a data fault to fix by hand; the ALTER below reports it
    ALTER TABLE grant_progress_reports ADD CONSTRAINT grant_progress_reports_uploaded_by_scientists_id_fk
      FOREIGN KEY (uploaded_by) REFERENCES scientists(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key grant_progress_reports_uploaded_by_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'certifications_uploaded_by_scientists_id_fk') THEN
    -- RESTRICT: an orphan here is a data fault to fix by hand; the ALTER below reports it
    ALTER TABLE certifications ADD CONSTRAINT certifications_uploaded_by_scientists_id_fk
      FOREIGN KEY (uploaded_by) REFERENCES scientists(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key certifications_uploaded_by_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'certifications_module_id_certification_modules_id_fk') THEN
    -- RESTRICT: an orphan here is a data fault to fix by hand; the ALTER below reports it
    ALTER TABLE certifications ADD CONSTRAINT certifications_module_id_certification_modules_id_fk
      FOREIGN KEY (module_id) REFERENCES certification_modules(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key certifications_module_id_certification_modules_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pdf_import_history_uploaded_by_users_id_fk') THEN
    -- RESTRICT: an orphan here is a data fault to fix by hand; the ALTER below reports it
    ALTER TABLE pdf_import_history ADD CONSTRAINT pdf_import_history_uploaded_by_users_id_fk
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key pdf_import_history_uploaded_by_users_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_contract_documents_uploaded_by_user_id_users_id_fk') THEN
    -- RESTRICT: an orphan here is a data fault to fix by hand; the ALTER below reports it
    ALTER TABLE research_contract_documents ADD CONSTRAINT research_contract_documents_uploaded_by_user_id_users_id_fk
      FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key research_contract_documents_uploaded_by_user_id_users_id_fk NOT added: %', SQLERRM;
END $$;

-- Declared in the schema for the first time; earlier migrations created these already, so the blocks are no-ops there.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_permissions_role_group_id_role_groups_id_fk') THEN
    DELETE FROM role_permissions t WHERE t.role_group_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM role_groups r WHERE r.id = t.role_group_id);
    ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_group_id_role_groups_id_fk
      FOREIGN KEY (role_group_id) REFERENCES role_groups(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key role_permissions_role_group_id_role_groups_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grant_collaborating_institutions_grant_id_grants_id_fk') THEN
    DELETE FROM grant_collaborating_institutions t WHERE t.grant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM grants r WHERE r.id = t.grant_id);
    ALTER TABLE grant_collaborating_institutions ADD CONSTRAINT grant_collaborating_institutions_grant_id_grants_id_fk
      FOREIGN KEY (grant_id) REFERENCES grants(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key grant_collaborating_institutions_grant_id_grants_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grant_co_investigators_grant_id_grants_id_fk') THEN
    DELETE FROM grant_co_investigators t WHERE t.grant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM grants r WHERE r.id = t.grant_id);
    ALTER TABLE grant_co_investigators ADD CONSTRAINT grant_co_investigators_grant_id_grants_id_fk
      FOREIGN KEY (grant_id) REFERENCES grants(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key grant_co_investigators_grant_id_grants_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grant_co_investigators_scientist_id_scientists_id_fk') THEN
    DELETE FROM grant_co_investigators t WHERE t.scientist_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scientists r WHERE r.id = t.scientist_id);
    ALTER TABLE grant_co_investigators ADD CONSTRAINT grant_co_investigators_scientist_id_scientists_id_fk
      FOREIGN KEY (scientist_id) REFERENCES scientists(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key grant_co_investigators_scientist_id_scientists_id_fk NOT added: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grant_institution_collaborators_institution_id_grant_collaborat') THEN
    DELETE FROM grant_institution_collaborators t WHERE t.institution_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM grant_collaborating_institutions r WHERE r.id = t.institution_id);
    ALTER TABLE grant_institution_collaborators ADD CONSTRAINT grant_institution_collaborators_institution_id_grant_collaborat
      FOREIGN KEY (institution_id) REFERENCES grant_collaborating_institutions(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN
  RAISE WARNING 'foreign key grant_institution_collaborators_institution_id_grant_collaborat NOT added: %', SQLERRM;
END $$;
