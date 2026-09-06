/**
 * The researcher-facing views of grants and contracts.
 *
 * The Research Office pages under /api/grants and /api/research-contracts show
 * the office everything, with the tooling an office needs -- imports, clean-up,
 * issue flags. These two endpoints answer the question the people named on
 * those records ask instead: which are mine, and which are my section's.
 *
 * Both withhold, but they withhold different amounts:
 *
 *  - **Grants** shows the viewer's own section entire -- every status,
 *    including applications that were refused -- and every other section only
 *    once a grant has an outcome. Within what is sent, the scope control is a
 *    convenience, so switching between all / mine / my section costs no
 *    further request.
 *  - **Contracts** withholds outright. Anything outside the viewer's section
 *    never leaves the server.
 *
 * In both cases the withholding happens here rather than in the browser. A
 * record the viewer may not see should not be in the response for them to
 * read, whatever the interface then chooses to render.
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
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

import {
  grantCoInvestigators,
  insertResearchContractSchema,
  insertResearchContractScopeItemSchema,
  scientists,
  users,
  type Grant,
  type ResearchContract,
} from "@shared/schema";
import {
  grantInvolvement,
  grantVisibleToViewer,
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

      const listed = [];
      for (const grant of grants) {
        const coInvestigatorIds = coInvestigatorsByGrant.get(grant.id) ?? [];
        const involvement = grantInvolvement(
          { lpiId: grant.lpiId, coInvestigatorIds },
          viewer,
          colleagues,
        );
        // Another section's application is theirs while it is in flight. Only
        // its outcome crosses the boundary, and it is dropped here rather than
        // hidden in the browser -- a grant the viewer may not see should not
        // be in the response for them to read.
        if (!grantVisibleToViewer(involvement, grant.status)) continue;
        listed.push({
          ...grant,
          lpiName: formatName(grant.lpiId ? staffById.get(grant.lpiId) : undefined),
          coInvestigatorNames: coInvestigatorIds
            .map((id) => formatName(staffById.get(id)))
            .filter((name): name is string => name != null),
          involvement,
        });
      }

      res.json({
        viewer: viewerSummary(viewer, colleagues),
        grants: listed,
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

/**
 * Raising a contract request.
 *
 * The office endpoints under /api/research-contracts create and administer
 * contracts, and answer to the "research-office" area. Asking for one is a
 * different act by a different person: a researcher who needs a collaboration
 * agreement is not thereby an officer of the Research Office, and requiring
 * them to hold that area in order to ask would have meant granting the office
 * screens to everyone who might ever need a contract.
 *
 * So the request has its own prefix answering to "research-portfolio". It
 * writes the same rows through the same storage and validation -- this is a
 * second door onto one record, not a second kind of record -- and the office
 * reviews what comes through it exactly as before.
 *
 * This is what makes "create" a meaningful level for the portfolio area:
 * "view" reads your section's grants and contracts, "create" additionally
 * lets you ask for a contract. Nothing here edits, so "edit" still grants
 * nothing beyond "create".
 */
function createContractRequestHandler(): RequestHandler {
  return async (req: Request, res: Response) => {
    try {
      const validated = insertResearchContractSchema
        .omit({ contractNumber: true })
        .parse(req.body);

      if (validated.researchActivityId) {
        const activity = await storage.getResearchActivity(validated.researchActivityId);
        if (!activity) return res.status(404).json({ message: "Research activity not found" });
      }
      if (validated.leadPIId) {
        const pi = await storage.getScientist(validated.leadPIId);
        if (!pi) return res.status(404).json({ message: "Lead PI not found" });
      }

      const contract = await storage.createResearchContract({
        ...validated,
        contractNumber: `CR-${Date.now()}`,
        // Taken from the session, never from the body. This is what places the
        // contract in a section before a lead PI is assigned, so a requester
        // who could name somebody else here could file a request into another
        // section and read it back through the portfolio contracts list.
        requestedByUserId: req.session?.user?.id ?? null,
        status: "submitted",
      } as Parameters<typeof storage.createResearchContract>[0]);

      await req.audit?.logInsert(
        "research_contracts",
        contract.id,
        contract as Record<string, unknown>,
      );
      res.status(201).json(contract);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error("Error creating contract request:", error);
      res.status(500).json({ message: "Failed to submit contract request" });
    }
  };
}

function createContractRequestScopeItemHandler(): RequestHandler {
  return async (req: Request, res: Response) => {
    try {
      const contractId = parseInt(req.params.contractId);
      if (isNaN(contractId)) return res.status(400).json({ message: "Invalid contract ID" });

      const contract = await storage.getResearchContract(contractId);
      if (!contract) return res.status(404).json({ message: "Research contract not found" });

      const validated = insertResearchContractScopeItemSchema.parse({
        ...req.body,
        contractId,
      });
      const scopeItem = await storage.createResearchContractScopeItem(validated);
      res.status(201).json(scopeItem);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error("Error creating contract request scope item:", error);
      res.status(500).json({ message: "Failed to save scope item" });
    }
  };
}

export function registerResearchPortfolioRoutes(app: Express): void {
  app.get("/api/research-portfolio/grants", requireAuth, createPortfolioGrantsHandler());
  app.get("/api/research-portfolio/contracts", requireAuth, createPortfolioContractsHandler());

  // Separate prefix, same area: see the comment above. The matrix guard is
  // mounted on the prefix, so both of these need "create" on
  // research-portfolio, which is what a POST resolves to.
  app.post("/api/contract-requests", requireAuth, createContractRequestHandler());
  app.post(
    "/api/contract-requests/:contractId/scope-items",
    requireAuth,
    createContractRequestScopeItemHandler(),
  );
}
