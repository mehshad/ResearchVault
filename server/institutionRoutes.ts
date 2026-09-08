/**
 * The shared institution list.
 *
 * Read by every form that names an external organisation -- a grant's
 * submitting institution, the institutions a grant is run with, and a
 * contract's counterparty -- and added to by the same people, because the
 * alternative is an administrator standing between a researcher and a
 * collaborator nobody has typed before.
 *
 * Guarded by requireAuth alone, and listed in UNMAPPED_API_PREFIXES with that
 * reason. It is a reference list rather than a record: no single matrix area
 * owns it, since it is read from both the Research Office screens and the
 * portfolio contract-request form, and mapping it to either would refuse the
 * other a list it needs to render a field.
 */
import type { Express, Request, RequestHandler, Response } from "express";
import { asc, eq } from "drizzle-orm";

import { db } from "./db";
import { requireAuth } from "./auth";
import { institutions } from "@shared/schema";
import {
  institutionKey,
  isUsableInstitutionName,
  normaliseInstitutionName,
} from "@shared/institutions";

/**
 * The account to record as having added a row, or null.
 *
 * The demo session carries id 0. That user is injected into the request rather
 * than stored, so it satisfies no foreign key -- server/auth.ts recognises the
 * same 0 when it decides whether it is looking at a demo principal. Writing it
 * into created_by_user_id fails the insert outright, which is how this was
 * found: adding an institution in demo mode returned a 500.
 *
 * Null is also the honest answer. No real account added the row, and the
 * column is nullable precisely because some rows have no author to name -- the
 * ones seeded from existing data are the other case.
 */
export function creatorUserId(req: Request): number | null {
  const id = req.session?.user?.id;
  return typeof id === "number" && id > 0 ? id : null;
}

export type InstitutionDependencies = {
  list(): Promise<Array<{ id: number; name: string }>>;
  findByKey(key: string): Promise<{ id: number; name: string } | undefined>;
  create(input: {
    name: string;
    nameKey: string;
    createdByUserId: number | null;
  }): Promise<{ id: number; name: string }>;
};

const defaultDependencies: InstitutionDependencies = {
  list: async () =>
    db
      .select({ id: institutions.id, name: institutions.name })
      .from(institutions)
      .orderBy(asc(institutions.name)),
  findByKey: async (key) => {
    const [row] = await db
      .select({ id: institutions.id, name: institutions.name })
      .from(institutions)
      .where(eq(institutions.nameKey, key));
    return row;
  },
  create: async (input) => {
    const [row] = await db
      .insert(institutions)
      .values(input)
      .returning({ id: institutions.id, name: institutions.name });
    return row;
  },
};

export function createInstitutionListHandler(
  dependencies: InstitutionDependencies = defaultDependencies,
): RequestHandler {
  return async (_req: Request, res: Response) => {
    try {
      res.json(await dependencies.list());
    } catch (error) {
      console.error("Error fetching institutions:", error);
      res.status(500).json({ message: "Failed to fetch institutions" });
    }
  };
}

/**
 * Add an institution, or hand back the one that is already there.
 *
 * Idempotent on the key rather than an error on a duplicate: two people filling
 * forms at once will both send "Osaka University", and the second one wants a
 * usable institution back, not a conflict to interpret. The unique index is
 * still what decides -- the pre-check is a courtesy, and the insert is wrapped
 * so a race that loses to it re-reads instead of failing.
 */
export function createInstitutionCreateHandler(
  dependencies: InstitutionDependencies = defaultDependencies,
): RequestHandler {
  return async (req: Request, res: Response) => {
    try {
      const raw = typeof req.body?.name === "string" ? req.body.name : "";
      const name = normaliseInstitutionName(raw);
      if (!isUsableInstitutionName(name)) {
        return res.status(400).json({ message: "An institution needs a name." });
      }

      const key = institutionKey(name);
      const existing = await dependencies.findByKey(key);
      if (existing) return res.status(200).json(existing);

      try {
        const created = await dependencies.create({
          name,
          nameKey: key,
          // From the session, never the body: this records who added it.
          createdByUserId: creatorUserId(req),
        });
        return res.status(201).json(created);
      } catch (insertError) {
        // Lost a race to the unique index. Whoever won wrote the same
        // organisation, so return theirs.
        const raced = await dependencies.findByKey(key);
        if (raced) return res.status(200).json(raced);
        throw insertError;
      }
    } catch (error) {
      console.error("Error creating institution:", error);
      res.status(500).json({ message: "Failed to add institution" });
    }
  };
}

export function registerInstitutionRoutes(app: Express): void {
  app.get("/api/institutions", requireAuth, createInstitutionListHandler());
  app.post("/api/institutions", requireAuth, createInstitutionCreateHandler());
}
