import type { Express, RequestHandler } from "express";
import { inArray, sql } from "drizzle-orm";

import { db } from "./db";
import { storage } from "./databaseStorage";
import { requireAuth } from "./auth";
import {
  grantCollaboratingInstitutions,
  grantResearchActivities,
  scientists,
  type Grant,
} from "@shared/schema";
import { evaluateGrantIssues } from "@shared/grantIssues";
import { classifyGrantSubmission, resolveGrantLpiName } from "@shared/grantSubmission";

const formatScientistName = (scientist: ScientistSummary | null | undefined): string | null =>
  scientist
    ? [scientist.honorificTitle, scientist.firstName, scientist.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || null
    : null;

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
  // Names only, and for every grant at once. The list shows who we work with
  // on each row, and a query per row would be one per grant on every load.
  getCollaboratingInstitutions(): Promise<Array<{ grantId: number; name: string }>>;
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
  getCollaboratingInstitutions: async () =>
    db
      .select({
        grantId: grantCollaboratingInstitutions.grantId,
        name: grantCollaboratingInstitutions.name,
      })
      .from(grantCollaboratingInstitutions)
      .orderBy(grantCollaboratingInstitutions.name),
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
      const [scientistRows, countRows, institutionRows] = await Promise.all([
        dependencies.getScientists(scientistIds),
        dependencies.getSdrCounts(),
        dependencies.getCollaboratingInstitutions(),
      ]);
      const scientistMap = new Map(scientistRows.map((scientist) => [scientist.id, scientist]));
      const sdrCounts = new Map(countRows.map((row) => [row.grantId, Number(row.count)]));
      const institutionsByGrant = new Map<number, string[]>();
      for (const row of institutionRows) {
        const names = institutionsByGrant.get(row.grantId);
        if (names) names.push(row.name);
        else institutionsByGrant.set(row.grantId, [row.name]);
      }

      res.json(grants.map((grant) => {
        const linkedSdrsCount = sdrCounts.get(grant.id) ?? 0;
        const lpi = grant.lpiId ? scientistMap.get(grant.lpiId) ?? null : null;
        return {
          ...grant,
          linkedSdrsCount,
          issues: evaluateGrantIssues(grant, linkedSdrsCount),
          collaboratingInstitutions: institutionsByGrant.get(grant.id) ?? [],
          submission: classifyGrantSubmission(grant),
          // Resolved, not stored: our own grants fall back to the Sidra Lead
          // PI rather than showing an empty cell.
          resolvedGrantLpiName: resolveGrantLpiName(grant, formatScientistName(lpi)),
          lpi,
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