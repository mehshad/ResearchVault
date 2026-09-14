/**
 * One colour per status per domain.
 *
 * Seventeen files each carried a private status → class map, and they
 * disagreed: under_review was purple on /irb but yellow on /irb-reviewer and
 * on the office protocol page, and the same PMO application changed colour
 * between its list, its detail and the office view. Every badge now asks this
 * module, so a status looks the same wherever it is shown.
 *
 * The class strings are written out as literals rather than built from a
 * template: Tailwind only emits classes it can find as text in the source,
 * so `bg-${c}-100` would leave the build without the colours nobody else
 * happens to use.
 */

export type StatusDomain =
  | "irb"
  | "ibc"
  | "pmo"
  | "grant"
  | "contract"
  | "patent"
  | "publication"
  | "project";

type Tone =
  | "gray"
  | "slate"
  | "blue"
  | "sky"
  | "cyan"
  | "yellow"
  | "amber"
  | "orange"
  | "purple"
  | "green"
  | "emerald"
  | "red";

const TONES: Record<Tone, string> = {
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-950 dark:text-gray-300",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-950 dark:text-slate-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  green: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

function tone(color: Tone): string {
  return TONES[color];
}

const FALLBACK = tone("gray");

const STATUS_TONES: Record<StatusDomain, Record<string, Tone>> = {
  irb: {
    draft: "gray",
    submitted: "blue",
    triage_complete: "cyan",
    under_review: "yellow",
    ready_for_decision: "purple",
    approved: "green",
    rejected: "red",
    revisions_requested: "orange",
    resubmitted: "purple",
    pending: "blue",
    expired: "gray",
  },
  ibc: {
    draft: "gray",
    submitted: "blue",
    vetted: "purple",
    under_review: "yellow",
    active: "green",
    expired: "red",
  },
  pmo: {
    draft: "gray",
    submitted: "blue",
    under_review: "yellow",
    revision_requested: "orange",
    approved: "green",
    rejected: "red",
  },
  grant: {
    submitted: "yellow",
    pending: "gray",
    in_review: "purple",
    awarded: "emerald",
    active: "green",
    completed: "blue",
    not_awarded: "orange",
    rejected: "orange",
    cancelled: "red",
    withdrawn: "slate",
    terminated: "red",
    transferred: "sky",
    suspended: "amber",
  },
  contract: {
    draft: "gray",
    active: "green",
    pending: "yellow",
    completed: "blue",
    terminated: "red",
    under_review: "purple",
  },
  patent: {
    filed: "blue",
    granted: "green",
    pending: "yellow",
    rejected: "red",
    in_preparation: "purple",
  },
  publication: {
    // "Published *" (an SDR-linked paper) normalises to plain "published".
    published: "green",
    published_invalid: "red",
    submitted: "yellow",
    in_preparation: "blue",
    rejected: "red",
    under_review: "purple",
  },
  project: {
    active: "green",
    pending: "yellow",
    planning: "blue",
    completed: "gray",
    on_hold: "red",
  },
};

/**
 * "Under Review", "under-review", " under_review " and "Published *" all
 * become the key they are stored under: lowercase, punctuation dropped,
 * words joined by a single underscore.
 */
export function normaliseStatus(status: string | null | undefined): string {
  return (status ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function statusBadgeClass(
  domain: StatusDomain,
  status: string | null | undefined,
): string {
  const color = STATUS_TONES[domain][normaliseStatus(status)];
  return color ? tone(color) : FALLBACK;
}
