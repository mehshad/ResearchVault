/**
 * The researcher-facing views of grants and contracts.
 *
 * The Research Office pages under /api/grants and /api/research-contracts show
 * the office everything, with the tooling an office needs -- imports, clean-up,
 * issue flags. These two endpoints answer the question the people named on
 * those records ask instead: which are mine, and which are my section's.
 *
 * The two pages deliberately differ in kind:
 *
 *  - **Grants** lists every grant and marks each one. The filter is a
 *    convenience, so the data is not withheld and the client can switch
 *    between all / mine / my section without another request.
 *  - **Contracts** is a restriction. Anything outside the viewer's section
 *    never leaves the server, so the filtering happens here and not in the
 *    browser.
 *
 * Both mount under /api/research-portfolio, which is one matrix area
 * ("research-portfolio") separate from "research-office". That separation is
 * the point: it lets an administrator grant researchers these pages without
 * also handing them the office screens, which a single shared area could not
 * express.
 */
import type { Express, Request, RequestHandler, Response } from "express";
import { inArray } from "drizzle-orm";

import { db } from "./db";
import { storage } from "./databaseStorage";
import { requireAuth } from "./auth";
import { hasAnyRole } from "@shared/effectiveRoles";
import {
  grantCoInvestigators,
  scientists,
  users,
  type Grant,
  type ResearchContract,
} from "@shared/schema";
import {
  grantInvolvement,
  sectionColleagueIds,
  visibleContracts,
  type PortfolioViewer,
} from "@shared/researchPortfolioScope";

/**
 * The roles for which the section is the whole institution.
 *
 * Administrators are included for the same reason they short-circuit the
 * matrix: a person who can edit every record anyway is not usefully shown a
 * section-sized slice of it.
 */
const SEES_EVERYTHING_ROLES = ["Management", "admin", "superadmin"] as const;

type ScientistSummary = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  honorificTitle: string | null;
  sectionId: number | null;
};

export type ResearchPortfolioDependencies = {
  getGrants(): Promise<Grant[]>;
  getContracts(): Promise<ResearchContract[]>;
  /** Every staff record, for resolving sections and displaying names. */
  getScientists(): Promise<ScientistSummary[]>;
  /** Co-investigator links for every grant at once, not one query per row. */
  getGrantCoInvestigators(): Promise<Array<{ grantId: number; scientistId: number }>>;
  /** The staff record behind each account that has raised a contract request. */
  getScientistIdsByUserId(userIds: number[]): Promise<Map<number, number | null>>;
};

const defaultDependencies: ResearchPortfolioDependencies = {
  getGrants: () => storage.getGrants(),
  getContracts: () => storage.getResearchContracts(),
  getScientists: async () =>
    db
      .select({
        id: scientists.id,
        firstName: scientists.firstName,
        lastName: scientists.lastName,
        honorificTitle: scientists.honorificTitle,
        sectionId: scientists.sectionId,
      })
      .from(scientists),
  getGrantCoInvestigators: async () =>
    db
      .select({
        grantId: grantCoInvestigators.grantId,
        scientistId: grantCoInvestigators.scientistId,
      })
      .from(grantCoInvestigators),
  getScientistIdsByUserId: async (userIds) => {
    if (userIds.length === 0) return new Map();
    const rows = await db
      .select({ id: users.id, scientistId: users.scientistId })
      .from(users)
      .where(inArray(users.id, userIds));
    return new Map<number, number | null>(
      rows.map((row: { id: number; scientistId: number | null }) => [
        row.id,
        row.scientistId ?? null,
      ]),
    );
  },
};

/**
 * The viewer, as the scoping rules need them.
 *
 * The section comes from the staff record rather than the session, because the
 * session carries who you are and the organisation chart says where you sit;
 * copying the section into the session would give it a second home to fall out
 * of step with.
 */
function resolveViewer(req: Request, staff: readonly ScientistSummary[]): PortfolioViewer {
  const scientistId = req.session?.user?.scientistId ?? null;
  const profile = scientistId == null ? null : staff.find((person) => person.id === scientistId);
  return {
    scientistId,
    sectionId: profile?.sectionId ?? null,
    seesEverything: hasAnyRole(req.session?.user, SEES_EVERYTHING_ROLES),
  };
}

