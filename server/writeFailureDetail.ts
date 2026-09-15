/**
 * The reason a write failed, for the response body of an administrator-only
 * endpoint.
 *
 * These handlers returned a fixed sentence and put the cause in the server log
 * only. That is the right default, but it left three production 500s
 * undiagnosable from the interface -- a staff update, a staff delete and a role
 * change, each of which wrote its row and then failed, none of which reproduces
 * against a development database. An administrator is already entitled to see
 * this data; withholding why the write failed only slows down fixing it.
 */
export function writeFailureDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Postgres puts the useful part in these; drizzle wraps them.
  const cause = (error as { cause?: { message?: string; detail?: string } } | null)?.cause;
  const extra = [cause?.message, cause?.detail].filter(Boolean).join(" — ");
  return [message, extra].filter(Boolean).join(" — ").slice(0, 500);
}
