/**
 * A staff member's name as it is written out: honorific, first name, last
 * name, whichever are recorded. Two server modules each carried their own
 * copy of this; one copy, here, so the grants export and the publication
 * link import spell a person the same way.
 */
export function scientistDisplayName(person: {
  honorificTitle?: string | null;
  firstName: string;
  lastName: string;
}): string {
  return [person.honorificTitle, person.firstName, person.lastName].filter(Boolean).join(" ").trim();
}
