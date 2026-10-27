/**
 * Uploads and object storage: signed upload URLs, finalisation and serving.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 */
import type { Express, Request, Response } from "express";
import { storage } from "../databaseStorage";
import { ObjectStorageService, ObjectNotFoundError } from "../objectStorage";
import { LocalObjectStorageService, ObjectAlreadyExistsError } from "../localObjectStorage";
import { MAX_LOCAL_UPLOAD_BYTES, generateFinalizeToken, localUploadSubject, verifyFinalizeToken, verifyUploadToken, withLocalUploadToken } from "../uploadTokens";
import { and } from "drizzle-orm";
import { requireAuth } from "../auth";
import { getObjectAclPolicy, ObjectPermission } from "../objectAcl";
import { getObjectStorageService, isLocalStorage } from "../objectStorageService";
import { logError } from "../logger";

// Upload tokens (finalize and local upload) live in ./uploadTokens.ts, where
// they are tested. The finalize token binds an object path to the requesting
// user so nobody else can claim the object; the local upload token does the
// same for the PUT itself when files live on the local filesystem.

/** The identity an upload is bound to: the session user, or "demo" in demo mode. */
function uploadUserId(req: Request): string {
  const sessionUser = (req.session as any)?.user;
  return sessionUser?.id?.toString() ?? "demo";
}

