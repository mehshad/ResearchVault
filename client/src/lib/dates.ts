/**
 * One way to write a date.
 *
 * The app had at least six: `toLocaleDateString()` with no locale (which gives
 * whatever the reader's browser is set to, so 08/09/2026 in London and
 * 09/08/2026 in New York for the same day), an explicit `'MM/dd/yyyy'`, three
 * variations on "Sep 8, 2026", and a couple of places that already did the
 * right thing. A grants officer reading two screens side by side could not tell
 * which number was the month.
 *
 * Everything here is **day first**: 08/09/2026, or 8 Sep 2026 where a month
 * name reads better. That is what the office writes, and it is fixed rather
 * than taken from the browser, so two people looking at the same record see the
 * same date.
 *
 * Native `<input type="date">` is the one thing this cannot reach. The browser
 * renders that control in the operating system's locale and no attribute
 * changes it -- the value is always ISO underneath, so the data is unambiguous,
 * but a reader on a US-configured machine sees mm/dd/yyyy in the picker. Use
 * `DATE_INPUT_HINT` beside such a field where the format matters.
 */

/** Accepts what the API actually returns: ISO strings, Dates, or nothing. */
type DateLike = string | number | Date | null | undefined;

function toDate(value: DateLike): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const pad = (n: number) => String(n).padStart(2, "0");

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * 08/09/2026. The default for anywhere a date is shown.
 *
 * Returns the fallback rather than "Invalid Date" for anything unparseable,
 * because a table cell reading "Invalid Date" tells the reader nothing they can
 * act on and an empty one at least reads as "not recorded".
 */
export function formatDate(value: DateLike, fallback = ""): string {
  const date = toDate(value);
  if (!date) return fallback;
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** 8 Sep 2026. For prose and headings, where a month name reads better. */
export function formatDateLong(value: DateLike, fallback = ""): string {
  const date = toDate(value);
  if (!date) return fallback;
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** 08/09/2026 14:30. Day first, then a 24-hour clock. */
export function formatDateTime(value: DateLike, fallback = ""): string {
  const date = toDate(value);
  if (!date) return fallback;
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Month and year only: Sep 2026. */
export function formatMonthYear(value: DateLike, fallback = ""): string {
  const date = toDate(value);
  if (!date) return fallback;
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * What a native date picker cannot say for itself.
 *
 * Put it beside an `<input type="date">` when a reader might otherwise misread
 * the browser's own rendering of the value.
 */
export const DATE_INPUT_HINT = "dd/mm/yyyy";
