import { eq, inArray, or } from "drizzle-orm";

import { roleGroups, userRoleAssignments, users } from "@shared/schema";
import { INVESTIGATOR_ROLE } from "@shared/investigatorEligibility";
import { db } from "./db";

/**
 * The staff profiles whose account holds the Investigator access role.
 *
 * Investigator status lives on the account, in either role slot -- as a primary
 * role, or granted alongside one in User Management, which is how a Researcher
 * who also leads a study gets it. Staff profiles carry no investigator field of
 * their own; the value the API returns is derived here on every read so the two
 * cannot drift apart.
 *
 * A staff profile with no account holds no roles, so it is not an
 * investigator. That is the intended consequence: investigator status is
 * granted to a person who signs in, and someone who cannot sign in cannot be
 * given it.
 */
export async function resolveInvestigatorScientistIds(
  database: Pick<typeof db, "select"> = db,
): Promise<Set<number>> {
  const primary = await database
    .select({ scientistId: users.scientistId })
    .from(users)
    .where(eq(users.role, INVESTIGATOR_ROLE));

  const secondary = await database
    .select({ scientistId: users.scientistId })
    .from(userRoleAssignments)
    .innerJoin(users, eq(users.id, userRoleAssignments.userId))
    .innerJoin(roleGroups, eq(roleGroups.id, userRoleAssignments.roleGroupId))
    .where(eq(roleGroups.name, INVESTIGATOR_ROLE));

  const ids = new Set<number>();
  for (const row of [...primary, ...secondary]) {
    if (row.scientistId != null) ids.add(row.scientistId);
  }
  return ids;
}

/**
 * Those whose *primary* access role is Investigator, as distinct from holding
 * it alongside another.
 *
 * Both are investigators and neither is more entitled than the other. The
 * difference is what the person is here to do: somebody whose primary role is
 * Investigator runs research as their job, while a Research Officer who also
 * leads a study holds it in addition. In a list of a laboratory's
 * investigators, the first is who you are looking for.
 */
export async function resolvePrimaryInvestigatorScientistIds(
  database: Pick<typeof db, "select"> = db,
): Promise<Set<number>> {
  const rows = await database
    .select({ scientistId: users.scientistId })
    .from(users)
    .where(eq(users.role, INVESTIGATOR_ROLE));

  const ids = new Set<number>();
  for (const row of rows) {
    if (row.scientistId != null) ids.add(row.scientistId);
  }
  return ids;
}

/** Stamp the derived flag onto staff records before they leave the server. */
export function withInvestigatorFlag<T extends { id: number }>(
  records: T[],
  investigatorIds: Set<number>,
  primaryInvestigatorIds?: Set<number>,
): Array<T & { isInvestigator: boolean; isPrimaryInvestigator: boolean }> {
  return records.map((record) => ({
    ...record,
    isInvestigator: investigatorIds.has(record.id),
    // Absent set means nobody was resolved as primary, not everybody: a caller
    // that has not asked gets false rather than a wrong true.
    isPrimaryInvestigator: primaryInvestigatorIds?.has(record.id) ?? false,
  }));
}

/** The scientist ids reachable from a set of user ids, for cache invalidation. */
export async function scientistIdsForUsers(
  userIds: number[],
  database: Pick<typeof db, "select"> = db,
): Promise<number[]> {
  if (userIds.length === 0) return [];
  const rows = await database
    .select({ scientistId: users.scientistId })
    .from(users)
    .where(inArray(users.id, userIds));
  return rows
    .map((row: { scientistId: number | null }) => row.scientistId)
    .filter((id: number | null): id is number => id != null);
}
