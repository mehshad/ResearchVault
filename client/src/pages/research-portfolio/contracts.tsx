/**
 * Research contracts, scoped to the viewer's section.
 *
 * Unlike the grants page beside it, this list is a restriction rather than a
 * convenience: a contract outside the viewer's section never reaches the
 * browser. The scope control here only narrows what the server already sent --
 * which is why it offers no "all contracts" option, since there is no wider
 * set to show.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Search, Users, User, Calendar, Plus } from "lucide-react";
import type { ResearchContract } from "@shared/schema";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { PermissionWrapper } from "@/components/PermissionWrapper";
import { PortfolioScopeSelect } from "@/components/PortfolioScopeSelect";
import {
  matchesScope,
  scopeEmptyMessage,
  type PortfolioResponse,
  type PortfolioScope,
} from "@/lib/portfolioScope";

type PortfolioContract = ResearchContract & {
  leadPIName: string | null;
  requestedByScientistId: number | null;
  involvement: "mine" | "team";
};

const formatDate = (date: string | Date | null | undefined) => {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatValue = (value: string | number | null | undefined, currency: string | null) => {
  if (!value) return "—";
  const numeric = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(numeric)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "QAR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numeric);
  } catch {
    return `${currency || "QAR"} ${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(numeric)}`;
  }
};

export default function PortfolioContracts() {
  const { currentUser } = useCurrentUser();
  // Starts on the section rather than on "mine": the page exists to show a
  // researcher what their section is running, and opening on their own
  // contracts would show most researchers an empty table.
  const [scope, setScope] = useState<PortfolioScope>("team");
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading } = useQuery<PortfolioResponse<{ contracts: PortfolioContract[] }>>({
    queryKey: ["/api/research-portfolio/contracts"],
  });

  const contracts = data?.contracts;
  const viewer = data?.viewer;

  const filtered = useMemo(() => {
    if (!contracts) return undefined;
    const needle = searchQuery.trim().toLowerCase();
    return contracts.filter((contract) => {
      if (!matchesScope(contract.involvement, scope)) return false;
      if (!needle) return true;
      return [
        contract.title,
        contract.contractNumber,
        contract.contractType,
        contract.contractorName,
        contract.leadPIName,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [contracts, scope, searchQuery]);

  return (
    <PermissionWrapper
      currentUserRole={currentUser.role}
      navigationItem="research-portfolio"
      showReadOnlyBanner={false}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Contracts</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {viewer?.seesEverything
                ? "Every research contract on record."
                : "Research contracts your section is running. Contracts belonging to other sections are not shown."}
            </p>
          </div>
          {/*
            Requesting a contract belongs with the people who need one, not
            with the office that fulfils it. Gated on "create" for this area,
            which is the level that distinguishes a researcher who may ask from
            one who may only read.
          */}
          <PermissionWrapper
            requiredPermissions={['canAdd']}
            currentUserRole={currentUser.role}
            navigationItem="research-portfolio"
          >
            <Link href="/research-portfolio/contracts/request">
              <Button data-testid="button-request-contract">
                <Plus className="h-4 w-4 mr-2" />
                Request New Contract
              </Button>
            </Link>
          </PermissionWrapper>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>
                {filtered
                  ? `${filtered.length} contract${filtered.length === 1 ? "" : "s"}`
                  : "Contracts"}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <PortfolioScopeSelect
                  scope={scope}
                  onChange={setScope}
                  viewer={viewer}
                  hideAll
                  allLabel="All contracts"
                  mineLabel="Contracts I lead"
                  teamLabel={
                    viewer?.seesEverything ? "All contracts" : "My section's contracts"
                  }
                />
                <div className="relative w-56">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search contracts..."
                    className="pl-8"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    data-testid="input-search-contracts"
                  />
                </div>
              </div>
            </div>
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
                    <TableHead className="w-[34%]">Title &amp; contract number</TableHead>
                    <TableHead>Lead PI</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Timeline</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered?.map((contract) => (
                    <TableRow key={contract.id} data-testid={`row-contract-${contract.id}`}>
                      <TableCell>
                        <div className="font-medium">
                          <Link
                            href={`/contracts/${contract.id}`}
                            className="hover:text-primary transition-colors"
                          >
                            {contract.title}
                          </Link>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                          <span>{contract.contractNumber}</span>
                          {/* Only under a scope that mixes the two. */}
                          {scope !== "mine" && contract.involvement === "mine" && (
                            <Badge variant="outline" className="gap-1 text-xs font-normal">
                              <User className="h-3 w-3" />
                              You lead this
                            </Badge>
                          )}
                          {scope !== "mine" && contract.involvement === "team" && !viewer?.seesEverything && (
                            <Badge variant="outline" className="gap-1 text-xs font-normal">
                              <Users className="h-3 w-3" />
                              Your section
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {contract.leadPIName ?? (
                          <span className="text-muted-foreground">Not yet assigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm capitalize">
                        {contract.contractType ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {contract.startDate || contract.endDate ? (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            <span>
                              {formatDate(contract.startDate)} – {formatDate(contract.endDate)}
                            </span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatValue(contract.contractValue, contract.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {contract.status?.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {scopeEmptyMessage(scope, viewer, "contracts", Boolean(searchQuery))}
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
