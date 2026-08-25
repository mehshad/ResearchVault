import fs from "fs";
import path from "path";

// ── File setup ────────────────────────────────────────────────────────────────

const LOG_FILE = process.env.LOG_FILE || "/var/log/app/app.log";

let fileStream: fs.WriteStream | null = null;

function getFileStream(): fs.WriteStream | null {
  if (fileStream) return fileStream;
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fileStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
    fileStream.on("error", (err) => {
      console.error(`[logger] Cannot write to log file ${LOG_FILE}: ${err.message}`);
      fileStream = null;
    });
    return fileStream;
  } catch (err: any) {
    console.error(`[logger] Cannot open log file ${LOG_FILE}: ${err.message}`);
    return null;
  }
}

// ── Core emit ─────────────────────────────────────────────────────────────────

export interface LogFields {
  [key: string]: unknown;
}

function emit(record: Record<string, unknown>): void {
  const line = JSON.stringify(record);
  console.log(line);
  const stream = getFileStream();
  if (stream) stream.write(line + "\n");
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * General-purpose structured log. Drop-in for the old log(message, source).
 */
export function log(message: string, source = "express", fields?: LogFields): void {
  emit({
    timestamp: new Date().toISOString(),
    level: "info",
    source,
    message,
    ...fields,
  });
}

/**
 * Structured error log. Pass the caught error as `err`.
 */
export function logError(
  message: string,
  source = "express",
  err?: unknown,
  fields?: LogFields,
): void {
  const errFields: Record<string, unknown> = {};
  if (err instanceof Error) {
    errFields.error = err.message;
    errFields.stack = err.stack;
  } else if (err !== undefined) {
    errFields.error = String(err);
  }
  emit({
    timestamp: new Date().toISOString(),
    level: "error",
    source,
    message,
    ...errFields,
    ...fields,
  });
}

/**
 * HTTP access log — one entry per request/response cycle.
 */
export interface RequestLogFields {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  userId?: number | null;
  username?: string | null;
  ip?: string;
  userAgent?: string;
  contentLength?: number;
}

export function logRequest(fields: RequestLogFields): void {
  emit({
    timestamp: new Date().toISOString(),
    level: fields.statusCode >= 500 ? "error" : fields.statusCode >= 400 ? "warn" : "info",
    source: "http",
    event: "http_request",
    ...fields,
  });
}

/**
 * Discrete application event (login, logout, record create/delete, etc.).
 * Use for anything you want to surface in user-activity or audit dashboards.
 */
export function logEvent(
  event: string,
  source: string,
  fields?: LogFields,
): void {
  emit({
    timestamp: new Date().toISOString(),
    level: "info",
    source,
    event,
    ...fields,
  });
}
