/**
 * Effective roles for a signed-in person.
 *
 * A user holds one **primary** access role (`users.role`) plus any number of
 * **secondary** roles (`user_role_assignments`). This models people who genuinely
 * hold more than one position — a Physician who is also an Investigator, a Staff
 * Scientist who also sits on the IBC board — and it is how administrator rights
 * are granted: `admin` is layered on as a secondary, not used as an identity.
 *
 * Access is the **union** of what those roles allow. That matches the existing
 * behaviour of /api/access-check, which already resolves a user's access as the
 * maximum across their role groups.
 *
 * Every authorisation decision goes through this module so the rules cannot
 * drift apart between guards, the permission matrix and the client.
 */
import { ACCESS_LEVELS, RESTRICTED_USER_ROLE, type AccessLevel } from "./constants";

export interface RoleBearer {
  role?: string | null;
  /** Additional roles held alongside the primary one. */
  secondaryRoles?: string[] | null;
  /**
   * Set while an administrator is deliberately previewing the application
   * without their administrator rights.
   *
   * Suppressed here rather than by editing the roles they hold, so the session
   * keeps telling the truth about who they are. Because every authorisation
   * decision goes through this module, the suppression reaches the server
   * guards too -- a preview that only dimmed the menu would be a lie, and the
   * API would still answer.
   */
  adminPreviewOff?: boolean | null;
}

export type { AccessLevel };

/**
 * Rank used whenever two access levels have to be reconciled.
 *
 * All four levels are ranked. "create" was previously absent from this map, so
 * a role holding it ranked below "hide" and could be silently dropped when
 * access was reconciled across several roles.
 */
const ACCESS_RANK: Record<string, number> = { hide: 1, view: 2, create: 3, edit: 4 };

/** Every level, weakest first. */
export const ACCESS_LEVELS_BY_RANK: readonly AccessLevel[] = [...ACCESS_LEVELS]
  .sort((a, b) => (ACCESS_RANK[a] ?? 0) - (ACCESS_RANK[b] ?? 0));

/** True when `held` is at least as permissive as `required`. */
export function satisfiesAccessLevel(
  held: AccessLevel | null | undefined,
  required: AccessLevel,
): boolean {
  return (ACCESS_RANK[held ?? "hide"] ?? 0) >= (ACCESS_RANK[required] ?? 0);
}

/**
 * Every role the person holds, primary first, de-duplicated and free of blanks.
 */
export function allRolesOf(user: RoleBearer | null | undefined): string[] {
  if (!user) return [];
  const roles: string[] = [];
  const push = (value: unknown) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (trimmed && !roles.includes(trimmed)) roles.push(trimmed);
  };
  push(user.role);
  for (const secondary of user.secondaryRoles ?? []) push(secondary);
  return roles;
}

/** True when the person holds `role` in any slot. */
export function hasRole(user: RoleBearer | null | undefined, role: string): boolean {
  const wanted = role.trim().toLowerCase();
  return allRolesOf(user).some((held) => held.toLowerCase() === wanted);
}

/** True when the person holds any of `roles`. */
export function hasAnyRole(
  user: RoleBearer | null | undefined,
  roles: readonly string[],
): boolean {
  return roles.some((role) => hasRole(user, role));
}

/**
 * Administrator rights, wherever they are held. `admin` is normally a secondary
 * role; `superadmin` is granted by environment configuration only.
 */
export function isAdministrator(user: RoleBearer | null | undefined): boolean {
  if (user?.adminPreviewOff) return false;
  return holdsAdministratorRole(user);
}

/**
 * Whether the person actually holds administrator rights, ignoring any preview
 * suppression.
 *
 * Use this only to decide whether to offer the preview toggle -- turning it
 * back off has to stay reachable to someone currently previewing without it.
 * Every other decision belongs to isAdministrator.
 */
export function holdsAdministratorRole(user: RoleBearer | null | undefined): boolean {
  return hasAnyRole(user, ["admin", "superadmin"]);
}

/**
 * The restricted onboarding state: the primary role is still the default and no
 * other role has been granted. Receiving any secondary role counts as having
 * been assigned, so the onboarding lockout lifts.
 */
export function isRestrictedOnly(user: RoleBearer | null | undefined): boolean {
  if (!user) return false;
  const roles = allRolesOf(user);
  return roles.length === 1 && roles[0] === RESTRICTED_USER_ROLE;
}

/** The more permissive of two access levels. */
export function maxAccessLevel(
  a: AccessLevel | null | undefined,
  b: AccessLevel | null | undefined,
): AccessLevel | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return (ACCESS_RANK[a] ?? 0) >= (ACCESS_RANK[b] ?? 0) ? a : b;
}

/**
 * Effective access to one navigation area, given the stored level for each of
 * the person's roles. Administrators short-circuit to edit; otherwise the most
 * permissive of the roles wins, and an absent entry means hide.
 */
export function effectiveAccessLevel(
  user: RoleBearer | null | undefined,
  levelForRole: (role: string) => AccessLevel | null | undefined,
): AccessLevel {
  if (isAdministrator(user)) return "edit";
  let best: AccessLevel | null = null;
  for (const role of allRolesOf(user)) {
    best = maxAccessLevel(best, levelForRole(role));
  }
  return best ?? "hide";
}
