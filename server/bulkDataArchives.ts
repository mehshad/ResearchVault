import { ZipArchive } from "archiver";
import { createHash, randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { and, desc, eq, lt, ne, or } from "drizzle-orm";
import { bulkDataArchives, type BulkDataArchive } from "@shared/schema";
import { db } from "./db";
import { buildExportWorkbook, SECTION_META } from "./bulkDataHub";
import { LocalObjectStorageService } from "./localObjectStorage";
import { ObjectStorageService } from "./objectStorage";

const ARCHIVE_MIME = "application/zip";
const RETAIN_SUCCEEDED = 30;
const SCHEDULER_INTERVAL_MS = 60_000;
const LEASE_MS = 60 * 60 * 1000;

type ArchiveStorage = Pick<
  ObjectStorageService | LocalObjectStorageService,
  "saveArchive" | "getArchive" | "deleteArchive"
>;

function archiveStorage(): ArchiveStorage {
  return process.env.STORAGE_TYPE === "local" ||
    (process.env.NODE_ENV !== "production" && !process.env.PRIVATE_OBJECT_DIR)
    ? new LocalObjectStorageService()
    : new ObjectStorageService();
}

export interface BulkArchiveManifest {
  format: "research-vault-bulk-data";
  version: 1;
  generatedAt: string;
  sections: Array<{
    id: string;
    label: string;
    fileName: string;
    sha256: string;
    byteSize: number;
  }>;
}

function zipEntries(entries: Array<{ name: string; body: Buffer }>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    output.on("end", () => resolve(Buffer.concat(chunks)));
    output.on("error", reject);

    const zip = new ZipArchive({ zlib: { level: 9 } });
    zip.on("error", reject);
    zip.pipe(output);
    for (const entry of entries) {
      zip.append(entry.body, { name: entry.name });
    }
    void zip.finalize();
  });
}

/** Builds the canonical all-sections archive in SECTION_META order. */
export async function buildBulkDataArchive(
  now = new Date(),
  workbookBuilder: typeof buildExportWorkbook = buildExportWorkbook,
): Promise<{
  buffer: Buffer;
  manifest: BulkArchiveManifest;
}> {
  const sections: BulkArchiveManifest["sections"] = [];
  const entries: Array<{ name: string; body: Buffer }> = [];
  for (const section of SECTION_META) {
    const body = await workbookBuilder(section.id);
    const fileName = `${section.id}.xlsx`;
    sections.push({
      id: section.id,
      label: section.label,
      fileName,
      sha256: createHash("sha256").update(body).digest("hex"),
      byteSize: body.length,
    });
    entries.push({ name: fileName, body });
  }
  const manifest: BulkArchiveManifest = {
    format: "research-vault-bulk-data",
    version: 1,
    generatedAt: now.toISOString(),
    sections,
  };
  entries.push({
    name: "manifest.json",
    body: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
  });
  return { buffer: await zipEntries(entries), manifest };
}

export function bulkArchiveFileName(now = new Date()): string {
  return `bulk-data-export-${now.toISOString().replace(/[:.]/g, "-")}.zip`;
}

export function riyadhDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isPastRiyadhScheduleBoundary(now = new Date()): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now));
  return hour >= 2;
}

function publicArchive(row: BulkDataArchive) {
  const { objectId: _objectId, leaseToken: _leaseToken, ...safe } = row;
  return safe;
}

export async function listBulkDataArchives() {
  const rows = await db.select().from(bulkDataArchives)
    .where(ne(bulkDataArchives.status, "deleting"))
    .orderBy(desc(bulkDataArchives.createdAt));
  return rows.map(publicArchive);
}

export async function getBulkDataArchive(id: string) {
  const [row] = await db.select().from(bulkDataArchives)
    .where(eq(bulkDataArchives.id, id)).limit(1);
  return row;
}

export async function createBulkDataArchive(
  source: "manual" | "scheduled",
  requestedBy?: string,
  scheduleDate?: string,
): Promise<BulkDataArchive | null> {
  const values = {
    id: randomUUID(),
    source,
    status: "pending",
    requestedBy: requestedBy ?? null,
    scheduleDate: source === "scheduled" ? scheduleDate! : null,
  };
  const inserted = await db.insert(bulkDataArchives).values(values)
    .onConflictDoNothing().returning();
  return inserted[0] ?? null;
}

async function claimArchive(id: string): Promise<BulkDataArchive | null> {
  const stale = new Date(Date.now() - LEASE_MS);
  const leaseToken = randomUUID();
  const rows = await db.update(bulkDataArchives)
    .set({ status: "running", startedAt: new Date(), leaseToken, errorMessage: null })
    .where(and(
      eq(bulkDataArchives.id, id),
      or(
        eq(bulkDataArchives.status, "pending"),
        and(eq(bulkDataArchives.status, "running"), lt(bulkDataArchives.startedAt, stale)),
      ),
    ))
    .returning();
  return rows[0] ?? null;
}

export async function retainRecentBulkDataArchives(
  storage: ArchiveStorage = archiveStorage(),
): Promise<void> {
  const rows = await db.select().from(bulkDataArchives);
  const removalIds = selectArchivesForRetentionRemoval(rows);
  const old = rows.filter((row: BulkDataArchive) => removalIds.includes(row.id));
  for (const row of old) {
    const claimed = await db.update(bulkDataArchives)
      .set({ status: "deleting" })
      .where(and(
        eq(bulkDataArchives.id, row.id),
        eq(bulkDataArchives.status, "succeeded"),
      ))
      .returning({ id: bulkDataArchives.id, objectId: bulkDataArchives.objectId });
    if (!claimed[0]) continue;
    if (claimed[0].objectId) await storage.deleteArchive(claimed[0].objectId);
    await db.delete(bulkDataArchives).where(and(
      eq(bulkDataArchives.id, row.id),
      eq(bulkDataArchives.status, "deleting"),
    ));
  }
}

