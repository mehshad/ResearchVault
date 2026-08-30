/**
 * The SDR exception.
 *
 * A publication normally links to a Scientific Data Record. The exception is
 * work done for a collaborator at another institution: the scientist is an
 * author, but there is no research activity here to link, and forcing one would
 * put a fictional record in the system.
 *
 * These pin the rule every surface asks — the office list, the finalize gate
 * and both forms — so they cannot drift into disagreeing about what counts as
 * accounting for the research activity.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  SDR_EXEMPTION_REASON_MAX_LENGTH,
  hasSdrOrExemption,
  validateSdrExemptionReason,
} from "./publicationWorkflow.js";

test("an explanation is required, not merely offered", () => {
  for (const empty of ["", "   ", "\n\t ", null, undefined, 42, {}]) {
    const result = validateSdrExemptionReason(empty);
    assert.equal(result.ok, false, `${JSON.stringify(empty)} must be rejected`);
    if (!result.ok) assert.match(result.message, /why no SDR applies/i);
  }
});

test("an explanation is trimmed and bounded", () => {
  const result = validateSdrExemptionReason("  Collaboration with Lisbon; I ran the panel.  ");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.reason, "Collaboration with Lisbon; I ran the panel.");

  const atLimit = validateSdrExemptionReason("x".repeat(SDR_EXEMPTION_REASON_MAX_LENGTH));
  assert.equal(atLimit.ok, true, "the limit itself is allowed");

  const overLimit = validateSdrExemptionReason("x".repeat(SDR_EXEMPTION_REASON_MAX_LENGTH + 1));
  assert.equal(overLimit.ok, false);
  if (!overLimit.ok) assert.match(overLimit.message, /2000 characters or fewer/);
});

test("a publication accounts for its research activity by a link or an explanation", () => {
  assert.equal(
    hasSdrOrExemption({ researchActivityId: 12, sdrExemptionReason: null }),
    true,
    "a linked SDR satisfies it",
  );
  assert.equal(
    hasSdrOrExemption({ researchActivityId: null, sdrExemptionReason: "External collaboration." }),
    true,
    "an explanation satisfies it in place of a link",
  );
  assert.equal(
    hasSdrOrExemption({ researchActivityId: null, sdrExemptionReason: null }),
    false,
    "neither is still a defect",
  );
});

test("whitespace is not an explanation", () => {
  // The reason clears the flag on submission rather than on approval, so an
  // all-whitespace value must not be able to silence it.
  assert.equal(
    hasSdrOrExemption({ researchActivityId: null, sdrExemptionReason: "    " }),
    false,
  );
  assert.equal(
    hasSdrOrExemption({ researchActivityId: null, sdrExemptionReason: "\n\t" }),
    false,
  );
});

test("an absent field is treated as absent, not as satisfied", () => {
  assert.equal(hasSdrOrExemption({}), false);
  assert.equal(hasSdrOrExemption({ researchActivityId: undefined }), false);
  assert.equal(hasSdrOrExemption({ sdrExemptionReason: undefined }), false);
});

test("a linked SDR satisfies the rule regardless of the reason field", () => {
  // The two are mutually exclusive and the server clears the reason whenever an
  // SDR is present; the check must not depend on that having happened yet.
  assert.equal(
    hasSdrOrExemption({ researchActivityId: 7, sdrExemptionReason: "stale text" }),
    true,
  );
});
