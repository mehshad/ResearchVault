/**
 * Server-side matrix enforcement.
 *
 * The guard is the only thing standing between a hidden menu item and an open
 * endpoint, so these tests pin the decisions rather than the plumbing: who
 * short-circuits, what each HTTP method demands, and what happens when the
 * lookup itself fails.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { NAVIGATION_ITEMS, ACCESS_LEVELS } from "@shared/constants";
import {
  createRequireNavigationAccess,
  requiredLevelForMethod,
  type NavigationAccessLoader,
} from "./auth.js";
import { NAVIGATION_ROUTE_RULES, registerNavigationAccessGuards } from "./navigationAccess.js";

type Session = { user?: { username?: string; role?: string | null; secondaryRoles?: string[] } };

function fakeReq(method: string, path: string, session?: Session) {
  return { method, path, session } as any;
}

function fakeRes() {
  const res: any = {
    statusCode: 0,
    body: undefined,
    status(code: number) { res.statusCode = code; return res; },
    json(payload: unknown) { res.body = payload; return res; },
  };
  return res;
}

/** Runs a guard and reports whether it called next(). */
async function run(
  guard: ReturnType<typeof createRequireNavigationAccess>,
  req: any,
): Promise<{ allowed: boolean; status: number; message?: string }> {
  const res = fakeRes();
  let allowed = false;
  await guard(req, res, () => { allowed = true; });
  return { allowed, status: res.statusCode, message: (res.body as any)?.message };
}

const grants = (level: string | null): NavigationAccessLoader => async () => level;

// ── Method to required level ───────────────────────────────────────────────

test("each method demands the level its effect deserves", () => {
  assert.equal(requiredLevelForMethod("GET"), "view");
  assert.equal(requiredLevelForMethod("head"), "view");
  assert.equal(requiredLevelForMethod("OPTIONS"), "view");
  // "create" means may add but not change. Mapping POST to it is what gives
  // that level any meaning on the server.
  assert.equal(requiredLevelForMethod("POST"), "create");
  assert.equal(requiredLevelForMethod("PUT"), "edit");
  assert.equal(requiredLevelForMethod("PATCH"), "edit");
  assert.equal(requiredLevelForMethod("DELETE"), "edit");
});

// ── Short-circuits ─────────────────────────────────────────────────────────

test("an anonymous request is refused before the matrix is consulted", async () => {
  let consulted = false;
  const guard = createRequireNavigationAccess("grants", {
    loadAccess: async () => { consulted = true; return "edit"; },
  });
  const result = await run(guard, fakeReq("GET", "/api/grants", {}));
  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
  assert.equal(consulted, false, "there is no role to resolve");
});

test("administrators are never locked out by a matrix cell", async () => {
  // The whole point: a wrong cell must not be able to lock out the people who
  // would have to fix it.
  const guard = createRequireNavigationAccess("grants", { loadAccess: grants("hide") });
  for (const user of [
    { username: "a", role: "superadmin" },
    { username: "b", role: "admin" },
    // admin is normally held as a secondary role alongside a job-title primary.
    { username: "c", role: "Investigator", secondaryRoles: ["admin"] },
  ]) {
    const result = await run(guard, fakeReq("DELETE", "/api/grants/1", { user }));
    assert.equal(result.allowed, true, `${user.username} must pass`);
  }
});

test("a restricted account is refused unless the policy that owns it says otherwise", async () => {
  // A restricted "user" holds no matrix role, so the matrix would refuse it
  // everywhere -- including the ordinary publication reads
  // restrictDefaultUserApiAccess deliberately allows. The caller supplies that
  // decision so one policy stays the single owner of it.
  const req = fakeReq("GET", "/api/publications", { user: { username: "new", role: "user" } });

  // Unset: refused. The guard must be safe on a route mounted without the
  // restricted-user middleware, rather than trusting it to be there.
  const bare = createRequireNavigationAccess("publications", { loadAccess: grants(null) });
  assert.equal((await run(bare, req)).allowed, false);

  const allowed = createRequireNavigationAccess("publications", {
    loadAccess: grants(null),
    allowRestricted: () => true,
  });
  assert.equal((await run(allowed, req)).allowed, true);

  const denied = createRequireNavigationAccess("publications", {
    loadAccess: grants(null),
    allowRestricted: () => false,
  });
  assert.equal((await run(denied, req)).allowed, false);
});

test("the mounted guards defer to the real restricted-user allowlist", async () => {
  // The allowlist permits ordinary publication reads and refuses everything
  // else, so mounting must wire it in rather than reimplementing it.
  const { isRestrictedUserApiRequestAllowed } = await import("./restrictedUserPolicy.js");
  const guard = createRequireNavigationAccess("publications", {
    loadAccess: grants(null),
    allowRestricted: isRestrictedUserApiRequestAllowed,
  });
  const session = { user: { username: "new", role: "user" } };

  const read = await run(guard, {
    ...fakeReq("GET", "/api/publications", session),
    originalUrl: "/api/publications",
  });
  assert.equal(read.allowed, true, "an ordinary publication read is allowed");

  const write = await run(guard, {
    ...fakeReq("POST", "/api/publications/1/finalize", session),
    originalUrl: "/api/publications/1/finalize",
  });
  assert.equal(write.allowed, false, "an office action is not");
});

