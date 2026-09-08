/**
 * Managing the grant status list.
 *
 * Unlike institutions and contract types, a status cannot be added inline from
 * the form that uses it. Adding one means declaring what it *means* -- whether
 * it marks the grant awarded, whether the work has dates, whether other
 * sections may see it -- and somebody halfway through filling in a grant is in
 * no position to decide that. So this answers a configuration screen, and
 * writing needs `edit` on the Research Office area.
 *
 * Reading is open to any signed-in account, because every screen that shows or
 * filters a grant status needs the list to render at all.
 *
 * Every write refreshes the in-process registry the lifecycle rules read, so a
 * status added here takes effect on the next request rather than at the next
 * restart. See shared/grantStatusRegistry.ts for why that registry exists.
 */
import type { Express, Request, RequestHandler, Response } from "express";
import { asc, eq } from "drizzle-orm";

import { db } from "./db";
import { requireAuth, createRequireNavigationAccess } from "./auth";
import { creatorUserId } from "./institutionRoutes";
import { grantStatuses } from "@shared/schema";
import { referenceNameKey } from "@shared/institutions";
import { isGrantStatusStage } from "@shared/grantStatusStages";
import {
  setGrantStatusRegistry,
  type GrantStatusDefinition,
} from "@shared/grantStatusRegistry";

type StatusRow = {
  id: number;
  value: string;
  label: string;
  stage: string;
  sortOrder: number;
  isBuiltIn: boolean;
  retiredAt: Date | null;
};

const columns = {
  id: grantStatuses.id,
  value: grantStatuses.value,
  label: grantStatuses.label,
  stage: grantStatuses.stage,
  sortOrder: grantStatuses.sortOrder,
  isBuiltIn: grantStatuses.isBuiltIn,
  retiredAt: grantStatuses.retiredAt,
};

export type GrantStatusDependencies = {
  list(): Promise<StatusRow[]>;
  findByValue(value: string): Promise<StatusRow | undefined>;
  create(input: {
    value: string;
    label: string;
    stage: string;
    sortOrder: number;
    createdByUserId: number | null;
  }): Promise<StatusRow>;
  update(id: number, patch: Partial<Pick<StatusRow, "label" | "stage" | "sortOrder">> & {
    retiredAt?: Date | null;
  }): Promise<StatusRow | undefined>;
  nextSortOrder(): Promise<number>;
};

const defaultDependencies: GrantStatusDependencies = {
  list: async () =>
    db.select(columns).from(grantStatuses).orderBy(asc(grantStatuses.sortOrder), asc(grantStatuses.label)),
  findByValue: async (value) => {
    const [row] = await db.select(columns).from(grantStatuses).where(eq(grantStatuses.value, value));
    return row;
  },
  create: async (input) => {
    const [row] = await db.insert(grantStatuses).values(input).returning(columns);
    return row;
  },
  update: async (id, patch) => {
    const [row] = await db
      .update(grantStatuses)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(grantStatuses.id, id))
      .returning(columns);
    return row;
  },
  nextSortOrder: async () => {
    const rows = await db.select({ sortOrder: grantStatuses.sortOrder }).from(grantStatuses);
    return (
      rows.reduce((max: number, r: { sortOrder: number | null }) => Math.max(max, r.sortOrder ?? 0), 0) + 1
    );
  },
};

/** A retired status still exists; it is simply no longer offered. */
const toDefinition = (row: StatusRow): GrantStatusDefinition => ({
  value: row.value,
  label: row.label,
  stage: row.stage as GrantStatusDefinition["stage"],
  sortOrder: row.sortOrder,
  isBuiltIn: row.isBuiltIn,
});

/**
 * Load the table into the registry the lifecycle rules read.
 *
 * Retired statuses are included. They are gone from the dropdown but grants
 * still carry them, and a grant whose status the registry cannot resolve would
 * lose its award and its SDR links. Retiring a status must not change what
 * existing grants mean -- only what new ones can be set to.
 */
export async function refreshGrantStatusRegistry(
  dependencies: GrantStatusDependencies = defaultDependencies,
): Promise<void> {
  try {
    const rows = await dependencies.list();
    setGrantStatusRegistry(rows.map(toDefinition));
  } catch (error) {
    // Leaving the registry as it is means the built-in thirteen, which is what
    // the system meant before this table existed. Refusing to start over a
    // reference list would be worse than running with the old meaning.
    console.error("Could not load grant statuses; keeping the current list:", error);
  }
}

