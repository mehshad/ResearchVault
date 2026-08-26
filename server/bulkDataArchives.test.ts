import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";

process.env.DATABASE_URL ||= "postgres://unused:unused@127.0.0.1:1/unused";

test("all-sections archive contains five canonical workbooks and manifest", async () => {
  const { buildBulkDataArchive } = await import("./bulkDataArchives");
  const { SECTION_META } = await import("./bulkDataHub");
  const now = new Date("2026-08-26T12:34:56.000Z");
  const { buffer, manifest } = await buildBulkDataArchive(
    now,
    async (sectionId) => Buffer.from(`workbook:${sectionId}`),
  );
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files);
  assert.deepEqual(names, [
    ...SECTION_META.map((section) => `${section.id}.xlsx`),
    "manifest.json",
  ]);
  assert.equal(manifest.sections.length, 5);
  assert.equal(manifest.generatedAt, now.toISOString());
  const storedManifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  assert.deepEqual(storedManifest, manifest);
  for (const section of SECTION_META) {
    assert.equal(
      await zip.file(`${section.id}.xlsx`)!.async("string"),
      `workbook:${section.id}`,
    );
  }
});

test("Riyadh helpers use the local date and 02:00 boundary", async () => {
  const { isPastRiyadhScheduleBoundary, riyadhDate } = await import("./bulkDataArchives");
  const before = new Date("2026-08-26T22:59:59.000Z"); // 01:59:59 on Aug 27 in Riyadh
  const boundary = new Date("2026-08-26T23:00:00.000Z"); // 02:00 on Aug 27
  assert.equal(riyadhDate(before), "2026-08-27");
  assert.equal(isPastRiyadhScheduleBoundary(before), false);
  assert.equal(isPastRiyadhScheduleBoundary(boundary), true);
});

test("retention removes only succeeded archives beyond the newest 30", async () => {
  const { selectArchivesForRetentionRemoval } = await import("./bulkDataArchives");
  const base = {
    source: "manual",
    scheduleDate: null,
    fileName: null,
    objectId: null,
    byteSize: null,
    checksum: null,
    leaseToken: null,
    errorMessage: null,
    requestedBy: null,
    startedAt: null,
  };
  const succeeded = Array.from({ length: 31 }, (_, index) => ({
    ...base,
    id: `success-${index}`,
    status: "succeeded",
    createdAt: new Date(index * 1000),
    completedAt: new Date(index * 1000),
  }));
  const failed = {
    ...base,
    id: "failed-old",
    status: "failed",
    createdAt: new Date(0),
    completedAt: new Date(0),
  };
  assert.deepEqual(
    selectArchivesForRetentionRemoval([...succeeded, failed] as any),
    ["success-0"],
  );
});