export interface AuthorCheckScientist {
  firstName: string | null;
  lastName: string | null;
}

export interface AuthorCheckSessionUser {
  scientistId?: number | null;
  name?: string | null;
}

export type AuthorCheckSubjectResult =
  | {
      ok: true;
      firstName: string | null;
      lastName: string | null;
    }
  | {
      ok: false;
      status: 400 | 401 | 404;
      message: string;
    };

interface ResolveAuthorCheckSubjectOptions {
  requestedScientistId: unknown;
  authMode: string;
  sessionUser?: AuthorCheckSessionUser;
  getScientist: (id: number) => Promise<AuthorCheckScientist | undefined>;
}

/**
 * Resolve whose name drives the internal-author scan. An explicit scientist
 * profile always wins over the current demo/session identity.
 */
export async function resolveAuthorCheckSubject({
  requestedScientistId,
  authMode,
  sessionUser,
  getScientist,
}: ResolveAuthorCheckSubjectOptions): Promise<AuthorCheckSubjectResult> {
  if (requestedScientistId !== undefined) {
    if (
      typeof requestedScientistId !== "string" ||
      !/^\d+$/.test(requestedScientistId)
    ) {
      return { ok: false, status: 400, message: "Invalid scientist ID" };
    }

    const scientistId = Number(requestedScientistId);
    if (!Number.isSafeInteger(scientistId) || scientistId <= 0) {
      return { ok: false, status: 400, message: "Invalid scientist ID" };
    }

    const scientist = await getScientist(scientistId);
    if (!scientist) {
      return { ok: false, status: 404, message: "Scientist not found" };
    }

    return {
      ok: true,
      firstName: scientist.firstName,
      lastName: scientist.lastName,
    };
  }

  if (authMode === "demo") {
    return { ok: true, firstName: "Wouter", lastName: "Hendrickx" };
  }

  if (!sessionUser) {
    return { ok: false, status: 401, message: "Not authenticated" };
  }

  if (sessionUser.scientistId) {
    const scientist = await getScientist(sessionUser.scientistId);
    if (scientist) {
      return {
        ok: true,
        firstName: scientist.firstName,
        lastName: scientist.lastName,
      };
    }
  }

  if (sessionUser.name) {
    const cleaned = sessionUser.name
      .replace(
        /^(dr\.?|prof\.?|professor|mr\.?|ms\.?|mrs\.?|phd\.?|md\.?)\s+/i,
        "",
      )
      .trim();
    const parts = cleaned.split(/\s+/);
    if (parts.length >= 2) {
      return {
        ok: true,
        firstName: parts[0],
        lastName: parts[parts.length - 1],
      };
    }
  }

  return { ok: true, firstName: null, lastName: null };
}