import test from "node:test";
import assert from "node:assert/strict";
import { isRestrictedUserRouteAllowed } from "./restrictedUserPolicy";

test("restricted users can open ordinary publications and their own profile", () => {
  assert.equal(isRestrictedUserRouteAllowed("/publications", 42), true);
  assert.equal(isRestrictedUserRouteAllowed("/publications/19", 42), true);
  assert.equal(isRestrictedUserRouteAllowed("/scientists/42", 42), true);
  assert.equal(isRestrictedUserRouteAllowed("/scientists/42/edit", 42), true);
});

test("restricted users cannot open office areas, publication writes, or other profiles", () => {
  assert.equal(isRestrictedUserRouteAllowed("/grants", 42), false);
  assert.equal(isRestrictedUserRouteAllowed("/outcome-office", 42), false);
  assert.equal(isRestrictedUserRouteAllowed("/ibc-applications/7/print", 42), false);
  assert.equal(isRestrictedUserRouteAllowed("/irb-applications/8/print", 42), false);
  assert.equal(isRestrictedUserRouteAllowed("/publications/new", 42), false);
  assert.equal(isRestrictedUserRouteAllowed("/publications/19/edit", 42), false);
  assert.equal(isRestrictedUserRouteAllowed("/scientists/43", 42), false);
});

test("restricted users can register while no profile is linked", () => {
  assert.equal(isRestrictedUserRouteAllowed("/register", null), true);
  assert.equal(isRestrictedUserRouteAllowed("/scientists/42", null), false);
});