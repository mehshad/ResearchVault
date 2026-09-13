/**
 * Grants, as the researcher named on them sees them.
 *
 * Three lists, not one list with a scope control: the grants I lead, the
 * grants my section is running, and the grants I contribute to. A single
 * list with a dropdown asked the reader to know the control was there and
 * to pick a scope before it showed them anything of their own; three lists
 * show all three answers at once, each with its own count.
 *
 * The server sends the viewer's own section entire and other sections only
 * while a grant is in good standing, so what arrives here is already bounded.
 * Within that, the status and search controls are conveniences over data the
 * viewer may see, which is why they filter in the browser -- and they apply to
 * every list at once.
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
import { Button } from "@/components/ui/button";
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
import { Search, Users, User, Info, Crown, ChevronDown, ChevronRight } from "lucide-react";
import type { Grant } from "@shared/schema";
import { useGrantStatuses } from "@/hooks/useGrantStatuses";
import { statusesVisibleOutsideSection, type GrantRole } from "@shared/researchPortfolioScope";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { PermissionWrapper } from "@/components/PermissionWrapper";
import type { PortfolioResponse, PortfolioViewerSummary } from "@/lib/portfolioScope";

type PortfolioGrant = Grant & {
  lpiName: string | null;
  coInvestigatorNames: string[];
  involvement: "mine" | "team" | null;
  role: GrantRole;
  /** Somebody in the viewer's own section is on it, whatever the viewer's role. */
  inSection: boolean;
};

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

interface GrantsTableProps {
  grants: PortfolioGrant[] | undefined;
  isLoading: boolean;
  emptyMessage: string;
  statusLabels: Map<string, string>;
  /**
   * Tag rows by the viewer's part on them. Only in the section list, where
   * the tag distinguishes one row from another; in "My grants" or "Grants I
   * am on" every row would carry the same badge.
   */
  tagRoles?: boolean;
}

