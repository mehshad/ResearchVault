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
]);

/** Patterns that decide access from one role string. */
const OFFENDERS: Array<{ label: string; re: RegExp }> = [
  {
    label: "role-list membership test",
    re: /\][\s\r\n]*\.includes\(\s*(effectiveRole|[A-Za-z]*[Uu]ser\??\.role)\s*\)/,
  },
  {
    label: "direct comparison against a role name",
    re: /(effectiveRole|[A-Za-z]*[Uu]ser\??\.role)\s*(===|!==)\s*["'](admin|superadmin|Management|Outcome Officer|Research Officer|Investigator|user)["']/,
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
