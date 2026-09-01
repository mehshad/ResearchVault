import assert from "node:assert/strict";
import test from "node:test";

import {
  allRolesOf,
  hasRole,
  hasAnyRole,
  holdsAdministratorRole,
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

test("a job title written differently is not a mismatch", async () => {
  const { isRoleTitleMismatch, accessRoleForJobTitle, RESEARCHER_ROLE } =
    await import("./constants.js");

  // The stored title is whatever the organisation calls the post, and it
  // arrives through staff imports. Sixteen people held "Post Doctoral Fellow"
  // or "Post-doctoral Fellow" against the canonical "Postdoctoral Researcher"
  // and every one was flagged -- a warning about nothing.
  for (const spelling of [
    "Post Doctoral Fellow",
    "Post-doctoral Fellow",
    "Postdoctoral Fellow",
    "postdoc",
    "POSTDOCTORAL RESEARCHER",
  ]) {
    assert.equal(
      accessRoleForJobTitle(spelling),
      RESEARCHER_ROLE,
      `"${spelling}" should resolve to Researcher`,
    );
    assert.equal(isRoleTitleMismatch(RESEARCHER_ROLE, spelling), false);
  }

  // Punctuation and case cannot turn a correct assignment into a mismatch.
  assert.equal(isRoleTitleMismatch("Research Officer", "research  officer"), false);
  assert.equal(isRoleTitleMismatch("IRB Officer", "irb-officer"), false);
});

test("an unrecognised title implies no role, so it is not a mismatch", async () => {
  const { isRoleTitleMismatch, accessRoleForJobTitle } = await import("./constants.js");
  // "Other" says nothing about what someone should reach, so there is nothing
  // for a role to disagree with. It used to resolve to itself and therefore
  // flagged against every possible role.
  for (const title of ["Other", "Visiting Scholar", "Consultant (external)"]) {
    assert.equal(accessRoleForJobTitle(title), null);
    assert.equal(isRoleTitleMismatch("Researcher", title), false);
    assert.equal(isRoleTitleMismatch("Management", title), false);
  }
});

test("a genuine mismatch is still reported", async () => {
  const { isRoleTitleMismatch } = await import("./constants.js");
  // The tolerance above must not swallow the case the warning exists for.
  assert.equal(isRoleTitleMismatch("IRB Officer", "Staff Scientist"), true);
  assert.equal(isRoleTitleMismatch("Researcher", "Investigator"), true);
  assert.equal(isRoleTitleMismatch("Physician", "Post Doctoral Fellow"), true);
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

// ── Job title tabs on the staff directory ──────────────────────────────────

test("a job title tab matches every spelling of that post", async () => {
  const { matchesJobTitle, JOB_TITLE_TAB_ALIASES } = await import("./constants.js");
  // The failure this prevents: the post-doc tab compared with === against
  // "Post-doctoral Fellow" and showed two of sixteen people, because the other
  // fourteen were stored as "Post Doctoral Fellow".
  for (const spelling of [
    "Post Doctoral Fellow",
    "Post-doctoral Fellow",
    "Postdoctoral Fellow",
    "Postdoctoral Researcher",
    "postdoc",
  ]) {
    assert.equal(
      matchesJobTitle(spelling, JOB_TITLE_TAB_ALIASES["post-doc"]),
      true,
      `"${spelling}" belongs in the post-doc tab`,
    );
  }
});

test("a tab does not sweep in a different post", async () => {
  const { matchesJobTitle, JOB_TITLE_TAB_ALIASES } = await import("./constants.js");
  assert.equal(matchesJobTitle("Staff Scientist", JOB_TITLE_TAB_ALIASES["post-doc"]), false);
  assert.equal(matchesJobTitle("Investigator", JOB_TITLE_TAB_ALIASES["staff-scientist"]), false);
  assert.equal(matchesJobTitle("Research Officer", JOB_TITLE_TAB_ALIASES["officers"]), true);
  assert.equal(matchesJobTitle("Physician", JOB_TITLE_TAB_ALIASES["officers"]), false);
});

test("a missing or unknown title matches no tab", async () => {
  const { matchesJobTitle, JOB_TITLE_TAB_ALIASES } = await import("./constants.js");
  for (const tab of Object.keys(JOB_TITLE_TAB_ALIASES)) {
    assert.equal(matchesJobTitle(null, JOB_TITLE_TAB_ALIASES[tab]), false);
    assert.equal(matchesJobTitle("", JOB_TITLE_TAB_ALIASES[tab]), false);
    assert.equal(matchesJobTitle("Other", JOB_TITLE_TAB_ALIASES[tab]), false);
  }
});

test("dropping administrator rights actually drops them", () => {
  // The outcome-office row as stored: Investigator is hidden, and there is no
  // row for admin at all, because admin is not a matrix role.
  const outcomeOffice = (role: string) =>
    role === "Management" || role === "Outcome Officer" ? "edit" : "hide";

  const holding = { role: "Investigator", secondaryRoles: ["admin"] };
  const previewing = { ...holding, adminPreviewOff: true };

  assert.equal(effectiveAccessLevel(holding, outcomeOffice), "edit");
  assert.equal(effectiveAccessLevel(previewing, outcomeOffice), "hide");

  // The leak that made the toggle do nothing: isAdministrator was suppressed,
  // but "admin" stayed in the role list, so callers asking for it directly --
  // and the per-role loop, whose lookup short-circuits on the name -- still
  // resolved to full access.
  assert.equal(allRolesOf(previewing).includes("admin"), false);
  assert.equal(hasAnyRole(previewing, ["admin", "superadmin"]), false);
  assert.equal(isAdministrator(previewing), false);

  // But the rights are still held, or the control to restore them would be
  // gated behind the very thing it restores.
  assert.equal(holdsAdministratorRole(previewing), true);

  // A superadmin previewing is equally ordinary while it lasts.
  const superadmin = { role: "superadmin", adminPreviewOff: true };
  assert.equal(isAdministrator(superadmin), false);
  assert.equal(holdsAdministratorRole(superadmin), true);
  assert.equal(effectiveAccessLevel(superadmin, outcomeOffice), "hide");
});

test("a non-standard job title is recognised rather than discarded", async () => {
  const { canonicalJobTitle, isCanonicalJobTitle } = await import("./constants.js");

  // The spellings actually in the data. None is a canonical entry, and every
  // one of them means the same post.
  for (const stored of [
    "Post Doctoral Fellow",
    "Post-doctoral Fellow",
    "Postdoctoral Fellow",
    "postdoc",
  ]) {
    assert.equal(isCanonicalJobTitle(stored), false, stored);
    assert.equal(canonicalJobTitle(stored), "Postdoctoral Researcher", stored);
  }

  // Spacing, hyphens and case never change the answer.
  assert.equal(canonicalJobTitle("staff  scientist"), "Staff Scientist");
  assert.equal(canonicalJobTitle("IRB-Officer"), "IRB Officer");

  // A canonical title is left exactly as it is.
  assert.equal(isCanonicalJobTitle("Postdoctoral Researcher"), true);
  assert.equal(canonicalJobTitle("Postdoctoral Researcher"), "Postdoctoral Researcher");

  // Something genuinely unrecognisable offers no correction, so the editor
  // keeps it and says so rather than guessing.
  assert.equal(canonicalJobTitle("Other"), null);
  assert.equal(canonicalJobTitle(""), null);
  assert.equal(canonicalJobTitle(null), null);
});
