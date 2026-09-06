import { PUBLICATION_WORKFLOW_STAGES } from "./publicationWorkflow";

/**
 * The order publications read best in on an SDR.
 *
 * Published work first, oldest to newest, so the most recent paper sits at the
 * bottom -- the list grows downwards the way a bibliography does, and the
 * newest thing is where the eye lands last.
 *
 * Then everything still in progress, most advanced first: Accepted/In Press
 * down to Concept. Read together, the whole card runs from what is finished,
 * through what is nearly finished, to what has barely started.
 */

const stageByStatus = new Map<string, number>();
for (const stage of PUBLICATION_WORKFLOW_STAGES) {
  for (const status of stage.statuses) stageByStatus.set(status.toLowerCase(), stage.stage);
}

/** Stage 7 and 8 are Published and Published *; everything below is in progress. */
const FIRST_PUBLISHED_STAGE = 7;

export interface OrderablePublication {
  status?: string | null;
  publicationDate?: string | Date | null;
  title?: string | null;
}

export function workflowStageOf(status: string | null | undefined): number {
  return stageByStatus.get((status ?? "").trim().toLowerCase()) ?? 0;
}

export function isPublished(publication: OrderablePublication): boolean {
  return workflowStageOf(publication.status) >= FIRST_PUBLISHED_STAGE;
}

const timeOf = (value: string | Date | null | undefined): number | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

/**
 * Sorts a copy; the caller's array is left alone.
 *
 * A published paper with no date sorts to the end of the published group
 * rather than the start: undated is not the same as ancient, and putting it
 * first would claim it is the oldest thing here.
 */
export function orderPublicationsForActivity<T extends OrderablePublication>(
  publications: readonly T[],
): T[] {
  return [...publications].sort((a, b) => {
    const aPublished = isPublished(a);
    const bPublished = isPublished(b);
    if (aPublished !== bPublished) return aPublished ? -1 : 1;

    if (aPublished) {
      const aTime = timeOf(a.publicationDate);
      const bTime = timeOf(b.publicationDate);
      if (aTime == null && bTime == null) return (a.title ?? "").localeCompare(b.title ?? "");
      if (aTime == null) return 1;
      if (bTime == null) return -1;
      if (aTime !== bTime) return aTime - bTime;
      return (a.title ?? "").localeCompare(b.title ?? "");
    }

    // In progress: furthest along first.
    const byStage = workflowStageOf(b.status) - workflowStageOf(a.status);
    if (byStage !== 0) return byStage;
    return (a.title ?? "").localeCompare(b.title ?? "");
  });
}
