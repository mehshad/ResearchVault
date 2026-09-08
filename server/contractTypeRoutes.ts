/**
 * The contract type list.
 *
 * Was eight values in a zod enum. The Research Office maintains a list of
 * forty-three, and knowing its own agreement vocabulary is not something it
 * should need a deployment for — so the types are rows, seeded with both sets,
 * and extended the same way institutions are: by anyone filling in the form
 * that needs one.
 *
 * Mirrors institutionRoutes.ts deliberately, down to the idempotent create and
 * the race handling. They are the same problem, and the second reader should
 * not have to work out whether the differences are meaningful.
 *
 * Guarded by requireAuth and excluded from the matrix for the same reason as
 * institutions: it is a reference list read by both the Research Office
 * contract screens and the portfolio request form, so no single area owns it.
 */
import type { Express, Request, RequestHandler, Response } from "express";
import { asc, eq } from "drizzle-orm";

import { db } from "./db";
import { requireAuth } from "./auth";
import { creatorUserId } from "./institutionRoutes";
import { contractTypes } from "@shared/schema";
import { referenceNameKey } from "@shared/institutions";

export type ContractTypeDependencies = {
  list(): Promise<Array<{ id: number; name: string; isBuiltIn: boolean }>>;
  findByKey(key: string): Promise<{ id: number; name: string; isBuiltIn: boolean } | undefined>;
  create(input: {
    name: string;
    nameKey: string;
    sortOrder: number;
    createdByUserId: number | null;
  }): Promise<{ id: number; name: string; isBuiltIn: boolean }>;
  nextSortOrder(): Promise<number>;
};

const columns = {
  id: contractTypes.id,
  name: contractTypes.name,
  isBuiltIn: contractTypes.isBuiltIn,
};

const defaultDependencies: ContractTypeDependencies = {
  list: async () =>
    db
      .select(columns)
      .from(contractTypes)
      // Built-in first, then the office's own, each in the order it was given.
      .orderBy(asc(contractTypes.sortOrder), asc(contractTypes.name)),
  findByKey: async (key) => {
    const [row] = await db.select(columns).from(contractTypes).where(eq(contractTypes.nameKey, key));
    return row;
  },
  create: async (input) => {
    const [row] = await db.insert(contractTypes).values(input).returning(columns);
    return row;
  },
  nextSortOrder: async () => {
    const rows = await db.select({ sortOrder: contractTypes.sortOrder }).from(contractTypes);
    return (
      rows.reduce(
        (max: number, row: { sortOrder: number | null }) => Math.max(max, row.sortOrder ?? 0),
        0,
      ) + 1
    );
  },
};

export function createContractTypeListHandler(
  dependencies: ContractTypeDependencies = defaultDependencies,
): RequestHandler {
  return async (_req: Request, res: Response) => {
    try {
      res.json(await dependencies.list());
    } catch (error) {
      console.error("Error fetching contract types:", error);
      res.status(500).json({ message: "Failed to fetch contract types" });
    }
  };
}

export function createContractTypeCreateHandler(
  dependencies: ContractTypeDependencies = defaultDependencies,
): RequestHandler {
  return async (req: Request, res: Response) => {
    try {
      const raw = typeof req.body?.name === "string" ? req.body.name : "";
      const name = raw.replace(/\s+/g, " ").trim();
      const key = referenceNameKey(name);
      if (!key) {
        return res.status(400).json({ message: "A contract type needs a name." });
      }

      const existing = await dependencies.findByKey(key);
      if (existing) return res.status(200).json(existing);

      try {
        const created = await dependencies.create({
          name,
          nameKey: key,
          sortOrder: await dependencies.nextSortOrder(),
          createdByUserId: creatorUserId(req),
        });
        return res.status(201).json(created);
      } catch (insertError) {
        const raced = await dependencies.findByKey(key);
        if (raced) return res.status(200).json(raced);
        throw insertError;
      }
    } catch (error) {
      console.error("Error creating contract type:", error);
      res.status(500).json({ message: "Failed to add contract type" });
    }
  };
}

export function registerContractTypeRoutes(app: Express): void {
  app.get("/api/contract-types", requireAuth, createContractTypeListHandler());
  app.post("/api/contract-types", requireAuth, createContractTypeCreateHandler());
}
