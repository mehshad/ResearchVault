/**
 * Who sees every publication, regardless of who wrote it.
 *
 * Lifted out of server/scientistPublicationVisibility.ts so the note on the
 * publications list can state the rule the server actually applies. It lived
 * only on the server, so any sentence describing it on screen was a
 * second, hand-maintained copy -- and the two would have parted company the
 * first time a role was added.
 *
 * Compared against the viewer's **primary** role, because that is what
 * getScientistPublicationViewer sends and therefore what the filtering uses. A
 * secondary Outcome Officer role does not widen this list today.
 */
export const FULL_PUBLICATION_VISIBILITY_ROLES = [
  "Outcome Officer",
  "Management",
  "admin",
  "superadmin",
] as const;

export type FullPublicationVisibilityRole =
  (typeof FULL_PUBLICATION_VISIBILITY_ROLES)[number];
