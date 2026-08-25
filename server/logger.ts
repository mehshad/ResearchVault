import fs from "fs";
import path from "path";

const LOG_FILE = process.env.LOG_FILE?.trim() || null;

let fileStream: fs.WriteStream | null = null;
let fileLoggingUnavailable = false;

function getFileStream(): fs.WriteStream | null {
  if (!LOG_FILE || fileLoggingUnavailable) return null;
  if (fileStream) return fileStream;
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fileStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
    fileStream.on("error", (err) => {
      console.error(`[logger] Cannot write to log file ${LOG_FILE}: ${err.message}`);
      fileStream = null;
      fileLoggingUnavailable = true;
    });
    return fileStream;
  } catch (err: any) {
    console.error(`[logger] Cannot open log file ${LOG_FILE}: ${err.message}`);
    fileLoggingUnavailable = true;
    return null;
  }
}

export interface LogFields {
  [key: string]: unknown;
}

function emit(record: Record<string, unknown>): void {
  const line = JSON.stringify(record);
  console.log(line);
  const stream = getFileStream();
  if (stream) stream.write(line + "\n");
}

export function log(message: string, source = "express", fields?: LogFields): void {
  emit({
    timestamp: new Date().toISOString(),
    level: "info",
    source,
    message,
    ...fields,
  });
}

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
