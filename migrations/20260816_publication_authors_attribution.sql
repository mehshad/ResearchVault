-- Add attribution columns to publication_authors
ALTER TABLE publication_authors
  ADD COLUMN IF NOT EXISTS linked_by_user_id integer,
  ADD COLUMN IF NOT EXISTS link_method text NOT NULL DEFAULT 'manual';
