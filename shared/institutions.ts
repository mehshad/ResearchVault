/**
 * The shared list of external organisations.
 *
 * Grants record a submitting institution and the institutions they are run
 * with; contracts record a counterparty. All three were free text typed into a
 * box, which is how "Weill Cornell Medical College in Qatar" and "Weill Cornell
 * Medicine Qatar" both came to exist in the same table, and why the submitting
 * institution needed isHomeInstitution() to recognise our own name written
 * several ways.
 *
 * One list, chosen from a dropdown, so the same organisation is written the
 * same way wherever it appears — and editable by the people filling the forms,
 * because the alternative is an administrator standing between a researcher and
 * a collaborator nobody has typed before.
 */

/**
 * The form of a name that decides whether two entries are the same
 * organisation.
 *
 * Case, spacing and punctuation are dropped: "Hamad Medical Corporation",
 * "hamad medical corporation" and "Hamad  Medical-Corporation" are one
 * institution written three ways, and a list that holds all three is the
 * problem this exists to stop.
 *
 * Deliberately *not* clever beyond that. "Weill Cornell Medical College in
 * Qatar" and "Weill Cornell Medicine Qatar" are the same place and this will
 * not merge them: matching those needs judgement, and guessing wrong silently
 * merges two organisations that a reader can no longer tell apart. Near
 * duplicates are left for a person to notice, which the dropdown makes easy by
 * showing them next to each other.
 */
export function institutionKey(name: string): string {
  return referenceNameKey(name);
}

/**
 * The same rule, named for what it is, because contract types need it too.
 *
 * Any list the office curates by typing into it has this problem: the second
 * person to need an entry spells it differently, and the list grows a twin.
 * One normalisation, used by every such list, so they cannot disagree about
 * what counts as the same thing.
 */
export function referenceNameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** A name is usable if it has letters or digits in it once punctuation is gone. */
export function isUsableInstitutionName(name: string): boolean {
  return institutionKey(name).length > 0;
}

/** Collapse runs of whitespace and trim, so stored names are tidy. */
export function normaliseInstitutionName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export interface InstitutionOption {
  id: number;
  name: string;
}

/**
 * The list as the dropdown shows it: sorted by name, and with an exact match
 * for what has been typed pulled out so the caller can tell "choose this
 * existing one" from "add a new one".
 */
export function findInstitutionByName<T extends { name: string }>(
  institutions: readonly T[],
  name: string,
): T | undefined {
  const key = institutionKey(name);
  if (!key) return undefined;
  return institutions.find((institution) => institutionKey(institution.name) === key);
}

/**
 * Whether typing `name` should offer to add it.
 *
 * Only when it is usable and does not already exist, so the dropdown never
 * offers to add a second spelling of something already on the list.
 */
export function canAddInstitution<T extends { name: string }>(
  institutions: readonly T[],
  name: string,
): boolean {
  return isUsableInstitutionName(name) && findInstitutionByName(institutions, name) === undefined;
}
