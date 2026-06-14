import { randomUUID } from "crypto";
import { createReadStream, existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { type Response } from "express";
import { ObjectNotFoundError, SAFE_INLINE_MIME_TYPES } from "./objectStorage";

const UPLOADS_DIR = process.env.UPLOADS_DIR || "/data/uploads";
const APP_URL = process.env.APP_URL || "http://localhost:5000";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resolves the local file path for a given UUID.
// Rejects anything that is not a bare UUID to prevent path traversal.
function localFilePath(id: string): string {
  if (!UUID_RE.test(id)) {
    throw new Error("Invalid file id: must be a UUID");
  }
  return path.join(UPLOADS_DIR, id);
}

export class LocalFile {
  constructor(
    public readonly filePath: string,
    public readonly contentType: string = "application/octet-stream",
  ) {}
}

export class LocalObjectStorageService {
  async getObjectEntityUploadURL(): Promise<string> {
    await mkdir(UPLOADS_DIR, { recursive: true });
    const id = randomUUID();
    return `${APP_URL}/api/objects/local-upload/${id}`;
  }

  // Saves a file body buffer/stream to disk and returns the local file.
  async saveFile(id: string, body: Buffer, contentType: string): Promise<void> {
    await mkdir(UPLOADS_DIR, { recursive: true });
    const filePath = localFilePath(id); // throws if id is not a UUID
    // Defense-in-depth: confirm the resolved path stays inside UPLOADS_DIR
    const resolvedDir = path.resolve(UPLOADS_DIR);
    const resolvedFile = path.resolve(filePath);
    if (!resolvedFile.startsWith(resolvedDir + path.sep)) {
      throw new Error("Path traversal detected");
    }
    await writeFile(resolvedFile, body);
  }

  async getObjectEntityFile(objectPath: string): Promise<LocalFile> {
    // objectPath is /objects/local-upload/<uuid>
    const id = objectPath.split("/").pop();
    if (!id) throw new ObjectNotFoundError();
    const filePath = localFilePath(id);
    if (!existsSync(filePath)) throw new ObjectNotFoundError();
    return new LocalFile(filePath);
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (rawPath.includes("/api/objects/local-upload/")) {
      const id = rawPath.split("/").pop();
      return `/objects/local-upload/${id}`;
    }
    return rawPath;
  }

  async downloadObject(file: LocalFile, res: Response): Promise<void> {
    const isSafeInline = SAFE_INLINE_MIME_TYPES.has(file.contentType);
    res.set({
      "Content-Type": isSafeInline ? file.contentType : "application/octet-stream",
      "Content-Disposition": isSafeInline ? "inline" : "attachment",
      "X-Content-Type-Options": "nosniff",
    });
    const stream = createReadStream(file.filePath);
    stream.on("error", () => {
      if (!res.headersSent) res.status(500).json({ error: "Error streaming file" });
    });
    stream.pipe(res);
  }

  async trySetObjectEntityAclPolicy(rawPath: string, _aclPolicy: any): Promise<string> {
    return this.normalizeObjectEntityPath(rawPath);
  }

  async canAccessObjectEntity(_opts: { userId?: string; objectFile: any; requestedPermission?: any }): Promise<boolean> {
    return true;
  }
}