function GrantsTable({ grants, isLoading, emptyMessage, statusLabels, tagRoles }: GrantsTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 py-3">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-5 w-64" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
    );
  }
  return (
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
        {grants?.map((grant) => (
          <TableRow key={grant.id} data-testid={`row-grant-${grant.id}`}>
            <TableCell>
              {/* Not a link. There is no grant detail page -- only
                  /grants/:id/edit, which answers to the Research Office area
                  this page exists to avoid needing. A title that looks
                  clickable and goes nowhere is worse than plain text. */}
              <div className="font-medium">{grant.title}</div>
              <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                <span>{grant.projectNumber}</span>
                {tagRoles && grant.role === "lead" && (
                  <Badge variant="outline" className="gap-1 text-xs font-normal">
                    <Crown className="h-3 w-3" />
                    You lead this
                  </Badge>
                )}
                {tagRoles && grant.role === "co-investigator" && (
                  <Badge variant="outline" className="gap-1 text-xs font-normal">
                    <User className="h-3 w-3" />
                    You are named
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
        {grants?.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

/** Why a personal list is empty, in order of what the reader can act on. */
function personalEmptyMessage(
  viewer: PortfolioViewerSummary | undefined,
  filtered: boolean,
  nothing: string,
): string {
  // Asked directly rather than through scopeUnavailableReason, which waives
  // the reason for Management -- but a Management account with no staff
  // record still cannot be on a grant, and should be told why.
  if (viewer && viewer.scientistId == null) {
    return "Your account is not linked to a staff profile, so we cannot tell which grants are yours.";
  }
  if (filtered) return "No grants match the filters you have set.";
  return nothing;
}

/**
 * Why the section list is empty. Two of the reasons are configuration gaps
 * the reader can get fixed, and the sentence says which.
 */
function teamEmptyMessage(viewer: PortfolioViewerSummary | undefined, filtered: boolean): string {
  if (viewer && viewer.scientistId == null) {
    return "Your account is not linked to a staff profile, so we cannot tell which section is yours.";
  }
  if (viewer && viewer.sectionId == null) {
    return "Your staff profile has not been placed in a section, so we cannot tell which grants are your section's.";
  }
  if (filtered) return "No grants match the filters you have set.";
  if (viewer?.sectionSize === 1) {
    return "You are the only person in your section, and you are not named on any grants.";
  }
  return "Nobody in your section is named on any grants.";
}

export default function PortfolioGrants() {
  const { currentUser } = useCurrentUser();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showOthers, setShowOthers] = useState(false);
  const { options: statusOptions, all: allStatuses } = useGrantStatuses();

  const statusLabels = useMemo(
    () => new Map<string, string>(allStatuses.map((option) => [option.value, option.label])),
    [allStatuses],
  );

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
      statusOptions
        .map((option) => option.value)
        .filter((value) => !statusesVisibleOutsideSection().includes(value)),
    );
  }, [viewer?.seesEverything, statusOptions]);

  const restrictionApplies = sectionOnlyStatuses.size > 0;
  const selectedStatusIsSectionOnly = restrictionApplies && sectionOnlyStatuses.has(statusFilter);
  const filtered = Boolean(searchQuery || statusFilter !== "all");

  // Status and search first, then each list takes its own slice. A grant the
  // viewer leads is also in the section list: their work is the section's
  // work, and leaving it out would make that an odd "everyone but me" list.
  const matching = useMemo(() => {
    if (!grants) return undefined;
    const needle = searchQuery.trim().toLowerCase();
    return grants.filter((grant) => {
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
  }, [grants, statusFilter, searchQuery]);

  const mine = useMemo(() => matching?.filter((grant) => grant.role === "lead"), [matching]);
  // The section list is the viewer's own section for everyone, Management
  // included: their role sees every grant, but their team is still the
  // section their staff record sits in. Own work is in it too.
  const team = useMemo(
    () => matching?.filter((grant) => grant.role != null || grant.inSection),
    [matching],
  );
  const named = useMemo(
    () => matching?.filter((grant) => grant.role === "co-investigator"),
    [matching],
  );
  const others = useMemo(
    () => matching?.filter((grant) => grant.role == null && !grant.inSection),
    [matching],
  );

  const count = (list: PortfolioGrant[] | undefined) =>
    list ? `${list.length} grant${list.length === 1 ? "" : "s"}` : "";

  return (
    <PermissionWrapper
      currentUserRole={currentUser.role}
      navigationItem="research-portfolio"
      showReadOnlyBanner={false}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Grants</h1>
            <p className="text-sm text-muted-foreground mt-1">
              The grants you lead, the grants your section is running, and the grants you are named
              on, each in its own list.
              {restrictionApplies && (
                <>
                  {" "}
                  Your section&rsquo;s grants appear at every stage; other sections&rsquo; only once
                  awarded, active or completed.
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-52" data-testid="select-grant-status">
                <SelectValue placeholder="Any status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {/*
                      Marked in the list itself, not only in a note below it.
                      Someone picking "Submitted" is about to see their own
                      section and nothing else, and the moment to say so is
                      while they are choosing.
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
          Shown when the chosen status is one the boundary applies to, so an
          unexpectedly short list is explained where it happens rather than
          read as missing data.
        */}
        {selectedStatusIsSectionOnly && (
          <p
            className="text-xs text-muted-foreground flex items-start gap-1.5"
            data-testid="text-status-scope-notice"
          >
            <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>
              Showing your section only. From other sections, the lists carry awarded, active and
              completed grants only.
            </span>
          </p>
        )}

        <Card data-testid="section-my-grants">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5" />
              My grants
              <span className="text-sm font-normal text-muted-foreground">{count(mine)}</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">Grants on which you are the Sidra lead PI.</p>
          </CardHeader>
          <CardContent>
            <GrantsTable
              grants={mine}
              isLoading={isLoading}
              statusLabels={statusLabels}
              emptyMessage={personalEmptyMessage(
                viewer,
                filtered,
                "You are not the lead PI on any grants.",
              )}
            />
          </CardContent>
        </Card>

        <Card data-testid="section-team-grants">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              My team's grants
              <span className="text-sm font-normal text-muted-foreground">{count(team)}</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Every grant led by, or naming, somebody in your section, your own included.
            </p>
          </CardHeader>
          <CardContent>
            <GrantsTable
              grants={team}
              isLoading={isLoading}
              statusLabels={statusLabels}
              tagRoles
              emptyMessage={teamEmptyMessage(viewer, filtered)}
            />
          </CardContent>
        </Card>

        <Card data-testid="section-named-grants">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Grants I am on
              <span className="text-sm font-normal text-muted-foreground">{count(named)}</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Grants somebody else leads that name you as a co-investigator.
            </p>
          </CardHeader>
          <CardContent>
            <GrantsTable
              grants={named}
              isLoading={isLoading}
              statusLabels={statusLabels}
              emptyMessage={personalEmptyMessage(
                viewer,
                filtered,
                "You are not named as a co-investigator on any grants.",
              )}
            />
          </CardContent>
        </Card>

        {/*
          What the server sent that is nobody's in the lists above: other
          sections' grants in good standing, or for Management the grants with
          nobody named on them. Kept, folded away, so that a grant the viewer
          may see is not silently dropped from the page.
        */}
        {others && others.length > 0 && (
          <Card data-testid="section-other-grants">
            <CardHeader className="pb-3">
              <Button
                variant="ghost"
                className="w-full justify-start px-0 hover:bg-transparent"
                onClick={() => setShowOthers((open) => !open)}
                aria-expanded={showOthers}
                data-testid="button-toggle-other-grants"
              >
                {showOthers ? <ChevronDown className="h-4 w-4 mr-2" /> : <ChevronRight className="h-4 w-4 mr-2" />}
                <span className="font-semibold">
                  {viewer?.seesEverything ? "All other grants" : "Other sections' grants"}
                </span>
                <span className="text-sm font-normal text-muted-foreground ml-2">{count(others)}</span>
              </Button>
              <p className="text-sm text-muted-foreground">
                {viewer?.seesEverything
                  ? "Every other grant on record. Your role sees the whole institution."
                  : "Awarded, active and completed grants elsewhere in the institution."}
              </p>
            </CardHeader>
            {showOthers && (
              <CardContent>
                <GrantsTable
                  grants={others}
                  isLoading={isLoading}
                  statusLabels={statusLabels}
                  emptyMessage="Nothing here."
                />
              </CardContent>
            )}
          </Card>
        )}
      </div>
    </PermissionWrapper>
  );
}
