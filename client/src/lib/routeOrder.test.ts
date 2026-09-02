/**
 * Guards route ordering in the client router.
 *
 * wouter's <Switch> takes the first route that matches, so a literal path
 * declared after a parameter route on the same prefix is unreachable: the
 * parameter swallows it. `/scientists/organization` was declared after
 * `/scientists/:id` and opened "Scientist Not Found", because the switch read
 * "organization" as a staff id.
 *
 * The same shape has bitten the server route table before. It is invisible in
 * review -- both lines look correct on their own, and the file is long enough
 * that they are nowhere near each other.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const APP = "client/src/App.tsx";

/** Every `path="..."` in the order the switch will try them. */
function declaredRoutes(): string[] {
  const source = readFileSync(APP, "utf8");
  return [...source.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);
}

const segments = (route: string) => route.split("/").filter(Boolean);
const isParam = (segment: string) => segment.startsWith(":");

test("no literal route is declared after a parameter route that would swallow it", () => {
  const routes = declaredRoutes();
  assert.ok(routes.length > 20, "expected to find the route table");

  const unreachable: string[] = [];

  routes.forEach((later, laterIndex) => {
    const laterParts = segments(later);
    for (let earlierIndex = 0; earlierIndex < laterIndex; earlierIndex++) {
      const earlier = routes[earlierIndex];
      const earlierParts = segments(earlier);
      if (earlierParts.length !== laterParts.length) continue;

      // Does the earlier route match the later one literally, with its
      // parameters standing in for the later route's fixed segments?
      const swallows = earlierParts.every((part, i) =>
        isParam(part) ? !isParam(laterParts[i]) : part === laterParts[i],
      );
      // Only a problem when the earlier one is actually more general.
      const isMoreGeneral = earlierParts.some(isParam);

      if (swallows && isMoreGeneral) {
        unreachable.push(`  "${later}" is unreachable — "${earlier}" is declared first and matches it`);
        break;
      }
    }
  });

  assert.deepEqual(
    unreachable,
    [],
    `Routes hidden behind an earlier parameter route. Move the literal path above\n` +
      `the parameter one in ${APP}:\n\n${unreachable.join("\n")}`,
  );
});
