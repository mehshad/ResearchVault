import { ACCESS_ROLES } from "@shared/constants";

export interface DummyUser {
  id: number;
  name: string;
  email: string;
  /** Primary access role. */
  role: string;
  /**
   * Roles held alongside the primary one; access is the union of all of them.
   *
   * Carried here because every client-side authorisation check resolves against
   * this object. Without it `isAdministrator` and `getEffectiveAccessLevel` saw
   * the primary role alone, so someone holding admin as a secondary -- which is
   * how administrator rights are normally granted -- was refused by the
   * interface while the server was granting them.
   */
  secondaryRoles?: string[];
  /**
   * Set while an administrator is previewing the application without their
   * administrator rights. Carried here because every client authorisation
   * check resolves against this object.
   */
  adminPreviewOff?: boolean;
}

/**
 * Role-emulation identities for development and demo testing.
 *
 * These are built from ACCESS_ROLES rather than hand-listed. The list used to be
 * hard-coded and drifted: after the research roles were consolidated it still
 * offered "Staff Scientist", "Postdoctoral Researcher" and "PhD Student" — none
 * of which exist any more — while omitting "Researcher" and "IT Officer"
 * entirely. Deriving it means retiring or adding an access role updates the
 * selector on its own, and currentUserRoleData.test.ts fails if it ever
 * diverges again.
 *
 * The names are here only so the selector reads like a list of people rather
 * than a list of enum values. NAMES_BY_ROLE supplies one per role; any role
 * without an entry still appears, named after the role itself.
 *
 * Kept out of the context module so Vite Fast Refresh does not replace the
 * context when only this data changes.
 */
const NAMES_BY_ROLE: Record<string, string> = {
  "Investigator": "Dr. Sarah Chen",
  "Researcher": "Dr. Alex Kumar",
  "Physician": "Dr. Emily Hassan",
  "Lab Manager": "Lisa Thompson",
  "Management": "Q-BRIDGE Administrator",
  "IRB Board Member": "Dr. Jennifer Park",
  "IBC Board Member": "Dr. Robert Kim",
  "Outcome Officer": "Jessica Morgan",
  "PMO Officer": "Sarah Chen (PMO)",
  "IRB Officer": "Jennifer Park (IRB)",
  "IBC Officer": "Lisa Wong (IBC)",
  "Research Officer": "Sarah Mitchell",
  "IT Officer": "Daniel Achebe",
};

function emailFor(name: string): string {
  const local = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `${local}@research.org`;
}

export const DUMMY_USERS: DummyUser[] = ACCESS_ROLES.map((role, index) => {
  const name = NAMES_BY_ROLE[role] ?? role;
  return { id: index + 1, name, email: emailFor(name), role };
});

/** The role the demo session starts as, and the selector's initial value. */
export const DEFAULT_DEMO_ROLE = "Management";

// Only exposed in the role selector when AUTH_MODE=demo.
export const SUPER_ADMIN_USER: DummyUser = {
  id: 99,
  name: "Super Admin",
  email: "superadmin@research.org",
  role: "superadmin",
};
