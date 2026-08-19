import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  FileText,
  Search,
} from "lucide-react";
import type { JournalImpactFactor } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ImpactFactorsResponse = {
  data: JournalImpactFactor[];
  total: number;
};

type SortDirection = "asc" | "desc";

const PAGE_SIZE = 100;

function quartileClass(quartile: string | null) {
  switch (quartile) {
    case "Q1":
      return "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300";
    case "Q2":
      return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300";
    case "Q3":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300";
    default:
      return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";
  }
}

export function ImpactFactorsReadOnly({
  onViewJournalPublications,
}: {
  onViewJournalPublications: (journalName: string) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [field, setField] = useState("all");
  const [minImpactFactor, setMinImpactFactor] = useState("");
  const [maxImpactFactor, setMaxImpactFactor] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState("rank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [exportYear, setExportYear] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const parsedMin = Number(minImpactFactor);
  const parsedMax = Number(maxImpactFactor);
  const minIf = minImpactFactor !== "" && Number.isFinite(parsedMin) ? parsedMin : undefined;
  const maxIf = maxImpactFactor !== "" && Number.isFinite(parsedMax) ? parsedMax : undefined;
  const offset = (currentPage - 1) * PAGE_SIZE;

  const { data: impactFactorsResult, isLoading } = useQuery<ImpactFactorsResponse>({
    queryKey: [
      "/api/journal-impact-factors",
      {
        limit: PAGE_SIZE,
        offset,
        sortField,
        sortDirection,
        searchTerm: debouncedSearchTerm,
        field,
        minIf,
        maxIf,
      },
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
        sortField,
        sortDirection,
      });
      if (debouncedSearchTerm) params.set("searchTerm", debouncedSearchTerm);
      if (field !== "all") params.set("fields", field);
      if (minIf !== undefined) params.set("minImpactFactor", String(minIf));
      if (maxIf !== undefined) params.set("maxImpactFactor", String(maxIf));

      const response = await fetch(`/api/journal-impact-factors?${params}`);
      if (!response.ok) throw new Error("Failed to load impact factors");
      return response.json();
    },
  });

  const { data: availableFields = [] } = useQuery<string[]>({
    queryKey: ["/api/journal-impact-factors/fields"],
  });

  const { data: availableYears = [] } = useQuery<number[]>({
    queryKey: ["/api/journal-impact-factors/years"],
  });

  useEffect(() => {
    if (!exportYear && availableYears.length > 0) {
      setExportYear(String(availableYears[0]));
    }
  }, [availableYears, exportYear]);

  const impactFactors = impactFactorsResult?.data ?? [];
  const totalRecords = impactFactorsResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));

  const visibleJournalNames = useMemo(
    () => Array.from(new Set(impactFactors.map((factor) => factor.journalName).filter(Boolean))),
    [impactFactors]
  );

  const { data: journalPublicationCounts = {} } = useQuery<Record<string, number>>({
    queryKey: [
      "/api/publications/journal-counts",
      "impact-factors-read-only",
      visibleJournalNames.join("|"),
    ],
    queryFn: async () => {
      if (visibleJournalNames.length === 0) return {};
      const params = new URLSearchParams({ journals: visibleJournalNames.join("|") });
      const response = await fetch(`/api/publications/journal-counts?${params}`);
      if (!response.ok) throw new Error("Failed to load journal publication counts");
      return response.json();
    },
    enabled: visibleJournalNames.length > 0,
  });

  const changeSort = (nextSortField: string) => {
    if (nextSortField === sortField) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortField(nextSortField);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  const SortHeader = ({
    field: column,
    children,
  }: {
    field: string;
    children: React.ReactNode;
  }) => (
    <Button
      variant="ghost"
      className="h-auto p-0 font-semibold hover:bg-transparent"
      onClick={() => changeSort(column)}
    >
      {children}
      {sortField !== column ? (
        <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-50" />
      ) : sortDirection === "asc" ? (
        <ArrowUp className="ml-1 h-3.5 w-3.5" />
      ) : (
        <ArrowDown className="ml-1 h-3.5 w-3.5" />
      )}
    </Button>
  );

  const exportImpactFactors = () => {
    if (!exportYear) return;
    const params = new URLSearchParams({ year: exportYear });
    if (debouncedSearchTerm) params.set("searchTerm", debouncedSearchTerm);
    if (field !== "all") params.set("fields", field);
    if (minIf !== undefined) params.set("minImpactFactor", String(minIf));
    if (maxIf !== undefined) params.set("maxImpactFactor", String(maxIf));
    window.location.href = `/api/journal-impact-factors/export?${params}`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>Journal Impact Factors</CardTitle>
          <p className="text-sm text-muted-foreground">
            Browse the current journal metrics. This view is read-only.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_220px_150px_150px_170px] lg:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="impact-factor-search">Search journals</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="impact-factor-search"
                  className="pl-9"
                  placeholder="Journal name or publisher..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  data-testid="input-publication-impact-factor-search"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Field</Label>
              <Select
                value={field}
                onValueChange={(value) => {
                  setField(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger data-testid="select-publication-impact-factor-field">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All fields</SelectItem>
                  {availableFields.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="impact-factor-min">Minimum JIF</Label>
              <Input
                id="impact-factor-min"
                type="number"
                min="0"
                step="0.1"
                placeholder="Any"
                value={minImpactFactor}
                onChange={(event) => {
                  setMinImpactFactor(event.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="impact-factor-max">Maximum JIF</Label>
              <Input
                id="impact-factor-max"
                type="number"
                min="0"
                step="0.1"
                placeholder="Any"
                value={maxImpactFactor}
                onChange={(event) => {
                  setMaxImpactFactor(event.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label>Export year</Label>
                <Select value={exportYear} onValueChange={setExportYear}>
                  <SelectTrigger data-testid="select-publication-impact-factor-export-year">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableYears.map((year) => (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="icon"
                title="Export matching impact factors as CSV"
                aria-label="Export matching impact factors as CSV"
                onClick={exportImpactFactors}
                disabled={!exportYear}
                data-testid="button-publication-impact-factor-export"
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Impact Factors ({totalRecords.toLocaleString()} journals, page {currentPage} of {totalPages})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]"><SortHeader field="journalName">Journal name</SortHeader></TableHead>
                  <TableHead><span className="text-xs font-medium">Pubs</span></TableHead>
                  <TableHead className="min-w-[160px]"><SortHeader field="abbreviatedJournal">Abbreviated</SortHeader></TableHead>
                  <TableHead className="min-w-[180px]"><SortHeader field="field">Field</SortHeader></TableHead>
                  <TableHead><SortHeader field="year">Year</SortHeader></TableHead>
                  <TableHead><span className="text-xs font-medium">ISSN</span></TableHead>
                  <TableHead><span className="text-xs font-medium">eISSN</span></TableHead>
                  <TableHead><SortHeader field="impactFactor">JIF</SortHeader></TableHead>
                  <TableHead><SortHeader field="fiveYearJif">5-year JIF</SortHeader></TableHead>
                  <TableHead><SortHeader field="jifWithoutSelfCites">JIF w/o self</SortHeader></TableHead>
                  <TableHead><SortHeader field="jci">JCI</SortHeader></TableHead>
                  <TableHead><SortHeader field="quartile">Quartile</SortHeader></TableHead>
                  <TableHead><SortHeader field="rank">Rank</SortHeader></TableHead>
                  <TableHead><SortHeader field="totalCites">Total cites</SortHeader></TableHead>
                  <TableHead><SortHeader field="totalArticles">Articles</SortHeader></TableHead>
                  <TableHead><SortHeader field="citableItems">Citable items</SortHeader></TableHead>
                  <TableHead><SortHeader field="citedHalfLife">Cited half-life</SortHeader></TableHead>
                  <TableHead><SortHeader field="citingHalfLife">Citing half-life</SortHeader></TableHead>
                  <TableHead className="min-w-[160px]"><SortHeader field="publisher">Publisher</SortHeader></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={`impact-factor-loading-${index}`}>
                      <TableCell colSpan={19} className="h-12 animate-pulse text-muted-foreground">
                        Loading impact factors…
                      </TableCell>
                    </TableRow>
                  ))}
                {!isLoading && impactFactors.map((factor) => {
                  const publicationCount = journalPublicationCounts[factor.journalName] ?? 0;
                  return (
                    <TableRow key={factor.journalId} data-testid={`row-publication-impact-factor-${factor.journalId}`}>
                      <TableCell className="font-medium">{factor.journalName}</TableCell>
                      <TableCell>
                        {publicationCount > 0 ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-7"
                            onClick={() => onViewJournalPublications(factor.journalName)}
                            title={`View ${publicationCount} publication${publicationCount === 1 ? "" : "s"} in ${factor.journalName}`}
                          >
                            <FileText className="mr-1 h-3.5 w-3.5" />
                            {publicationCount}
                          </Button>
                        ) : (
                          <Badge variant="outline" className="font-normal text-muted-foreground">0</Badge>
                        )}
                      </TableCell>
                      <TableCell>{factor.abbreviatedJournal || "—"}</TableCell>
                      <TableCell>{factor.field || "—"}</TableCell>
                      <TableCell>{factor.year ?? "—"}</TableCell>
                      <TableCell className="text-xs">{factor.issn || "—"}</TableCell>
                      <TableCell className="text-xs">{factor.eissn || "—"}</TableCell>
                      <TableCell className="font-semibold text-blue-600 dark:text-blue-400">{factor.impactFactor ?? "—"}</TableCell>
                      <TableCell>{factor.fiveYearJif ?? "—"}</TableCell>
                      <TableCell>{factor.jifWithoutSelfCites ?? "—"}</TableCell>
                      <TableCell>{factor.jci ?? "—"}</TableCell>
                      <TableCell>
                        {factor.quartile ? (
                          <Badge className={quartileClass(factor.quartile)} variant="secondary">
                            {factor.quartile}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell>{factor.rank ?? "—"}</TableCell>
                      <TableCell>{factor.totalCites?.toLocaleString() ?? "—"}</TableCell>
                      <TableCell>{factor.totalArticles?.toLocaleString() ?? "—"}</TableCell>
                      <TableCell>{factor.citableItems?.toLocaleString() ?? "—"}</TableCell>
                      <TableCell>{factor.citedHalfLife ?? "—"}</TableCell>
                      <TableCell>{factor.citingHalfLife ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{factor.publisher || "—"}</TableCell>
                    </TableRow>
                  );
                })}
                {!isLoading && impactFactors.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={19} className="py-10 text-center text-muted-foreground">
                      No impact factors match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {totalRecords > PAGE_SIZE && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, totalRecords)} of {totalRecords.toLocaleString()} journals
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} aria-label="First page">
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1} aria-label="Previous page">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 text-sm font-medium">Page {currentPage} of {totalPages}</span>
                <Button variant="outline" size="icon" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages} aria-label="Next page">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} aria-label="Last page">
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}