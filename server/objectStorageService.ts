/**
 * Which object store backs uploads, chosen once from STORAGE_TYPE.
 * Shared by the upload/object routes in routes.ts and the certificate OCR
 * routes, which used to reach it as a closure inside registerRoutes.
 */
import { ObjectStorageService } from "./objectStorage";
import { LocalObjectStorageService } from "./localObjectStorage";

export const isLocalStorage = process.env.STORAGE_TYPE === "local";

export function getObjectStorageService(): ObjectStorageService | LocalObjectStorageService {
  return isLocalStorage ? new LocalObjectStorageService() : new ObjectStorageService();
}
