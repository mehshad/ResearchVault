import assert from "node:assert/strict";
import test from "node:test";

import { pageSlice, pageWindow } from "./paging";

test("a list shorter than a page is one page", () => {
  assert.deepEqual(pageWindow(12, 1, 50), { page: 1, pageCount: 1, from: 1, to: 12, total: 12 });
  assert.deepEqual(pageWindow(12, 4, 50), { page: 1, pageCount: 1, from: 1, to: 12, total: 12 });
});

test("the last page is partial and a page past the end clamps to it", () => {
  assert.deepEqual(pageWindow(272, 6, 50), { page: 6, pageCount: 6, from: 251, to: 272, total: 272 });
  assert.equal(pageWindow(272, 9, 50).page, 6);
  assert.equal(pageWindow(272, 0, 50).page, 1);
  assert.equal(pageWindow(272, -3, 50).page, 1);
});

test("an empty list is page one of one with nothing shown", () => {
  assert.deepEqual(pageWindow(0, 3, 50), { page: 1, pageCount: 1, from: 0, to: 0, total: 0 });
});

test("the slice matches the window", () => {
  const rows = Array.from({ length: 120 }, (_, i) => i + 1);
  assert.deepEqual(pageSlice(rows, 1, 50).slice(0, 2), [1, 2]);
  assert.deepEqual(pageSlice(rows, 3, 50), Array.from({ length: 20 }, (_, i) => 101 + i));
  assert.deepEqual(pageSlice(rows, 7, 50), Array.from({ length: 20 }, (_, i) => 101 + i));
});
