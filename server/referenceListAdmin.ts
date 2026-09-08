/**
 * Cleaning up and bulk-loading the curated lists.
 *
 * Institutions and contract types are the same problem twice: a list of names
 * that people type into, which therefore grows near-duplicates and needs
 * refilling from a spreadsheet now and then. So one module, configured per
 * list, rather than two that drift.
 *
 * The names are stored as text on the records that use them -- a grant's
 * submitting institution is the word "Osaka University", not a foreign key -- so
 * merging two entries is not a row delete. Every record naming the loser has to
 * be repointed at the survivor first, or the duplicate reappears the next time
 * somebody opens one of those records and saves it.
 */
import type { Express, Request, RequestHandler, Response } from "express";
import { sql } from "drizzle-orm";

import { db } from "./db";
import { requireAuth, createRequireNavigationAccess } from "./auth";
import { creatorUserId } from "./institutionRoutes";
import { referenceNameKey } from "@shared/institutions";
import { findDuplicateCandidates } from "@shared/referenceDuplicates";

/** Where a list's names are written on other records. */
interface NameReference {
  table: string;
  column: string;
  /** What to call it when reporting how many records a merge will touch. */
  label: string;
}

export interface ReferenceListConfig {
  /** URL segment: /api/<path>/... */
  path: string;
  table: string;
  /** Extra columns to carry through an import, beyond name. */
  extraColumns?: string[];
  references: NameReference[];
  /** Entries that must not be deleted or merged away. */
  protectedWhere?: string;
}

export const INSTITUTION_LIST: ReferenceListConfig = {
  path: "institutions",
  table: "institutions",
  extraColumns: ["country"],
  references: [
    { table: "grants", column: "submitting_institution", label: "grants" },
    {
      table: "grant_collaborating_institutions",
      column: "name",
      label: "collaborating institution entries",
    },
    { table: "research_contracts", column: "contractor_name", label: "contracts" },
  ],
};

export const CONTRACT_TYPE_LIST: ReferenceListConfig = {
  path: "contract-types",
  table: "contract_types",
  references: [
    { table: "research_contracts", column: "contract_type", label: "contracts" },
  ],
  // The eight the system shipped with. Merging one away would leave the code
  // that still names them pointing at nothing.
  protectedWhere: "is_built_in = true",
};

type Row = { id: number; name: string };

async function listEntries(config: ReferenceListConfig): Promise<Row[]> {
  const result = await db.execute(
    sql.raw(`SELECT id, name FROM "${config.table}" ORDER BY name`),
  );
  return (result.rows ?? result) as unknown as Row[];
}

/** How many records name this entry, per place it can be named. */
async function countReferences(
  config: ReferenceListConfig,
  name: string,
): Promise<Array<{ label: string; count: number }>> {
  const counts: Array<{ label: string; count: number }> = [];
  for (const reference of config.references) {
    const result = await db.execute(
      sql.raw(
        `SELECT count(*)::int AS n FROM "${reference.table}" WHERE "${reference.column}" = ${literal(name)}`,
      ),
    );
    const rows = (result.rows ?? result) as unknown as Array<{ n: number }>;
    counts.push({ label: reference.label, count: Number(rows[0]?.n ?? 0) });
  }
  return counts;
}

/** Single-quoted SQL literal. Names come from a table, but never trust that. */
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;

export function createDuplicatesHandler(config: ReferenceListConfig): RequestHandler {
  return async (_req: Request, res: Response) => {
    try {
      const entries = await listEntries(config);
      const candidates = findDuplicateCandidates(entries);
      // The counts tell somebody which of a pair to keep: the one 30 grants
      // already name is usually the survivor.
      const withUsage = await Promise.all(
        candidates.slice(0, 200).map(async (candidate) => ({
          ...candidate,
          leftUsage: await countReferences(config, candidate.left.name),
          rightUsage: await countReferences(config, candidate.right.name),
        })),
      );
      res.json(withUsage);
    } catch (error) {
      console.error(`Error finding duplicates in ${config.table}:`, error);
      res.status(500).json({ message: "Failed to look for duplicates" });
    }
  };
}

/**
 * Merge one entry into another.
 *
 * Repoints every record naming the loser, then deletes it, in one transaction:
 * a merge that repointed some records and then failed would leave the list
 * holding a name nothing uses and records pointing at a name not on the list.
 */
