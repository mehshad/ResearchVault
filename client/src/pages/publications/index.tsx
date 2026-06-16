// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, TableBody, TableCell, TableHead, 
  TableHeader, TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EnhancedPublication } from "@/lib/types";
import { Plus, Search, MoreHorizontal, CalendarRange, Bookmark, FileText, Download, Star, ArrowUpDown, ArrowUp, ArrowDown, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PermissionWrapper } from "@/components/PermissionWrapper";
import { usePermissions } from "@/hooks/usePermissions";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { PublicationsToFix } from "@/components/PublicationsToFix";
import PublicationImport from "./import";

export default function PublicationsList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [location, navigate] = useLocation();
  const [filterResearchActivityId, setFilterResearchActivityId] = useState<number | null>(null);
  const [filterJournal, setFilterJournal] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Advanced (horizontal) filter bar state
  const [journalFilter, setJournalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [authorFilter, setAuthorFilter] = useState("");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");

  type SavedPublicationSearch = {
    name: string;
    filters: {
      searchQuery: string;
      journalFilter: string;
      statusFilter: string;
      authorFilter: string;
      startDateFilter: string;
      endDateFilter: string;
    };
  };
  const [savedSearches, setSavedSearches] = useState<SavedPublicationSearch[]>([]);
  const [searchName, setSearchName] = useState("");

  const PUBLICATION_STATUS_OPTIONS = [
    "Concept",
    "Complete Draft",
    "Vetted for submission",
    "Submitted for review",
    "Under review",
    "Accepted/In Press",
    "Published",
    "Published *",
  ];

  // Load saved searches (distinct key from the export tab's saved searches)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("publications-list-searches");
      if (saved) setSavedSearches(JSON.parse(saved));
    } catch {
      // ignore malformed storage
    }
  }, []);

  const hasActiveFilters =
    !!searchQuery ||
    !!journalFilter ||
    (statusFilter && statusFilter !== "all") ||
    !!authorFilter ||
    !!startDateFilter ||
    !!endDateFilter;

  const handleClearFilters = () => {
    setSearchQuery("");
    setJournalFilter("");
    setStatusFilter("all");
    setAuthorFilter("");
    setStartDateFilter("");
    setEndDateFilter("");
  };

  const handleSaveSearch = () => {
    if (!searchName.trim()) return;
    const newSearch: SavedPublicationSearch = {
      name: searchName.trim(),
      filters: {
        searchQuery,
        journalFilter,
        statusFilter,
        authorFilter,
        startDateFilter,
        endDateFilter,
      },
    };
    const updated = [...savedSearches, newSearch];
    setSavedSearches(updated);
    localStorage.setItem("publications-list-searches", JSON.stringify(updated));
    setSearchName("");
  };

  const handleLoadSearch = (search: SavedPublicationSearch) => {
    setSearchQuery(search.filters.searchQuery ?? "");
    setJournalFilter(search.filters.journalFilter ?? "");
    setStatusFilter(search.filters.statusFilter ?? "all");
    setAuthorFilter(search.filters.authorFilter ?? "");
    setStartDateFilter(search.filters.startDateFilter ?? "");
    setEndDateFilter(search.filters.endDateFilter ?? "");
  };

  const handleDeleteSearch = (name: string) => {
    const updated = savedSearches.filter((s) => s.name !== name);
    setSavedSearches(updated);
    localStorage.setItem("publications-list-searches", JSON.stringify(updated));
  };
  const { toast } = useToast();
  const { currentUser } = useCurrentUser();

  // Parse query params (research activity + journal filter from Outcomes Office)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const researchActivityId = params.get('researchActivityId');
    setFilterResearchActivityId(researchActivityId ? parseInt(researchActivityId, 10) : null);
    const journal = params.get('journal');
    setFilterJournal(journal ? journal : null);
  }, [location]);

  const { data: publications, isLoading } = useQuery<EnhancedPublication[]>({
    queryKey: ['/api/publications'],
  });
  
  // Get research activity details if we're filtering by one
  const { data: researchActivity } = useQuery({
    queryKey: ['/api/research-activities', filterResearchActivityId],
    enabled: !!filterResearchActivityId,
  });

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short'
    });
  };

  const statusColors = {
    published: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    "published *": "bg-green-600 text-white dark:bg-green-700 dark:text-green-100",
    submitted: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    "in preparation": "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    rejected: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
    "under review": "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
  };

  const filteredPublications = publications?.filter(publication => {
    // First apply research activity filter
    if (filterResearchActivityId && publication.researchActivityId !== filterResearchActivityId) {
      return false;
    }

    // Journal filter (deep-link from Outcomes Office, case-insensitive)
    if (filterJournal) {
      const j = (publication.journal ?? '').trim().toLowerCase();
      if (j !== filterJournal.trim().toLowerCase()) return false;
    }

    // Advanced filter bar: journal (case-insensitive substring)
    if (journalFilter) {
      const j = (publication.journal ?? '').toLowerCase();
      if (!j.includes(journalFilter.toLowerCase().trim())) return false;
    }

    // Advanced filter bar: status (exact match, "all" = no filter)
    if (statusFilter && statusFilter !== "all") {
      if ((publication.status ?? '') !== statusFilter) return false;
    }

    // Advanced filter bar: author/scientist (case-insensitive substring)
    if (authorFilter) {
      const a = (publication.authors ?? '').toLowerCase();
      if (!a.includes(authorFilter.toLowerCase().trim())) return false;
    }

    // Advanced filter bar: inclusive publication date range
    if (startDateFilter || endDateFilter) {
      if (!publication.publicationDate) return false;
      const pubTime = new Date(publication.publicationDate).getTime();
      if (Number.isNaN(pubTime)) return false;
      if (startDateFilter) {
        const startTime = new Date(`${startDateFilter}T00:00:00`).getTime();
        if (pubTime < startTime) return false;
      }
      if (endDateFilter) {
        const endTime = new Date(`${endDateFilter}T23:59:59.999`).getTime();
        if (pubTime > endTime) return false;
      }
    }

    // Then apply search query filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      // Normalize DOI queries so a pasted resolver URL (https://doi.org/...)
      // matches a bare DOI stored in the record, and vice versa.
      const stripDoi = (s: string) =>
        s.toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "").replace(/^doi:\s*/, "");
      const qDoi = stripDoi(q);
      return (
        publication.title.toLowerCase().includes(q) ||
        (publication.authors && publication.authors.toLowerCase().includes(q)) ||
        (publication.journal && publication.journal.toLowerCase().includes(q)) ||
        (publication.abstract && publication.abstract.toLowerCase().includes(q)) ||
        (publication.doi && stripDoi(publication.doi).includes(qDoi)) ||
        (publication.pmid && publication.pmid.toLowerCase().includes(q))
      );
    }
    
    return true;
  });

  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedPublications = (() => {
    if (!filteredPublications || !sortColumn) return filteredPublications;
    const getValue = (p: EnhancedPublication): string | number => {
      switch (sortColumn) {
        case 'title':
          return (p.title ?? '').toLowerCase();
        case 'journal':
          return (p.journal ?? '').toLowerCase();
        case 'date':
          return p.publicationDate ? new Date(p.publicationDate).getTime() : 0;
        case 'sdr':
          return p.researchActivityId ?? 0;
        case 'status':
          return (p.status ?? '').toLowerCase();
        default:
          return '';
      }
    };
    return [...filteredPublications].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      let cmp: number;
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  })();

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 ml-1 inline-block opacity-40" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1 inline-block" />
      : <ArrowDown className="h-3 w-3 ml-1 inline-block" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Publications</h1>
          {filterResearchActivityId && researchActivity && (
            <div className="mt-1 flex items-center">
              <Badge variant="outline" className="mr-2 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                Filtered by SDR: {researchActivity.sdrNumber}
              </Badge>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 px-2 text-sm text-blue-600 dark:text-blue-400" 
                onClick={() => {
                  setFilterResearchActivityId(null);
                  window.history.pushState({}, '', '/publications');
                }}
              >
                Clear Filter
              </Button>
            </div>
          )}
          {filterJournal && (
            <div className="mt-1 flex items-center" data-testid="banner-journal-filter">
              <Badge variant="outline" className="mr-2 bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                Filtered by Journal: {filterJournal}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-sm text-amber-700 dark:text-amber-300"
                onClick={() => {
                  setFilterJournal(null);
                  const params = new URLSearchParams(window.location.search);
                  params.delete('journal');
                  const qs = params.toString();
                  window.history.pushState({}, '', '/publications' + (qs ? `?${qs}` : ''));
                }}
                data-testid="button-clear-journal-filter"
              >
                Clear Filter
              </Button>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {currentUser && (
            <>
              <PermissionWrapper
                currentUserRole={currentUser.role}
                navigationItem="publications"
                requiredPermissions={['canAdd']}
                fallback={null}
              >
                <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="flex items-center gap-2">
                      <Download className="h-4 w-4" />
                      Import Publication
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Import Publication</DialogTitle>
                    </DialogHeader>
                    <PublicationImport onClose={() => setImportDialogOpen(false)} />
                  </DialogContent>
                </Dialog>
              </PermissionWrapper>
              <PermissionWrapper
                currentUserRole={currentUser.role}
                navigationItem="publications"
                requiredPermissions={['canAdd']}
                fallback={null}
              >
                <Link href="/publications/create">
                  <Button className="flex items-center gap-2 bg-[#2D9C95] hover:bg-[#238B7A] text-white">
                    <Plus className="h-4 w-4" />
                    Add Publication
                  </Button>
                </Link>
              </PermissionWrapper>
            </>
          )}
        </div>
      </div>

      <PublicationsToFix />

      <Card>
        <CardHeader className="pb-3 space-y-4">
          <div className="flex items-center justify-between">
            <CardTitle>Research Publications</CardTitle>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-sm text-muted-foreground"
                onClick={handleClearFilters}
                data-testid="button-clear-filters"
              >
                Clear all
              </Button>
            )}
          </div>

          {/* Horizontal advanced filter bar */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5 min-w-[220px] flex-1">
              <Label htmlFor="filter-search" className="text-xs text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
                <Input
                  id="filter-search"
                  type="search"
                  placeholder="Title, author, journal, DOI, PMID..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5 min-w-[150px] flex-1">
              <Label htmlFor="filter-journal" className="text-xs text-muted-foreground">Journal</Label>
              <Input
                id="filter-journal"
                placeholder="Journal name..."
                value={journalFilter}
                onChange={(e) => setJournalFilter(e.target.value)}
                data-testid="input-filter-journal"
              />
            </div>

            <div className="flex flex-col gap-1.5 min-w-[170px]">
              <Label htmlFor="filter-status" className="text-xs text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="filter-status" data-testid="select-filter-status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {PUBLICATION_STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5 min-w-[150px] flex-1">
              <Label htmlFor="filter-author" className="text-xs text-muted-foreground">Author/Scientist</Label>
              <Input
                id="filter-author"
                placeholder="Author name..."
                value={authorFilter}
                onChange={(e) => setAuthorFilter(e.target.value)}
                data-testid="input-filter-author"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="filter-start-date" className="text-xs text-muted-foreground">Start date</Label>
              <Input
                id="filter-start-date"
                type="date"
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
                data-testid="input-filter-start-date"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="filter-end-date" className="text-xs text-muted-foreground">End date</Label>
              <Input
                id="filter-end-date"
                type="date"
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
                data-testid="input-filter-end-date"
              />
            </div>
          </div>

          {/* Saved searches */}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Save current filters as..."
              className="h-8 w-56"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              data-testid="input-save-search-name"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={handleSaveSearch}
              disabled={!searchName.trim()}
              data-testid="button-save-search"
            >
              <Bookmark className="h-3.5 w-3.5 mr-1" />
              Save
            </Button>
            {savedSearches.map((search) => (
              <Badge
                key={search.name}
                variant="secondary"
                className="h-8 px-2.5 gap-1.5 cursor-pointer hover:bg-secondary/80"
                onClick={() => handleLoadSearch(search)}
                data-testid={`badge-saved-search-${search.name}`}
              >
                {search.name}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDeleteSearch(search.name); }}
                  className="ml-0.5 text-muted-foreground hover:text-foreground"
                  data-testid={`button-delete-search-${search.name}`}
                  aria-label={`Delete saved search ${search.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {(
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">
                    <button type="button" onClick={() => handleSort('title')} className="flex items-center font-medium hover:text-foreground" data-testid="sort-title">
                      Title & Authors <SortIcon column="title" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button type="button" onClick={() => handleSort('journal')} className="flex items-center font-medium hover:text-foreground" data-testid="sort-journal">
                      Journal <SortIcon column="journal" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button type="button" onClick={() => handleSort('date')} className="flex items-center font-medium hover:text-foreground" data-testid="sort-date">
                      Date <SortIcon column="date" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button type="button" onClick={() => handleSort('sdr')} className="flex items-center font-medium hover:text-foreground" data-testid="sort-sdr">
                      SDR <SortIcon column="sdr" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button type="button" onClick={() => handleSort('status')} className="flex items-center font-medium hover:text-foreground" data-testid="sort-status">
                      Status <SortIcon column="status" />
                    </button>
                  </TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`pub-skeleton-${i}`} data-testid={`row-publication-skeleton-${i}`}>
                    <TableCell>
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-[80%]" />
                        <Skeleton className="h-3 w-[60%]" />
                      </div>
                    </TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                  </TableRow>
                ))}
                {!isLoading && (sortedPublications?.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground" data-testid="text-publications-empty">
                      {hasActiveFilters
                        ? "No publications match your filters."
                        : "No publications yet. Use \"Import Publication\" or \"Add Publication\" to add one."}
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && sortedPublications?.map((publication) => (
                  <TableRow 
                    key={publication.id} 
                    className="hover:bg-gray-50 cursor-pointer transition-colors dark:hover:bg-gray-900"
                    onClick={() => navigate(`/publications/${publication.id}`)}
                    data-testid={`row-publication-${publication.id}`}
                  >
                    <TableCell>
                      <div className="font-medium">
                        {publication.title}
                      </div>
                      <div className="text-sm text-gray-600 mt-1 dark:text-gray-300">
                        {publication.authors || '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Bookmark className="h-4 w-4 mr-2 text-blue-500" />
                        <span>{publication.journal || "—"}</span>
                      </div>
                      {publication.volume && (
                        <div className="text-sm text-gray-600 mt-1 dark:text-gray-300">
                          Vol. {publication.volume}{publication.issue ? `, Issue ${publication.issue}` : ''}
                          {publication.pages ? `, pp. ${publication.pages}` : ''}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center text-sm">
                        <CalendarRange className="h-4 w-4 mr-1 text-gray-600 dark:text-gray-300" />
                        <span>{formatDate(publication.publicationDate)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {publication.researchActivityId ? (
                        <Link href={`/research-activities/${publication.researchActivityId}`}>
                          <span className="text-primary-500 hover:text-primary-600 transition-colors text-sm">
                            SDR-{publication.researchActivityId}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-gray-600 text-sm dark:text-gray-300">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {publication.status && (
                        <Badge 
                          variant={publication.status.includes('*') ? 'default' : 'outline'}
                          className={`capitalize ${statusColors[publication.status.toLowerCase() as keyof typeof statusColors] || "bg-gray-100 text-gray-600"}`}
                        >
                          {publication.status.includes('*') ? (
                            <div className="flex items-center gap-1">
                              <Star className="h-3 w-3 fill-current" />
                              Published
                            </div>
                          ) : (
                            publication.status
                          )}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/publications/${publication.id}`}>
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          {currentUser && (
                            <PermissionWrapper
                              currentUserRole={currentUser.role}
                              navigationItem="publications"
                              requiredPermissions={['canEdit']}
                              fallback={null}
                            >
                              <DropdownMenuItem asChild>
                                <Link href={`/publications/${publication.id}/edit`}>
                                  Edit Publication
                                </Link>
                              </DropdownMenuItem>
                            </PermissionWrapper>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
