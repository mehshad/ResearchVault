import { db } from "./db";
import { sql } from "drizzle-orm";

// Access level ordering: edit(3) > create(2) > view(1) > hide(0) > null(-1)
const ACCESS_LEVEL_ORDER: Record<string, number> = {
  edit: 3,
  create: 2,
  view: 1,
  hide: 0,
};

export type AccessLevel = "hide" | "view" | "create" | "edit";

export function maxAccess(a: AccessLevel | null, b: AccessLevel | null): AccessLevel | null {
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  return ACCESS_LEVEL_ORDER[a] >= ACCESS_LEVEL_ORDER[b] ? a : b;
}

/**
 * Resolves ownership-based access for a given user, module, and record.
 * Returns the highest granted_access from all matching ownership_overrides, or null if none match.
 */
export async function resolveOwnershipAccess(
  userId: number,
  module: string,
  recordId: number
): Promise<AccessLevel | null> {
  // 1. Get the user's scientistId
  const userRows = await db.execute(
    sql`SELECT scientist_id FROM users WHERE id = ${userId} LIMIT 1`
  );
  const userRow = (userRows as any).rows?.[0] ?? userRows[0];
  const scientistId: number | null = userRow?.scientist_id ?? null;
  if (!scientistId) return null;

  // 2. Get all overrides for this module
  const overrideRows = await db.execute(
    sql`SELECT relationship, granted_access FROM ownership_overrides WHERE module = ${module}`
  );
  const overrides: Array<{ relationship: string; granted_access: string }> =
    (overrideRows as any).rows ?? (overrideRows as any);

  if (!overrides || overrides.length === 0) return null;

  // 3. Check each relationship
  let highest: AccessLevel | null = null;

  for (const override of overrides) {
    const { relationship, granted_access } = override;
    let matches = false;

    try {
      if (module === "publications" && relationship === "is_author") {
        const r = await db.execute(
          sql`SELECT 1 FROM publication_authors WHERE publication_id = ${recordId} AND scientist_id = ${scientistId} LIMIT 1`
        );
        matches = ((r as any).rows ?? r).length > 0;
      } else if (module === "research-activities" && relationship === "is_budget_holder") {
        const r = await db.execute(
          sql`SELECT 1 FROM research_activities WHERE id = ${recordId} AND budget_holder_id = ${scientistId} LIMIT 1`
        );
        matches = ((r as any).rows ?? r).length > 0;
      } else if (module === "research-activities" && relationship === "is_team_member") {
        const r = await db.execute(
          sql`SELECT 1 FROM project_members WHERE research_activity_id = ${recordId} AND scientist_id = ${scientistId} LIMIT 1`
        );
        matches = ((r as any).rows ?? r).length > 0;
      } else if (module === "projects" && relationship === "is_pi") {
        const r = await db.execute(
          sql`SELECT 1 FROM projects WHERE id = ${recordId} AND principal_investigator_id = ${scientistId} LIMIT 1`
        );
        matches = ((r as any).rows ?? r).length > 0;
      } else if (module === "projects" && relationship === "is_team_member") {
        const r = await db.execute(
          sql`SELECT 1 FROM project_members pm JOIN research_activities ra ON ra.id = pm.research_activity_id WHERE ra.project_id = ${recordId} AND pm.scientist_id = ${scientistId} LIMIT 1`
        );
        matches = ((r as any).rows ?? r).length > 0;
      } else if (module === "irb-applications" && relationship === "is_pi") {
        const r = await db.execute(
          sql`SELECT 1 FROM irb_applications WHERE id = ${recordId} AND principal_investigator_id = ${scientistId} LIMIT 1`
        );
        matches = ((r as any).rows ?? r).length > 0;
      } else if (module === "ibc-applications" && relationship === "is_pi") {
        const r = await db.execute(
          sql`SELECT 1 FROM ibc_applications WHERE id = ${recordId} AND principal_investigator_id = ${scientistId} LIMIT 1`
        );
        matches = ((r as any).rows ?? r).length > 0;
      } else if (module === "contracts" && relationship === "is_lead_pi") {
        const r = await db.execute(
          sql`SELECT 1 FROM research_contracts WHERE id = ${recordId} AND lead_pi_id = ${scientistId} LIMIT 1`
        );
        matches = ((r as any).rows ?? r).length > 0;
      } else if (module === "data-management" && relationship === "is_team_member") {
        // Resolve via data_management_plans.research_activity_id, then check project_members
        const dmpRows = await db.execute(
          sql`SELECT research_activity_id FROM data_management_plans WHERE id = ${recordId} LIMIT 1`
        );
        const dmpRow = ((dmpRows as any).rows ?? dmpRows)[0];
        if (dmpRow?.research_activity_id) {
          const r = await db.execute(
            sql`SELECT 1 FROM project_members WHERE research_activity_id = ${dmpRow.research_activity_id} AND scientist_id = ${scientistId} LIMIT 1`
          );
          matches = ((r as any).rows ?? r).length > 0;
        }
      }
    } catch {
      // If the query fails (e.g., column doesn't exist yet), skip this relationship
      continue;
    }

    if (matches) {
      const grantedLevel = granted_access as AccessLevel;
      highest = maxAccess(highest, grantedLevel);
    }
  }

  return highest;
}