export function registerObjectStorageRoutes(app: Express): void {
  app.post("/api/objects/upload", requireAuth, async (req, res) => {
    const objectStorageService = getObjectStorageService();
    try {
      let uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      const userId = uploadUserId(req);
      const finalizeToken = generateFinalizeToken(objectPath, userId);
      // On local storage the upload URL is one of our own routes, so it is
      // signed for this user and this id: the PUT below refuses anything
      // else. A presigned cloud URL carries its own signature.
      if (isLocalStorage) {
        const uploadId = objectPath.split("/").pop() ?? "";
        uploadURL = withLocalUploadToken(uploadURL, uploadId, userId);
      }
      res.json({ uploadURL, objectPath, finalizeToken });
    } catch (error) {
      logError("Error getting upload URL", "routes", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Finalize an upload by setting a private ACL on the object.
  // Requires a valid HMAC finalizeToken issued by the upload-URL endpoint so
  // that only the user who requested the upload can set ACL on that objectPath.
  app.post("/api/uploads/finalize", requireAuth, async (req, res) => {
    const { objectPath, finalizeToken } = req.body;
    if (!objectPath || typeof objectPath !== "string") {
      return res.status(400).json({ error: "objectPath is required" });
    }
    const sessionUser = (req.session as any)?.user;

    // Require and verify the HMAC token for everyone. This used to be skipped
    // in demo mode, which is now real signed-in accounts like any other.
    if (!sessionUser) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!finalizeToken || typeof finalizeToken !== "string") {
      return res.status(400).json({ error: "finalizeToken is required" });
    }
    const userId = sessionUser.id.toString();
    if (!verifyFinalizeToken(objectPath, userId, finalizeToken)) {
      return res.status(403).json({ error: "Invalid or expired finalize token" });
    }
    // Token is valid: set a private ACL with this user as owner on cloud
    // storage. Local storage has no ACL metadata; nothing to set.
    if (!isLocalStorage) {
      const objectStorageService = new ObjectStorageService();
      try {
        await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
          owner: userId,
          visibility: "private",
        });
      } catch (error) {
        logError("Failed to set ACL on upload", "routes", error);
        return res.status(500).json({ error: "Failed to finalize upload" });
      }
    }
    res.json({ ok: true });
  });
  
  // Upload URL request for presigned uploads
  app.post("/api/uploads/request-url", requireAuth, async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const { name, size, contentType } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Missing required field: name" });
      }
      
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      const sessionUser = (req.session as any)?.user;
      const userId = sessionUser?.id?.toString() ?? "demo";
      const finalizeToken = generateFinalizeToken(objectPath, userId);
      
      res.json({
        uploadURL,
        objectPath,
        finalizeToken,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      logError("Error generating upload URL", "routes", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });
  
  // Serve uploaded objects — single consolidated handler for GCS and local storage.
  //
  // Authorization matrix:
  //   demo mode (AUTH_MODE=demo) → open access (entire app is unauthenticated in this mode)
  //   GCS, real auth, ACL=public → world-readable
  //   GCS, real auth, ACL=private or no ACL → require session + canAccessObjectEntity();
  //       no-ACL objects return false (deny-by-default) unless finalized via
  //       POST /api/uploads/finalize which sets owner+private ACL after upload.
  //   Local storage, real auth   → require session only (no GCS ACL metadata)
  app.get("/objects/:objectPath(*)", async (req, res) => {
    const objectStorageService = getObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);

      const sessionUser = (req.session as any)?.user;

      // Access control applies to everyone. Demo used to serve every object
      // with no check at all -- the whole app was unauthenticated -- which let
      // the demo instance hand out any file, production uploads included when a
      // volume was shared. Demo is signed-in accounts now.
      if (!isLocalStorage) {
        const aclPolicy = await getObjectAclPolicy(objectFile as any);
        if (aclPolicy?.visibility !== "public") {
          // Non-public (private ACL or no ACL): require a real session.
          if (!sessionUser) {
            return res.status(401).json({ error: "Authentication required" });
          }
          // Route all private/no-ACL decisions through canAccessObjectEntity so
          // deny-by-default is enforced: no-ACL → false, private+non-owner → false.
          const canAccess = await (objectStorageService as ObjectStorageService).canAccessObjectEntity({
            userId: sessionUser.id.toString(),
            objectFile: objectFile as any,
            requestedPermission: ObjectPermission.READ,
          });
          if (!canAccess) {
            return res.status(403).json({ error: "Access denied" });
          }
        }
        // aclPolicy?.visibility === "public" → world-readable, fall through to download.
      } else {
        // Local storage: no GCS ACL metadata; session presence is the sole gate.
        if (!sessionUser) {
          return res.status(401).json({ error: "Authentication required" });
        }
      }

      await objectStorageService.downloadObject(objectFile as any, res);
    } catch (error) {
      logError("Error serving object", "routes", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });

  // Local filesystem upload handler (used when STORAGE_TYPE=local)
  // Three things stand between a signed-in account and somebody else's file:
  // the URL must carry the token minted for this id and this user, the id
  // must not already hold a file, and the body is capped. The ids themselves
  // are not secret -- they sit in file_url columns and are returned to anyone
  // who may read the parent record -- so requireAuth alone was not a guard.
  app.put("/api/objects/local-upload/:id", requireAuth, async (req, res) => {
    if (!isLocalStorage) return res.status(404).end();
    const { id } = req.params;
    if (!verifyUploadToken(localUploadSubject(id), uploadUserId(req), req.query.token)) {
      req.resume();
      return res.status(403).json({ error: "This upload URL was not issued to you, or has expired. Request a new one." });
    }
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > MAX_LOCAL_UPLOAD_BYTES) {
      req.resume();
      return res.status(413).json({ error: `Files are limited to ${MAX_LOCAL_UPLOAD_BYTES / (1024 * 1024)} MB.` });
    }
    const chunks: Buffer[] = [];
    let received = 0;
    let refused = false;
    req.on("data", (chunk: Buffer) => {
      if (refused) return;
      received += chunk.length;
      if (received > MAX_LOCAL_UPLOAD_BYTES) {
        refused = true;
        chunks.length = 0;
        if (!res.headersSent) {
          res.status(413).json({ error: `Files are limited to ${MAX_LOCAL_UPLOAD_BYTES / (1024 * 1024)} MB.` });
        }
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", async () => {
      if (refused) return;
      try {
        const localService = new LocalObjectStorageService();
        await localService.saveFile(id, Buffer.concat(chunks), req.headers["content-type"] || "application/octet-stream");
        res.status(200).end();
      } catch (err: any) {
        if (err instanceof ObjectAlreadyExistsError) {
          return res.status(409).json({ error: "This upload id has already been used. Request a new upload URL." });
        }
        logError("Local upload error", "routes", err);
        // localFilePath throws for non-UUID ids and path traversal attempts.
        const status = err?.message?.includes("Invalid file id") || err?.message?.includes("Path traversal") ? 400 : 500;
        if (!res.headersSent) res.status(status).json({ error: status === 400 ? err.message : "Upload failed" });
      }
    });
    req.on("error", () => { if (!res.headersSent) res.status(500).json({ error: "Upload failed" }); });
  });

  // Certificate OCR: server/routes/certificateOcrRoutes.ts
}
