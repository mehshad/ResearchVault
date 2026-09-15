import fs from "fs";
import path from "path";

const LOG_FILE = process.env.LOG_FILE?.trim() || null;

// Rotation. The file used to be opened once with flags "a" and never rotated,
// so over months the app-logs volume grew without bound on the same disk as
// Postgres. Now qbridge.log is renamed to .1 (and .1 to .2, ...) once it
// reaches LOG_MAX_BYTES, keeping LOG_MAX_FILES files in all. Bytes are counted
// in-process from the size at open, so there is no stat per line.
const LOG_MAX_BYTES = Math.max(1024 * 1024, Number(process.env.LOG_MAX_BYTES) || 10 * 1024 * 1024);
const LOG_MAX_FILES = Math.min(50, Math.max(1, Number(process.env.LOG_MAX_FILES) || 5));

let fileStream: fs.WriteStream | null = null;
let fileLoggingUnavailable = false;
let bytesInFile = 0;

function openFileStream(): fs.WriteStream | null {
  if (!LOG_FILE) return null;
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    try {
      bytesInFile = fs.statSync(LOG_FILE).size;
    } catch {
      bytesInFile = 0;
    }
    const stream = fs.createWriteStream(LOG_FILE, { flags: "a" });
    stream.on("error", (err) => {
      console.error(`[logger] Cannot write to log file ${LOG_FILE}: ${err.message}`);
      fileStream = null;
      fileLoggingUnavailable = true;
    });
    fileStream = stream;
    return stream;
  } catch (err: any) {
    console.error(`[logger] Cannot open log file ${LOG_FILE}: ${err.message}`);
    fileLoggingUnavailable = true;
    return null;
  }
}

function getFileStream(): fs.WriteStream | null {
  if (!LOG_FILE || fileLoggingUnavailable) return null;
  return fileStream ?? openFileStream();
}

/** Shift qbridge.log -> .1 -> .2 ..., dropping the oldest; the next write reopens. */
function rotateFile(): void {
  if (!LOG_FILE) return;
  const stream = fileStream;
  fileStream = null;
  bytesInFile = 0;
  if (stream) stream.end();
  try {
    for (let i = LOG_MAX_FILES - 1; i >= 1; i--) {
      const from = i === 1 ? LOG_FILE : `${LOG_FILE}.${i - 1}`;
      if (fs.existsSync(from)) fs.renameSync(from, `${LOG_FILE}.${i}`);
    }
    if (LOG_MAX_FILES === 1) fs.rmSync(LOG_FILE, { force: true });
  } catch (err: any) {
    console.error(`[logger] Log rotation failed: ${err.message}`);
  }
}

function writeToFile(line: string): void {
  const bytes = Buffer.byteLength(line, "utf8") + 1;
  if (bytesInFile > 0 && bytesInFile + bytes > LOG_MAX_BYTES) rotateFile();
  const stream = getFileStream();
  if (!stream) return;
  stream.write(line + "\n");
  bytesInFile += bytes;
}

export interface LogFields {
  [key: string]: unknown;
}

function emit(record: Record<string, unknown>): void {
  const line = JSON.stringify(record);
  console.log(line);
  writeToFile(line);
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
