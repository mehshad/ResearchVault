/**
 * Sidra Score and per-scientist grants routes.
 *
 * Registers:
 *   GET  /api/sidra-score/settings         — requireAuth
 *   PUT  /api/sidra-score/settings         — requirePublicationOfficer
 *   POST /api/scientists/sidra-scores      — requirePublicationOfficer
 *   POST /api/scientists/:id/sidra-score   — requireAuth + own-or-demo
 *   GET  /api/scientists/:id/grants        — requireAuth + own-or-privileged
 *
 * NOTE: The /api/scientists/sidra-scores and /api/scientists/:id/sidra-score
 * entries MUST be registered before the generic /api/scientists/:id route in
 * routes.ts (Express matches in registration order).
 */
import type { Express, Request, Response } from "express";
import { hasAnyRole } from "@shared/effectiveRoles";
import { storage } from "./databaseStorage";
import { db } from "./db";
import { grants } from "@shared/schema";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import {
  requireAuth,
  requirePublicationOfficer,
  getAuthMode,
} from "./auth";
import {
  sidraScoreSettingsSchema,
  SIDRA_SCORE_SETTINGS_KEY,
} from "@shared/sidraScore";
import {
  loadOfficialSettings,
  saveOfficialSettings,
  calculateAllScientistScores,
  calculateSingleScientistScore,
} from "./sidraScoreService";

// ── Authorization helpers ──────────────────────────────────────────────────────

/**
 * Returns true when the currently-authenticated user is the owner of the
 * scientist profile identified by `scientistId`.
 */
export function isOwnScientistProfile(
  req: Request,
  scientistId: number
): boolean {
  const linked = req.session?.user?.scientistId;
  return linked != null && linked === scientistId;
}

/**
 * In demo mode all requests are allowed for any scientist id so the feature
 * can be exercised without real user accounts.
 */
export function isDemo(): boolean {
  return getAuthMode() === "demo";
}

/**
 * Returns true when the session user holds a privileged role for the
 * publication-officer group (Outcome Officer, Management, admin, superadmin).
 */
export function hasPublicationOfficerRole(req: Request): boolean {
  // Every slot, not the primary alone. Administrator rights are normally held
  // as a secondary role, and someone can sit in the Outcome Office alongside a
  // bench role -- reading users.role by itself refused both of them.
  return hasAnyRole(req.session?.user, [
    "Outcome Officer",
    "admin",
    "superadmin",
    "Management",
  ]);
}

/**
 * Returns true when the session user holds a Management/admin/superadmin role
 * (privileged for scientist profile edits and deletes).
 */
export function hasManagementRole(req: Request): boolean {
  // Every slot, not the primary alone. Administrator rights are normally held
  // as a secondary role, and this gates staff profile edits and deletes -- so
  // reading users.role by itself refused administrators their own tools.
  return hasAnyRole(req.session?.user, ["Management", "admin", "superadmin"]);
}

/**
 * Researchers may edit an unsealed publication only when their linked
 * scientist profile is already an internal author. Outcome Office and
 * management roles may correct any publication.
 */
export function canEditPublicationForLinkedScientists(
  req: Request,
  linkedScientistIds: Iterable<number>
): boolean {
  if (hasPublicationOfficerRole(req)) return true;
  const scientistId = req.session?.user?.scientistId;
  if (scientistId == null) return false;
  return new Set(linkedScientistIds).has(scientistId);
}

/**
 * A researcher may add/update only their own internal-author link. A new
 * self-link additionally requires a matching name in the publication's author
 * text; an existing self-link may still be corrected when the text is wrong.
 */
export function canManagePublicationAuthorLink(
  req: Request,
  targetScientistId: number,
  hasExistingLink: boolean,
  authorNameMatches: boolean
): boolean {
  if (hasPublicationOfficerRole(req)) return true;
  const scientistId = req.session?.user?.scientistId;
  return (
    scientistId != null &&
    scientistId === targetScientistId &&
    (hasExistingLink || authorNameMatches)
  );
}

/**
 * Researchers may create a publication only against an SDR where they are the
 * budget holder or a project member. Outcome Office and management may create
 * records for any SDR.
 */
export function canCreatePublicationForResearchActivity(
  req: Request,
  budgetHolderId: number | null | undefined,
  projectMemberScientistIds: Iterable<number>
): boolean {
  if (hasPublicationOfficerRole(req)) return true;
  const scientistId = req.session?.user?.scientistId;
  if (scientistId == null) return false;
  return (
    budgetHolderId === scientistId ||
    new Set(projectMemberScientistIds).has(scientistId)
  );
}

