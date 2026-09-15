/**
 * Whether a staff member may be named in an investigator role.
 *
 * Lived inside server/routes.ts and was called from thirteen places there,
 * which was fine until the IBC routes moved into their own module: they need
 * it too, and importing routes.ts from a file routes.ts imports is a cycle.
 * It depends on nothing in routes.ts, so it has its own home.
 */
import { storage } from "./databaseStorage";
import { isInvestigatorEligible } from "@shared/investigatorEligibility";

export type InvestigatorAssignmentError = {
  status: 400 | 404;
  message: string;
};

export async function getInvestigatorAssignmentError(
  scientistId: number | null | undefined,
  roleLabel: string,
): Promise<InvestigatorAssignmentError | null> {
  if (scientistId == null) return null;

  const scientist = await storage.getScientist(scientistId);
  if (!scientist) {
    return {
      status: 404,
      message: `${roleLabel} staff member not found.`,
    };
  }

  if (!isInvestigatorEligible(scientist)) {
    return {
      status: 400,
      message: `${roleLabel} must have an eligible Investigator designation.`,
    };
  }

  return null;
}
