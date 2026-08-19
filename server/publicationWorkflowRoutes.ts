import type { RequestHandler } from "express";

import {
  approvePublicationForIp,
  IP_VETTED_STATUS,
} from "@shared/publicationWorkflow";

type IpVettingStorage = {
  getPublication(id: number): Promise<any>;
  updatePublication(id: number, update: Record<string, unknown>): Promise<any>;
  updatePublicationStatus(
    id: number,
    status: string,
    changedBy: number,
    changes?: { field: string; oldValue: string; newValue: string }[]
  ): Promise<any>;
};

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
      await workflowStorage.updatePublication(id, {
        vettedForSubmissionByIpOffice: true,
      });
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
        ]
      );

      res.json(updated ?? transition);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Complete Draft")) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error vetting publication for IP:", error);
      res.status(500).json({ message: "Failed to vet publication for submission" });
    }
  };
}