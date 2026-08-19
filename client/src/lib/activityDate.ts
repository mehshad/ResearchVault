const DOHA_TIME_ZONE = "Asia/Qatar";
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DOHA_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const calendarDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DOHA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const olderActivityFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DOHA_TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function dohaCalendarDay(date: Date): number {
  const parts = calendarDateFormatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return Math.floor(Date.UTC(year, month - 1, day) / MILLISECONDS_PER_DAY);
}

export function formatActivityDate(
  value: Date | string,
  now: Date = new Date()
): string {
  const activityDate = value instanceof Date ? value : new Date(value);
  if (
    Number.isNaN(activityDate.getTime()) ||
    Number.isNaN(now.getTime())
  ) {
    return "Date unavailable";
  }

  const dayDifference =
    dohaCalendarDay(now) - dohaCalendarDay(activityDate);
  const time = timeFormatter.format(activityDate);

  if (dayDifference === 0) {
    return `Today, ${time}`;
  }
  if (dayDifference === 1) {
    return `Yesterday, ${time}`;
  }
  if (dayDifference > 1 && dayDifference < 7) {
    return `${dayDifference} days ago`;
  }

  return olderActivityFormatter.format(activityDate);
}