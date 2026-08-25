import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";

import {
  isInvestigatorEligible,
  isInvestigatorRoleAssignmentAllowed,
} from "../shared/investigatorEligibility";
import {
  INVESTIGATOR_ELIGIBILITY_MANAGEMENT_MESSAGE,
  requireInvestigatorDesignationManager,
} from "./investigatorDesignationPolicy";

async function withPolicyServer(
  role: string,
  run: (baseUrl: string) => Promise<void>
) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = { user: { id: 1, role, scientistId: 42 } };
    next();
  });
  app.patch(
    "/api/scientists/:id",
    requireInvestigatorDesignationManager,
    (_req, res) => res.sendStatus(204)
  );
  app.post(
    "/api/scientists",
    requireInvestigatorDesignationManager,
    (_req, res) => res.sendStatus(201)
  );
  app.post(
    "/api/register",
    requireInvestigatorDesignationManager,
    (_req, res) => res.sendStatus(201)
  );

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listeningServer = app.listen(0, "127.0.0.1", () =>
      resolve(listeningServer)
    );
  });

  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("investigator eligibility preserves legacy titles and accepts the additional designation", () => {
  assert.equal(isInvestigatorEligible({ jobTitle: "Investigator" }), true);
  assert.equal(isInvestigatorEligible({ jobTitle: "Staff Scientist" }), true);
  assert.equal(
    isInvestigatorEligible({
      jobTitle: "Physician",
      isInvestigator: true,
    }),
    true
  );
  assert.equal(
    isInvestigatorEligible({
      jobTitle: "Physician",
      isInvestigator: false,
    }),
    false
  );
  assert.equal(isInvestigatorEligible(null), false);
});

test("staff cannot self-promote by submitting the protected designation field", async () => {
  await withPolicyServer("Physician", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/scientists/42`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isInvestigator: true }),
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      message: INVESTIGATOR_ELIGIBILITY_MANAGEMENT_MESSAGE,
    });
  });
});

test("staff may update profile job titles without changing their access role", async () => {
  await withPolicyServer("Physician", async (baseUrl) => {
    for (const jobTitle of ["Investigator", "Staff Scientist"]) {
      const updateResponse = await fetch(`${baseUrl}/api/scientists/42`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTitle }),
      });
      assert.equal(updateResponse.status, 204);

      const createResponse = await fetch(`${baseUrl}/api/scientists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTitle }),
      });
      assert.equal(createResponse.status, 201);
    }
  });
});

test("staff registration may use any profile job title", async () => {
  await withPolicyServer("user", async (baseUrl) => {
    for (const jobTitle of ["Investigator", "Staff Scientist"]) {
      const response = await fetch(`${baseUrl}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTitle }),
      });
      assert.equal(response.status, 201);
    }

    const ordinaryRegistration = await fetch(`${baseUrl}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobTitle: "Physician" }),
    });
    assert.equal(ordinaryRegistration.status, 201);
  });
});

test("Principal Investigator team roles require investigator eligibility", () => {
  assert.equal(
    isInvestigatorRoleAssignmentAllowed("Principal Investigator", {
      jobTitle: "Physician",
      isInvestigator: false,
    }),
    false
  );
  assert.equal(
    isInvestigatorRoleAssignmentAllowed("Principal Investigator", {
      jobTitle: "Physician",
      isInvestigator: true,
    }),
    true
  );
  assert.equal(
    isInvestigatorRoleAssignmentAllowed("Research Coordinator", {
      jobTitle: "Physician",
      isInvestigator: false,
    }),
    true
  );
});

test("staff may still update ordinary profile fields", async () => {
  await withPolicyServer("Physician", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/scientists/42`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bio: "Updated profile" }),
    });

    assert.equal(response.status, 204);
  });
});

test("Management can change the additional designation", async () => {
  await withPolicyServer("Management", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/scientists/42`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isInvestigator: true }),
    });

    assert.equal(response.status, 204);

    const titleResponse = await fetch(`${baseUrl}/api/scientists/42`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobTitle: "Investigator" }),
    });
    assert.equal(titleResponse.status, 204);
  });
});