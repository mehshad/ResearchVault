/**
 * A publication's additional SDR links.
 *
 * The record carries one research activity, on publications.research_activity_id,
 * and that one is the primary: it is what the score, the exemption rule and
 * the finalise check read. A paper can belong to more than one SDR, though --
 * a collaboration between two activities produces one paper, and each SDR
 * should list it -- so a publication may also carry any number of additional
 * links, which are optional and carry no rule of their own.
 *
 * Both the form and the server normalise the list the same way, here, so what
 * the user is shown as saved is what the server stored.
 */

/**
 * The ids worth storing: positive integers, each once, in the order given,
 * and never the primary -- a link that duplicates the record's own activity
 * says nothing and would list the paper twice on that SDR.
 */
export function normaliseAdditionalSdrIds(
  primaryId: number | null | undefined,
  ids: readonly unknown[] | null | undefined,
): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const raw of ids ?? []) {
    const id = typeof raw === "string" ? Number(raw) : raw;
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) continue;
    if (id === primaryId || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export interface SdrLinkedPublication {
  researchActivityId?: number | null;
  additionalResearchActivities?: ReadonlyArray<{ id: number }> | null;
}

/** Whether the publication is linked to the SDR, as its primary or as an additional link. */
export function isLinkedToResearchActivity(
  publication: SdrLinkedPublication,
  researchActivityId: number,
): boolean {
  if (publication.researchActivityId === researchActivityId) return true;
  return (publication.additionalResearchActivities ?? []).some(
    (activity) => activity.id === researchActivityId,
  );
}
