/**
 * The publications a program can claim, and the window a reader looks at
 * them through.
 *
 * A program owns projects, a project owns SDRs, and a publication is linked
 * to one SDR. So the program's publications are the ones whose SDR sits under
 * one of its projects -- the server resolves that join. What is left to decide
 * here is which of them a "last N years" toggle shows, and in what order.
 *
 * The windows count calendar years, not months: "1" is this year, "3" is this
 * year and the two before it. That matches the ordering, which is by year with
 * the newest on top, so a window never cuts through the middle of a year the
 * list is otherwise showing whole.
 */

export const PUBLICATION_YEAR_WINDOWS = [1, 3, 5, "all"] as const;
export type PublicationYearWindow = (typeof PUBLICATION_YEAR_WINDOWS)[number];

export interface DatedPublication {
  publicationDate?: string | Date | null;
  title?: string | null;
}

const timeOf = (value: string | Date | null | undefined): number | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

export function publicationYearOf(publication: DatedPublication): number | null {
  const time = timeOf(publication.publicationDate);
  return time == null ? null : new Date(time).getFullYear();
}

/** The first calendar year a window admits, or null when it admits everything. */
export function yearWindowStart(
  window: PublicationYearWindow,
  now: Date = new Date(),
): number | null {
  if (window === "all") return null;
  return now.getFullYear() - window + 1;
}

/**
 * An undated publication is in no year, so no finite window shows it. "All"
 * does: the reader asked for everything, and hiding a paper because nobody
 * recorded its date would make it look as if it did not exist.
 */
export function isWithinYearWindow(
  publication: DatedPublication,
  window: PublicationYearWindow,
  now: Date = new Date(),
): boolean {
  const start = yearWindowStart(window, now);
  if (start == null) return true;
  const year = publicationYearOf(publication);
  return year != null && year >= start;
}

/**
 * Newest first. Sorts a copy.
 *
 * Within a year the full date decides, so two papers from the same year keep
 * their real order. Undated papers go last: undated is not the same as
 * newest, and putting them on top would claim they are.
 */
export function orderPublicationsNewestFirst<T extends DatedPublication>(
  publications: readonly T[],
): T[] {
  return [...publications].sort((a, b) => {
    const aTime = timeOf(a.publicationDate);
    const bTime = timeOf(b.publicationDate);
    if (aTime == null && bTime == null) return (a.title ?? "").localeCompare(b.title ?? "");
    if (aTime == null) return 1;
    if (bTime == null) return -1;
    if (aTime !== bTime) return bTime - aTime;
    return (a.title ?? "").localeCompare(b.title ?? "");
  });
}
