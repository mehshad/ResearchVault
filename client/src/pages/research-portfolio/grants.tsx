/**
 * Grants, as the researcher named on them sees them.
 *
 * The server sends the viewer's own section entire and other sections only
 * while a grant is in good standing, so what arrives here is already bounded.
 * Within that, the scope and status controls are conveniences over data the
 * viewer may see, which is why they filter in the browser.
 *
 * The status control has to say where the boundary falls, though: picking
 * "Submitted" returns the viewer's section and nothing else, and a list that
 * short is read as missing data unless the page says why. Hence the marks in
 * the dropdown and the notice under it -- the restriction is the server's, and
 * this page's job is to stop it looking like a fault.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Users, User, Info } from "lucide-react";
import type { Grant } from "@shared/schema";
import { GRANT_STATUS_OPTIONS } from "@shared/grantLifecycle";
import { statusesVisibleOutsideSection } from "@shared/researchPortfolioScope";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { PermissionWrapper } from "@/components/PermissionWrapper";
import { PortfolioScopeSelect } from "@/components/PortfolioScopeSelect";
import {
  matchesScope,
  scopeEmptyMessage,
  type PortfolioResponse,
  type PortfolioScope,
} from "@/lib/portfolioScope";

type PortfolioGrant = Grant & {
  lpiName: string | null;
  coInvestigatorNames: string[];
  involvement: "mine" | "team" | null;
};

const statusLabels = new Map<string, string>(
  GRANT_STATUS_OPTIONS.map((option) => [option.value, option.label]),
);

const formatCurrency = (amount: string | number | null | undefined, currency = "USD") => {
  if (!amount) return "—";
  const numeric = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(numeric)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numeric);
  } catch {
    return `${currency || "USD"} ${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(numeric)}`;
  }
};

const formatYear = (grant: PortfolioGrant) =>
  grant.awardedYear ?? grant.submittedYear ?? "—";

export default function PortfolioGrants() {
  const { currentUser } = useCurrentUser();
  const [scope, setScope] = useState<PortfolioScope>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading } = useQuery<PortfolioResponse<{ grants: PortfolioGrant[] }>>({
    queryKey: ["/api/research-portfolio/grants"],
  });

  const grants = data?.grants;
  const viewer = data?.viewer;

  // Statuses at which the viewer will only ever see their own section, because
  // the server sends no other section's grant at them. Empty for Management,
  // who have no boundary and would otherwise be warned about one they do not
  // have.
  const sectionOnlyStatuses = useMemo(() => {
    if (viewer?.seesEverything) return new Set<string>();
    return new Set(
      GRANT_STATUS_OPTIONS.map((option) => option.value).filter(
        (value) => !statusesVisibleOutsideSection().includes(value),
      ),
    );
  }, [viewer?.seesEverything]);

  const restrictionApplies = sectionOnlyStatuses.size > 0;
  const selectedStatusIsSectionOnly = restrictionApplies && sectionOnlyStatuses.has(statusFilter);

  const filtered = useMemo(() => {
    if (!grants) return undefined;
    const needle = searchQuery.trim().toLowerCase();
    return grants.filter((grant) => {
      if (!matchesScope(grant.involvement, scope)) return false;
      if (statusFilter !== "all" && grant.status !== statusFilter) return false;
      if (!needle) return true;
      return [
        grant.title,
        grant.projectNumber,
        grant.fundingAgency,
        grant.lpiName,
        ...grant.coInvestigatorNames,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [grants, scope, statusFilter, searchQuery]);

  return (
    <PermissionWrapper
      currentUserRole={currentUser.role}
      navigationItem="research-portfolio"
      showReadOnlyBanner={false}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Grants</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {restrictionApplies ? (
              <>
                Your section&rsquo;s grants at every stage, and other sections&rsquo; awarded,
                active and completed grants. Narrow the list to the ones you are named on, or the
                ones your section is running.
              </>
            ) : (
              <>
                Every grant on record. Narrow it to the ones you are named on, or the ones your
                section is running.
              </>
            )}
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>
                {filtered ? `${filtered.length} grant${filtered.length === 1 ? "" : "s"}` : "Grants"}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <PortfolioScopeSelect
                  scope={scope}
                  onChange={setScope}
                  viewer={viewer}
                  // For Management the section is the institution, so calling
                  // it "my section" would promise a narrower list than they
                  // get.
                  teamLabel={
                    viewer?.seesEverything ? "Grants with a named PI" : "My section's grants"
                  }
                  mineLabel="Grants I am on"
                  allLabel="All grants"
                />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-52" data-testid="select-grant-status">
                    <SelectValue placeholder="Any status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any status</SelectItem>
                    {GRANT_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {/*
                          Marked in the list itself, not only in a note below
                          it. Someone picking "Submitted" is about to see their
                          own section and nothing else, and the moment to say
                          so is while they are choosing.
                        */}
                        {option.label}
                        {sectionOnlyStatuses.has(option.value) && (
                          <span className="text-muted-foreground"> · your section</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative w-56">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search grants..."
                    className="pl-8"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    data-testid="input-search-grants"
                  />
                </div>
              </div>
            </div>
            {/*
              Shown when the chosen status is one the boundary applies to, so
              an unexpectedly short list is explained where it happens rather
              than read as missing data.
            */}
            {selectedStatusIsSectionOnly && (
              <p
                className="text-xs text-muted-foreground mt-3 flex items-start gap-1.5"
                data-testid="text-status-scope-notice"
              >
                <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  Showing your section only. From other sections, this list carries awarded,
                  active and completed grants only.
                </span>
              </p>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-4 py-3">
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-5 w-64" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                    <Skeleton className="h-8 w-20" />
                  </div>
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[34%]">Title &amp; project number</TableHead>
                    <TableHead>Lead PI</TableHead>
                    <TableHead>Funder</TableHead>
                    <TableHead>Awarded</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered?.map((grant) => (
                    <TableRow key={grant.id} data-testid={`row-grant-${grant.id}`}>
                      <TableCell>
                        {/* Not a link. There is no grant detail page -- only
                            /grants/:id/edit, which answers to the Research
                            Office area this page exists to avoid needing. A
                            title that looks clickable and goes nowhere is
                            worse than plain text. */}
                        <div className="font-medium">{grant.title}</div>
                        <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                          <span>{grant.projectNumber}</span>
                          {/*
                            Tagged only where the tag distinguishes one row
                            from another: not in the "grants I am on" view,
                            where every row would carry the same badge, and not
                            for Management, whose section is the institution so
                            every grant with a PI on it would be "your section".
                          */}
                          {scope !== "mine" && grant.involvement === "mine" && (
                            <Badge variant="outline" className="gap-1 text-xs font-normal">
                              <User className="h-3 w-3" />
                              You are named
                            </Badge>
                          )}
                          {scope !== "mine" &&
                            grant.involvement === "team" &&
                            !viewer?.seesEverything && (
                              <Badge variant="outline" className="gap-1 text-xs font-normal">
                                <Users className="h-3 w-3" />
                                Your section
                              </Badge>
                            )}
                        </div>
                        {grant.coInvestigatorNames.length > 0 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Co-I: {grant.coInvestigatorNames.join(", ")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{grant.lpiName ?? "—"}</TableCell>
                      <TableCell className="text-sm">{grant.fundingAgency ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {formatCurrency(grant.awardedAmount, grant.currency ?? undefined)}
                      </TableCell>
                      <TableCell className="text-sm">{formatYear(grant)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {statusLabels.get(grant.status) ?? grant.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {scopeEmptyMessage(scope, viewer, "grants", Boolean(searchQuery || statusFilter !== "all"))}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </PermissionWrapper>
  );
}
