/**
 * The one change that can lock an administrator out (#25): moving the last
 * administrator rights off an account -- their own, or the only one left.
 *
 * Every request rebuilds the principal from the users table, so an
 * administrator who drops their own rights loses them on their very next
 * call, and if nobody else holds them there is no way back through the
 * interface. Both role routes ask here before writing.
 */
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { isAdministrator, type RoleBearer } from "@shared/effectiveRoles";
import { roleGroups, userRoleAssignments, users } from "@shared/schema";
import { db } from "./db";

const ADMINISTRATOR_ROLES = ["admin", "superadmin"];

export interface AdminChange {
  targetId: number;
  /** The signed-in account making the change; null when there is none. */
  callerId: number | null;
  /** Primary and secondary roles the target holds now. */
  before: RoleBearer;
  /** What the target would hold after the change. */
  after: RoleBearer;
  /** Accounts other than the target that hold administrator rights. */
  otherAdministrators: number;
}

/** The reason the change must be refused, or null when it is safe. */
export function adminChangeRefusal(change: AdminChange): string | null {
  if (!isAdministrator(change.before) || isAdministrator(change.after)) return null;
  if (change.callerId !== null && change.targetId === change.callerId) {
    return "You cannot remove your own administrator rights. Ask another administrator to do it.";
  }
  if (change.otherAdministrators === 0) {
    return "This is the last account with administrator rights. Grant them to another account first.";
  }
  return null;
}

/**
 * How many accounts besides this one hold administrator rights, as a primary
 * role or a secondary one.
 */
export async function countOtherAdministrators(excludingUserId: number): Promise<number> {
  const primary = await db
    .select({ id: users.id })
    .from(users)
    .where(and(ne(users.id, excludingUserId), inArray(sql`lower(${users.role})`, ADMINISTRATOR_ROLES)));
  const secondary = await db
    .select({ id: userRoleAssignments.userId })
    .from(userRoleAssignments)
    .innerJoin(roleGroups, eq(userRoleAssignments.roleGroupId, roleGroups.id))
    .where(and(ne(userRoleAssignments.userId, excludingUserId), inArray(sql`lower(${roleGroups.name})`, ADMINISTRATOR_ROLES)));
  return new Set([...primary, ...secondary].map((row) => row.id)).size;
}
