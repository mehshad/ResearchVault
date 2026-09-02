import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";

import { requireAuth } from "./auth";
import { createGrantListHandler, type GrantListDependencies } from "./grantIssueRoutes";

async function withServer(
  authenticated: boolean,
  dependencies: GrantListDependencies,
  run: (url: string) => Promise<void>,
) {
  const app = express();
  app.use((req, _res, next) => {
    if (authenticated) {
      (req as any).session = { user: { id: 7, role: "Management" } };
    }
    next();
  });
  app.get("/api/grants", requireAuth, createGrantListHandler(dependencies));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}/api/grants`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    );
  }
}

const grant = {
  id: 1,
  projectNumber: "G-1",
  title: "Grant",
  lpiId: 9,
  researcherId: null,
  fundingAgency: "Funder",
  requestedAmount: "100",
  awardedAmount: "200",
  currency: "QAR",
  awardedYear: 2026,
  awarded: true,
  status: "awarded",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
} as any;

test("grant list requires authentication", async () => {
  const previousMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "local";
  try {
    await withServer(false, {
      async getGrants() { return [grant]; },
      async getScientists() { return []; },
      async getSdrCounts() { return []; },
      async getCollaboratingInstitutions() { return []; },
    }, async (url) => {
      const response = await fetch(url);
      assert.equal(response.status, 401);
    });
  } finally {
    if (previousMode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = previousMode;
  }
});

test("grant list batches people and SDR counts and returns authoritative issues", async () => {
  let scientistCalls = 0;
  let countCalls = 0;
  let institutionCalls = 0;
  await withServer(true, {
    async getGrants() { return [grant, { ...grant, id: 2, lpiId: 9 }]; },
    async getScientists(ids) {
      scientistCalls += 1;
      assert.deepEqual(ids, [9]);
      return [{ id: 9, firstName: "A", lastName: "PI", honorificTitle: "Dr." }];
    },
    async getSdrCounts() {
      countCalls += 1;
      return [{ grantId: 1, count: 1 }];
    },
    async getCollaboratingInstitutions() {
      institutionCalls += 1;
      return [
        { grantId: 1, name: "Weill Cornell Medicine-Qatar" },
        { grantId: 1, name: "Hamad Medical Corporation" },
      ];
    },
  }, async (url) => {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const body = await response.json() as any[];
    assert.equal(body[0].linkedSdrsCount, 1);
    assert.deepEqual(body[0].issues, []);
    assert.deepEqual(body[0].lpi, {
      id: 9,
      firstName: "A",
      lastName: "PI",
      honorificTitle: "Dr.",
    });
    assert.equal(body[1].linkedSdrsCount, 0);
    assert.deepEqual(body[1].issues.map((issue) => issue.code), ["missing_sdr"]);
    // Grouped per grant from one query, not fetched per row.
    assert.deepEqual(body[0].collaboratingInstitutions, [
      "Weill Cornell Medicine-Qatar",
      "Hamad Medical Corporation",
    ]);
    assert.deepEqual(body[1].collaboratingInstitutions, []);
  });
  assert.equal(scientistCalls, 1);
  assert.equal(countCalls, 1);
  assert.equal(institutionCalls, 1);
});

test("grant list says who submitted, and does not guess when nobody recorded it", async () => {
  await withServer(true, {
    async getGrants() {
      return [
        { ...grant, id: 1, submittingInstitution: "Sidra Medicine" },
        { ...grant, id: 2, submittingInstitution: "Qatar University" },
        { ...grant, id: 3, submittingInstitution: null },
        // Spelt several ways across years of spreadsheets; all of them us.
        { ...grant, id: 4, submittingInstitution: "  SIDRA  " },
      ];
    },
    async getScientists() { return []; },
    async getSdrCounts() { return []; },
    async getCollaboratingInstitutions() { return []; },
  }, async (url) => {
    const body = await (await fetch(url)).json() as any[];
    assert.deepEqual(body.map((row) => row.submission.role), [
      "lead",
      "subawardee",
      "unknown",
      "lead",
    ]);
    assert.equal(body[1].submission.label, "Subawardee of Qatar University");
    assert.equal(body[2].submission.label, "Not recorded");
  });
});