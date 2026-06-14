// Optional text fields on a scientist/staff record that allow NULL on the
// server. Blank values are sent as `null` (not "") so the payload matches the
// server-side normalization and blank Staff IDs don't collide on the unique
// constraint.
const OPTIONAL_TEXT_FIELDS = [
  "jobTitle",
  "staffId",
  "department",
  "bio",
  "profileImageInitials",
  "orcidId",
  "linkedInUrl",
  "googleScholarUrl",
  "webOfScienceId",
] as const;

export function normalizeOptionalScientistFields<T extends Record<string, any>>(data: T): T {
  const normalized: Record<string, any> = { ...data };
  for (const field of OPTIONAL_TEXT_FIELDS) {
    if (typeof normalized[field] === "string" && normalized[field].trim() === "") {
      normalized[field] = null;
    }
  }
  return normalized as T;
}
