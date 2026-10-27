import { createHmac, timingSafeEqual } from "crypto";

/**
 * Short-lived HMAC tokens that bind an upload to the account that asked for it.
 *
 * Two things are minted alongside an upload URL. The finalize token lets the
 * client claim the object afterwards (POST /api/uploads/finalize) and stops
 * any other signed-in account from setting the ACL on an object it did not
 * upload. The local upload token does the same for the PUT itself when files
 * live on the local filesystem: the upload ids are UUIDs that end up in
 * file_url columns and are returned to anyone who may read the parent record,
 * so without it any signed-in account could PUT new bytes under somebody
 * else's certificate or contract document.
 *
 * Both are the same construction over a different subject, so the subject is
 * part of the signed payload and a token for one cannot be replayed as the
 * other.
 */

const TOKEN_TTL_SEC = 3600; // 1 hour

/** The largest body the local upload handler will buffer. */
export const MAX_LOCAL_UPLOAD_BYTES = 50 * 1024 * 1024;

function secret(): string {
  return process.env.SESSION_SECRET ?? "dev-fallback-secret";
}

function sign(subject: string, userId: string, expiry: number): string {
  return createHmac("sha256", secret()).update(`${subject}|${userId}|${expiry}`).digest("hex");
}

export function generateUploadToken(subject: string, userId: string, now: number = Date.now()): string {
  const expiry = Math.floor(now / 1000) + TOKEN_TTL_SEC;
  return `${expiry}.${sign(subject, userId, expiry)}`;
}

export function verifyUploadToken(
  subject: string,
  userId: string,
  token: unknown,
  now: number = Date.now(),
): boolean {
  if (typeof token !== "string") return false;
  const dotIdx = token.indexOf(".");
  if (dotIdx < 1) return false;
  const expiry = parseInt(token.slice(0, dotIdx), 10);
  if (!Number.isFinite(expiry) || Math.floor(now / 1000) > expiry) return false;
  const sigBuf = Buffer.from(token.slice(dotIdx + 1), "hex");
  const expBuf = Buffer.from(sign(subject, userId, expiry), "hex");
  if (sigBuf.length !== expBuf.length || sigBuf.length === 0) return false;
  return timingSafeEqual(sigBuf, expBuf);
}

/** The subject a finalize token is signed over: the object path being claimed. */
export function finalizeSubject(objectPath: string): string {
  return `finalize:${objectPath}`;
}

/** The subject a local upload token is signed over: the upload id being written. */
export function localUploadSubject(uploadId: string): string {
  return `local-upload:${uploadId}`;
}

export function generateFinalizeToken(objectPath: string, userId: string): string {
  return generateUploadToken(finalizeSubject(objectPath), userId);
}

export function verifyFinalizeToken(objectPath: string, userId: string, token: unknown): boolean {
  return verifyUploadToken(finalizeSubject(objectPath), userId, token);
}

/** Appends the local upload token to a minted local upload URL. */
export function withLocalUploadToken(uploadURL: string, uploadId: string, userId: string): string {
  const token = generateUploadToken(localUploadSubject(uploadId), userId);
  return `${uploadURL}${uploadURL.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}
