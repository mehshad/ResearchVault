import test from "node:test";
import assert from "node:assert/strict";
import {
  isRestrictedUserApiRequestAllowed,
  rejectRestrictedUserProfileAccessChanges,
  requestsRestrictedProfileAccessChange,
} from "./restrictedUserPolicy";

function request(
  method: string,
  originalUrl: string,
  scientistId: number | null = 42
) {
  return {
    method,
    originalUrl,
    session: {
      user: {
        id: 7,
        username: "restricted",
        name: "Restricted User",
        email: "restricted@example.test",
        role: "user",
        scientistId,
        needsRegistration: scientistId == null,
      },
    },
  } as any;
}

test("restricted users can use session lifecycle and first-time registration", () => {
  assert.equal(
    isRestrictedUserApiRequestAllowed(request("GET", "/api/auth/me")),
    true
  );
  assert.equal(
    isRestrictedUserApiRequestAllowed(request("POST", "/api/register", null)),
    true
  );
});

test("restricted users can read ordinary publications but cannot write or read office queues", () => {
  assert.equal(
    isRestrictedUserApiRequestAllowed(request("GET", "/api/publications")),
    true
  );
  assert.equal(
    isRestrictedUserApiRequestAllowed(request("GET", "/api/publications/19")),
    true
  );
  assert.equal(
    isRestrictedUserApiRequestAllowed(request("POST", "/api/publications")),
    false
  );
  assert.equal(
    isRestrictedUserApiRequestAllowed(
      request("GET", "/api/publications/needs-author-fix")
    ),
    false
  );
});

test("restricted users can access only their own profile endpoints", () => {
  assert.equal(
    isRestrictedUserApiRequestAllowed(request("GET", "/api/scientists/42")),
    true
  );
  assert.equal(
    isRestrictedUserApiRequestAllowed(
      request("GET", "/api/scientists/42/grants?includeOther=false")
    ),
    true
  );
  assert.equal(
    isRestrictedUserApiRequestAllowed(request("PATCH", "/api/scientists/42")),
    true
  );
  assert.equal(
    isRestrictedUserApiRequestAllowed(request("GET", "/api/scientists/43")),
    false
  );
  assert.equal(
    isRestrictedUserApiRequestAllowed(request("PATCH", "/api/scientists/43")),
    false
  );
});

test("restricted self-profile updates cannot include access-changing fields", () => {
  assert.equal(
    requestsRestrictedProfileAccessChange({ bio: "Updated biography" }),
    false
  );
  assert.equal(
    requestsRestrictedProfileAccessChange({ jobTitle: "Investigator" }),
    true
  );
  assert.equal(
    requestsRestrictedProfileAccessChange({ isInvestigator: true }),
    true
  );
});

test("server rejects direct restricted-user access-field patches outside demo", () => {
  const previousMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "local";
  let nextCalled = false;
  let statusCode = 200;
  let responseBody: unknown;

  try {
    rejectRestrictedUserProfileAccessChanges(
      {
        body: { jobTitle: "Investigator" },
        session: { user: request("PATCH", "/api/scientists/42").session.user },
      } as any,
      {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(body: unknown) {
          responseBody = body;
          return this;
        },
      } as any,
      () => {
        nextCalled = true;
      }
    );
  } finally {
    if (previousMode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = previousMode;
  }

  assert.equal(nextCalled, false);
  assert.equal(statusCode, 403);
  assert.deepEqual(responseBody, {
    message: "An administrator must update your job title or Investigator designation.",
  });
});

test("server allows ordinary restricted self-profile patches", () => {
  const previousMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "local";
  let nextCalled = false;

  try {
    rejectRestrictedUserProfileAccessChanges(
      {
        body: { bio: "Updated biography" },
        session: { user: request("PATCH", "/api/scientists/42").session.user },
      } as any,
      {} as any,
      () => {
        nextCalled = true;
      }
    );
  } finally {
    if (previousMode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = previousMode;
  }

  assert.equal(nextCalled, true);
});

test("restricted users are denied grants, office helpers, settings, and unknown APIs", () => {
  for (const url of [
    "/api/grants",
    "/api/publications/duplicates",
    "/api/role-groups",
    "/api/admin/users",
    "/api/unknown-future-area",
  ]) {
    assert.equal(
      isRestrictedUserApiRequestAllowed(request("GET", url)),
      false
    );
  }
});

test("mounted API paths still work when the app is hosted under a URL prefix", () => {
  assert.equal(
    isRestrictedUserApiRequestAllowed({
      ...request("GET", "/demo/api/publications"),
      baseUrl: "/api",
      path: "/publications",
    }),
    true
  );
});