async function recoverDeletingBulkDataArchives(
  storage: ArchiveStorage = archiveStorage(),
): Promise<void> {
  const rows = await db.select({
    id: bulkDataArchives.id,
    objectId: bulkDataArchives.objectId,
  }).from(bulkDataArchives).where(eq(bulkDataArchives.status, "deleting"));
  for (const row of rows) {
    if (row.objectId) await storage.deleteArchive(row.objectId);
    await db.delete(bulkDataArchives).where(and(
      eq(bulkDataArchives.id, row.id),
      eq(bulkDataArchives.status, "deleting"),
    ));
  }
}

export function selectArchivesForRetentionRemoval(
  rows: BulkDataArchive[],
  retain = RETAIN_SUCCEEDED,
): string[] {
  return rows
    .filter((row) => row.status === "succeeded")
    .sort((a, b) => {
      const completed = (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0);
      return completed || (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
    })
    .slice(retain)
    .map((row) => row.id);
}

export async function generateBulkDataArchive(id: string): Promise<void> {
  const claimed = await claimArchive(id);
  if (!claimed) return;
  const leaseToken = claimed.leaseToken;
  if (!leaseToken) return;
  const storage = archiveStorage();
  const objectId = randomUUID();
  try {
    const generatedAt = new Date();
    const { buffer } = await buildBulkDataArchive(generatedAt);
    await storage.saveArchive(objectId, buffer);
    const completed = await db.update(bulkDataArchives).set({
      status: "succeeded",
      objectId,
      fileName: bulkArchiveFileName(generatedAt),
      byteSize: buffer.length,
      checksum: createHash("sha256").update(buffer).digest("hex"),
      leaseToken: null,
      completedAt: new Date(),
      errorMessage: null,
    }).where(and(
      eq(bulkDataArchives.id, id),
      eq(bulkDataArchives.status, "running"),
      eq(bulkDataArchives.leaseToken, leaseToken),
    )).returning({ id: bulkDataArchives.id });
    if (!completed[0]) {
      await storage.deleteArchive(objectId);
      return;
    }
  } catch (error) {
    await storage.deleteArchive(objectId).catch(() => undefined);
    await db.update(bulkDataArchives).set({
      status: "failed",
      leaseToken: null,
      completedAt: new Date(),
      errorMessage: error instanceof Error ? error.message.slice(0, 2000) : "Archive generation failed",
    }).where(and(
      eq(bulkDataArchives.id, id),
      eq(bulkDataArchives.status, "running"),
      eq(bulkDataArchives.leaseToken, leaseToken),
    ));
    return;
  }

  // Retention is deliberately isolated from archive completion. A transient
  // cleanup failure must never remove or downgrade the newly succeeded archive.
  try {
    await retainRecentBulkDataArchives(storage);
  } catch (error) {
    console.error("Bulk data archive retention failed:", error);
  }
}

export function queueBulkDataArchive(id: string): void {
  setImmediate(() => {
    void generateBulkDataArchive(id).catch((error) => {
      console.error("Bulk data archive worker failed:", error);
    });
  });
}

export async function downloadBulkDataArchive(row: BulkDataArchive): Promise<Buffer> {
  if (row.status !== "succeeded" || !row.objectId) {
    throw new Error("Archive is not ready");
  }
  return archiveStorage().getArchive(row.objectId);
}

export async function scheduleBulkDataArchive(now = new Date()): Promise<void> {
  if (!isPastRiyadhScheduleBoundary(now)) return;
  const scheduleDate = riyadhDate(now);
  let row = await createBulkDataArchive("scheduled", undefined, scheduleDate);
  if (!row) {
    [row] = await db.select().from(bulkDataArchives).where(and(
      eq(bulkDataArchives.source, "scheduled"),
      eq(bulkDataArchives.scheduleDate, scheduleDate),
    )).limit(1);
  }
  if (row && (row.status === "pending" || row.status === "running")) {
    queueBulkDataArchive(row.id);
  }
}

async function recoverBulkDataArchiveJobs(): Promise<void> {
  await recoverDeletingBulkDataArchives();
  const rows = await db.select({ id: bulkDataArchives.id })
    .from(bulkDataArchives)
    .where(or(
      eq(bulkDataArchives.status, "pending"),
      eq(bulkDataArchives.status, "running"),
    ));
  for (const row of rows) queueBulkDataArchive(row.id);
}

export function startBulkDataArchiveScheduler(): NodeJS.Timeout {
  void Promise.all([recoverBulkDataArchiveJobs(), scheduleBulkDataArchive()]).catch((error) => {
    console.error("Bulk data archive startup catch-up failed:", error);
  });
  const timer = setInterval(() => {
    void Promise.all([recoverBulkDataArchiveJobs(), scheduleBulkDataArchive()]).catch((error) => {
      console.error("Bulk data archive scheduler failed:", error);
    });
  }, SCHEDULER_INTERVAL_MS);
  timer.unref();
  return timer;
}

export { ARCHIVE_MIME };