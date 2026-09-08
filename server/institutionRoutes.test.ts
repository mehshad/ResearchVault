import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";

import { requireAuth } from "./auth";
import {
  createInstitutionCreateHandler,
  createInstitutionListHandler,
  creatorUserId,
  type InstitutionDependencies,
} from "./institutionRoutes";
import { institutionKey } from "@shared/institutions";

type SessionUser = { id: number; role: string };

/** An in-memory stand-in for the table, unique on the key like the real index. */
function makeDependencies(seed: string[] = []) {
  const rows = seed.map((name, index) => ({
    id: index + 1,
    name,
    nameKey: institutionKey(name),
    createdByUserId: null as number | null,
  }));
  let nextId = rows.length + 1;
  const dependencies: InstitutionDependencies = {
    async list() {
      return [...rows]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(({ id, name }) => ({ id, name }));
    },
    async findByKey(key) {
      const found = rows.find((row) => row.nameKey === key);
      return found ? { id: found.id, name: found.name } : undefined;
    },
    async create(input) {
      if (rows.some((row) => row.nameKey === input.nameKey)) {
        throw new Error("duplicate key value violates unique constraint");
      }
      const row = { id: nextId++, ...input };
      rows.push(row);
      return { id: row.id, name: row.name };
    },
  };
  return { dependencies, rows };
}

async function withServer(
  user: SessionUser | null,
  dependencies: InstitutionDependencies,
  run: (url: string) => Promise<void>,
) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (user) (req as any).session = { user };
    next();
  });
  app.get("/api/institutions", requireAuth, createInstitutionListHandler(dependencies));
  app.post("/api/institutions", requireAuth, createInstitutionCreateHandler(dependencies));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}/api/institutions`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

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

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const signedIn: SessionUser = { id: 7, role: "Researcher" };
const demoSession: SessionUser = { id: 0, role: "Management" };

// ── Who may reach it ────────────────────────────────────────────────────────

test("the institution list needs a session", async () => {
  await inAuthMode("local", async () => {
    const { dependencies } = makeDependencies(["Qatar University"]);
    await withServer(null, dependencies, async (url) => {
      assert.equal((await fetch(url)).status, 401);
      assert.equal((await post(url, { name: "Osaka University" })).status, 401);
    });
  });
});

// ── Reading ─────────────────────────────────────────────────────────────────

test("the list comes back sorted by name", async () => {
  await inAuthMode("local", async () => {
    const { dependencies } = makeDependencies(["Qatar University", "Aga Khan University"]);
    await withServer(signedIn, dependencies, async (url) => {
      const body = await (await fetch(url)).json();
      assert.deepEqual(
        body.map((i: any) => i.name),
        ["Aga Khan University", "Qatar University"],
      );
    });
  });
});

// ── Adding ──────────────────────────────────────────────────────────────────

test("a new institution is created and returned", async () => {
  await inAuthMode("local", async () => {
    const { dependencies, rows } = makeDependencies([]);
    await withServer(signedIn, dependencies, async (url) => {
      const response = await post(url, { name: "Osaka University" });
      assert.equal(response.status, 201);
      assert.equal((await response.json()).name, "Osaka University");
      assert.equal(rows.length, 1);
      assert.equal(rows[0].createdByUserId, 7);
    });
  });
});

test("adding a spelling of one already there returns the existing entry", async () => {
  await inAuthMode("local", async () => {
    // The whole reason the list exists: two people typing the same
    // organisation differently must not create two organisations.
    const { dependencies, rows } = makeDependencies(["Hamad Medical Corporation"]);
    await withServer(signedIn, dependencies, async (url) => {
      const response = await post(url, { name: "  hamad   medical-corporation " });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).name, "Hamad Medical Corporation");
      assert.equal(rows.length, 1, "no second row should have been written");
    });
  });
});

test("names are tidied but the submitter's capitalisation is kept", async () => {
  await inAuthMode("local", async () => {
    const { dependencies } = makeDependencies([]);
    await withServer(signedIn, dependencies, async (url) => {
      const created = await (await post(url, { name: "  osaka   UNIVERSITY  " })).json();
      assert.equal(created.name, "osaka UNIVERSITY");
    });
  });
});

test("a name with nothing in it is refused", async () => {
  await inAuthMode("local", async () => {
    const { dependencies, rows } = makeDependencies([]);
    await withServer(signedIn, dependencies, async (url) => {
      for (const name of ["", "   ", "--", null, 42]) {
        const response = await post(url, { name });
        assert.equal(response.status, 400, JSON.stringify(name));
      }
      assert.equal(rows.length, 0);
    });
  });
});

test("losing a race to the unique index returns the winner's row", async () => {
  await inAuthMode("local", async () => {
    const { dependencies } = makeDependencies([]);
    let firstLookup = true;
    const racing: InstitutionDependencies = {
      ...dependencies,
      async findByKey(key) {
        // Miss the first time, as the loser of a race does, then find the row
        // the winner wrote.
        if (firstLookup) {
          firstLookup = false;
          return undefined;
        }
        return { id: 99, name: "Osaka University" };
      },
      async create() {
        throw new Error("duplicate key value violates unique constraint");
      },
    };
    await withServer(signedIn, racing, async (url) => {
      const response = await post(url, { name: "Osaka University" });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).id, 99);
    });
  });
});

// ── Who gets recorded as the author ─────────────────────────────────────────

test("the demo session records no author rather than a user id that does not exist", async () => {
  // id 0 is injected into the request, not stored, so it satisfies no foreign
  // key. Writing it made adding an institution fail with a 500 in demo mode.
  await inAuthMode("demo", async () => {
    const { dependencies, rows } = makeDependencies([]);
    await withServer(demoSession, dependencies, async (url) => {
      const response = await post(url, { name: "Kyoto Institute of Genomics" });
      assert.equal(response.status, 201);
      assert.equal(rows[0].createdByUserId, null);
    });
  });
});

test("creatorUserId keeps real accounts and drops the synthetic one", () => {
  assert.equal(creatorUserId({ session: { user: { id: 7 } } } as any), 7);
  assert.equal(creatorUserId({ session: { user: { id: 0 } } } as any), null);
  assert.equal(creatorUserId({ session: { user: {} } } as any), null);
  assert.equal(creatorUserId({ session: {} } as any), null);
  assert.equal(creatorUserId({} as any), null);
});