// ── Route registration ─────────────────────────────────────────────────────────

export function registerSidraScoreRoutes(app: Express): void {
  // ── GET /api/sidra-score/settings ──────────────────────────────────────────
  app.get(
    "/api/sidra-score/settings",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const settings = await loadOfficialSettings();
        res.json(settings);
      } catch (error) {
        console.error("Error fetching Sidra score settings:", error);
        res.status(500).json({ message: "Failed to fetch Sidra score settings" });
      }
    }
  );

  // ── PUT /api/sidra-score/settings ──────────────────────────────────────────
  app.put(
    "/api/sidra-score/settings",
    requireAuth,
    requirePublicationOfficer,
    async (req: Request, res: Response) => {
      try {
        const settings = await saveOfficialSettings(req.body);
        res.json(settings);
      } catch (error) {
        if (error instanceof ZodError) {
          return res
            .status(400)
            .json({ message: fromZodError(error).message });
        }
        console.error("Error saving Sidra score settings:", error);
        res.status(500).json({ message: "Failed to save Sidra score settings" });
      }
    }
  );

  // ── POST /api/scientists/sidra-scores (office-wide) ────────────────────────
  // Protected by requirePublicationOfficer; saves the submitted settings as
  // the official office-wide settings, then runs the calculation.
  app.post(
    "/api/scientists/sidra-scores",
    requireAuth,
    requirePublicationOfficer,
    async (req: Request, res: Response) => {
      try {
        // Validate + normalize the request body and persist as official settings.
        const settings = await saveOfficialSettings(req.body);
        const rankings = await calculateAllScientistScores(settings);
        res.json(rankings);
      } catch (error) {
        if (error instanceof ZodError) {
          return res
            .status(400)
            .json({ message: fromZodError(error).message });
        }
        console.error("Error calculating Sidra scores:", error);
        res.status(500).json({ message: "Failed to calculate Sidra scores" });
      }
    }
  );

  // ── POST /api/scientists/:id/sidra-score (per-profile) ─────────────────────
  // Requires authentication. In real-auth modes only the linked owner may call
  // this. In demo mode any id is permitted so the feature can be exercised.
  // Body parameters are ignored; official settings are always used.
  app.post(
    "/api/scientists/:id/sidra-score",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ message: "Invalid scientist ID" });
        }

        // Authorization: own profile or demo mode.
        if (!isDemo() && !isOwnScientistProfile(req, id)) {
          return res.status(403).json({
            message:
              "Forbidden. You may only view the Sidra score for your own linked profile.",
          });
        }

        // Always use official settings — ignore body.
        const settings = await loadOfficialSettings();
        const result = await calculateSingleScientistScore(id, settings);

        if (!result) {
          return res.status(404).json({ message: "Scientist not found" });
        }

        res.json(result);
      } catch (error) {
        console.error("Error calculating individual Sidra score:", error);
        res
          .status(500)
          .json({ message: "Failed to calculate Sidra score" });
      }
    }
  );

  // ── GET /api/scientists/:id/grants ─────────────────────────────────────────
  // Returns grants where this scientist is lead-PI (lpiId).
  // Default: active grants only.
  // includeOther=true: returns all statuses — only available to the linked owner
  // or demo mode.
  app.get(
    "/api/scientists/:id/grants",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ message: "Invalid scientist ID" });
        }

        const scientist = await storage.getScientist(id);
        if (!scientist) {
          return res.status(404).json({ message: "Scientist not found" });
        }

        const includeOther = req.query.includeOther === "true";

        // includeOther (all statuses) is restricted to own profile or demo.
        if (includeOther && !isDemo() && !isOwnScientistProfile(req, id)) {
          return res.status(403).json({
            message:
              "Forbidden. Only the linked owner may request grants with includeOther=true.",
          });
        }

        // Fetch all grants for this scientist as lead-PI.
        const allGrants = await db
          .select()
          .from(grants)
          .where(eq(grants.lpiId, id));

        const filtered = includeOther
          ? allGrants
          : allGrants.filter(
              (g: { status: string | null }) =>
                (g.status || "").trim().toLowerCase() === "active"
            );

        res.json(filtered);
      } catch (error) {
        console.error("Error fetching scientist grants:", error);
        res.status(500).json({ message: "Failed to fetch grants" });
      }
    }
  );
}
