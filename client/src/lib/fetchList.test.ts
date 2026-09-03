import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchList } from "./fetchList";

const withFetch = async (impl: (url: string) => Promise<any>, run: () => Promise<void>) => {
  const original = globalThis.fetch;
  (globalThis as any).fetch = (url: string) => impl(url);
  try { await run(); } finally { (globalThis as any).fetch = original; }
};

const reply = (status: number, body: unknown) => Promise.resolve({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  json: async () => body,
} as any);

test("a refused area yields an empty list, not the refusal object", async () => {
  // The whole bug: 403 bodies are `{message}`, components call .find() on
  // them, the render throws, React unmounts, and the page goes blank.
  await withFetch(() => reply(403, { message: "Forbidden. IBC office access required." }), async () => {
    assert.deepEqual(await fetchList("/api/ibc-board-members"), []);
  });
});

test("a missing endpoint also yields an empty list", async () => {
  await withFetch(() => reply(404, { message: "Not found" }), async () => {
    assert.deepEqual(await fetchList("/api/whatever"), []);
  });
});

test("a real fault is raised rather than shown as an empty list", async () => {
  // A page confidently rendering "no staff" over a broken API is worse than
  // one reporting an error.
  await withFetch(() => reply(500, { message: "boom" }), async () => {
    await assert.rejects(() => fetchList("/api/scientists"), /500/);
  });
});

test("a successful list comes through unchanged", async () => {
  await withFetch(() => reply(200, [{ id: 1 }, { id: 2 }]), async () => {
    assert.deepEqual(await fetchList("/api/scientists"), [{ id: 1 }, { id: 2 }]);
  });
});

test("a success that is not a list is treated as no rows", async () => {
  await withFetch(() => reply(200, { message: "unexpected" }), async () => {
    assert.deepEqual(await fetchList("/api/scientists"), []);
  });
});
