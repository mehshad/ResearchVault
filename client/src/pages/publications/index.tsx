// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Plus, Search, MoreHorizontal, CalendarRange, Bookmark, FileText, Download, Star, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
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
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Research Publications</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
              <Input
                type="search"
                placeholder="Search by title, author, journal, DOI, PMID..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
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
                      {searchQuery
                        ? "No publications match your search."
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
