import type { NextFunction, Request, Response } from "express";
import {
  IP_VETTED_STATUS,
  IP_VETTING_READY_STATUS,
} from "@shared/publicationWorkflow";
import { insertPublicationSchema, type InsertPublication } from "@shared/schema";

export type PublicationWorkflowViolation = {
  statusCode: 400 | 403;
  message: string;
};

export function getGenericPublicationPatchWorkflowViolation(
  update: Record<string, unknown>
): PublicationWorkflowViolation | null {
  if (Object.prototype.hasOwnProperty.call(update, "invalidReason")) {
    return {
      statusCode: 403,
      message:
        "The active invalid reason can only be changed through the publication correction workflow.",
    };
  }
  if (
    Object.prototype.hasOwnProperty.call(
      update,
      "vettedForSubmissionByIpOffice"
    )
  ) {
    return {
      statusCode: 403,
      message:
        "IP office approval can only be changed through the Outcome Office vetting action.",
    };
  }

  if (Object.prototype.hasOwnProperty.call(update, "status")) {
    return {
      statusCode: 400,
      message:
        "Publication status cannot be changed through the general edit endpoint.",
    };
  }

  return null;
}

export function getPublicationCreateWorkflowViolation(
  publication: Record<string, unknown>
): PublicationWorkflowViolation | null {
  if (Object.prototype.hasOwnProperty.call(publication, "invalidReason")) {
    return {
      statusCode: 403,
      message:
        "New publications cannot be created with an active invalid reason.",
    };
  }
  if (publication.vettedForSubmissionByIpOffice === true) {
    return {
      statusCode: 403,
      message:
        "New publications cannot be created with IP office approval already granted.",
    };
  }

  if (
    Object.prototype.hasOwnProperty.call(publication, "status") &&
    publication.status !== "Concept"
  ) {
    return {
      statusCode: 400,
      message:
        "New publications must start at the Concept stage. Use the publication workflow to advance them.",
    };
  }

  return null;
}

export function getStatusTransitionWorkflowViolation(
  currentStatus: string,
  targetStatus: string
): PublicationWorkflowViolation | null {
  if (
    currentStatus === "Published - Invalid" ||
    targetStatus === "Published - Invalid"
  ) {
    return {
      statusCode: 403,
      message:
        "Published correction status can only be changed through its dedicated Outcome Office or linked-author action.",
    };
  }
  if (
    currentStatus === IP_VETTING_READY_STATUS &&
    targetStatus === IP_VETTED_STATUS
  ) {
    return {
      statusCode: 403,
      message:
        "Only the Outcome Office IP vetting action can approve a Complete Draft for submission.",
    };
  }

  return null;
}

/**
 * The fields sent alongside a status change, coerced to what the column types
 * expect and stripped of anything that is not a publication field.
 *
 * The status endpoint used to hand `updatedFields` to the storage layer exactly
 * as the browser sent it. `publicationDate` leaves an `<input type="date">` as
 * "2026-07-03", but the column is a timestamp and Drizzle calls `.toISOString()`
 * on whatever it is given -- so moving a publication to Published threw
 * `value.toISOString is not a function` before any SQL ran, and the endpoint
 * answered a bare 500. Published is the only stage that writes a date, which is
 * why every earlier stage worked and this one could never be reached.
 *
 * The generic edit endpoint never had the problem because it parses its body
 * through `insertPublicationSchema`, which converts the date. Sharing that
 * schema here removes the asymmetry, rather than converting this one field at
 * the call site and leaving the next timestamp to fail the same way.
 */
export function parsePublicationStatusFields(
  updatedFields: unknown
):
  | { ok: true; fields: Partial<InsertPublication> | undefined }
  | { ok: false; message: string } {
  if (updatedFields == null) return { ok: true, fields: undefined };
  if (typeof updatedFields !== "object" || Array.isArray(updatedFields)) {
    return { ok: false, message: "Updated fields must be an object." };
  }

  const parsed = insertPublicationSchema.partial().safeParse(updatedFields);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.errors
        .map((issue) => `${issue.path.join(".") || "field"}: ${issue.message}`)
        .join("; "),
    };
  }

  return { ok: true, fields: parsed.data };
}

export function getStatusUpdatedFieldsWorkflowViolation(
  updatedFields: Record<string, unknown> | null | undefined
): PublicationWorkflowViolation | null {
  if (
    updatedFields &&
    Object.prototype.hasOwnProperty.call(updatedFields, "invalidReason")
  ) {
    return {
      statusCode: 403,
      message:
        "The active invalid reason can only be changed through the publication correction workflow.",
    };
  }
  if (
    updatedFields &&
    Object.prototype.hasOwnProperty.call(
      updatedFields,
      "vettedForSubmissionByIpOffice"
    )
  ) {
    return {
      statusCode: 403,
      message:
        "IP office approval can only be changed through the Outcome Office vetting action.",
    };
  }

  return null;
}

export function rejectGenericPublicationWorkflowMutation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const violation = getGenericPublicationPatchWorkflowViolation(req.body);
  if (violation) {
    return res
      .status(violation.statusCode)
      .json({ message: violation.message });
  }

  next();
}

export function rejectPublicationCreateWorkflowMutation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const violation = getPublicationCreateWorkflowViolation(req.body);
  if (violation) {
    return res
      .status(violation.statusCode)
      .json({ message: violation.message });
  }

  next();
}

export function rejectProtectedPublicationStatusFields(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const violation = getStatusUpdatedFieldsWorkflowViolation(
    req.body?.updatedFields
  );
  if (violation) {
    return res
      .status(violation.statusCode)
      .json({ message: violation.message });
  }

  next();
}