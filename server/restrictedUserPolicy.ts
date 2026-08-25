import type { NextFunction, Request, Response } from "express";
import { getAuthMode } from "./auth";
import { RESTRICTED_USER_ROLE } from "@shared/constants";

export const RESTRICTED_USER_API_MESSAGE =
  "Your account has limited access until an administrator assigns an access role.";
export const RESTRICTED_PROFILE_ACCESS_FIELDS_MESSAGE =
  "An administrator must update your job title or Investigator designation.";

type RestrictedRequest = Pick<Request, "method" | "originalUrl"> & {
  session?: Request["session"];
  baseUrl?: string;
  path?: string;
};

function apiPath(
  req: Pick<RestrictedRequest, "originalUrl" | "baseUrl" | "path">
): string {
  const mountedPath = `${req.baseUrl ?? ""}${req.path ?? ""}`;
  if (mountedPath.startsWith("/api/") || mountedPath === "/api") {
    return mountedPath;
  }
  return req.originalUrl.split("?")[0];
}

function isOwnScientistPath(path: string, scientistId: number): boolean {
  return path === `/api/scientists/${scientistId}`;
}

function isOwnScientistReadPath(path: string, scientistId: number): boolean {
  return (
    isOwnScientistPath(path, scientistId) ||
    new RegExp(
      `^/api/scientists/${scientistId}/(?:publications|research-activities|authorship-stats|missing-papers|grants)$`
    ).test(path)
  );
}

function isOrdinaryPublicationReadPath(path: string): boolean {
  return (
    path === "/api/publications" ||
    path === "/api/publications/journal-counts" ||
    /^\/api\/publications\/\d+$/.test(path) ||
    /^\/api\/publications\/\d+\/(?:history|authors)$/.test(path)
  );
}

function isImpactFactorReadPath(path: string): boolean {
  return (
    path === "/api/journal-impact-factors" ||
    path === "/api/journal-impact-factors/years" ||
    path === "/api/journal-impact-factors/fields" ||
    /^\/api\/journal-impact-factors\/journal\/[^/]+\/year\/[^/]+$/.test(path) ||
    /^\/api\/journal-impact-factors\/historical\/[^/]+$/.test(path)
  );
}

export function isRestrictedUserApiRequestAllowed(
  req: RestrictedRequest
): boolean {
  const path = apiPath(req);
  const method = req.method.toUpperCase();
  const scientistId = req.session?.user?.scientistId;

  if (path.startsWith("/api/auth/")) return true;
  if (method === "POST" && path === "/api/register") return true;

  if (method === "GET") {
    if (isOrdinaryPublicationReadPath(path) || isImpactFactorReadPath(path)) {
      return true;
    }
    if (path === "/api/certification-modules") return true;
    if (
      scientistId != null &&
      (isOwnScientistReadPath(path, scientistId) ||
        path === `/api/certifications/scientist/${scientistId}`)
    ) {
      return true;
    }
  }

  if (
    scientistId != null &&
    method === "PATCH" &&
    isOwnScientistPath(path, scientistId)
  ) {
    return true;
  }

  if (
    scientistId != null &&
    method === "POST" &&
    path === `/api/scientists/${scientistId}/sidra-score`
  ) {
    return true;
  }

  return false;
}

export function requestsRestrictedProfileAccessChange(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const payload = body as Record<string, unknown>;
  return (
    Object.prototype.hasOwnProperty.call(payload, "jobTitle") ||
    Object.prototype.hasOwnProperty.call(payload, "isInvestigator")
  );
}

export function rejectRestrictedUserProfileAccessChanges(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (
    getAuthMode() !== "demo" &&
    req.session?.user?.role === RESTRICTED_USER_ROLE &&
    requestsRestrictedProfileAccessChange(req.body)
  ) {
    return res
      .status(403)
      .json({ message: RESTRICTED_PROFILE_ACCESS_FIELDS_MESSAGE });
  }

  next();
}

export function restrictDefaultUserApiAccess(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (
    getAuthMode() === "demo" ||
    req.session?.user?.role !== RESTRICTED_USER_ROLE
  ) {
    return next();
  }

  if (isRestrictedUserApiRequestAllowed(req)) {
    return next();
  }

  return res.status(403).json({ message: RESTRICTED_USER_API_MESSAGE });
}