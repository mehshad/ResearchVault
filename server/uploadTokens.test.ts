import assert from "node:assert/strict";
import test from "node:test";

import {
  generateFinalizeToken,
  generateUploadToken,
  localUploadSubject,
  verifyFinalizeToken,
  verifyUploadToken,
  withLocalUploadToken,
} from "./uploadTokens";

const subject = localUploadSubject("2f1c6a0e-3f6b-4d3a-9d7a-0c9b1f2e3a4b");

test("a token verifies for the subject and user it was minted for", () => {
  const token = generateUploadToken(subject, "42");
  assert.equal(verifyUploadToken(subject, "42", token), true);
});

test("a token minted for one user does not let another write the same upload", () => {
  const token = generateUploadToken(subject, "42");
  assert.equal(verifyUploadToken(subject, "43", token), false);
});

test("a token minted for one upload id does not open another", () => {
  const token = generateUploadToken(subject, "42");
  assert.equal(verifyUploadToken(localUploadSubject("11111111-2222-4333-8444-555555555555"), "42", token), false);
});

test("a finalize token is not accepted as a local upload token for the same path", () => {
  const objectPath = "/objects/local-upload/2f1c6a0e-3f6b-4d3a-9d7a-0c9b1f2e3a4b";
  const token = generateFinalizeToken(objectPath, "42");
  assert.equal(verifyFinalizeToken(objectPath, "42", token), true);
  assert.equal(verifyUploadToken(subject, "42", token), false);
});

test("a token expires after an hour", () => {
  const minted = Date.parse("2026-09-13T10:00:00Z");
  const token = generateUploadToken(subject, "42", minted);
  assert.equal(verifyUploadToken(subject, "42", token, minted + 59 * 60 * 1000), true);
  assert.equal(verifyUploadToken(subject, "42", token, minted + 61 * 60 * 1000), false);
});

test("a tampered, malformed or missing token is refused", () => {
  const token = generateUploadToken(subject, "42");
  const [expiry, sig] = token.split(".");
  assert.equal(verifyUploadToken(subject, "42", `${expiry}.${sig.replace(/^./, (c) => (c === "a" ? "b" : "a"))}`), false);
  assert.equal(verifyUploadToken(subject, "42", `${Number(expiry) + 100}.${sig}`), false);
  assert.equal(verifyUploadToken(subject, "42", "not-a-token"), false);
  assert.equal(verifyUploadToken(subject, "42", ""), false);
  assert.equal(verifyUploadToken(subject, "42", undefined), false);
  assert.equal(verifyUploadToken(subject, "42", ["a", "b"]), false);
});

test("the minted local upload URL carries a token bound to its id", () => {
  const id = "2f1c6a0e-3f6b-4d3a-9d7a-0c9b1f2e3a4b";
  const url = withLocalUploadToken(`http://localhost:5000/api/objects/local-upload/${id}`, id, "42");
  const token = new URL(url).searchParams.get("token");
  assert.ok(token);
  assert.equal(verifyUploadToken(localUploadSubject(id), "42", token), true);
  assert.equal(new URL(url).pathname, `/api/objects/local-upload/${id}`);
});
