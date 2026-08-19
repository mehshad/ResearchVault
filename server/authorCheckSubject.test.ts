import assert from "node:assert/strict";
import test from "node:test";
import { resolveAuthorCheckSubject } from "./authorCheckSubject";

test("an explicit profile scientist overrides the demo identity", async () => {
  const requestedIds: number[] = [];
  const result = await resolveAuthorCheckSubject({
    requestedScientistId: "24396",
    authMode: "demo",
    getScientist: async (id) => {
      requestedIds.push(id);
      return { firstName: "Tracy", lastName: "Augustine" };
    },
  });

  assert.deepEqual(requestedIds, [24396]);
  assert.deepEqual(result, {
    ok: true,
    firstName: "Tracy",
    lastName: "Augustine",
  });
});

test("different profile scientists resolve independently", async () => {
  const scientists = new Map([
    [1, { firstName: "Emily", lastName: "Chen" }],
    [2, { firstName: "Michael", lastName: "Johnson" }],
  ]);
  const getScientist = async (id: number) => scientists.get(id);

  const emily = await resolveAuthorCheckSubject({
    requestedScientistId: "1",
    authMode: "demo",
    getScientist,
  });
  const michael = await resolveAuthorCheckSubject({
    requestedScientistId: "2",
    authMode: "demo",
    getScientist,
  });

  assert.notDeepEqual(emily, michael);
  assert.equal(emily.ok && emily.lastName, "Chen");
  assert.equal(michael.ok && michael.lastName, "Johnson");
});

test("the current-user demo fallback remains unchanged without a profile", async () => {
  const result = await resolveAuthorCheckSubject({
    requestedScientistId: undefined,
    authMode: "demo",
    getScientist: async () => undefined,
  });

  assert.deepEqual(result, {
    ok: true,
    firstName: "Wouter",
    lastName: "Hendrickx",
  });
});

test("invalid and missing profile scientists return clear errors", async () => {
  const invalid = await resolveAuthorCheckSubject({
    requestedScientistId: "not-an-id",
    authMode: "demo",
    getScientist: async () => undefined,
  });
  const missing = await resolveAuthorCheckSubject({
    requestedScientistId: "999",
    authMode: "demo",
    getScientist: async () => undefined,
  });

  assert.deepEqual(invalid, {
    ok: false,
    status: 400,
    message: "Invalid scientist ID",
  });
  assert.deepEqual(missing, {
    ok: false,
    status: 404,
    message: "Scientist not found",
  });
});