const formatName = (person: ScientistSummary | undefined): string | null =>
  person
    ? [person.honorificTitle, person.firstName, person.lastName].filter(Boolean).join(" ").trim() ||
      null
    : null;

/** What the client needs to render the filter honestly. */
function viewerSummary(viewer: PortfolioViewer, colleagues: Set<number> | null) {
  return {
    scientistId: viewer.scientistId,
    sectionId: viewer.sectionId,
    seesEverything: viewer.seesEverything,
    /**
     * How many people the section holds, so the page can say the section is
     * empty rather than showing a filter that returns nothing and looks broken.
     * null when no boundary applies.
     */
    sectionSize: colleagues === null ? null : colleagues.size,
  };
}

export function createPortfolioGrantsHandler(
  dependencies: ResearchPortfolioDependencies = defaultDependencies,
): RequestHandler {
  return async (req: Request, res: Response) => {
    try {
      const [grants, staff, coInvestigatorRows] = await Promise.all([
        dependencies.getGrants(),
        dependencies.getScientists(),
        dependencies.getGrantCoInvestigators(),
      ]);

      const viewer = resolveViewer(req, staff);
      const colleagues = sectionColleagueIds(viewer, staff);
      const staffById = new Map(staff.map((person) => [person.id, person]));

      const coInvestigatorsByGrant = new Map<number, number[]>();
      for (const row of coInvestigatorRows) {
        const existing = coInvestigatorsByGrant.get(row.grantId);
        if (existing) existing.push(row.scientistId);
        else coInvestigatorsByGrant.set(row.grantId, [row.scientistId]);
      }

      res.json({
        viewer: viewerSummary(viewer, colleagues),
        grants: grants.map((grant) => {
          const coInvestigatorIds = coInvestigatorsByGrant.get(grant.id) ?? [];
          return {
            ...grant,
            lpiName: formatName(grant.lpiId ? staffById.get(grant.lpiId) : undefined),
            coInvestigatorNames: coInvestigatorIds
              .map((id) => formatName(staffById.get(id)))
              .filter((name): name is string => name != null),
            involvement: grantInvolvement(
              { lpiId: grant.lpiId, coInvestigatorIds },
              viewer,
              colleagues,
            ),
          };
        }),
      });
    } catch (error) {
      console.error("Error fetching portfolio grants:", error);
      res.status(500).json({ message: "Failed to fetch grants" });
    }
  };
}

export function createPortfolioContractsHandler(
  dependencies: ResearchPortfolioDependencies = defaultDependencies,
): RequestHandler {
  return async (req: Request, res: Response) => {
    try {
      const [contracts, staff] = await Promise.all([
        dependencies.getContracts(),
        dependencies.getScientists(),
      ]);

      const requesterIds = [
        ...new Set(
          contracts
            .map((contract) => contract.requestedByUserId)
            .filter((id): id is number => id != null),
        ),
      ];
      const scientistIdByUserId = await dependencies.getScientistIdsByUserId(requesterIds);

      const viewer = resolveViewer(req, staff);
      const colleagues = sectionColleagueIds(viewer, staff);
      const staffById = new Map(staff.map((person) => [person.id, person]));

      const scoped = contracts.map((contract) => ({
        ...contract,
        requestedByScientistId:
          contract.requestedByUserId == null
            ? null
            : scientistIdByUserId.get(contract.requestedByUserId) ?? null,
      }));

      res.json({
        viewer: viewerSummary(viewer, colleagues),
        contracts: visibleContracts(scoped, viewer, colleagues).map((contract) => ({
          ...contract,
          leadPIName: formatName(contract.leadPIId ? staffById.get(contract.leadPIId) : undefined),
        })),
      });
    } catch (error) {
      console.error("Error fetching portfolio contracts:", error);
      res.status(500).json({ message: "Failed to fetch contracts" });
    }
  };
}

export function registerResearchPortfolioRoutes(app: Express): void {
  app.get("/api/research-portfolio/grants", requireAuth, createPortfolioGrantsHandler());
  app.get("/api/research-portfolio/contracts", requireAuth, createPortfolioContractsHandler());
}
