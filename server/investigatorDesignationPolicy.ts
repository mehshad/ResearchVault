import type { NextFunction, Request, Response } from "express";
import { hasManagementRole } from "./sidraScoreRoutes";
import { INVESTIGATOR_ELIGIBLE_JOB_TITLES } from "@shared/investigatorEligibility";

export const INVESTIGATOR_DESIGNATION_FIELD = "isInvestigator";
export const INVESTIGATOR_ELIGIBILITY_MANAGEMENT_MESSAGE =
  "Only Management or an administrator can grant Investigator eligibility.";

export function requestsInvestigatorEligibilityChange(
  body: unknown
): boolean {
  if (!body || typeof body !== "object") return false;

  const payload = body as Record<string, unknown>;
  if (
    Object.prototype.hasOwnProperty.call(
      payload,
      INVESTIGATOR_DESIGNATION_FIELD
    )
  ) {
    return true;
  }

  return (
    typeof payload.jobTitle === "string" &&
    INVESTIGATOR_ELIGIBLE_JOB_TITLES.includes(
      payload.jobTitle as (typeof INVESTIGATOR_ELIGIBLE_JOB_TITLES)[number]
    )
  );
}

/**
 * Prevent staff from promoting themselves by submitting the protected field
 * directly. Management/admin users may change it on create or update.
 */
export function requireInvestigatorDesignationManager(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (
    requestsInvestigatorEligibilityChange(req.body) &&
    !hasManagementRole(req)
  ) {
    return res.status(403).json({
      message: INVESTIGATOR_ELIGIBILITY_MANAGEMENT_MESSAGE,
    });
  }

  next();
}