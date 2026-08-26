export interface ScientistPublicationViewer {
  userId?: number | null;
  role?: string | null;
  scientistId?: number | null;
}

export interface ScientistPublicationTarget {
  id: number;
  supervisorId?: number | null;
}

export interface PublicationVisibilityRecord {
  status?: string | null;
  createdByUserId?: number | null;
}

export interface PublicationVisibilityAuthor {
  scientistId: number;
  supervisorId?: number | null;
}

const FULL_VISIBILITY_ROLES = new Set([
  "Outcome Officer",
  "Management",
  "admin",
  "superadmin",
]);

export function isPublicScientistProfilePublicationStatus(
  status: string | null | undefined,
): boolean {
  const normalized = status?.trim().toLowerCase();
  return normalized === "published" || normalized === "published *";
}

export function canViewUnpublishedScientistPublications(
  viewer: ScientistPublicationViewer | null | undefined,
  target: ScientistPublicationTarget,
): boolean {
  if (!viewer) return false;
  if (viewer.role && FULL_VISIBILITY_ROLES.has(viewer.role)) return true;
  if (!viewer.scientistId) return false;

  return (
    viewer.scientistId === target.id ||
    viewer.scientistId === target.supervisorId
  );
}

export function canViewPublication(
  viewer: ScientistPublicationViewer | null | undefined,
  publication: PublicationVisibilityRecord,
  linkedAuthors: PublicationVisibilityAuthor[],
): boolean {
  if (isPublicScientistProfilePublicationStatus(publication.status)) return true;
  if (!viewer) return false;
  if (viewer.role && FULL_VISIBILITY_ROLES.has(viewer.role)) return true;
  if (viewer.userId && viewer.userId === publication.createdByUserId) return true;
  if (!viewer.scientistId) return false;

  return linkedAuthors.some(
    (author) =>
      author.scientistId === viewer.scientistId ||
      author.supervisorId === viewer.scientistId,
  );
}