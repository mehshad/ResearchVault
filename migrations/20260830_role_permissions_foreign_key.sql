-- Make role_permissions.role_group_id a real foreign key.
--
-- The column was documented as "FK to role_groups" but never declared as one,
-- so deleting a role left its permission rows behind. They are invisible: every
-- read joins role_groups, so nothing displays them, exports them, or applies
-- them. They are not harmless, though — role_groups.id comes from a sequence,
-- and an id that ever came round again would silently attach a retired role's
-- permissions to a new one.
--
-- Deletes the orphans first, then adds the constraint with ON DELETE CASCADE so
-- retiring a role takes its matrix rows with it, which is what every
-- consolidation migration has had to do by hand.
--
-- Idempotent: the entrypoint replays every migration on each container start.

BEGIN;

DELETE FROM role_permissions rp
WHERE NOT EXISTS (
  SELECT 1 FROM role_groups rg WHERE rg.id = rp.role_group_id
);

ALTER TABLE role_permissions
  DROP CONSTRAINT IF EXISTS role_permissions_role_group_id_role_groups_id_fk;

ALTER TABLE role_permissions
  ADD CONSTRAINT role_permissions_role_group_id_role_groups_id_fk
  FOREIGN KEY (role_group_id) REFERENCES role_groups(id) ON DELETE CASCADE;

COMMIT;
