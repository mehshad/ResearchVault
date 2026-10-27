-- #49: calendar dates were stored as timestamp without time zone. Midnight
-- serialised as an instant and shown in another zone displays the previous
-- day, and the insert schemas would only accept a full ISO date-time. These
-- columns hold a day, not a moment, so they become date, as grants and
-- certifications already were.
--
-- Limited to the tables in use: research activities, publications, patents.
-- The IRB, IBC and board-member date columns keep their type until those
-- modules are switched on.
--
-- Safe to re-run: each ALTER is skipped once the column is already a date.

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('research_activities', 'start_date'),
      ('research_activities', 'end_date'),
      ('publications', 'publication_date'),
      ('patents', 'filing_date'),
      ('patents', 'grant_date')
    ) AS t(table_name, column_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = target.table_name
        AND c.column_name = target.column_name AND c.data_type <> 'date'
    ) THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE date USING %I::date',
                     target.table_name, target.column_name, target.column_name);
    END IF;
  END LOOP;
END $$;
