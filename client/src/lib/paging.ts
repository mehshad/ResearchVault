/**
 * Client-side paging over a list the page already holds.
 *
 * The grants, staff and publications tables rendered every row in one pass
 * -- 272 grants across twelve columns, each with issue badges and
 * institution chips. Nothing sliced them. Until those endpoints page on the
 * server, the page slices what it has, which keeps a filter change cheap
 * and a long table readable.
 */

export const DEFAULT_PAGE_SIZE = 50;

export interface PageWindow {
  /** 1-based, always within [1, pageCount]. */
  page: number;
  pageCount: number;
  /** 1-based positions of the first and last row shown, 0 when empty. */
  from: number;
  to: number;
  total: number;
}

/** Clamps a requested page to the pages that exist, so a filter that shrinks the list never leaves the reader on an empty page. */
export function pageWindow(total: number, requestedPage: number, pageSize: number = DEFAULT_PAGE_SIZE): PageWindow {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), pageCount);
  if (total === 0) return { page: 1, pageCount: 1, from: 0, to: 0, total };
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return { page, pageCount, from, to, total };
}

export function pageSlice<T>(rows: readonly T[], requestedPage: number, pageSize: number = DEFAULT_PAGE_SIZE): T[] {
  const { page } = pageWindow(rows.length, requestedPage, pageSize);
  return rows.slice((page - 1) * pageSize, page * pageSize);
}
