import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Check, Minus } from "lucide-react";
import {
  GRANT_STATUS_OPTIONS,
  grantStatusRequiresAward,
  grantStatusRequiresStartDate,
  grantStatusAllowsProgressTracking,
} from "@shared/grantLifecycle";
import {
  GRANT_ISSUE_DEFINITIONS,
  GRANT_ISSUE_WHEN_LABELS,
  type GrantIssueWhen,
} from "@shared/grantIssues";
import { GRANT_MINIMUM_ISSUE_CODES } from "@shared/grantValidity";

interface GrantRulesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * What the system checks on a grant, and when.
 *
 * Generated from the same constants and predicates the validation runs on --
 * GRANT_STATUS_OPTIONS with grantStatusRequiresAward and friends, and
 * GRANT_ISSUE_DEFINITIONS with each check's `when`. Nothing here is written out
 * by hand, because a page describing rules in prose drifts from the rules the
 * moment either changes, and a confidently wrong rules page is worse than none.
 *
 * It exists so the office can see why a row was refused or flagged without
 * asking, and can argue with a specific line of it.
 */
export function GrantRulesDialog({ open, onOpenChange }: GrantRulesDialogProps) {
  const minimumCodes = new Set<string>(GRANT_MINIMUM_ISSUE_CODES);

  const byWhen = (when: GrantIssueWhen) =>
    GRANT_ISSUE_DEFINITIONS.filter((definition) => definition.when === when);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto" data-testid="dialog-grant-rules">
        <DialogHeader>
          <DialogTitle>How grants are checked</DialogTitle>
          <DialogDescription>
            The rules the system applies when a grant is saved or imported. Everything below is read
            from the rules themselves, so this page cannot fall out of step with what actually runs.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Status and the Awarded switch</h3>
          <p className="text-sm text-muted-foreground">
            A status that only makes sense on a grant that was won requires the Awarded switch to be
            on. Setting such a status turns it on; turning it off while one is set is refused. This
            is the rule that rejects an import row, so it is the one worth arguing about first.
          </p>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-40">Awarded switch</TableHead>
                  <TableHead className="w-44">Also requires</TableHead>
                  <TableHead className="w-40">Progress reports</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {GRANT_STATUS_OPTIONS.map((option) => {
                  const needsAward = grantStatusRequiresAward(option.value);
                  const needsStart = grantStatusRequiresStartDate(option.value);
                  const reports = grantStatusAllowsProgressTracking(option.value);
                  return (
                    <TableRow key={option.value}>
                      <TableCell className="font-medium">{option.label}</TableCell>
                      <TableCell>
                        {needsAward ? (
                          <Badge variant="outline" className="border-emerald-500 text-emerald-700 dark:text-emerald-300">
                            Must be on
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Must be off</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {needsStart ? "A start date" : <Minus className="h-3 w-3 text-muted-foreground" />}
                      </TableCell>
                      <TableCell className="text-sm">
                        {reports ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                            <Check className="h-3 w-3" /> Available
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Hidden</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">What gets flagged in the Issues column</h3>
          <p className="text-sm text-muted-foreground">
            Flags never block saving or importing. They mark a record as unfinished so somebody can
            come back to it.
          </p>
          <div className="space-y-3">
            {(["always", "preAward", "awarded"] as GrantIssueWhen[]).map((when) => (
              <div key={when}>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                  {GRANT_ISSUE_WHEN_LABELS[when]}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {byWhen(when).map((definition) => (
                    <Badge
                      key={definition.code}
                      variant="outline"
                      className="border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                      title={definition.detail}
                    >
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      {definition.label}
                      {minimumCodes.has(definition.code) && <span className="ml-1 font-semibold">*</span>}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">What the clean-up tool will offer to delete</h3>
          <p className="text-sm text-muted-foreground">
            Only the three marked <span className="font-semibold">*</span> above make a grant a
            deletion candidate:{" "}
            {GRANT_ISSUE_DEFINITIONS.filter((d) => minimumCodes.has(d.code))
              .map((d) => d.label.replace(/^Missing /, ""))
              .join(", ")}
            . The rest are ordinary gaps in a perfectly real grant.
          </p>
          <p className="text-sm text-muted-foreground">
            Even then nothing is deleted without being ticked, records holding amounts, dates or a
            description are left unticked, and a grant with SDR links or progress reports is refused
            outright.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">What the Awarded switch unlocks</h3>
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            <li>SDRs can only be linked to an awarded grant.</li>
            <li>Dates and the reporting schedule open up once the grant is awarded.</li>
            <li>
              Progress reports appear only on the statuses marked Available above, because a report
              needs a period, and a period needs a start date.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">On import</h3>
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            <li>Grants are matched on Project Number. A number already present is updated, not duplicated.</li>
            <li>
              The Lead PI is resolved by LPI Email first, then by name. A name is matched ignoring
              titles and middle names, and a name matching two people is left for a person rather
              than guessed at.
            </li>
            <li>
              Where another institution submitted the grant, its Lead PI goes to Grant LPI and the
              Sidra Lead PI is taken from Co-Investigators, but only when exactly one of them is
              one of ours.
            </li>
            <li>A row that breaks the status rule above is refused; the rest of the file still imports.</li>
          </ul>
        </section>
      </DialogContent>
    </Dialog>
  );
}
