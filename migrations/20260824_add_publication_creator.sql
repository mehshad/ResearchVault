ALTER TABLE "publications"
ADD COLUMN IF NOT EXISTS "created_by_user_id" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'publications_created_by_user_id_fk'
  ) THEN
    ALTER TABLE "publications"
    ADD CONSTRAINT "publications_created_by_user_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "publications_created_by_user_id_idx"
ON "publications" ("created_by_user_id");

WITH creation_history AS (
  SELECT DISTINCT ON (history.publication_id)
    history.publication_id,
    COALESCE(direct_user.id, linked_user.id) AS creator_user_id
  FROM "manuscript_history" history
  LEFT JOIN "users" direct_user
    ON direct_user.id = history.changed_by
  LEFT JOIN "users" linked_user
    ON linked_user.scientist_id = history.changed_by
  WHERE COALESCE(history.from_status, '') = ''
    AND (
      history.change_reason = 'Publication created'
      OR history.change_reason LIKE 'Imported %'
    )
    AND COALESCE(direct_user.id, linked_user.id) IS NOT NULL
  ORDER BY history.publication_id, history.created_at ASC, history.id ASC
)
UPDATE "publications" publication
SET "created_by_user_id" = creation_history.creator_user_id
FROM creation_history
WHERE publication.id = creation_history.publication_id
  AND publication.created_by_user_id IS NULL;