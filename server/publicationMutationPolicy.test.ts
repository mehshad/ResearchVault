import assert from "node:assert/strict";
import test from "node:test";

import {
  getGenericPublicationPatchWorkflowViolation,
  getPublicationCreateWorkflowViolation,
  getStatusTransitionWorkflowViolation,
  getStatusUpdatedFieldsWorkflowViolation,
  parsePublicationStatusFields,
} from "./publicationMutationPolicy";

test("generic publication edits cannot set the IP approval flag", () => {
  assert.deepEqual(
    getGenericPublicationPatchWorkflowViolation({
      vettedForSubmissionByIpOffice: true,
    }),
    {
      statusCode: 403,
      message:
        "IP office approval can only be changed through the Outcome Office vetting action.",
    }
  );
});

test("generic publication edits cannot bypass status transitions", () => {
  assert.equal(
    getGenericPublicationPatchWorkflowViolation({
      status: "Vetted for submission",
    })?.statusCode,
    400
  );
});

test("new publications cannot start with an advanced status or IP approval", () => {
  assert.equal(
    getPublicationCreateWorkflowViolation({
      status: "Vetted for submission",
    })?.statusCode,
    400
  );
  assert.equal(
    getPublicationCreateWorkflowViolation({
      status: "Concept",
      vettedForSubmissionByIpOffice: true,
    })?.statusCode,
    403
  );
  assert.equal(
    getPublicationCreateWorkflowViolation({
      status: "Concept",
      vettedForSubmissionByIpOffice: false,
    }),
    null
  );
});

test("the regular status endpoint cannot perform the IP approval transition", () => {
  assert.equal(
    getStatusTransitionWorkflowViolation(
      "Complete Draft",
      "Vetted for submission"
    )?.statusCode,
    403
  );
  assert.equal(
    getStatusTransitionWorkflowViolation(
      "Vetted for submission",
      "Submitted for review without pre-publication"
    ),
    null
  );
});

test("the regular status endpoint cannot set the protected IP approval field", () => {
  assert.equal(
    getStatusUpdatedFieldsWorkflowViolation({
      vettedForSubmissionByIpOffice: true,
    })?.statusCode,
    403
  );
  assert.equal(
    getStatusUpdatedFieldsWorkflowViolation({
      prepublicationSite: "medRxiv",
    }),
    null
  );
});

test("invalid status and active reason require dedicated correction routes", () => {
  assert.equal(
    getGenericPublicationPatchWorkflowViolation({
      invalidReason: "client supplied",
    })?.statusCode,
    403,
  );
  assert.equal(
    getPublicationCreateWorkflowViolation({
      status: "Concept",
      invalidReason: "client supplied",
    })?.statusCode,
    403,
  );
  assert.equal(
    getStatusTransitionWorkflowViolation(
      "Published",
      "Published - Invalid",
    )?.statusCode,
    403,
  );
  assert.equal(
    getStatusTransitionWorkflowViolation(
      "Published - Invalid",
      "Published",
    )?.statusCode,
    403,
  );
  assert.equal(
    getStatusUpdatedFieldsWorkflowViolation({
      invalidReason: null,
    })?.statusCode,
    403,
  );
});
// The Published stage is the only one that writes a date, and it was
// unreachable: the browser sends what an <input type="date"> holds, the column
// is a timestamp, and Drizzle called .toISOString() on the string.
test("a date sent as text becomes a Date the timestamp column accepts", () => {
  const parsed = parsePublicationStatusFields({
    publicationDate: "2026-07-03",
    doi: "10.3390/epigenomes10030044",
  });

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.ok(
    parsed.fields?.publicationDate instanceof Date,
    "publicationDate must reach the database as a Date, not a string",
  );
  assert.equal(
    (parsed.fields?.publicationDate as Date).toISOString().slice(0, 10),
    "2026-07-03",
  );
  assert.equal(parsed.fields?.doi, "10.3390/epigenomes10030044");
});

test("a cleared date becomes null rather than an invalid Date", () => {
  const parsed = parsePublicationStatusFields({ publicationDate: "" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.fields?.publicationDate, null);
});

test("no updated fields stays absent, so nothing is written", () => {
  assert.deepEqual(parsePublicationStatusFields(undefined), {
    ok: true,
    fields: undefined,
  });
  assert.deepEqual(parsePublicationStatusFields(null), {
    ok: true,
    fields: undefined,
  });
});

// Same guarantee the generic edit endpoint gets: a status change writes
// publication columns and nothing else.
test("fields that are not publication columns are dropped", () => {
  const parsed = parsePublicationStatusFields({
    journal: "epigenomes",
    id: 99,
    createdByUserId: 7,
    somethingInvented: true,
  });

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.fields, { journal: "epigenomes" });
});

test("an unusable date is refused with a reason instead of a bare 500", () => {
  const parsed = parsePublicationStatusFields({ publicationDate: "not a date" });
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.match(parsed.message, /publicationDate/);
});
