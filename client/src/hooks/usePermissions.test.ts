import assert from "node:assert/strict";
import test from "node:test";
import { NAVIGATION_ITEMS } from "@/lib/navigationPermissions";

test("the access matrix includes the Certifications navigation item", () => {
  assert.equal(NAVIGATION_ITEMS.includes("certifications"), true);
});