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
import {
  createInvalidatePublishedHandler,
  createInvalidAuthorActionHandler,
  createIpVettingHandler,
  createRevertFinalHandler,
  selectInvalidLinkedPublications,
} from "./publicationWorkflowRoutes";
import {
  INVALID_REASON_MAX_LENGTH,
  PUBLISHED_INVALID_LABEL,
  PUBLISHED_INVALID_STATUS,
  PUBLISHED_STATUS,
  WITHDRAWN_STATUS,
  validateInvalidPublicationReason,
} from "@shared/publicationWorkflow";

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
    async updatePublicationStatus(
      _id: number,
      status: string,
      _changedBy: number,
      _changes?: unknown,
      expectedStatus?: string,
      updatedFields?: Record<string, unknown>,
    ) {
      if (expectedStatus && publication.status !== expectedStatus) return undefined;
      publication = { ...publication, ...updatedFields, status };
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

test("invalid workflow uses canonical labels and a trimmed bounded reason", () => {
  assert.equal(PUBLISHED_INVALID_STATUS, "Published - Invalid");
  assert.equal(PUBLISHED_INVALID_LABEL, "Published - Invalid");
  assert.deepEqual(validateInvalidPublicationReason("  correction needed  "), {
    ok: true,
    reason: "correction needed",
  });
  assert.equal(validateInvalidPublicationReason("   ").ok, false);
  assert.equal(
    validateInvalidPublicationReason("x".repeat(INVALID_REASON_MAX_LENGTH + 1)).ok,
    false,
  );
});

test("invalid issues use only explicit scientist links, never matching author text", () => {
  const publications = [
    {
      id: 1,
      status: PUBLISHED_INVALID_STATUS,
      authors: "Linked, Alice",
    },
    {
      id: 2,
      status: PUBLISHED_INVALID_STATUS,
      authors: "Linked, Alice",
    },
    {
      id: 3,
      status: PUBLISHED_STATUS,
      authors: "Linked, Alice",
    },
  ];
  const links = [
    { publicationId: 1, scientistId: 42 },
    { publicationId: 2, scientistId: 99 },
    { publicationId: 3, scientistId: 42 },
  ];
  assert.deepEqual(
    selectInvalidLinkedPublications(publications, links, 42).map((p) => p.id),
    [1],
  );
  assert.deepEqual(
    selectInvalidLinkedPublications(publications, links, 99).map((p) => p.id),
    [2],
  );
  assert.deepEqual(
    selectInvalidLinkedPublications(publications, links, null).map((p) => p.id),
    [1, 2],
  );
});

function correctionStorage(initialStatus: string, linkedScientistIds = [42]) {
  let publication = {
    id: 42,
    title: "Correction test",
    status: initialStatus,
    invalidReason: initialStatus === PUBLISHED_INVALID_STATUS ? "Wrong metadata" : null,
  };
  const history: Array<Record<string, unknown>> = [];
  return {
    get publication() { return publication; },
    history,
    async getPublication() { return { ...publication }; },
    async getPublicationAuthors() {
      return linkedScientistIds.map((scientistId) => ({ scientistId }));
    },
    async updatePublicationCorrectionStatus(
      _id: number,
      expectedStatus: string,
      status: string,
      invalidReason: string | null,
      changedBy: number,
      changeReason: string,
    ) {
      if (publication.status !== expectedStatus) return undefined;
      history.push({
        fromStatus: publication.status,
        toStatus: status,
        changedBy,
        changeReason,
      });
      publication = { ...publication, status, invalidReason };
      return { ...publication };
    },
  };
}

test("only an officer invalidates current Published and Published * stays sealed", async () => {
  const store = correctionStorage(PUBLISHED_STATUS);
  await withTestServer("user", (app) => {
    app.post(
      "/api/publications/:id/mark-invalid",
      requirePublicationOfficer,
      createInvalidatePublishedHandler(store),
    );
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/publications/42/mark-invalid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Wrong DOI" }),
    });
    assert.equal(response.status, 403);
    assert.equal(store.publication.status, PUBLISHED_STATUS);
  });

  await withTestServer("Outcome Officer", (app) => {
    app.post(
      "/api/publications/:id/mark-invalid",
      requirePublicationOfficer,
      createInvalidatePublishedHandler(store),
    );
  }, async (baseUrl) => {
    const missingReason = await fetch(`${baseUrl}/api/publications/42/mark-invalid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: " " }),
    });
    assert.equal(missingReason.status, 400);
    const response = await fetch(`${baseUrl}/api/publications/42/mark-invalid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "  Wrong DOI  " }),
    });
    assert.equal(response.status, 200);
    assert.equal(store.publication.status, PUBLISHED_INVALID_STATUS);
    assert.equal(store.publication.invalidReason, "Wrong DOI");
    assert.equal(store.history[0].changeReason, "Wrong DOI");
  });

  const sealed = correctionStorage("Published *");
  await withTestServer("Outcome Officer", (app) => {
    app.post(
      "/api/publications/:id/mark-invalid",
      requirePublicationOfficer,
      createInvalidatePublishedHandler(sealed),
    );
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/publications/42/mark-invalid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Cannot bypass seal" }),
    });
    assert.equal(response.status, 400);
    assert.equal(sealed.publication.status, "Published *");
  });
});

