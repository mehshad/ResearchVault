import { randomBytes } from "node:crypto";
import type { Response } from "express";
import { logError } from "./logger";

/**
 * The reason a write failed, for the server log.
 *
 * Three production 500s -- a staff update, a staff delete and a role change --
 * were undiagnosable because the handlers logged a fixed sentence and the
 * driver's message went nowhere. This gathers what Postgres reports (its
 * message and detail arrive wrapped as the error's cause), which names the
 * column, the constraint and the offending value. That is exactly what an
 * operator needs and more than a caller should be sent, so it goes to the log
 * and the response carries a reference to it (#46).
 */
export function writeFailureDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Postgres puts the useful part in these; drizzle wraps them.
  const cause = (error as { cause?: { message?: string; detail?: string } } | null)?.cause;
  const extra = [cause?.message, cause?.detail].filter(Boolean).join(" — ");
  return [message, extra].filter(Boolean).join(" — ").slice(0, 500);
}

/**
 * Answer a failed write: the detail is logged under a short reference and the
 * response carries the reference and a plain sentence, so whoever reports the
 * failure can point at the log entry without the log entry being sent to them.
 */
export function respondWriteFailure(res: Response, message: string, error: unknown, source = "routes"): void {
  const reference = randomBytes(4).toString("hex");
  logError(`${message} [${reference}]`, source, error, { reference, detail: writeFailureDetail(error) });
  res.status(500).json({
    message: `${message}. Quote reference ${reference} when reporting it; the cause is in the server log.`,
    reference,
  });
}
