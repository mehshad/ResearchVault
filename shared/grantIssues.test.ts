import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GRANT_ISSUE_DEFINITIONS,
  evaluateGrantIssues,
  type GrantIssueCode,
} from "./grantIssues";

/**
 * The rules panel on the grants page is generated from GRANT_ISSUE_DEFINITIONS,
 * including each check's `when`. That makes `when` a claim the office will read
 * and act on, so it has to be what the code actually does -- a panel confidently
 * describing a rule nobody enforces is worse than no panel.
 *
 * Each definition is exercised against a grant in all three phases: everything
 * blank, so every check that can fire does.
 */
const blank = {
  projectNumber: "",
  title: "",
  lpiId: null,
  fundingAgency: "",
  requestedAmount: null,
  awardedAmount: null,
  currency: "",
  awardedYear: null,
  startDate: null,
  endDate: null,
};

const codesFor = (overrides: Record<string, unknown>): Set<GrantIssueCode> =>
  new Set(evaluateGrantIssues({ ...blank, ...overrides } as any, 0).map((i) => i.code));

const preAward = codesFor({ status: "submitted", awarded: false });
const awarded = codesFor({ status: "awarded", awarded: true });
// Terminal and never awarded: neither the pre-award nor the awarded checks.
const notAwarded = codesFor({ status: "not_awarded", awarded: false });

for (const definition of GRANT_ISSUE_DEFINITIONS) {
  test(`"${definition.label}" fires exactly where its \`when\` says (${definition.when})`, () => {
    const inPre = preAward.has(definition.code);
    const inAwarded = awarded.has(definition.code);
    const inNotAwarded = notAwarded.has(definition.code);

    if (definition.when === "always") {
      assert.ok(inPre && inAwarded && inNotAwarded, "should fire in every phase");
    } else if (definition.when === "preAward") {
      assert.ok(inPre, "should fire before the award decision");
      assert.ok(!inAwarded, "should not fire once awarded");
      assert.ok(!inNotAwarded, "should not fire on a grant that was never awarded");
    } else {
      assert.ok(inAwarded, "should fire once awarded");
      assert.ok(!inPre, "should not fire before the award decision");
      assert.ok(!inNotAwarded, "should not fire on a grant that was never awarded");
    }
  });
}

test("every issue the evaluator can raise is described in the panel", () => {
  // A new code that never reached GRANT_ISSUE_DEFINITIONS would be flagged on
  // the list with no explanation anywhere.
  const described = new Set(GRANT_ISSUE_DEFINITIONS.map((d) => d.code));
  for (const code of [...preAward, ...awarded, ...notAwarded]) {
    assert.ok(described.has(code), `${code} is raised but not described`);
  }
});
