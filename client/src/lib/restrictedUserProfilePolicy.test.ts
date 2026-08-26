import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeScientistUpdatePayload } from "./restrictedUserProfilePolicy";

test("ordinary self-profile updates retain job title but omit the protected designation", () => {
  assert.deepEqual(
    sanitizeScientistUpdatePayload(
      {
        firstName: "Amina",
        bio: "Updated bio",
        jobTitle: "Investigator",
        isInvestigator: true,
      },
      false
    ),
    {
      firstName: "Amina",
      bio: "Updated bio",
      jobTitle: "Investigator",
    }
  );
});

test("profile managers retain access-changing fields", () => {
  const payload = {
    firstName: "Amina",
    jobTitle: "Investigator",
    isInvestigator: true,
  };

  assert.deepEqual(sanitizeScientistUpdatePayload(payload, true), payload);
});