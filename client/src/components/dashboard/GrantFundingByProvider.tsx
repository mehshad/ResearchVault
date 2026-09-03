import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatQar } from "@shared/currency";
import type { GrantDashboardStats } from "@shared/dashboardStats";

interface GrantFundingByProviderProps {
  stats?: GrantDashboardStats;
  isLoading?: boolean;
}

/**
 * Money received, by funder, in riyals.
 *
 * Grants are held in the currency they were awarded in, so a single total only
 * means something once they are converted. QAR/USD is a central-bank peg, which
 * makes almost every figure here exact rather than an estimate -- and the card
 * says so, because a money figure whose basis is unstated invites more trust
 * than it has earned.
 *
 * Counts only grants carrying the award milestone: a submitted application has
 * not received anything.
 */
export default function GrantFundingByProvider({ stats, isLoading }: GrantFundingByProviderProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Funding received by provider</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  const funders = stats?.byFunder ?? [];
  const largest = funders[0]?.qar ?? 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle>Funding received by provider</CardTitle>
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums">
              {formatQar(stats?.totalReceivedQar ?? 0)}
            </div>
            <div className="text-xs text-muted-foreground">
              across {stats?.awarded ?? 0} awarded grant{(stats?.awarded ?? 0) === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {funders.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No awarded grant carries an amount yet.
          </p>
        ) : (
          <div className="space-y-2">
            {funders.map((row) => (
              <div key={row.funder} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words font-medium">{row.funder}</span>
                  <span className="shrink-0 tabular-nums">{formatQar(row.qar)}</span>
                </div>
                {/* Proportion at a glance; the numbers stay the real answer. */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: largest > 0 ? `${Math.max(2, (row.qar / largest) * 100)}%` : "0%" }}
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  {row.grants} grant{row.grants === 1 ? "" : "s"}
                  {!row.exact && " · includes an estimated conversion"}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          Converted to riyals at the central bank peg of 3.64 QAR to the US dollar, which is fixed
          rather than a market rate.
          {stats && !stats.exact && " Some amounts used an estimated rate and are approximate."}
          {stats && stats.unconverted.length > 0 && (
            <span className="text-amber-700 dark:text-amber-400">
              {" "}
              Amounts in {stats.unconverted.join(", ")} have no conversion rate and are not included.
            </span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
