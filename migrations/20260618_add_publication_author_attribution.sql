-- Author-link attribution for publication_authors.
-- Records who created each internal-author link and whether it was made
-- manually (detail page) or automatically (auto-connect / discovery import).
-- Idempotent and safe on existing rows (legacy links default to 'manual').

ALTER TABLE "publication_authors"
  ADD COLUMN IF NOT EXISTS "linked_by_user_id" integer;

ALTER TABLE "publication_authors"
  ADD COLUMN IF NOT EXISTS "link_method" text NOT NULL DEFAULT 'manual';
