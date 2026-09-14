import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * What a list or detail page shows when its data could not be loaded.
 *
 * The query client retries nothing and throws on any non-OK status, so a
 * failed request leaves `data` undefined. Thirty-five pages rendered that as
 * an empty table with no message at all -- a 500 or an expired session was
 * indistinguishable from "there are no grants". This names the failure,
 * says what to do, and offers the retry the page could not otherwise make.
 *
 * `what` is the plural the page uses ("grants", "publications"). The
 * message from the error is shown when it says something a reader can act
 * on; the raw "500: Internal Server Error" is not that, so it is folded
 * into a plain sentence.
 */
export function QueryError({
  what,
  error,
  onRetry,
}: {
  what: string;
  error?: unknown;
  onRetry?: () => void;
}) {
  const message = describe(error);
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm"
      data-testid="query-error"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
        <div>
          <p className="font-medium">Could not load {what}.</p>
          <p className="text-muted-foreground">{message}</p>
        </div>
      </div>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry} data-testid="button-retry-query">
          <RotateCw className="mr-2 h-3.5 w-3.5" />
          Try again
        </Button>
      )}
    </div>
  );
}

function describe(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const status = /^(\d{3})\b/.exec(text)?.[1];
  if (status === "401") return "Your session has ended. Sign in again and retry.";
  if (status === "403") return "Your account does not have access to this area.";
  if (status === "404") return "The server has no such record.";
  if (status && status.startsWith("5")) return "The server reported a fault. Try again in a moment; if it persists, tell an administrator.";
  if (!text) return "Check your connection and try again.";
  // A message the server wrote for people, e.g. from a JSON { message } body.
  const body = text.replace(/^\d{3}:\s*/, "");
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.message === "string") return parsed.message;
  } catch {
    // not JSON; fall through to the text itself
  }
  return body;
}
