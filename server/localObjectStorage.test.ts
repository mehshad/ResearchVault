import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

// The module reads UPLOADS_DIR once at import, so the directory has to be
// chosen before it loads.
const uploadsDir = await mkdtemp(path.join(tmpdir(), "qbridge-uploads-"));
process.env.UPLOADS_DIR = uploadsDir;
const { LocalObjectStorageService, ObjectAlreadyExistsError } = await import("./localObjectStorage");

test.after(async () => {
  await rm(uploadsDir, { recursive: true, force: true });
});

test("a fresh id is written once and read back", async () => {
  const service = new LocalObjectStorageService();
  const id = randomUUID();
  await service.saveFile(id, Buffer.from("first body"), "text/plain");
  assert.equal(await readFile(path.join(uploadsDir, id), "utf8"), "first body");
});

test("a second write under the same id is refused and the first body survives", async () => {
  const service = new LocalObjectStorageService();
  const id = randomUUID();
  await service.saveFile(id, Buffer.from("the certificate"), "application/pdf");
  await assert.rejects(
    () => service.saveFile(id, Buffer.from("replaced by somebody else"), "application/pdf"),
    ObjectAlreadyExistsError,
  );
  assert.equal(await readFile(path.join(uploadsDir, id), "utf8"), "the certificate");
});

test("two concurrent writes under one id let exactly one through", async () => {
  const service = new LocalObjectStorageService();
  const id = randomUUID();
  const results = await Promise.allSettled([
    service.saveFile(id, Buffer.from("a"), "text/plain"),
    service.saveFile(id, Buffer.from("b"), "text/plain"),
  ]);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok((rejected[0] as PromiseRejectedResult).reason instanceof ObjectAlreadyExistsError);
});

test("an id that is not a UUID is refused before anything is written", async () => {
  const service = new LocalObjectStorageService();
  await assert.rejects(() => service.saveFile("../etc/passwd", Buffer.from("x"), "text/plain"), /Invalid file id/);
});

test("the object path is the id without the upload token", () => {
  const service = new LocalObjectStorageService();
  const id = randomUUID();
  assert.equal(
    service.normalizeObjectEntityPath(`http://localhost:5000/api/objects/local-upload/${id}?token=123.abc`),
    `/objects/local-upload/${id}`,
  );
});
