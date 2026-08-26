export function sanitizeScientistUpdatePayload<T extends Record<string, unknown>>(
  data: T,
  canManageProfileAccess: boolean
): T {
  const payload = { ...data };

  if (!canManageProfileAccess) {
    delete payload.isInvestigator;
  }

  return payload;
}