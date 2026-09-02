// Unit tests for the pure layout helpers in reportGraphics.ts.
// Drawing functions (drawTable, drawChart, etc.) require a live PDFPage and
// are smoke-tested separately; only the arithmetic helpers are covered here.

import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";

process.env.DATABASE_URL ||= "postgresql://ci:ci@localhost:5432/ci_test";

import { fit, wrap, tableHeight } from "./reportGraphics";

// ---------------------------------------------------------------------------
// Bootstrap a real PDFFont so fit/wrap have accurate width measurements
// ---------------------------------------------------------------------------

let helvetica: Awaited<ReturnType<typeof loadFont>>;

async function loadFont() {
  const doc = await PDFDocument.create();
  return doc.embedFont(StandardFonts.Helvetica);
}

// Node test runner runs tests sequentially; load the font once before all tests.
const fontReady = loadFont().then((f) => { helvetica = f; });

// ---------------------------------------------------------------------------
// tableHeight
// ---------------------------------------------------------------------------

test("tableHeight returns header + row area + padding", () => {
  // Formula: 18 + rowCount * rowHeight + 4
  assert.equal(tableHeight(0),      18 + 0  * 15 + 4);   // 22
  assert.equal(tableHeight(1),      18 + 1  * 15 + 4);   // 37
  assert.equal(tableHeight(10),     18 + 10 * 15 + 4);   // 172
  assert.equal(tableHeight(100),    18 + 100 * 15 + 4);  // 1522
});

test("tableHeight accepts a custom rowHeight", () => {
  assert.equal(tableHeight(5, 20), 18 + 5 * 20 + 4); // 122
  assert.equal(tableHeight(3, 10), 18 + 3 * 10 + 4); // 52
});

test("tableHeight default rowHeight is 15", () => {
  assert.equal(tableHeight(7), tableHeight(7, 15));
});

// ---------------------------------------------------------------------------
// fit
// ---------------------------------------------------------------------------

test("fit returns the original string when it fits within maxWidth", async () => {
  await fontReady;
  const text = "Hello";
  // A very generous maxWidth — the string should not be truncated
  const result = fit(text, helvetica, 12, 1000);
  assert.equal(result, text);
});

test("fit truncates long text with an ellipsis when it exceeds maxWidth", async () => {
  await fontReady;
  const long = "This is a very long string that definitely will not fit in ten points of width";
  const result = fit(long, helvetica, 12, 10);
  assert.ok(result.endsWith("…"), `expected ellipsis, got: "${result}"`);
  assert.ok(result.length < long.length);
});

test("fit truncated result fits within maxWidth", async () => {
  await fontReady;
  const long = "ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 1234567890";
  const maxWidth = 50;
  const result = fit(long, helvetica, 12, maxWidth);
  const actualWidth = helvetica.widthOfTextAtSize(result, 12);
  assert.ok(
    actualWidth <= maxWidth,
    `truncated text (${actualWidth}pt) exceeds maxWidth (${maxWidth}pt): "${result}"`,
  );
});

test("fit handles empty string", async () => {
  await fontReady;
  assert.equal(fit("", helvetica, 12, 100), "");
});

test("fit handles null-ish by treating it as empty string", async () => {
  await fontReady;
  // The implementation does `const value = text ?? ""`
  assert.equal(fit(null as unknown as string, helvetica, 12, 100), "");
});

// ---------------------------------------------------------------------------
// wrap
// ---------------------------------------------------------------------------

test("wrap returns a single line when text fits on one line", async () => {
  await fontReady;
  const lines = wrap("Hello world", helvetica, 12, 1000);
  assert.deepEqual(lines, ["Hello world"]);
});

test("wrap breaks text across multiple lines", async () => {
  await fontReady;
  // Force narrow width so each word gets its own line
  const lines = wrap("one two three four", helvetica, 12, 20);
  assert.ok(lines.length > 1, `expected multiple lines, got ${lines.length}`);
});

test("wrap respects maxLines limit", async () => {
  await fontReady;
  const lines = wrap("one two three four five six seven eight", helvetica, 12, 20, 2);
  assert.ok(lines.length <= 2, `expected at most 2 lines, got ${lines.length}`);
});

test("wrap truncates the last line with ellipsis when text overflows maxLines", async () => {
  await fontReady;
  const lines = wrap("alpha beta gamma delta epsilon zeta eta theta", helvetica, 12, 60, 2);
  assert.ok(lines.length <= 2);
  // If the text was truncated the last line ends with "…"
  if (lines.length === 2) {
    assert.ok(lines[lines.length - 1].endsWith("…"), `last line should have ellipsis: "${lines[lines.length - 1]}"`);
  }
});

test("wrap returns [''] for empty string", async () => {
  await fontReady;
  const lines = wrap("", helvetica, 12, 200);
  assert.deepEqual(lines, [""]);
});

test("wrap handles null-ish input gracefully", async () => {
  await fontReady;
  const lines = wrap(null as unknown as string, helvetica, 12, 200);
  assert.deepEqual(lines, [""]);
});

test("wrap default maxLines is 3", async () => {
  await fontReady;
  // Generate a string that definitely produces more than 3 lines at narrow width
  const many = Array.from({ length: 20 }, (_, i) => `word${i}`).join(" ");
  const lines = wrap(many, helvetica, 12, 20);
  assert.ok(lines.length <= 3, `default maxLines should be 3, got ${lines.length} lines`);
});
