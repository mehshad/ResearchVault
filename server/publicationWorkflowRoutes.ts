import type { RequestHandler } from "express";

import {
  approvePublicationForIp,
  PUBLISHED_STATUS,
  PUBLISHED_INVALID_STATUS,
  PUBLISHED_FINAL_STATUS,
  WITHDRAWN_STATUS,
  IP_VETTED_STATUS,
  IP_VETTING_READY_STATUS,
  validateInvalidPublicationReason,
} from "@shared/publicationWorkflow";

type IpVettingStorage = {
  getPublication(id: number): Promise<any>;
  updatePublication(id: number, update: Record<string, unknown>): Promise<any>;
  updatePublicationStatus(
    id: number,
    status: string,
    changedBy: number,
    changes?: { field: string; oldValue: string; newValue: string }[],
    expectedStatus?: string,
    updatedFields?: Record<string, unknown>,
  ): Promise<any>;
};

type CorrectionWorkflowStorage = {
  getPublication(id: number): Promise<any>;
  getPublicationAuthors(id: number): Promise<Array<{ scientistId: number }>>;
  updatePublicationCorrectionStatus(
    id: number,
    expectedStatus: string,
    status: string,
    invalidReason: string | null,
    changedBy: number,
    changeReason: string,
  ): Promise<any>;
};

type RevertFinalStorage = {
  getPublication(id: number): Promise<any>;
  updatePublicationStatus(
    id: number,
    status: string,
    changedBy: number,
    changes?: { field: string; oldValue: string; newValue: string }[],
    expectedStatus?: string,
  ): Promise<any>;
};

export function selectInvalidLinkedPublications<
  T extends { id: number; status?: string | null },
>(
  publications: T[],
  authorLinks: Array<{ publicationId: number; scientistId: number }>,
  scientistId: number | null,
): T[] {
  const linkedPublicationIds = new Set(
    authorLinks
      .filter((author) =>
        scientistId == null || author.scientistId === scientistId
      )
      .map((author) => author.publicationId),
  );
  return publications.filter((publication) =>
    publication.status === PUBLISHED_INVALID_STATUS &&
    linkedPublicationIds.has(publication.id)
  );
}

function parsePublicationId(rawId: string): number | null {
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function createInvalidatePublishedHandler(
  workflowStorage: CorrectionWorkflowStorage,
): RequestHandler {
  return async (req, res) => {
    try {
      const id = parsePublicationId(req.params.id);
      if (id == null) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }
      const actorId = req.session?.user?.id;
      if (actorId == null) {
        return res.status(401).json({ message: "You must be signed in." });
      }
      const reasonResult = validateInvalidPublicationReason(req.body?.reason);
      if (!reasonResult.ok) {
        return res.status(400).json({ message: reasonResult.message });
      }
      const publication = await workflowStorage.getPublication(id);
      if (!publication) {
        return res.status(404).json({ message: "Publication not found" });
      }
      if (publication.status !== PUBLISHED_STATUS) {
        return res.status(400).json({
          message: `Only a current ${PUBLISHED_STATUS} publication can be marked ${PUBLISHED_INVALID_STATUS}.`,
        });
      }

      const updated = await workflowStorage.updatePublicationCorrectionStatus(
        id,
        PUBLISHED_STATUS,
        PUBLISHED_INVALID_STATUS,
        reasonResult.reason,
        actorId,
        reasonResult.reason,
      );
      if (!updated) {
        return res.status(409).json({
          message: "The publication status changed before it could be marked invalid.",
        });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error marking publication invalid:", error);
      res.status(500).json({ message: "Failed to mark publication invalid" });
    }
  };
}

export function createInvalidAuthorActionHandler(
  workflowStorage: CorrectionWorkflowStorage,
  targetStatus: typeof PUBLISHED_STATUS | typeof WITHDRAWN_STATUS,
): RequestHandler {
  return async (req, res) => {
    try {
      const id = parsePublicationId(req.params.id);
      if (id == null) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }
      const actor = req.session?.user;
      if (!actor) {
        return res.status(401).json({ message: "You must be signed in." });
      }
      const publication = await workflowStorage.getPublication(id);
      if (!publication) {
        return res.status(404).json({ message: "Publication not found" });
      }
      if (publication.status !== PUBLISHED_INVALID_STATUS) {
        return res.status(400).json({
          message: `Only a ${PUBLISHED_INVALID_STATUS} publication can use this action.`,
        });
      }

      const linkedAuthors = await workflowStorage.getPublicationAuthors(id);
      const isLinkedAuthor =
        actor.scientistId != null &&
        linkedAuthors.some((author) => author.scientistId === actor.scientistId);
      if (!isLinkedAuthor) {
        return res.status(403).json({
          message: "Only an actually linked author may perform this action.",
        });
      }

      const changeReason = targetStatus === PUBLISHED_STATUS
        ? "Correction submitted for Outcome Office review."
        : `Publication withdrawn while addressing invalidation: ${publication.invalidReason}`;
      const updated = await workflowStorage.updatePublicationCorrectionStatus(
        id,
        PUBLISHED_INVALID_STATUS,
        targetStatus,
        null,
        actor.id,
        changeReason,
      );
      if (!updated) {
        return res.status(409).json({
          message: "The publication status changed before the action completed.",
        });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error completing publication correction action:", error);
      res.status(500).json({ message: "Failed to complete publication correction action" });
    }
  };
}

export function createRevertFinalHandler(
  workflowStorage: RevertFinalStorage,
): RequestHandler {
  return async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }
      const sessionUserId = req.session?.user?.id;
      if (sessionUserId == null) {
        return res.status(401).json({ message: "You must be signed in." });
      }
      const publication = await workflowStorage.getPublication(id);
      if (!publication) {
        return res.status(404).json({ message: "Publication not found" });
      }
      if (publication.status !== PUBLISHED_FINAL_STATUS) {
        return res.status(400).json({
          message: "This publication is not in the final Published * state.",
        });
      }
      const updated = await workflowStorage.updatePublicationStatus(
        id,
        PUBLISHED_STATUS,
        sessionUserId,
        undefined,
        PUBLISHED_FINAL_STATUS,
      );
      if (!updated) {
        return res.status(409).json({
          message: "The publication changed before final approval was reverted. Refresh and try again.",
        });
      }
      return res.json(updated);
    } catch (error) {
      console.error("Error reverting final approval:", error);
      return res.status(500).json({ message: "Failed to revert final approval" });
    }
  };
}

export function createIpVettingHandler(
  workflowStorage: IpVettingStorage
): RequestHandler {
  return async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }

      const sessionUserId = req.session?.user?.id;
      if (sessionUserId == null) {
        return res.status(401).json({ message: "You must be signed in." });
      }

      const publication = await workflowStorage.getPublication(id);
      if (!publication) {
        return res.status(404).json({ message: "Publication not found" });
      }

      const transition = approvePublicationForIp(publication);
      const updated = await workflowStorage.updatePublicationStatus(
        id,
        IP_VETTED_STATUS,
        sessionUserId,
        [
          {
            field: "vettedForSubmissionByIpOffice",
            oldValue: String(
              publication.vettedForSubmissionByIpOffice ?? false
            ),
            newValue: "true",
          },
        ],
        IP_VETTING_READY_STATUS,
        { vettedForSubmissionByIpOffice: true },
      );
      if (!updated) {
        return res.status(409).json({
          message: "The publication changed before IP vetting completed. Refresh and try again.",
        });
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Complete Draft")) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error vetting publication for IP:", error);
      res.status(500).json({ message: "Failed to vet publication for submission" });
    }
  };
}