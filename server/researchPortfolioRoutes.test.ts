import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";

import { requireAuth } from "./auth";
import {
  createPortfolioContractsHandler,
  createPortfolioGrantsHandler,
  type ResearchPortfolioDependencies,
} from "./researchPortfolioRoutes";

type SessionUser = { id: number; role: string; secondaryRoles?: string[]; scientistId: number | null };

async function withServer(
  path: "grants" | "contracts",
  user: SessionUser | null,
  dependencies: ResearchPortfolioDependencies,
  run: (url: string) => Promise<void>,
) {
  const app = express();
  app.use((req, _res, next) => {
    if (user) (req as any).session = { user };
    next();
  });
  const handler =
    path === "grants"
      ? createPortfolioGrantsHandler(dependencies)
      : createPortfolioContractsHandler(dependencies);
  app.get(`/api/research-portfolio/${path}`, requireAuth, handler);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}/api/research-portfolio/${path}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

/** Runs `body` with AUTH_MODE forced, so demo mode cannot wave a guard through. */
async function inAuthMode(mode: string, body: () => Promise<void>) {
  const previous = process.env.AUTH_MODE;
  process.env.AUTH_MODE = mode;
  try {
    await body();
  } finally {
    if (previous === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = previous;
  }
}

// Two sections. 1 and 2 are Haematology; 3 is Genomics; 4 is unplaced.
const staff = [
  { id: 1, firstName: "Aisha", lastName: "Rahman", honorificTitle: "Dr", sectionId: 10 },
  { id: 2, firstName: "Leo", lastName: "Okonkwo", honorificTitle: "Dr", sectionId: 10 },
  { id: 3, firstName: "Mona", lastName: "Haddad", honorificTitle: "Dr", sectionId: 20 },
  { id: 4, firstName: "Sam", lastName: "Idris", honorificTitle: "Mr", sectionId: null },
];

const grants = [
  { id: 101, projectNumber: "G-1", title: "Mine", lpiId: 1, status: "active" },
  { id: 102, projectNumber: "G-2", title: "My colleague's", lpiId: 2, status: "active" },
  { id: 103, projectNumber: "G-3", title: "Another section's", lpiId: 3, status: "active" },
  { id: 104, projectNumber: "G-4", title: "Co-investigator", lpiId: 3, status: "active" },
] as any[];

const contracts = [
  { id: 201, contractNumber: "C-1", title: "Mine", leadPIId: 1, requestedByUserId: null },
  { id: 202, contractNumber: "C-2", title: "My colleague's", leadPIId: 2, requestedByUserId: null },
  { id: 203, contractNumber: "C-3", title: "Another section's", leadPIId: 3, requestedByUserId: null },
  // No lead PI yet -- a request in flight, raised by user 77 (staff record 2).
  { id: 204, contractNumber: "C-4", title: "Requested", leadPIId: null, requestedByUserId: 77 },
  { id: 205, contractNumber: "C-5", title: "Nobody's", leadPIId: null, requestedByUserId: null },
] as any[];

const dependencies: ResearchPortfolioDependencies = {
  async getGrants() {
    return grants;
  },
  async getContracts() {
    return contracts;
  },
  async getScientists() {
    return staff;
  },
  async getGrantCoInvestigators() {
    // Scientist 1 is a co-investigator on grant 104, which scientist 3 leads.
    return [{ grantId: 104, scientistId: 1 }];
  },
  async getScientistIdsByUserId(userIds) {
    return new Map(userIds.map((id) => [id, id === 77 ? 2 : null]));
  },
};

const researcher: SessionUser = { id: 5, role: "Researcher", scientistId: 1 };
const management: SessionUser = { id: 6, role: "Management", scientistId: 3 };

// ── Authentication ──────────────────────────────────────────────────────────

test("both portfolio endpoints require authentication", async () => {
  await inAuthMode("local", async () => {
    for (const path of ["grants", "contracts"] as const) {
      await withServer(path, null, dependencies, async (url) => {
        const response = await fetch(url);
        assert.equal(response.status, 401, path);
      });
    }
  });
});

// ── Grants: everything is listed, each row marked ───────────────────────────

test("the grants page lists every grant and marks each one", async () => {
  await inAuthMode("local", async () => {
    await withServer("grants", researcher, dependencies, async (url) => {
      const body = await (await fetch(url)).json();
      // Nothing is withheld: the filter is a convenience, not a restriction.
      assert.deepEqual(
        body.grants.map((g: any) => g.id),
        [101, 102, 103, 104],
      );
      const involvement = new Map(body.grants.map((g: any) => [g.id, g.involvement]));
      assert.equal(involvement.get(101), "mine");
      assert.equal(involvement.get(102), "team");
      assert.equal(involvement.get(103), null);
      // Named as co-investigator on somebody else's grant: still mine.
      assert.equal(involvement.get(104), "mine");
    });
  });
});

test("the grants page names the lead PI and the co-investigators", async () => {
  await inAuthMode("local", async () => {
    await withServer("grants", researcher, dependencies, async (url) => {
      const body = await (await fetch(url)).json();
      const coInvestigatorGrant = body.grants.find((g: any) => g.id === 104);
      assert.equal(coInvestigatorGrant.lpiName, "Dr Mona Haddad");
      assert.deepEqual(coInvestigatorGrant.coInvestigatorNames, ["Dr Aisha Rahman"]);
    });
  });
});

test("Management sees every grant as their section's", async () => {
  await inAuthMode("local", async () => {
    await withServer("grants", management, dependencies, async (url) => {
      const body = await (await fetch(url)).json();
      assert.equal(body.viewer.seesEverything, true);
      assert.equal(body.viewer.sectionSize, null);
      const involvement = body.grants.map((g: any) => g.involvement);
      assert.equal(
        involvement.every((value: string | null) => value !== null),
        true,
        "no grant should be out of scope for Management",
      );
    });
  });
});

test("admin held as a secondary role also sees everything", async () => {
  await inAuthMode("local", async () => {
    const admin: SessionUser = {
      id: 8,
      role: "Researcher",
      secondaryRoles: ["admin"],
      scientistId: 1,
    };
    await withServer("grants", admin, dependencies, async (url) => {
      const body = await (await fetch(url)).json();
      assert.equal(body.viewer.seesEverything, true);
    });
  });
});

// ── Contracts: a restriction, enforced on the server ─────────────────────────

test("a researcher receives only their section's contracts", async () => {
  await inAuthMode("local", async () => {
    await withServer("contracts", researcher, dependencies, async (url) => {
      const body = await (await fetch(url)).json();
      // 203 is another section's and 205 belongs to nobody: neither is sent.
      assert.deepEqual(
        body.contracts.map((c: any) => c.id),
        [201, 202, 204],
      );
      const involvement = new Map(body.contracts.map((c: any) => [c.id, c.involvement]));
      assert.equal(involvement.get(201), "mine");
      assert.equal(involvement.get(202), "team");
      // No lead PI, so it is placed by the section of whoever requested it.
      assert.equal(involvement.get(204), "team");
    });
  });
});

test("a contract outside the section never leaves the server", async () => {
  await inAuthMode("local", async () => {
    await withServer("contracts", researcher, dependencies, async (url) => {
      const raw = await (await fetch(url)).text();
      // Not merely unlabelled in the response -- absent from it.
      assert.equal(raw.includes("Another section's"), false);
      assert.equal(raw.includes("C-3"), false);
    });
  });
});

test("Management receives every contract, including ones naming nobody", async () => {
  await inAuthMode("local", async () => {
    await withServer("contracts", management, dependencies, async (url) => {
      const body = await (await fetch(url)).json();
      assert.deepEqual(
        body.contracts.map((c: any) => c.id),
        [201, 202, 203, 204, 205],
      );
    });
  });
});

test("an account with no staff record sees no contracts", async () => {
  await inAuthMode("local", async () => {
    const unlinked: SessionUser = { id: 9, role: "Researcher", scientistId: null };
    await withServer("contracts", unlinked, dependencies, async (url) => {
      const body = await (await fetch(url)).json();
      assert.deepEqual(body.contracts, []);
      assert.equal(body.viewer.scientistId, null);
    });
  });
});

test("a staff record placed in no section sees no contracts", async () => {
  await inAuthMode("local", async () => {
    // Fails closed rather than falling through to everybody's: an unplaced
    // profile is a configuration gap, not a licence.
    const unplaced: SessionUser = { id: 10, role: "Researcher", scientistId: 4 };
    await withServer("contracts", unplaced, dependencies, async (url) => {
      const body = await (await fetch(url)).json();
      assert.deepEqual(body.contracts, []);
      assert.equal(body.viewer.sectionId, null);
      assert.equal(body.viewer.sectionSize, 0);
    });
  });
});

test("the viewer summary reports the section the filter will use", async () => {
  await inAuthMode("local", async () => {
    await withServer("grants", researcher, dependencies, async (url) => {
      const body = await (await fetch(url)).json();
      assert.deepEqual(body.viewer, {
        scientistId: 1,
        sectionId: 10,
        seesEverything: false,
        sectionSize: 2,
      });
    });
  });
});
