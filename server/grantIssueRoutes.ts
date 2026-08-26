import type { Express, RequestHandler } from "express";
import { inArray, sql } from "drizzle-orm";

import { db } from "./db";
import { storage } from "./databaseStorage";
import { requireAuth } from "./auth";
import { grantResearchActivities, scientists, type Grant } from "@shared/schema";
import { evaluateGrantIssues } from "@shared/grantIssues";

type ScientistSummary = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  honorificTitle: string | null;
};

export type GrantListDependencies = {
  getGrants(): Promise<Array<Grant & { researcherId?: number | null }>>;
  getScientists(ids: number[]): Promise<ScientistSummary[]>;
  getSdrCounts(): Promise<Array<{ grantId: number; count: number }>>;
};

const defaultDependencies: GrantListDependencies = {
  getGrants: () => storage.getGrants(),
  getScientists: async (ids) => {
    if (ids.length === 0) return [];
    return db
      .select({
        id: scientists.id,
        firstName: scientists.firstName,
        lastName: scientists.lastName,
        honorificTitle: scientists.honorificTitle,
      })
      .from(scientists)
      .where(inArray(scientists.id, ids));
  },
  getSdrCounts: async () =>
    db
      .select({
        grantId: grantResearchActivities.grantId,
        count: sql<number>`count(*)::int`,
      })
      .from(grantResearchActivities)
      .groupBy(grantResearchActivities.grantId),
};

export function createGrantListHandler(
  dependencies: GrantListDependencies = defaultDependencies,
): RequestHandler {
  return async (_req, res) => {
    try {
      const grants = await dependencies.getGrants();
      const scientistIds = [
        ...new Set(
          grants.flatMap((grant) =>
            [grant.lpiId, grant.researcherId].filter(
              (id): id is number => id != null,
            ),
          ),
        ),
      ];
      const [scientistRows, countRows] = await Promise.all([
        dependencies.getScientists(scientistIds),
        dependencies.getSdrCounts(),
      ]);
      const scientistMap = new Map(scientistRows.map((scientist) => [scientist.id, scientist]));
      const sdrCounts = new Map(countRows.map((row) => [row.grantId, Number(row.count)]));

      res.json(grants.map((grant) => {
        const linkedSdrsCount = sdrCounts.get(grant.id) ?? 0;
        return {
          ...grant,
          linkedSdrsCount,
          issues: evaluateGrantIssues(grant, linkedSdrsCount),
          lpi: grant.lpiId ? scientistMap.get(grant.lpiId) ?? null : null,
          researcher: grant.researcherId
            ? scientistMap.get(grant.researcherId) ?? null
            : null,
        };
      }));
    } catch (error) {
      console.error("Error fetching grants:", error);
      res.status(500).json({ message: "Failed to fetch grants" });
    }
  };
}

export function registerGrantListRoute(app: Express): void {
  app.get("/api/grants", requireAuth, createGrantListHandler());
}