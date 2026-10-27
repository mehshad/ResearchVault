import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageWindow, DEFAULT_PAGE_SIZE } from "@/lib/paging";

/**
 * "Showing 51–100 of 272" with a page back and forth. Renders nothing when
 * everything fits on one page, so it can sit under every table
 * unconditionally.
 */
export function TablePagination({
  total,
  page,
  onPageChange,
  pageSize = DEFAULT_PAGE_SIZE,
  what = "rows",
}: {
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  what?: string;
}) {
  const window = pageWindow(total, page, pageSize);
  if (window.pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-4 pt-4 text-sm text-muted-foreground" data-testid="table-pagination">
      <span className="tabular-nums">
        Showing {window.from}–{window.to} of {total.toLocaleString()} {what}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(window.page - 1)}
          disabled={window.page <= 1}
          aria-label="Previous page"
          data-testid="button-page-previous"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="tabular-nums">
          Page {window.page} of {window.pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(window.page + 1)}
          disabled={window.page >= window.pageCount}
          aria-label="Next page"
          data-testid="button-page-next"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
