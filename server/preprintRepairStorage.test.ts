import assert from "node:assert/strict";
import test from "node:test";
import { MemStorage } from "./storage";

test("import creation stores the publication and initial history together", async () => {
  const storage = new MemStorage();
  const publication = await storage.createPublicationWithHistory({
    title: "Imported preprint",
    doi: "10.1101/2024.01.01.123456",
    status: "Submitted for review with pre-publication",
    publicationType: "Preprint",
  } as any, {
    fromStatus: "",
    toStatus: "Submitted for review with pre-publication",
    changedBy: 42,
    changeReason: "Imported from ORCID/Google Scholar",
  });

  const history = await storage.getManuscriptHistory(publication.id);
  assert.equal(history.length, 1);
  assert.equal(history[0].toStatus, publication.status);
  assert.equal(history[0].changedBy, 42);
});

test("preprint repair revalidates, updates fields, and writes an audit entry", async () => {
  const storage = new MemStorage();
  const publication = await storage.createPublication({
    title: "A preprint",
    doi: "10.1101/2024.02.03.123456",
    status: "Published",
    publicationType: "Journal Article",
  } as any);

  const repaired = await storage.repairPreprintPublication(publication.id, 99);
  assert.equal(repaired.publication?.status, "Submitted for review with pre-publication");
  assert.equal(repaired.publication?.publicationType, "Preprint");
  assert.equal(repaired.publication?.prepublicationUrl, "https://doi.org/10.1101/2024.02.03.123456");
  const history = await storage.getManuscriptHistory(publication.id);
  assert.equal(history.length, 1);
  assert.equal(history[0].changedBy, 99);
  assert.match(history[0].changeReason || "", /Corrected published preprint classification/);

  await storage.updatePublication(publication.id, { status: "Published *" } as any);
  const stale = await storage.repairPreprintPublication(publication.id, 99);
  assert.equal(stale.publication, undefined);
  assert.equal(stale.reason, "no longer eligible");
});