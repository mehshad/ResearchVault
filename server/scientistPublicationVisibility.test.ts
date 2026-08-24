import assert from "node:assert/strict";
import test from "node:test";
import {
  canViewUnpublishedScientistPublications,
  canViewPublication,
  isPublicScientistProfilePublicationStatus,
} from "./scientistPublicationVisibility";

const target = { id: 42, supervisorId: 7 };

test("profile owner can view unpublished publications", () => {
  assert.equal(
    canViewUnpublishedScientistPublications({ role: "Investigator", scientistId: 42 }, target),
    true,
  );
});

test("direct line manager can view unpublished publications", () => {
  assert.equal(
    canViewUnpublishedScientistPublications({ role: "Investigator", scientistId: 7 }, target),
    true,
  );
});

test("Management and administrator roles can view unpublished publications", () => {
  for (const role of ["Management", "admin", "superadmin"]) {
    assert.equal(
      canViewUnpublishedScientistPublications({ role, scientistId: 99 }, target),
      true,
    );
  }
});

test("unrelated and anonymous viewers cannot view unpublished publications", () => {
  assert.equal(
    canViewUnpublishedScientistPublications({ role: "Investigator", scientistId: 8 }, target),
    false,
  );
  assert.equal(canViewUnpublishedScientistPublications(null, target), false);
});

test("a manager's manager is not treated as the direct line manager", () => {
  assert.equal(
    canViewUnpublishedScientistPublications({ role: "Investigator", scientistId: 6 }, target),
    false,
  );
});

test("only Published and Published * are public profile statuses", () => {
  assert.equal(isPublicScientistProfilePublicationStatus("Published"), true);
  assert.equal(isPublicScientistProfilePublicationStatus(" published * "), true);
  assert.equal(isPublicScientistProfilePublicationStatus("In Press"), false);
  assert.equal(isPublicScientistProfilePublicationStatus("Concept"), false);
  assert.equal(isPublicScientistProfilePublicationStatus(null), false);
});

test("published publications are visible without a viewer", () => {
  assert.equal(canViewPublication(null, { status: "Published" }, []), true);
  assert.equal(canViewPublication(null, { status: "Published *" }, []), true);
});

test("an unpublished publication remains visible to its creator without author links", () => {
  assert.equal(
    canViewPublication(
      { userId: 12, role: "Investigator", scientistId: 90 },
      { status: "Concept", createdByUserId: 12 },
      [],
    ),
    true,
  );
});

test("linked authors and their direct line managers can view unpublished publications", () => {
  const authors = [{ scientistId: 42, supervisorId: 7 }];
  assert.equal(
    canViewPublication(
      { userId: 20, role: "Investigator", scientistId: 42 },
      { status: "In Press", createdByUserId: 12 },
      authors,
    ),
    true,
  );
  assert.equal(
    canViewPublication(
      { userId: 21, role: "Investigator", scientistId: 7 },
      { status: "In Press", createdByUserId: 12 },
      authors,
    ),
    true,
  );
});

test("unrelated viewers cannot view unpublished publications", () => {
  assert.equal(
    canViewPublication(
      { userId: 22, role: "Investigator", scientistId: 8 },
      { status: "Concept", createdByUserId: 12 },
      [{ scientistId: 42, supervisorId: 7 }],
    ),
    false,
  );
});