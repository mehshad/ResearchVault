import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";

import { requireAuth, requirePublicationOfficer } from "./auth";
import {
  rejectGenericPublicationWorkflowMutation,
  rejectPublicationCreateWorkflowMutation,
  rejectProtectedPublicationStatusFields,
} from "./publicationMutationPolicy";
import { createIpVettingHandler } from "./publicationWorkflowRoutes";

async function withTestServer(
  role: string,
  configure: (app: express.Express) => void,
  run: (baseUrl: string) => Promise<void>
) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = {
      user: { id: 7, role, scientistId: 42, username: "route-test-user" },
    };
    next();
  });
  configure(app);

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

test("an authenticated researcher cannot self-approve through generic publication routes", async () => {
  await withTestServer(
    "user",
    (app) => {
      app.post(
        "/api/publications",
        requireAuth,
        rejectPublicationCreateWorkflowMutation,
        (_req, res) => res.sendStatus(201)
      );
      app.patch(
        "/api/publications/:id",
        requireAuth,
        rejectGenericPublicationWorkflowMutation,
        (_req, res) => res.sendStatus(204)
      );
      app.patch(
        "/api/publications/:id/status",
        requireAuth,
        rejectProtectedPublicationStatusFields,
        (_req, res) => res.sendStatus(204)
      );
    },
    async (baseUrl) => {
      const createResponse = await fetch(`${baseUrl}/api/publications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Bypass attempt",
          status: "Vetted for submission",
          vettedForSubmissionByIpOffice: true,
        }),
      });
      assert.equal(createResponse.status, 403);

      const flagResponse = await fetch(`${baseUrl}/api/publications/42`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vettedForSubmissionByIpOffice: true }),
      });
      assert.equal(flagResponse.status, 403);

      const statusResponse = await fetch(`${baseUrl}/api/publications/42`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Vetted for submission" }),
      });
      assert.equal(statusResponse.status, 400);

      const statusFieldResponse = await fetch(
        `${baseUrl}/api/publications/42/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "Vetted for submission",
            updatedFields: { vettedForSubmissionByIpOffice: true },
          }),
        }
      );
      assert.equal(statusFieldResponse.status, 403);
    }
  );
});

test("only an Outcome Officer can move a Complete Draft to Vetted for submission", async () => {
  const initialPublication = {
    id: 42,
    status: "Complete Draft",
    vettedForSubmissionByIpOffice: false,
  };
  let publication = { ...initialPublication };
  const workflowStorage = {
    async getPublication() {
      return { ...publication };
    },
    async updatePublication(_id: number, update: Record<string, unknown>) {
      publication = { ...publication, ...update };
      return { ...publication };
    },
    async updatePublicationStatus(_id: number, status: string) {
      publication = { ...publication, status };
      return { ...publication };
    },
  };

  await withTestServer(
    "user",
    (app) => {
      app.post(
        "/api/publications/:id/ip-vet",
        requirePublicationOfficer,
        createIpVettingHandler(workflowStorage)
      );
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/publications/42/ip-vet`, {
        method: "POST",
      });
      assert.equal(response.status, 403);
      assert.deepEqual(publication, initialPublication);
    }
  );

  await withTestServer(
    "Outcome Officer",
    (app) => {
      app.post(
        "/api/publications/:id/ip-vet",
        requirePublicationOfficer,
        createIpVettingHandler(workflowStorage)
      );
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/publications/42/ip-vet`, {
        method: "POST",
      });
      assert.equal(response.status, 200);
      assert.equal(publication.status, "Vetted for submission");
      assert.equal(publication.vettedForSubmissionByIpOffice, true);
      assert.notEqual(publication.status, "Published *");
    }
  );
});