-- The programme a grant belongs to, chosen at submission.
--
-- Asked for by the grants office: a grant is submitted under a programme, and
-- that choice should limit which SDRs can be attached to it later, once the
-- grant is awarded and SDR linking opens.
--
-- The limit is: an SDR may be linked when its own project sits in the grant's
-- programme. A null on either side restricts nothing -- a grant naming no
-- programme has nothing to narrow by, and an SDR reaching no programme is not
-- excluded by one it cannot be compared against. See
-- shared/grantProgramScope.ts, which is where the rule actually lives; this
-- column only records the choice.
--
-- Nullable, and null on all 272 existing grants. Requiring it would have made
-- every one of them unsaveable until somebody guessed a programme for it.
--
-- No foreign key cascade: deleting a programme that grants point at should
-- fail rather than silently unfile them, which is what the plain REFERENCES
-- gives.
--
-- Reaches production through docker-entrypoint.sh, which applies this list and
-- never runs drizzle-kit push, so a column living only in shared/schema.ts
-- would be present in development and absent in production.
ALTER TABLE "grants"
  ADD COLUMN IF NOT EXISTS "program_id" integer REFERENCES "programs"("id");

-- Read on every grant edit to resolve the SDR picker, and on every attempt to
-- link one.
CREATE INDEX IF NOT EXISTS "grants_program_id_idx" ON "grants" ("program_id");
