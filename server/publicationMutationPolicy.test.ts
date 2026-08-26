import assert from "node:assert/strict";
import test from "node:test";

import {
  getGenericPublicationPatchWorkflowViolation,
  getPublicationCreateWorkflowViolation,
  getStatusTransitionWorkflowViolation,
  getStatusUpdatedFieldsWorkflowViolation,
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