export function createGrantStatusListHandler(
  dependencies: GrantStatusDependencies = defaultDependencies,
): RequestHandler {
  return async (_req: Request, res: Response) => {
    try {
      res.json(await dependencies.list());
    } catch (error) {
      console.error("Error fetching grant statuses:", error);
      res.status(500).json({ message: "Failed to fetch grant statuses" });
    }
  };
}

export function createGrantStatusCreateHandler(
  dependencies: GrantStatusDependencies = defaultDependencies,
): RequestHandler {
  return async (req: Request, res: Response) => {
    try {
      const label = String(req.body?.label ?? "").replace(/\s+/g, " ").trim();
      const stage = String(req.body?.stage ?? "");
      if (!label) return res.status(400).json({ message: "A status needs a name." });
      if (!isGrantStatusStage(stage)) {
        return res.status(400).json({
          message: "Choose what the status means: application, refused, awarded, scheduled or ended.",
        });
      }

      // Derived from the label rather than accepted from the caller: the value
      // is what lands in grants.status and what every rule looks up, and a
      // caller free to choose it could shadow a built-in status.
      const value = referenceNameKey(label);
      if (!value) return res.status(400).json({ message: "A status needs a name." });

      const existing = await dependencies.findByValue(value);
      if (existing) {
        return res.status(409).json({
          message: `"${existing.label}" already covers that name. Rename the existing status instead of adding a second one.`,
        });
      }

      const created = await dependencies.create({
        value,
        label,
        stage,
        sortOrder: await dependencies.nextSortOrder(),
        createdByUserId: creatorUserId(req),
      });
      await refreshGrantStatusRegistry(dependencies);
      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating grant status:", error);
      res.status(500).json({ message: "Failed to add the status" });
    }
  };
}

export function createGrantStatusUpdateHandler(
  dependencies: GrantStatusDependencies = defaultDependencies,
): RequestHandler {
  return async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid status id" });

      const patch: Parameters<GrantStatusDependencies["update"]>[1] = {};

      if (req.body?.label !== undefined) {
        const label = String(req.body.label).replace(/\s+/g, " ").trim();
        if (!label) return res.status(400).json({ message: "A status needs a name." });
        // Only the label changes. The value stays put: it is written on every
        // grant that holds this status, and renaming it would orphan them.
        patch.label = label;
      }

      if (req.body?.stage !== undefined) {
        if (!isGrantStatusStage(req.body.stage)) {
          return res.status(400).json({ message: "That is not one of the five stages." });
        }
        patch.stage = req.body.stage;
      }

      if (req.body?.sortOrder !== undefined) {
        const sortOrder = Number(req.body.sortOrder);
        if (!Number.isFinite(sortOrder)) {
          return res.status(400).json({ message: "Invalid position" });
        }
        patch.sortOrder = sortOrder;
      }

      if (req.body?.retired !== undefined) {
        const rows = await dependencies.list();
        const row = rows.find((r) => r.id === id);
        if (!row) return res.status(404).json({ message: "Status not found" });
        if (req.body.retired && row.isBuiltIn) {
          return res.status(409).json({
            message:
              "The statuses the system ships with cannot be retired. The grant lifecycle moves grants onto some of them by name.",
          });
        }
        patch.retiredAt = req.body.retired ? new Date() : null;
      }

      const updated = await dependencies.update(id, patch);
      if (!updated) return res.status(404).json({ message: "Status not found" });
      await refreshGrantStatusRegistry(dependencies);
      res.json(updated);
    } catch (error) {
      console.error("Error updating grant status:", error);
      res.status(500).json({ message: "Failed to update the status" });
    }
  };
}

export function registerGrantStatusRoutes(app: Express): void {
  const requireResearchOfficeEdit = createRequireNavigationAccess("research-office", {
    label: "Research office",
  });

  // Reading is open to any session: every screen that shows or filters a grant
  // status needs the list to render.
  app.get("/api/grant-statuses", requireAuth, createGrantStatusListHandler());
  app.post(
    "/api/grant-statuses",
    requireAuth,
    requireResearchOfficeEdit,
    createGrantStatusCreateHandler(),
  );
  app.patch(
    "/api/grant-statuses/:id",
    requireAuth,
    requireResearchOfficeEdit,
    createGrantStatusUpdateHandler(),
  );
}
