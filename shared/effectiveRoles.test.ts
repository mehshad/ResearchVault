import assert from "node:assert/strict";
import test from "node:test";

import {
  allRolesOf,
  hasRole,
  hasAnyRole,
  isAdministrator,
  isRestrictedOnly,
  maxAccessLevel,
  effectiveAccessLevel,
} from "./effectiveRoles.js";

test("all roles are primary first, de-duplicated, and free of blanks", () => {
  assert.deepEqual(
    allRolesOf({ role: "Physician", secondaryRoles: ["Investigator", "  ", "Physician"] }),
    ["Physician", "Investigator"],
    "the primary leads, blanks are dropped, and a repeat is not listed twice",
  );
  assert.deepEqual(allRolesOf({ role: "Investigator" }), ["Investigator"]);
  assert.deepEqual(allRolesOf(null), []);
  assert.deepEqual(allRolesOf({ role: null, secondaryRoles: null }), []);
});

test("a role is held whether it sits in the primary or a secondary slot", () => {
  const clinician = { role: "Physician", secondaryRoles: ["Investigator"] };
  assert.equal(hasRole(clinician, "Physician"), true);
  assert.equal(hasRole(clinician, "Investigator"), true, "a secondary counts as held");
  assert.equal(hasRole(clinician, "Management"), false);
  assert.equal(hasAnyRole(clinician, ["Management", "Investigator"]), true);
  assert.equal(hasAnyRole(clinician, ["Management", "PMO Officer"]), false);
});

test("administrator rights are recognised when held as a secondary role", () => {
  // This is the intended shape: a job-title primary with admin layered on.
  assert.equal(isAdministrator({ role: "Investigator", secondaryRoles: ["admin"] }), true);
  assert.equal(isAdministrator({ role: "superadmin" }), true);
  assert.equal(isAdministrator({ role: "admin" }), true);
  assert.equal(isAdministrator({ role: "Investigator", secondaryRoles: ["Physician"] }), false);
  assert.equal(isAdministrator(null), false);
});

test("the onboarding restriction lifts as soon as any other role is granted", () => {
  assert.equal(isRestrictedOnly({ role: "user" }), true, "the default role alone is restricted");
  assert.equal(
    isRestrictedOnly({ role: "user", secondaryRoles: ["Investigator"] }),
    false,
    "granting a secondary role is an assignment, so the lockout lifts",
  );
  assert.equal(isRestrictedOnly({ role: "Investigator" }), false);
  assert.equal(isRestrictedOnly(null), false);
});

test("access levels reconcile to the more permissive of the two", () => {
  assert.equal(maxAccessLevel("view", "edit"), "edit");
  assert.equal(maxAccessLevel("edit", "view"), "edit");
  assert.equal(maxAccessLevel("hide", "view"), "view");
  assert.equal(maxAccessLevel(null, "view"), "view");
  assert.equal(maxAccessLevel("view", null), "view");
  assert.equal(maxAccessLevel(null, null), null);
});

test("effective access is the union across every role held", () => {
  const levels: Record<string, "hide" | "view" | "edit"> = {
    "Staff Scientist": "view",
    "IBC Board Member": "edit",
    Physician: "hide",
  };
  const lookup = (role: string) => levels[role] ?? null;

  // The whole point of the feature: a Staff Scientist who also sits on the IBC
  // board gets the board's edit access, not the scientist's view.
  assert.equal(
    effectiveAccessLevel({ role: "Staff Scientist", secondaryRoles: ["IBC Board Member"] }, lookup),
    "edit",
  );
  assert.equal(effectiveAccessLevel({ role: "Staff Scientist" }, lookup), "view");
  assert.equal(effectiveAccessLevel({ role: "Physician" }, lookup), "hide");

  // An unknown role contributes nothing rather than defaulting open.
  assert.equal(effectiveAccessLevel({ role: "Nobody" }, lookup), "hide");
  assert.equal(effectiveAccessLevel(null, lookup), "hide");
});

test("administrators short-circuit regardless of what the matrix says", () => {
  const denyEverything = () => "hide" as const;
  assert.equal(
    effectiveAccessLevel({ role: "Investigator", secondaryRoles: ["admin"] }, denyEverything),
    "edit",
    "admin held as a secondary must still grant full access",
  );
});

test("a secondary role can only widen access, never narrow it", () => {
  // Guards against a future change that reconciles by minimum or by last-wins.
  const levels: Record<string, "hide" | "view" | "edit"> = {
    Investigator: "edit",
    "PhD Student": "hide",
  };
  const lookup = (role: string) => levels[role] ?? null;
  assert.equal(
    effectiveAccessLevel({ role: "Investigator", secondaryRoles: ["PhD Student"] }, lookup),
    "edit",
    "adding a more restricted role must not take access away",
  );
});

// ── Job titles vs access roles ──────────────────────────────────────────────

test("several job titles resolve to the one Researcher access role", async () => {
  const { accessRoleForJobTitle, isRoleTitleMismatch, RESEARCHER_ROLE, ACCESS_ROLES } =
    await import("./constants.js");

  for (const title of [
    "Staff Scientist", "Postdoctoral Researcher", "PhD Student",
    "Research Specialist", "Research Associate", "Research Assistant",
  ]) {
    assert.equal(accessRoleForJobTitle(title), RESEARCHER_ROLE, `${title} maps to Researcher`);
    assert.equal(
      isRoleTitleMismatch(RESEARCHER_ROLE, title),
      false,
      `holding Researcher while titled ${title} is consistent, not a mismatch`,
    );
  }

  // Investigator is deliberately not folded in.
  assert.equal(accessRoleForJobTitle("Investigator"), "Investigator");
  assert.equal(isRoleTitleMismatch(RESEARCHER_ROLE, "Investigator"), true);

  // The retired roles are gone from the assignable set; Researcher is in it.
  for (const retired of [
    "Staff Scientist", "Postdoctoral Researcher", "PhD Student",
    "Research Specialist", "Research Associate", "Research Assistant",
  ]) {
    assert.equal(ACCESS_ROLES.includes(retired), false, `${retired} is no longer an access role`);
  }
  assert.ok(ACCESS_ROLES.includes(RESEARCHER_ROLE));
  assert.ok(ACCESS_ROLES.includes("Investigator"));
});

test("built-in roles are never reported as a title mismatch", async () => {
  const { isRoleTitleMismatch } = await import("./constants.js");
  // These are granted deliberately and say nothing about the person's job, so
  // flagging them would make the warning meaningless.
  for (const role of ["admin", "superadmin", "user"]) {
    assert.equal(isRoleTitleMismatch(role, "Staff Scientist"), false, `${role} must not be flagged`);
  }
  assert.equal(isRoleTitleMismatch(null, "Staff Scientist"), false);
  assert.equal(isRoleTitleMismatch("Researcher", null), false);
  // A genuine mismatch is still reported.
  assert.equal(isRoleTitleMismatch("IRB Officer", "Staff Scientist"), true);
});
