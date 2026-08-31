import type { Scientist } from "@shared/schema";

/** The fields the organisation chart needs from a staff record. */
export type SectionMember = Pick<
  Scientist,
  "id" | "firstName" | "lastName" | "isInvestigator" | "sectionId"
>;

/**
 * Group investigators by the section they are placed in.
 *
 * Two things decide whether someone appears: the management-controlled
 * `isInvestigator` designation, and an actual section placement. Job title is
 * not consulted — someone titled "Investigator" who has not been designated one
 * is not, and the chart should say what the record says.
 *
 * Sorted by surname so a section with several reads as a list rather than
 * whatever order the query returned.
 */
export function groupInvestigatorsBySection<T extends SectionMember>(
  staff: readonly T[] | undefined,
): Map<number, T[]> {
  const bySection = new Map<number, T[]>();
  for (const person of staff ?? []) {
    if (!person.isInvestigator || person.sectionId == null) continue;
    const current = bySection.get(person.sectionId);
    if (current) current.push(person);
    else bySection.set(person.sectionId, [person]);
  }
  for (const list of bySection.values()) {
    list.sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
  }
  return bySection;
}
