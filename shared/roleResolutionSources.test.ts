/**
 * Guards against resolving access from the *primary* role alone.
 *
 * A person's access is the union of `users.role` and their secondary roles, and
 * administrator rights are normally held as a secondary. Every check therefore
 * has to ask about the person -- `hasAnyRole`, `isAdministrator`,
 * `isRestrictedOnly`, `getEffectiveAccessLevel` -- not about one role string.
 *
 * This has been got wrong three times in three different shapes: the sidebar
 * called `isHidden(currentUser.role, ...)`, the staff profile tested
 * `["Management","admin","superadmin"].includes(effectiveRole)`, and
 * `hasManagementRole` compared `session.user.role` directly. Each time the
 * symptom was an administrator being refused their own tools by an interface
 * sitting over an API that allowed them.
 *
 * A unit test on the resolver cannot catch any of that, because the resolver
 * was always right -- the call sites were not. So this reads the source.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["client/src", "server", "shared"];

/** Files allowed to compare a bare role string, with the reason. */
const ALLOWED = new Map<string, string>([
  ["shared/effectiveRoles.ts", "defines the resolution everything else uses"],
  ["shared/constants.ts", "compares a job title to its access role, not a person"],
  [
    "server/auth.ts",
    "the demo carve-out: requireAdmin admits the fixed demo Management session",
  ],
  [
    "server/bulkDataHub.ts",
    "reads role names out of spreadsheet rows, not out of a session",
  ],
  [
    "client/src/pages/settings/index.tsx",
    "the same demo carve-out, mirroring requireAdmin",
  ],
  [
    "client/src/components/layout/Sidebar.tsx",
    "renders the demo persona selector, which is about role names by design",
  ],
  [
    "client/src/providers/CurrentUserProvider.tsx",
    "builds the session identity rather than deciding access from it",
  ],
  [
    "client/src/lib/navigationPermissions.ts",
    "answers per role name by contract: seeds the default matrix, one role at a time",
  ],
  [
    "server/assignableRoles.ts",
    "filters a list of role names, with no person involved",
  ],
  [
    "client/src/pages/settings/users.tsx",
    "renders each listed account's own role, and disables editing the superadmin row",
  ],
  [
    "client/src/pages/teams/detail.tsx",
    "colours a badge by the team member's role name",
  ],
]);

/**
 * A line carrying this marker is about a role *name* -- one being submitted,
 * rendered or classified -- rather than about what someone may reach. Used
 * where a file mixes both, so the file itself cannot simply be allowed.
 */
const LINE_OPT_OUT = "role-name-ok";

/** Patterns that decide access from one role string. */
const OFFENDERS: Array<{ label: string; re: RegExp }> = [
  {
    label: "role-list membership test",
    // Any identifier ending in "role", however it was obtained. The first
    // version named the variables it had already seen -- effectiveRole,
    // currentUser.role -- and so missed
    // `const role = (req.session as any)?.user?.role` in requireOrgManager,
    // which is the same bug wearing a different name.
    re: /\][\s\r\n]*\.includes\(\s*[\w$?.]*\b\w*[Rr]ole\s*\)/,
  },
  {
    label: "direct comparison against a role name",
    // \w* may be empty, so a bare `role` matches as well as `effectiveRole`
    // and `sessionUser.role`. Requiring a prefix was the hole that let
    // requireOrgManager through.
    re: /\b\w*[Rr]ole\b\s*(===|!==)\s*["'](admin|superadmin|Management|Outcome Officer|Research Officer|Investigator|user)["']/,
  },
  {
    label: "isAdministrator given a hand-built object, dropping secondaries",
    re: /isAdministrator\(\s*\{(?![^}]*secondaryRoles)/,
  },
  {
    label: "per-role permission helper applied to the current user",
    re: /\b(isHidden|isReadOnly|canView|canEdit|canCreate)\(\s*[A-Za-z]*[Uu]ser\??\.role\b/,
  },
];

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

test("access is never decided from the primary role alone", () => {
  const offences: string[] = [];

  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const rel = file.replace(/\\/g, "/");
      if (ALLOWED.has(rel)) continue;
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        if (line.trimStart().startsWith("*") || line.trimStart().startsWith("//")) return;
        // The marker sits on the line above the one it excuses.
        if (lines[index - 1]?.includes(LINE_OPT_OUT)) return;
        for (const { label, re } of OFFENDERS) {
          if (re.test(line)) {
            offences.push(`${rel}:${index + 1} — ${label}\n    ${line.trim()}`);
          }
        }
      });
    }
  }

  assert.deepEqual(
    offences,
    [],
    `Access resolved from the primary role alone. Use hasAnyRole / isAdministrator /\n` +
      `isRestrictedOnly / getEffectiveAccessLevel on the user object instead, or add the\n` +
      `file to ALLOWED here with the reason it is genuinely about a role name:\n\n` +
      offences.join("\n"),
  );
});
