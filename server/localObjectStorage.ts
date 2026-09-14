import { randomUUID } from "crypto";
import { createReadStream, existsSync } from "fs";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { type Response } from "express";
import { ObjectNotFoundError, SAFE_INLINE_MIME_TYPES } from "./objectStorage";

const UPLOADS_DIR = process.env.UPLOADS_DIR ||
  (process.env.NODE_ENV === "production"
    ? "/data/uploads"
    : path.resolve(process.cwd(), "data/uploads"));
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

function localArchivePath(id: string): string {
  if (!UUID_RE.test(id)) throw new Error("Invalid archive id: must be a UUID");
  return path.join(UPLOADS_DIR, "bulk-data-archives", `${id}.zip`);
}

/**
 * Thrown when a write would replace a file already stored under that id.
 * An upload id is used once: the URL that carries it is minted for one
 * upload, and a second body under the same id is somebody overwriting a
 * document that other records already point at.
 */
export class ObjectAlreadyExistsError extends Error {
  constructor() {
    super("An object already exists under this id");
    this.name = "ObjectAlreadyExistsError";
  }
}

export class LocalFile {
  constructor(
    public readonly filePath: string,
    public readonly contentType: string = "application/octet-stream",
  ) {}
}

export class LocalObjectStorageService {
  async saveArchive(objectId: string, body: Buffer): Promise<void> {
    const filePath = localArchivePath(objectId);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
  }

  async getArchive(objectId: string): Promise<Buffer> {
    try {
      return await readFile(localArchivePath(objectId));
    } catch (error: any) {
      if (error?.code === "ENOENT") throw new ObjectNotFoundError();
      throw error;
    }
  }

  async deleteArchive(objectId: string): Promise<void> {
    try {
      await unlink(localArchivePath(objectId));
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  async getObjectEntityUploadURL(): Promise<string> {
    await mkdir(UPLOADS_DIR, { recursive: true });
    const id = randomUUID();
    return `${APP_URL}/api/objects/local-upload/${id}`;
  }

  // Saves a file body to disk under a fresh id. Refuses to replace an
  // existing file: the write is opened exclusively, so the check and the
  // write are one operation and two concurrent PUTs cannot both succeed.
  async saveFile(id: string, body: Buffer, contentType: string): Promise<void> {
    await mkdir(UPLOADS_DIR, { recursive: true });
    const filePath = localFilePath(id); // throws if id is not a UUID
    // Defense-in-depth: confirm the resolved path stays inside UPLOADS_DIR
    const resolvedDir = path.resolve(UPLOADS_DIR);
    const resolvedFile = path.resolve(filePath);
    if (!resolvedFile.startsWith(resolvedDir + path.sep)) {
      throw new Error("Path traversal detected");
    }
    try {
      await writeFile(resolvedFile, body, { flag: "wx" });
    } catch (error: any) {
      if (error?.code === "EEXIST") throw new ObjectAlreadyExistsError();
      throw error;
    }
  }

  async getObjectEntityFile(objectPath: string): Promise<LocalFile> {
    // objectPath is /objects/local-upload/<uuid>; a query string, if one was
    // carried along from the upload URL, is not part of the id.
    const id = objectPath.split("?")[0].split("/").pop();
    if (!id) throw new ObjectNotFoundError();
    const filePath = localFilePath(id);
    if (!existsSync(filePath)) throw new ObjectNotFoundError();
    return new LocalFile(filePath);
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (rawPath.includes("/api/objects/local-upload/")) {
      // The minted URL carries the upload token as a query string; the
      // object path is the id alone.
      const id = rawPath.split("?")[0].split("/").pop();
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
