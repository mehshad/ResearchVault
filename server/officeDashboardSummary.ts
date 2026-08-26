export type DashboardInterval = "month" | "quarter" | "year";

export interface DashboardRange {
  from: string;
  to: string;
  interval: DashboardInterval;
  fromDate: Date;
  endExclusive: Date;
}

export interface DashboardPeriod {
  key: string;
  label: string;
  start: string;
  endExclusive: string;
}

export interface DatedValue {
  eventDate?: unknown;
  category?: unknown;
  value?: unknown;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseIsoDay(value: unknown, name: string): Date {
  if (typeof value !== "string" || !DATE_RE.test(value)) {
    throw new Error(`${name} must use YYYY-MM-DD format`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || isoDay(date) !== value) {
    throw new Error(`${name} is not a valid calendar date`);
  }
  return date;
}

export function parseDashboardRange(query: Record<string, unknown>): DashboardRange {
  const fromDate = parseIsoDay(query.from, "from");
  const toDate = parseIsoDay(query.to, "to");
  const requestedInterval = query.interval;
  if (requestedInterval !== "month" && requestedInterval !== "quarter" && requestedInterval !== "year") {
    throw new Error("interval must be month, quarter, or year");
  }
  const interval: DashboardInterval = requestedInterval;
  if (toDate < fromDate) throw new Error("to must be on or after from");
  const endExclusive = new Date(toDate);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const days = (endExclusive.getTime() - fromDate.getTime()) / 86_400_000;
  if (days > 366 * 20) throw new Error("date range cannot exceed 20 years");

  const range = { from: isoDay(fromDate), to: isoDay(toDate), interval, fromDate, endExclusive };
  if (buildPeriods(range).length > 240) {
    throw new Error("date range produces too many periods; choose a wider interval");
  }
  return range;
}

function periodStart(date: Date, interval: DashboardInterval): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (interval === "year") return new Date(Date.UTC(year, 0, 1));
  if (interval === "quarter") return new Date(Date.UTC(year, Math.floor(month / 3) * 3, 1));
  return new Date(Date.UTC(year, month, 1));
}

function nextPeriod(date: Date, interval: DashboardInterval): Date {
  const months = interval === "month" ? 1 : interval === "quarter" ? 3 : 12;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function periodKey(date: Date, interval: DashboardInterval): string {
  const year = date.getUTCFullYear();
  if (interval === "year") return String(year);
  if (interval === "quarter") return `${year}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  return `${year}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function buildPeriods(range: DashboardRange): DashboardPeriod[] {
  const periods: DashboardPeriod[] = [];
  for (
    let cursor = periodStart(range.fromDate, range.interval);
    cursor < range.endExclusive;
    cursor = nextPeriod(cursor, range.interval)
  ) {
    const end = nextPeriod(cursor, range.interval);
    const key = periodKey(cursor, range.interval);
    periods.push({ key, label: key, start: isoDay(cursor), endExclusive: isoDay(end) });
  }
  return periods;
}

function validEventDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/** Builds a complete period/category matrix and ignores invalid or out-of-range events. */
export function aggregateDatedValues(
  range: DashboardRange,
  rows: DatedValue[],
  knownCategories: string[] = [],
): Array<{ period: string; total: number; byCategory: Record<string, number> }> {
  const periods = buildPeriods(range);
  const categorySet = new Set(knownCategories);
  const buckets = new Map(periods.map((period) => [
    period.key,
    { period: period.key, total: 0, byCategory: Object.fromEntries(knownCategories.map((c) => [c, 0])) },
  ]));
  for (const row of rows) {
    const date = validEventDate(row.eventDate);
    if (!date || date < range.fromDate || date >= range.endExclusive) continue;
    const category = typeof row.category === "string" && row.category.trim() ? row.category : "Unknown";
    const value = typeof row.value === "number" ? row.value : Number(row.value ?? 1);
    if (!Number.isFinite(value)) continue;
    categorySet.add(category);
    const bucket = buckets.get(periodKey(date, range.interval));
    if (!bucket) continue;
    bucket.total += value;
    bucket.byCategory[category] = (bucket.byCategory[category] ?? 0) + value;
  }
  for (const bucket of buckets.values()) {
    for (const category of categorySet) bucket.byCategory[category] ??= 0;
  }
  return [...buckets.values()];
}

export function totalsByCurrency(
  rows: Array<{ currency: unknown; amount: unknown }>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    const currency = typeof row.currency === "string" && row.currency.trim()
      ? row.currency.trim().toUpperCase()
      : "UNSPECIFIED";
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) continue;
    totals[currency] = (totals[currency] ?? 0) + amount;
  }
  return totals;
}

/** JSON workflow history is evidence only when an entry carries a real timestamp. */
export function extractHistoryEvents(history: unknown): DatedValue[] {
  if (!Array.isArray(history)) return [];
  const events: DatedValue[] = [];
  for (const entry of history) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const eventDate = item.timestamp ?? item.createdAt ?? item.date;
    if (!validEventDate(eventDate)) continue;
    const category = item.toStatus ?? item.status ?? item.outcome ?? item.action ?? "Unknown";
    events.push({ eventDate, category, value: 1 });
  }
  return events;
}

export function buildPmoTransitionEvents(
  rows: Array<{ applicationType?: unknown; event?: unknown }>,
): DatedValue[] {
  return rows.flatMap((row) => {
    const applicationType =
      typeof row.applicationType === "string" && row.applicationType.trim()
        ? row.applicationType
        : "Unknown application";
    return extractHistoryEvents([row.event]).map((event) => ({
      ...event,
      category: `${applicationType}: ${event.category}`,
    }));
  });
}

export function metadata(range: DashboardRange, partialData: string[]) {
  return {
    from: range.from,
    to: range.to,
    interval: range.interval,
    boundary: "from is inclusive; to is inclusive (implemented as exclusive day-after-to)",
    partialData,
  };
}