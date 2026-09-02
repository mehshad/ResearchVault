import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { IncompleteGrantSummary } from "@shared/grantValidity";

interface CleanupResponse {
  grants: IncompleteGrantSummary[];
  total: number;
  deletable: number;
  blocked: number;
  withOtherContent: number;
}

interface GrantCleanupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Clean-up tool for grant records too incomplete to act on.
 *
 * Preview first, then delete only what was ticked. The office asked for a
 * "delete all invalid grants" button, and a plain one would have been
 * dangerous: on the data as it stands, 95 of 113 grants have no Lead PI, and
 * they are not junk -- they are real proposals whose PI never matched a staff
 * record during an import. Deleting them would destroy the office's record of
 * a year of submissions, and nothing would say what had gone.
 *
 * So the dialog separates "incomplete" from "worth deleting". Rows that hold
 * only a project number and a title are ticked on opening; rows carrying
 * money, dates or an abstract are listed but left unticked, because those
 * want fixing rather than removing. Nothing is deleted that the person did
 * not see and leave ticked.
 */
export function GrantCleanupDialog({ open, onOpenChange }: GrantCleanupDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data, isLoading } = useQuery<CleanupResponse>({
    queryKey: ["/api/grants/cleanup/incomplete"],
    enabled: open,
  });

  const rows = useMemo(() => data?.grants ?? [], [data]);

  // Pre-tick the empty shells only. Re-running whenever the preview changes
  // keeps the selection honest after a delete: ids that no longer exist would
  // otherwise stay ticked and be re-sent.
  useEffect(() => {
    setSelected(
      new Set(rows.filter((row) => row.deletable && !row.hasOtherContent).map((row) => row.id)),
    );
  }, [rows]);

  const toggle = (id: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectableIds = rows.filter((row) => row.deletable).map((row) => row.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiRequest("DELETE", "/api/grants/cleanup/incomplete", { ids });
      return await res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/grants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grants/cleanup/incomplete"] });
      toast({
        title: "Clean-up complete",
        description:
          `${result.deletedCount} grant${result.deletedCount === 1 ? "" : "s"} deleted` +
          (result.skippedCount ? `, ${result.skippedCount} left in place.` : "."),
      });
      // Skips are named individually rather than counted: a skip means the
      // record changed under the preview, which the office needs to look at.
      for (const skip of result.skipped ?? []) {
        toast({
          title: `Kept ${skip.projectNumber ?? `grant ${skip.id}`}`,
          description: skip.reason,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Clean-up failed",
        description: error?.message ?? "No grants were deleted.",
        variant: "destructive",
      });
    },
  });

  const withContentSelected = rows.filter(
    (row) => selected.has(row.id) && row.hasOtherContent,
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl" data-testid="dialog-grant-cleanup">
        <DialogHeader>
          <DialogTitle>Clean up incomplete grants</DialogTitle>
          <DialogDescription>
            Grants missing a project number, a title, or a Lead PI. Nothing is deleted until you
            confirm, and only the rows you leave ticked are removed.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Every grant has a project number, a title and a Lead PI. Nothing to clean up.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">{data?.total} incomplete</Badge>
              {(data?.blocked ?? 0) > 0 && (
                <Badge variant="outline">{data?.blocked} cannot be deleted</Badge>
              )}
              {(data?.withOtherContent ?? 0) > 0 && (
                <Badge variant="outline" className="border-amber-500 text-amber-700">
                  {data?.withOtherContent} hold other data
                </Badge>
              )}
            </div>

            {(data?.withOtherContent ?? 0) > 0 && (
              <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Rows marked <strong>holds other data</strong> carry amounts, dates or a
                  description, so they are real records that were never finished rather than failed
                  imports. They are left unticked. Linking the missing Lead PI is usually the fix.
                </span>
              </div>
            )}

            <div className="max-h-[45vh] overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(checked) =>
                          setSelected(checked ? new Set(selectableIds) : new Set())
                        }
                        aria-label="Select every deletable grant"
                        data-testid="checkbox-cleanup-select-all"
                      />
                    </TableHead>
                    <TableHead>Project no.</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Missing</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} data-testid={`row-cleanup-grant-${row.id}`}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(row.id)}
                          disabled={!row.deletable}
                          onCheckedChange={() => toggle(row.id)}
                          aria-label={`Select ${row.projectNumber ?? `grant ${row.id}`}`}
                          data-testid={`checkbox-cleanup-grant-${row.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.projectNumber || <span className="text-muted-foreground">&mdash;</span>}
                      </TableCell>
                      <TableCell className="max-w-[22rem] truncate" title={row.title ?? ""}>
                        {row.title || <span className="text-muted-foreground">&mdash;</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {row.missing.map((issue) => (
                            <Badge key={issue.code} variant="secondary" className="text-xs">
                              {issue.label}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          {row.linkedSdrs > 0 && (
                            <Badge variant="outline">
                              {row.linkedSdrs} SDR{row.linkedSdrs === 1 ? "" : "s"} linked
                            </Badge>
                          )}
                          {row.progressReports > 0 && (
                            <Badge variant="outline">
                              {row.progressReports} progress report
                              {row.progressReports === 1 ? "" : "s"}
                            </Badge>
                          )}
                          {row.hasOtherContent && (
                            <Badge variant="outline" className="border-amber-500 text-amber-700">
                              Holds other data
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {selected.size} selected
            {withContentSelected > 0 && (
              <span className="text-amber-700">
                {" "}
                &mdash; {withContentSelected} of them hold other data
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              variant="destructive"
              disabled={selected.size === 0 || deleteMutation.isPending}
              onClick={() => deleteMutation.mutate([...selected])}
              data-testid="button-cleanup-delete"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete {selected.size} grant{selected.size === 1 ? "" : "s"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