test("granting any secondary role ends the restricted pass-through", async () => {
  const guard = createRequireNavigationAccess("publications", { loadAccess: grants("hide") });
  const result = await run(guard, fakeReq("GET", "/api/publications", {
    user: { username: "assigned", role: "user", secondaryRoles: ["Researcher"] },
  }));
  assert.equal(result.allowed, false, "an assigned account is judged on the matrix");
});

// ── The matrix decision ────────────────────────────────────────────────────

test("a level admits exactly the methods it should", async () => {
  const cases: Array<[string, Record<string, boolean>]> = [
    ["hide",   { GET: false, POST: false, PATCH: false, DELETE: false }],
    ["view",   { GET: true,  POST: false, PATCH: false, DELETE: false }],
    ["create", { GET: true,  POST: true,  PATCH: false, DELETE: false }],
    ["edit",   { GET: true,  POST: true,  PATCH: true,  DELETE: true }],
  ];
  for (const [level, expectations] of cases) {
    const guard = createRequireNavigationAccess("grants", { loadAccess: grants(level) });
    for (const [method, expected] of Object.entries(expectations)) {
      const result = await run(guard, fakeReq(method, "/api/grants", {
        user: { username: "u", role: "Research Officer" },
      }));
      assert.equal(result.allowed, expected, `${level} should ${expected ? "admit" : "refuse"} ${method}`);
    }
  }
});

test("access is the most permissive role held, never the first", async () => {
  const levels: Record<string, string> = { Researcher: "view", "IBC Board Member": "edit" };
  const guard = createRequireNavigationAccess("ibc-applications", {
    loadAccess: async (role) => levels[role] ?? null,
  });
  const result = await run(guard, fakeReq("DELETE", "/api/ibc-applications/1", {
    user: { username: "u", role: "Researcher", secondaryRoles: ["IBC Board Member"] },
  }));
  assert.equal(result.allowed, true, "the board seat grants what the primary role does not");
});

test("an unknown role contributes nothing rather than defaulting open", async () => {
  const guard = createRequireNavigationAccess("grants", { loadAccess: grants(null) });
  const result = await run(guard, fakeReq("GET", "/api/grants", {
    user: { username: "u", role: "Nobody In Particular" },
  }));
  assert.equal(result.allowed, false);
});

test("a failed lookup is a refusal, not permission", async () => {
  // Fail closed: a database that cannot answer must not be read as a yes.
  const guard = createRequireNavigationAccess("grants", {
    loadAccess: async () => { throw new Error("connection reset"); },
  });
  const result = await run(guard, fakeReq("GET", "/api/grants", {
    user: { username: "u", role: "Research Officer" },
  }));
  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
});

test("the refusal names the area that was missing", async () => {
  const guard = createRequireNavigationAccess("grants", {
    label: "Grants",
    loadAccess: grants("hide"),
  });
  const result = await run(guard, fakeReq("GET", "/api/grants", {
    user: { username: "u", role: "Physician" },
  }));
  assert.match(String(result.message), /Grants access required/);
});

// ── The route map ──────────────────────────────────────────────────────────

test("every mapped area is one the matrix can configure", () => {
  // These three are configured areas that NAVIGATION_ITEMS does not list,
  // because that list describes the menu rather than what is configurable.
  const unlisted = new Set(["certifications", "pmo-office", "research-office"]);
  const known = new Set<string>([...NAVIGATION_ITEMS.map((item) => item.id), ...unlisted]);
  for (const rule of NAVIGATION_ROUTE_RULES) {
    assert.ok(
      known.has(rule.navigationItem),
      `"${rule.navigationItem}" (${rule.prefix}) is not an area the matrix configures`,
    );
  }
});

test("no prefix is mapped twice or shadows another", () => {
  const seen = new Set<string>();
  for (const rule of NAVIGATION_ROUTE_RULES) {
    assert.ok(rule.prefix.startsWith("/api/"), `${rule.prefix} should sit under /api`);
    assert.ok(!seen.has(rule.prefix), `${rule.prefix} is mapped more than once`);
    seen.add(rule.prefix);
  }
  // A prefix that is a path-segment ancestor of another would silently apply
  // its own area to the descendant's routes as well.
  for (const rule of NAVIGATION_ROUTE_RULES) {
    for (const other of NAVIGATION_ROUTE_RULES) {
      if (rule === other) continue;
      assert.ok(
        !other.prefix.startsWith(`${rule.prefix}/`),
        `${rule.prefix} shadows ${other.prefix}`,
      );
    }
  }
});

test("mounting registers one guard per rule, on its own prefix", () => {
  const mounted: Array<[string, string]> = [];
  const app = {
    use(prefix: string, _handler: unknown) { mounted.push([prefix, (_handler as any).area]); },
  } as any;
  registerNavigationAccessGuards(app, (navigationItem) => {
    const handler: any = () => {};
    handler.area = navigationItem;
    return handler;
  });
  assert.equal(mounted.length, NAVIGATION_ROUTE_RULES.length);
  assert.deepEqual(
    mounted,
    NAVIGATION_ROUTE_RULES.map((rule) => [rule.prefix, rule.navigationItem]),
  );
});

test("the levels the guard reasons about are the levels the matrix stores", () => {
  // Guards against a level being added to the matrix that no method demands.
  assert.deepEqual([...ACCESS_LEVELS].sort(), ["create", "edit", "hide", "view"]);
});
