import type { NextFunction, Request, Response } from "express";
import {
  IP_VETTED_STATUS,
  IP_VETTING_READY_STATUS,
} from "@shared/publicationWorkflow";

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