test("only linked authors submit or withdraw an invalid publication", async () => {
  const unlinked = correctionStorage(PUBLISHED_INVALID_STATUS, [99]);
  await withTestServer("user", (app) => {
    app.post(
      "/api/publications/:id/submit-correction",
      requireAuth,
      createInvalidAuthorActionHandler(unlinked, PUBLISHED_STATUS),
    );
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/publications/42/submit-correction`, {
      method: "POST",
    });
    assert.equal(response.status, 403);
    assert.equal(unlinked.publication.status, PUBLISHED_INVALID_STATUS);
  });

  const corrected = correctionStorage(PUBLISHED_INVALID_STATUS);
  await withTestServer("user", (app) => {
    app.post(
      "/api/publications/:id/submit-correction",
      requireAuth,
      createInvalidAuthorActionHandler(corrected, PUBLISHED_STATUS),
    );
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/publications/42/submit-correction`, {
      method: "POST",
    });
    assert.equal(response.status, 200);
    assert.equal(corrected.publication.status, PUBLISHED_STATUS);
    assert.equal(corrected.publication.invalidReason, null);
    assert.equal(corrected.history[0].changedBy, 7);
  });

  const withdrawn = correctionStorage(PUBLISHED_INVALID_STATUS);
  await withTestServer("user", (app) => {
    app.post(
      "/api/publications/:id/withdraw-invalid",
      requireAuth,
      createInvalidAuthorActionHandler(withdrawn, WITHDRAWN_STATUS),
    );
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/publications/42/withdraw-invalid`, {
      method: "POST",
    });
    assert.equal(response.status, 200);
    assert.equal(withdrawn.publication.status, WITHDRAWN_STATUS);
    assert.equal(withdrawn.publication.invalidReason, null);
    assert.match(String(withdrawn.history[0].changeReason), /Wrong metadata/);
  });

  const unlinkedOfficer = correctionStorage(PUBLISHED_INVALID_STATUS, [99]);
  await withTestServer("Outcome Officer", (app) => {
    app.post(
      "/api/publications/:id/submit-correction",
      requireAuth,
      createInvalidAuthorActionHandler(unlinkedOfficer, PUBLISHED_STATUS),
    );
    app.post(
      "/api/publications/:id/withdraw-invalid",
      requireAuth,
      createInvalidAuthorActionHandler(unlinkedOfficer, WITHDRAWN_STATUS),
    );
  }, async (baseUrl) => {
    const correctionResponse = await fetch(`${baseUrl}/api/publications/42/submit-correction`, {
      method: "POST",
    });
    const withdrawalResponse = await fetch(`${baseUrl}/api/publications/42/withdraw-invalid`, {
      method: "POST",
    });
    assert.equal(correctionResponse.status, 403);
    assert.equal(withdrawalResponse.status, 403);
    assert.equal(unlinkedOfficer.publication.status, PUBLISHED_INVALID_STATUS);
  });
});

test("a stale final-revert request cannot erase a concurrent invalidation", async () => {
  const publication = {
    id: 42,
    status: "Published *",
    invalidReason: null as string | null,
  };
  const workflowStorage = {
    async getPublication() {
      return { ...publication };
    },
    async updatePublicationStatus(
      _id: number,
      status: string,
      _changedBy: number,
      _changes?: unknown,
      expectedStatus?: string,
    ) {
      publication.status = PUBLISHED_INVALID_STATUS;
      publication.invalidReason = "The DOI resolves to another manuscript.";
      if (publication.status !== expectedStatus) return undefined;
      publication.status = status;
      publication.invalidReason = null;
      return { ...publication };
    },
  };

  await withTestServer("Outcome Officer", (app) => {
    app.post(
      "/api/publications/:id/revert-final",
      requirePublicationOfficer,
      createRevertFinalHandler(workflowStorage),
    );
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/publications/42/revert-final`, {
      method: "POST",
    });
    assert.equal(response.status, 409);
    assert.equal(publication.status, PUBLISHED_INVALID_STATUS);
    assert.equal(
      publication.invalidReason,
      "The DOI resolves to another manuscript.",
    );
  });
});