export function createMergeHandler(config: ReferenceListConfig): RequestHandler {
  return async (req: Request, res: Response) => {
    try {
      const keepId = Number(req.body?.keepId);
      const mergeId = Number(req.body?.mergeId);
      if (!Number.isInteger(keepId) || !Number.isInteger(mergeId)) {
        return res.status(400).json({ message: "Choose which entry to keep and which to merge." });
      }
      if (keepId === mergeId) {
        return res.status(400).json({ message: "An entry cannot be merged into itself." });
      }

      const entries = await listEntries(config);
      const keep = entries.find((e) => e.id === keepId);
      const merge = entries.find((e) => e.id === mergeId);
      if (!keep || !merge) return res.status(404).json({ message: "Entry not found" });

      if (config.protectedWhere) {
        const guarded = await db.execute(
          sql.raw(
            `SELECT count(*)::int AS n FROM "${config.table}" WHERE id = ${mergeId} AND ${config.protectedWhere}`,
          ),
        );
        const rows = (guarded.rows ?? guarded) as unknown as Array<{ n: number }>;
        if (Number(rows[0]?.n ?? 0) > 0) {
          return res.status(409).json({
            message: `"${merge.name}" is one of the entries the system ships with and cannot be merged away. Merge the other one into it instead.`,
          });
        }
      }

      const moved: Array<{ label: string; count: number }> = [];
      await db.transaction(async (tx: typeof db) => {
        for (const reference of config.references) {
          const result = await tx.execute(
            sql.raw(
              `UPDATE "${reference.table}" SET "${reference.column}" = ${literal(keep.name)} ` +
                `WHERE "${reference.column}" = ${literal(merge.name)}`,
            ),
          );
          moved.push({ label: reference.label, count: (result as any).rowCount ?? 0 });
        }
        await tx.execute(sql.raw(`DELETE FROM "${config.table}" WHERE id = ${mergeId}`));
      });

      res.json({ kept: keep.name, merged: merge.name, moved });
    } catch (error) {
      console.error(`Error merging in ${config.table}:`, error);
      res.status(500).json({ message: "Failed to merge" });
    }
  };
}

/**
 * Add many entries at once, from a pasted or uploaded list.
 *
 * One name per line, with an optional second column. Deliberately not an xlsx
 * parser: the office's own list arrives as a column of names, and a text area
 * that accepts a paste is something they can use today without a template
 * round-trip. The preview says what would happen before anything is written.
 */
export function createImportHandler(
  config: ReferenceListConfig,
  { apply }: { apply: boolean },
): RequestHandler {
  return async (req: Request, res: Response) => {
    try {
      const raw = typeof req.body?.text === "string" ? req.body.text : "";
      const lines = raw
        .split(/\r?\n/)
        .map((line: string) => line.trim())
        .filter(Boolean);

      const existing = await db.execute(
        sql.raw(`SELECT name, name_key FROM "${config.table}"`),
      );
      const existingRows = (existing.rows ?? existing) as unknown as Array<{
        name: string;
        name_key: string;
      }>;
      const known = new Map(existingRows.map((r) => [r.name_key, r.name]));

      const toAdd: Array<{ name: string; key: string; extra: string | null }> = [];
      const alreadyThere: Array<{ name: string; existing: string }> = [];
      const unusable: string[] = [];
      const seen = new Set<string>();

      for (const line of lines) {
        // Tab or comma separates the optional second column (a country).
        const [namePart, extraPart] = line.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/, 2);
        const name = (namePart ?? "").replace(/^"|"$/g, "").replace(/\s+/g, " ").trim();
        const extra = (extraPart ?? "").replace(/^"|"$/g, "").trim() || null;
        const key = referenceNameKey(name);

        if (!key) {
          unusable.push(line);
          continue;
        }
        if (known.has(key)) {
          alreadyThere.push({ name, existing: known.get(key)! });
          continue;
        }
        if (seen.has(key)) continue;
        seen.add(key);
        toAdd.push({ name, key, extra });
      }

      if (!apply) {
        return res.json({
          toAdd: toAdd.map((e) => ({ name: e.name, extra: e.extra })),
          alreadyThere,
          unusable,
        });
      }

      if (toAdd.length > 0) {
        const extraColumn = config.extraColumns?.[0];
        const columns = ["name", "name_key", "created_by_user_id"];
        if (extraColumn) columns.splice(2, 0, extraColumn);
        const actor = creatorUserId(req);
        const values = toAdd
          .map((entry) => {
            const cells = [literal(entry.name), literal(entry.key)];
            if (extraColumn) cells.push(entry.extra ? literal(entry.extra) : "NULL");
            cells.push(actor === null ? "NULL" : String(actor));
            return `(${cells.join(", ")})`;
          })
          .join(", ");
        await db.execute(
          sql.raw(
            `INSERT INTO "${config.table}" (${columns.map((c) => `"${c}"`).join(", ")}) ` +
              `VALUES ${values} ON CONFLICT ("name_key") DO NOTHING`,
          ),
        );
      }

      res.json({ added: toAdd.length, alreadyThere: alreadyThere.length, unusable: unusable.length });
    } catch (error) {
      console.error(`Error importing into ${config.table}:`, error);
      res.status(500).json({ message: "Failed to import" });
    }
  };
}

export function registerReferenceListAdminRoutes(app: Express): void {
  // Cleaning and bulk-loading a shared list is an administrative act on data
  // the whole application reads, so it answers to the Research Office rather
  // than to anyone who can fill in a form.
  const guard = createRequireNavigationAccess("research-office", { label: "Research office" });

  for (const config of [INSTITUTION_LIST, CONTRACT_TYPE_LIST]) {
    app.get(`/api/${config.path}/duplicates`, requireAuth, guard, createDuplicatesHandler(config));
    app.post(`/api/${config.path}/merge`, requireAuth, guard, createMergeHandler(config));
    app.post(
      `/api/${config.path}/import/preview`,
      requireAuth,
      guard,
      createImportHandler(config, { apply: false }),
    );
    app.post(
      `/api/${config.path}/import/apply`,
      requireAuth,
      guard,
      createImportHandler(config, { apply: true }),
    );
  }
}
