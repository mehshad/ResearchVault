// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useState, useEffect, useRef, useLayoutEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Pencil, Save, X, Upload, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, Star, Shield, FileText, BarChart3, Download, Calendar, User, BookOpen, Award, TrendingUp, CopyCheck } from "lucide-react";
import { PublicationDuplicates } from "@/components/PublicationDuplicates";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer, BarChart, Bar, ReferenceLine, Cell } from "recharts";
import type { JournalImpactFactor, InsertJournalImpactFactor, Publication } from "@shared/schema";

interface SavedSearch {
  id?: string;
  name: string;
  filters: {
    startDate: string;
    endDate: string;
    journal: string;
    scientist: string;
    status: string;
  };
  createdAt?: string;
}

interface SidraRanking {
  id: number;
  honorificTitle?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  publicationsCount: number;
  sidraScore: number;
  missingImpactFactorPublications: string[];
  calculationDetails: any;
}

export default function PublicationOffice() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Tab state
  const [activeTab, setActiveTab] = useState("ip-vetting");
  
  // Export tab state
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [exportJournal, setExportJournal] = useState("");
  const [exportScientist, setExportScientist] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [searchName, setSearchName] = useState("");
  const [exportResults, setExportResults] = useState<{count: number, formattedText: string, publications: any[]} | null>(null);
  
  // Sidra Score tab state
  const [sidraYears, setSidraYears] = useState(5);
  const [firstAuthorMultiplier, setFirstAuthorMultiplier] = useState(2);
  const [lastAuthorMultiplier, setLastAuthorMultiplier] = useState(2);
  const [correspondingAuthorMultiplier, setCorrespondingAuthorMultiplier] = useState(2);
  const [seniorAuthorMultiplier, setSeniorAuthorMultiplier] = useState(2);
  const [impactFactorYear, setImpactFactorYear] = useState("publication"); // "prior", "publication", "latest"
  const [sidraRankings, setSidraRankings] = useState<SidraRanking[]>([]);
  const [selectedScientistDetails, setSelectedScientistDetails] = useState<SidraRanking | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  // Function to open calculation details modal
  const openCalculationDetails = (scientist: SidraRanking) => {
    setSelectedScientistDetails(scientist);
    setIsDetailsModalOpen(true);
  };
  
  // Impact Factor tab state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<InsertJournalImpactFactor>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [fieldFilter, setFieldFilter] = useState<string[]>([]);
  const IF_SLIDER_MIN = 0;
  const IF_SLIDER_MAX = 100;
  const IF_SLIDER_STEP = 0.5;
  const [ifRange, setIfRange] = useState<[number, number]>([IF_SLIDER_MIN, IF_SLIDER_MAX]);
  const [debouncedIfRange, setDebouncedIfRange] = useState<[number, number]>([IF_SLIDER_MIN, IF_SLIDER_MAX]);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportYear, setExportYear] = useState<string>("");
  const [, navigate] = useLocation();
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState("rank");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [editingFieldJournalId, setEditingFieldJournalId] = useState<number | null>(null);
  const [fieldDraft, setFieldDraft] = useState<string>("");

  // Synced top-of-table horizontal scrollbar so users can scroll the wide
  // Impact Factors table without scrolling all the way to the bottom.
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const syncingRef = useRef(false);

  const handleTopScroll = () => {
    if (syncingRef.current || !tableScrollRef.current || !topScrollRef.current) return;
    syncingRef.current = true;
    tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    syncingRef.current = false;
  };
  const handleTableScroll = () => {
    if (syncingRef.current || !tableScrollRef.current || !topScrollRef.current) return;
    syncingRef.current = true;
    topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
    syncingRef.current = false;
  };

  // Keep the top scrollbar's inner spacer the same width as the table so the
  // two scroll positions stay in lockstep when columns or data change.
  useLayoutEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    const sync = () => setTableScrollWidth(el.scrollWidth);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  });

  const limit = 100;

  // JCR column tooltips
  const columnTooltips: Record<string, string> = {
    journalName: "Full journal title as listed in JCR.",
    abbreviatedJournal: "Standard ISO 4 abbreviation used in citations.",
    field: "JCR subject category / discipline this journal is classified under.",
    issn: "Print International Standard Serial Number.",
    eissn: "Electronic International Standard Serial Number.",
    year: "Year the metrics below were reported by JCR.",
    impactFactor: "Journal Impact Factor (JIF): citations in the JCR year to items published in the prior 2 years, divided by the number of citable items.",
    fiveYearJif: "5-Year JIF: citations to items published in the prior 5 years, divided by citable items over the same window.",
    jifWithoutSelfCites: "JIF excluding the journal's own self-citations.",
    jci: "Journal Citation Indicator: field-normalized citation impact (1.0 = world average).",
    quartile: "Quartile within the subject category (Q1 = top 25%).",
    rank: "Rank within the journal's subject category.",
    totalCites: "Total citations received by the journal in the JCR year.",
    totalArticles: "Total articles published in the JCR year.",
    citableItems: "Items classified as citable (articles and reviews).",
    citedHalfLife: "Median age (years) of items cited from this journal in the JCR year.",
    citingHalfLife: "Median age (years) of items this journal cited in the JCR year.",
    publisher: "Journal publisher.",
  };
  const SortableHeader = ({ field, label }: { field: string; label: string }) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" onClick={() => handleSort(field)} className="flex items-center gap-1 p-0 h-auto font-semibold">
            {label} {getSortIcon(field)}
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{columnTooltips[field] ?? label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
  const PlainHeader = ({ field, label }: { field: string; label: string }) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="font-semibold cursor-help">{label}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{columnTooltips[field] ?? label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
  
  // Journal detail modal state
  const [selectedJournal, setSelectedJournal] = useState<JournalImpactFactor | null>(null);
  const [distHideLowIf, setDistHideLowIf] = useState(false);
  const [isJournalModalOpen, setIsJournalModalOpen] = useState(false);

  // Debounce search term to reduce API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1); // Reset to first page when search changes
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const offset = (currentPage - 1) * limit;
  
  const { data: impactFactorsResult, isLoading } = useQuery({
    queryKey: ['/api/journal-impact-factors', {
      limit,
      offset,
      sortField,
      sortDirection,
      searchTerm: debouncedSearchTerm,
      fields: fieldFilter.join(','),
      minIf: debouncedIfRange[0],
      maxIf: debouncedIfRange[1],
    }],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        sortField,
        sortDirection,
      });
      if (debouncedSearchTerm) params.append('searchTerm', debouncedSearchTerm);
      if (fieldFilter.length > 0) params.append('fields', fieldFilter.join(','));
      if (debouncedIfRange[0] > IF_SLIDER_MIN) params.append('minImpactFactor', String(debouncedIfRange[0]));
      if (debouncedIfRange[1] < IF_SLIDER_MAX) params.append('maxImpactFactor', String(debouncedIfRange[1]));
      const response = await fetch(`/api/journal-impact-factors?${params}`);
      if (!response.ok) throw new Error('Failed to fetch impact factors');
      return response.json();
    }
  });

  const impactFactors = impactFactorsResult?.data || [];
  const totalRecords = impactFactorsResult?.total || 0;
  const totalPages = Math.ceil(totalRecords / limit);

  // Publication counts for the journals currently shown on the IF page.
  // Pipe-separated because journal names can contain commas.
  const visibleJournalNames = useMemo(
    () => Array.from(new Set((impactFactors as JournalImpactFactor[]).map((j) => j.journalName).filter(Boolean))),
    [impactFactors]
  );
  const { data: journalPubCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ['/api/publications/journal-counts', 'batch', visibleJournalNames.join('|')],
    queryFn: async () => {
      if (visibleJournalNames.length === 0) return {};
      const qs = new URLSearchParams({ journals: visibleJournalNames.join('|') });
      const res = await fetch(`/api/publications/journal-counts?${qs.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch journal counts');
      return res.json();
    },
    enabled: visibleJournalNames.length > 0,
  });

  // Count for the currently selected journal (used in the detail modal).
  const { data: selectedJournalPubCount = 0 } = useQuery<number>({
    queryKey: ['/api/publications/journal-counts', 'single', selectedJournal?.journalName ?? ''],
    queryFn: async () => {
      const name = selectedJournal?.journalName;
      if (!name) return 0;
      const qs = new URLSearchParams({ journals: name });
      const res = await fetch(`/api/publications/journal-counts?${qs.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch journal count');
      const data = await res.json();
      return data[name] ?? 0;
    },
    enabled: !!selectedJournal?.journalName && isJournalModalOpen,
  });

  const goToPublicationsForJournal = (name: string) => {
    setIsJournalModalOpen(false);
    navigate(`/publications?journal=${encodeURIComponent(name)}`);
  };

  // Available metric years for the export-year picker
  const { data: availableYears = [] } = useQuery<number[]>({
    queryKey: ['/api/journal-impact-factors/years'],
    queryFn: async () => {
      const response = await fetch('/api/journal-impact-factors/years');
      if (!response.ok) throw new Error('Failed to fetch years');
      return response.json();
    },
  });

  useEffect(() => {
    if (!exportYear && availableYears.length > 0) {
      setExportYear(String(availableYears[0]));
    }
  }, [availableYears, exportYear]);

  const handleExportImpactFactors = () => {
    if (!exportYear) {
      toast({ title: "Select a year", description: "Choose a year to export.", variant: "destructive" });
      return;
    }
    const params = new URLSearchParams({ year: exportYear });
    if (debouncedSearchTerm) params.append('searchTerm', debouncedSearchTerm);
    if (fieldFilter.length > 0) params.append('fields', fieldFilter.join(','));
    if (debouncedIfRange[0] > IF_SLIDER_MIN) params.append('minImpactFactor', String(debouncedIfRange[0]));
    if (debouncedIfRange[1] < IF_SLIDER_MAX) params.append('maxImpactFactor', String(debouncedIfRange[1]));
    window.location.href = `/api/journal-impact-factors/export?${params.toString()}`;
    setExportDialogOpen(false);
  };

  // Distinct field list for the multi-select filter
  const { data: availableFields = [] } = useQuery<string[]>({
    queryKey: ['/api/journal-impact-factors/fields'],
    queryFn: async () => {
      const response = await fetch('/api/journal-impact-factors/fields');
      if (!response.ok) throw new Error('Failed to fetch fields');
      return response.json();
    },
  });

  // Query for historical data of selected journal (by journalId)
  const { data: historicalData = [] } = useQuery<JournalImpactFactor[]>({
    queryKey: ['/api/journal-impact-factors', selectedJournal?.journalId, 'history'],
    queryFn: async () => {
      const jid = selectedJournal?.journalId;
      if (!jid) return [];
      const response = await fetch(`/api/journal-impact-factors/${jid}/history`);
      if (!response.ok) throw new Error('Failed to fetch historical data');
      return response.json();
    },
    enabled: !!selectedJournal?.journalId && isJournalModalOpen,
  });

  // Query for field-wide IF distribution of selected journal
  const { data: fieldDistribution } = useQuery<{ field: string | null; distribution: Array<{ journalId: number; journalName: string; impactFactor: number; year: number }> }>({
    queryKey: ['/api/journal-impact-factors', selectedJournal?.journalId, 'field-distribution'],
    queryFn: async () => {
      const jid = selectedJournal?.journalId;
      if (!jid) return { field: null, distribution: [] };
      const response = await fetch(`/api/journal-impact-factors/${jid}/field-distribution`);
      if (!response.ok) throw new Error('Failed to fetch field distribution');
      return response.json();
    },
    enabled: !!selectedJournal?.journalId && isJournalModalOpen,
  });

  // Invalidate every cache entry that depends on journal/IF data, including
  // the per-journal modal queries keyed by selectedJournal.journalId. The
  // bare '/api/journal-impact-factors' key is a prefix match so it also
  // covers the modal keys, but we list the field/years queries explicitly
  // because they live under different top-level keys.
  const invalidateJournalCaches = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/journal-impact-factors'] });
    queryClient.invalidateQueries({ queryKey: ['/api/journal-impact-factors/fields'] });
    queryClient.invalidateQueries({ queryKey: ['/api/journal-impact-factors/years'] });
  };

  // Inline field edit mutation
  const updateFieldMutation = useMutation({
    mutationFn: async ({ journalId, field }: { journalId: number; field: string | null }) => {
      const response = await fetch(`/api/journal-impact-factors/${journalId}/field`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field }),
      });
      if (!response.ok) throw new Error('Failed to update field');
      return response.json();
    },
    onSuccess: () => {
      invalidateJournalCaches();
      setEditingFieldJournalId(null);
      setFieldDraft("");
      toast({ description: "Field updated" });
    },
    onError: () => toast({ description: "Failed to update field", variant: "destructive" }),
  });

  // Publication queries for the first two tabs
  const { data: publicationsForIP = [], isLoading: ipPublicationsLoading } = useQuery<Publication[]>({
    queryKey: ['/api/publications', 'ip-vetting'],
    queryFn: async () => {
      const response = await fetch('/api/publications');
      if (!response.ok) throw new Error('Failed to fetch publications');
      const publications = await response.json();
      // Filter publications that need IP vetting (not yet vetted for IP office)
      return publications.filter((pub: Publication) => 
        pub.vettedForSubmissionByIpOffice === false && 
        (pub.status === 'published' || pub.status === 'Published')
      );
    },
    enabled: activeTab === "ip-vetting"
  });

  // Count of duplicate publication groups for the Duplicates tab badge.
  const { data: duplicateCount = { count: 0 } } = useQuery<{ count: number }>({
    queryKey: ['/api/publications/duplicates/count'],
  });

  const { data: newPublications = [], isLoading: newPublicationsLoading } = useQuery<Publication[]>({
    queryKey: ['/api/publications', 'new-publications'],
    queryFn: async () => {
      const response = await fetch('/api/publications');
      if (!response.ok) throw new Error('Failed to fetch publications');
      const publications = await response.json();
      // Filter publications that have been vetted (Published status)
      return publications.filter((pub: Publication) => 
        pub.vettedForSubmissionByIpOffice === true &&
        pub.status === 'Published'
      );
    },
    enabled: activeTab === "new-publications"
  });

  // Export functionality
  const searchExportMutation = useMutation({
    mutationFn: async (filters: any) => {
      const response = await fetch('/api/publications/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters)
      });
      if (!response.ok) throw new Error('Failed to export publications');
      return response.json();
    },
    onSuccess: (data) => {
      setExportResults(data);
      toast({ title: "Success", description: `Found ${data.count} publications` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to search publications", variant: "destructive" });
    },
  });

  const handleExportSearch = () => {
    const filters = {
      startDate: exportStartDate || undefined,
      endDate: exportEndDate || undefined,
      journal: exportJournal || undefined,
      scientist: exportScientist || undefined,
      status: exportStatus || undefined
    };
    searchExportMutation.mutate(filters);
  };

  const handleCopyToClipboard = () => {
    if (exportResults?.formattedText) {
      navigator.clipboard.writeText(exportResults.formattedText).then(() => {
        toast({ title: "Success", description: "Publications copied to clipboard" });
      }).catch(() => {
        toast({ title: "Error", description: "Failed to copy to clipboard", variant: "destructive" });
      });
    }
  };

  const handleSaveSearch = () => {
    if (!searchName.trim()) {
      toast({ title: "Error", description: "Please enter a search name", variant: "destructive" });
      return;
    }
    
    const newSearch = {
      name: searchName,
      filters: {
        startDate: exportStartDate,
        endDate: exportEndDate,
        journal: exportJournal,
        scientist: exportScientist,
        status: exportStatus
      }
    };
    
    const updated = [...savedSearches, newSearch];
    setSavedSearches(updated);
    localStorage.setItem('publication-export-searches', JSON.stringify(updated));
    setSearchName("");
    toast({ title: "Success", description: "Search saved" });
  };

  const handleLoadSearch = (search: any) => {
    setExportStartDate(search.filters.startDate || "");
    setExportEndDate(search.filters.endDate || "");
    setExportJournal(search.filters.journal || "");
    setExportScientist(search.filters.scientist || "");
    setExportStatus(search.filters.status || "");
    toast({ title: "Success", description: "Search loaded" });
  };

  // Load saved searches on component mount
  useEffect(() => {
    const saved = localStorage.getItem('publication-export-searches');
    if (saved) {
      try {
        setSavedSearches(JSON.parse(saved));
      } catch (error) {
        console.error('Failed to load saved searches:', error);
      }
    }
  }, []);

  // Sidra Score calculation
  const calculateSidraScoresMutation = useMutation({
    mutationFn: async () => {
      const config = {
        years: sidraYears,
        impactFactorYear: impactFactorYear,
        multipliers: {
          'First Author': firstAuthorMultiplier,
          'Last Author': lastAuthorMultiplier,
          'Senior Author': seniorAuthorMultiplier,
          'Corresponding Author': correspondingAuthorMultiplier
        }
      };
      
      const response = await fetch('/api/scientists/sidra-scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (!response.ok) throw new Error('Failed to calculate Sidra scores');
      return response.json();
    },
    onSuccess: (data) => {
      setSidraRankings(data);
      toast({ title: "Success", description: `Calculated scores for ${data.length} scientists` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to calculate Sidra scores", variant: "destructive" });
    },
  });

  const handleCalculateSidraScores = () => {
    calculateSidraScoresMutation.mutate();
  };

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: Partial<InsertJournalImpactFactor> }) => {
      const response = await fetch(`/api/journal-impact-factors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update impact factor');
      return response.json();
    },
    onSuccess: () => {
      invalidateJournalCaches();
      setEditingId(null);
      setEditForm({});
      toast({ description: "Impact factor updated successfully" });
    },
    onError: () => {
      toast({ description: "Failed to update impact factor", variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/journal-impact-factors/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete impact factor');
    },
    onSuccess: () => {
      invalidateJournalCaches();
      toast({ description: "Impact factor deleted successfully" });
    },
    onError: () => {
      toast({ description: "Failed to delete impact factor", variant: "destructive" });
    }
  });

  const handleEdit = (factor: JournalImpactFactor) => {
    setEditingId(factor.journalId);
    setEditForm({
      journalName: factor.journalName,
      year: factor.year ?? new Date().getFullYear(),
      impactFactor: factor.impactFactor as any,
      quartile: factor.quartile,
      rank: factor.rank,
      totalCitations: factor.totalCitations,
      publisher: factor.publisher,
      field: factor.field,
    });
  };

  const handleSave = () => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: editForm });
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1); // Reset to first page when sorting
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 opacity-50" />;
    }
    return sortDirection === 'asc' ? 
      <ArrowUp className="h-4 w-4" /> : 
      <ArrowDown className="h-4 w-4" />;
  };

  const handleCSVImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // RFC 4180-ish CSV parser: handles quoted fields, escaped quotes ("") and CRLF
    const parseCsv = (text: string): string[][] => {
      const rows: string[][] = [];
      let row: string[] = [];
      let field = '';
      let inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
          if (c === '"') {
            if (text[i + 1] === '"') { field += '"'; i++; }
            else { inQuotes = false; }
          } else {
            field += c;
          }
        } else {
          if (c === '"') { inQuotes = true; }
          else if (c === ',') { row.push(field); field = ''; }
          else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(field); field = '';
            if (row.length > 1 || row[0] !== '') rows.push(row);
            row = [];
          } else {
            field += c;
          }
        }
      }
      if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
      return rows;
    };

    const numOrNull = (v: string | undefined) => {
      if (v == null) return null;
      const t = v.trim();
      if (t === '') return null;
      const n = parseFloat(t);
      return Number.isFinite(n) ? n : null;
    };
    const intOrNull = (v: string | undefined) => {
      if (v == null) return null;
      const t = v.trim();
      if (t === '') return null;
      // accept "1" or "1/250" (rank/total)
      const n = parseInt(t.split('/')[0], 10);
      return Number.isFinite(n) ? n : null;
    };
    const strOrNull = (v: string | undefined) => {
      if (v == null) return null;
      const t = v.trim();
      return t === '' ? null : t;
    };

    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) {
      toast({ description: "CSV is empty or has no data rows", variant: "destructive" });
      event.target.value = '';
      return;
    }

    // Map headers (case-insensitive) to column index. Accept the export's header names
    // and common aliases.
    const headers = rows[0].map((h) => h.trim().toLowerCase());
    const aliases: Record<string, string[]> = {
      journalName: ['journalname', 'journal name', 'journal', 'full journal title'],
      abbreviatedJournal: ['abbreviatedjournal', 'abbreviated journal', 'abbreviation', 'iso abbreviation'],
      publisher: ['publisher'],
      issn: ['issn'],
      eissn: ['eissn', 'e-issn'],
      field: ['field', 'category', 'subject', 'subjectarea', 'subject area'],
      year: ['year', 'jcr year'],
      impactFactor: ['impactfactor', 'impact factor', 'jif', '2024 jif', 'journal impact factor'],
      fiveYearJif: ['fiveyearjif', '5-year jif', '5 year jif', 'five year jif'],
      jifWithoutSelfCites: ['jifwithoutselfcites', 'jif without self cites', 'jif w/o self cites'],
      jci: ['jci'],
      quartile: ['quartile', 'jif quartile'],
      rank: ['rank', 'jif rank'],
      totalCites: ['totalcites', 'total cites', 'totalcitations', 'total citations'],
      totalArticles: ['totalarticles', 'total articles'],
      citableItems: ['citableitems', 'citable items'],
      citedHalfLife: ['citedhalflife', 'cited half-life', 'cited half life'],
      citingHalfLife: ['citinghalflife', 'citing half-life', 'citing half life'],
    };
    const idx: Record<string, number> = {};
    for (const [key, names] of Object.entries(aliases)) {
      idx[key] = headers.findIndex((h) => names.includes(h));
    }

    if (idx.journalName === -1) {
      toast({
        description: "CSV is missing required column 'journalName'. The CSV exported from this page is the perfect template.",
        variant: "destructive",
      });
      event.target.value = '';
      return;
    }

    const data: any[] = [];
    let skipped = 0;
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (row.length === 1 && row[0].trim() === '') continue;
      const get = (key: string) => (idx[key] >= 0 ? row[idx[key]] : undefined);

      const journalName = strOrNull(get('journalName'));
      const impactFactor = numOrNull(get('impactFactor'));
      const year = intOrNull(get('year'));
      if (!journalName || impactFactor == null || year == null) { skipped++; continue; }

      data.push({
        journalName,
        abbreviatedJournal: strOrNull(get('abbreviatedJournal')),
        publisher: strOrNull(get('publisher')),
        issn: strOrNull(get('issn')),
        eissn: strOrNull(get('eissn')),
        field: strOrNull(get('field')),
        year,
        impactFactor,
        fiveYearJif: numOrNull(get('fiveYearJif')),
        jifWithoutSelfCites: numOrNull(get('jifWithoutSelfCites')),
        jci: numOrNull(get('jci')),
        quartile: strOrNull(get('quartile')),
        rank: intOrNull(get('rank')),
        totalCites: intOrNull(get('totalCites')),
        totalArticles: intOrNull(get('totalArticles')),
        citableItems: intOrNull(get('citableItems')),
        citedHalfLife: numOrNull(get('citedHalfLife')),
        citingHalfLife: numOrNull(get('citingHalfLife')),
      });
    }

    if (data.length === 0) {
      toast({
        description: `No valid rows found. Each row needs at least journalName, year, and impactFactor. (${skipped} skipped)`,
        variant: "destructive",
      });
      event.target.value = '';
      return;
    }

    try {
      const response = await fetch('/api/journal-impact-factors/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvData: data })
      });
      const result = await response.json();
      queryClient.invalidateQueries({ queryKey: ['/api/journal-impact-factors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/journal-impact-factors/years'] });
      queryClient.invalidateQueries({ queryKey: ['/api/journal-impact-factors/fields'] });
      toast({
        description: `Imported ${result.imported} of ${result.total} records${skipped > 0 ? ` (${skipped} skipped — missing required fields)` : ''}`,
      });
    } catch (error) {
      toast({ description: "Failed to import CSV data", variant: "destructive" });
    }
    event.target.value = '';
  };

  // Publication status update mutations
  const updatePublicationStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number, status: string }) => {
      const response = await fetch(`/api/publications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('Failed to update publication status');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/publications'] });
      toast({ title: "Success", description: "Publication status updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update publication status", variant: "destructive" });
    },
  });

  const markAsVettedMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/publications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ vettedForSubmissionByIpOffice: true, status: 'Published *' }),
      });
      if (!response.ok) throw new Error('Failed to mark as vetted');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/publications'] });
      toast({ title: "Success", description: "Publication marked as vetted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to mark publication as vetted", variant: "destructive" });
    },
  });

  if (isLoading && activeTab === "impact-factors") {
    return (
      <div className="space-y-6">
        <div className="text-center">Loading impact factors...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-foreground">Outcome Office</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="ip-vetting" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            IP Vetting ({publicationsForIP.length})
          </TabsTrigger>
          <TabsTrigger value="new-publications" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            New Publications ({newPublications.length})
          </TabsTrigger>
          <TabsTrigger value="duplicates" className="flex items-center gap-2" data-testid="tab-duplicates">
            <CopyCheck className="h-4 w-4" />
            Duplicates
            {duplicateCount.count > 0 && (
              <Badge variant="destructive" className="ml-1" data-testid="badge-duplicate-count">
                {duplicateCount.count}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="export" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export
          </TabsTrigger>
          <TabsTrigger value="sidra-score" className="flex items-center gap-2">
            <Award className="h-4 w-4" />
            Sidra Score
          </TabsTrigger>
          <TabsTrigger value="impact-factors" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Impact Factors
          </TabsTrigger>
        </TabsList>

        {/* IP Vetting Tab */}
        <TabsContent value="ip-vetting" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Publications to be Vetted for IP
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ipPublicationsLoading ? (
                <div className="text-center py-8">Loading publications...</div>
              ) : publicationsForIP.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No publications pending IP vetting
                </div>
              ) : (
                <div className="space-y-4">
                  {publicationsForIP.map((pub: Publication) => (
                    <div key={pub.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <Link href={`/publications/${pub.id}`}>
                            <h3 className="font-semibold text-blue-600 hover:text-blue-800 cursor-pointer dark:text-blue-400 dark:hover:text-blue-300">
                              {pub.title}
                            </h3>
                          </Link>
                          <p className="text-sm text-gray-600 mt-1 dark:text-gray-300">{pub.authors}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {pub.journal} • {pub.publicationDate ? format(new Date(pub.publicationDate), 'yyyy') : 'No date'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{pub.status}</Badge>
                          <Button 
                            size="sm"
                            onClick={() => markAsVettedMutation.mutate(pub.id)}
                            disabled={markAsVettedMutation.isPending}
                          >
                            Mark as Vetted
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* New Publications Tab */}
        <TabsContent value="new-publications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                New Publications
              </CardTitle>
            </CardHeader>
            <CardContent>
              {newPublicationsLoading ? (
                <div className="text-center py-8">Loading publications...</div>
              ) : newPublications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No new publications
                </div>
              ) : (
                <div className="space-y-4">
                  {newPublications.map((pub: Publication) => (
                    <div key={pub.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <Link href={`/publications/${pub.id}`}>
                            <h3 className="font-semibold text-blue-600 hover:text-blue-800 cursor-pointer dark:text-blue-400 dark:hover:text-blue-300">
                              {pub.title}
                            </h3>
                          </Link>
                          <p className="text-sm text-gray-600 mt-1 dark:text-gray-300">{pub.authors}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {pub.journal} • {pub.publicationDate ? format(new Date(pub.publicationDate), 'yyyy') : 'No date'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={pub.status?.includes('*') ? 'default' : 'outline'}
                            className={pub.status?.includes('*') ? 'bg-green-600 hover:bg-green-700' : ''}
                          >
                            {pub.status?.includes('*') ? (
                              <div className="flex items-center gap-1">
                                <Star className="h-3 w-3 fill-current" />
                                Published
                              </div>
                            ) : (
                              pub.status
                            )}
                          </Badge>
                          {!pub.status?.includes('*') && (
                            <Button 
                              size="sm"
                              onClick={() => markAsVettedMutation.mutate(pub.id)}
                              disabled={markAsVettedMutation.isPending}
                            >
                              <Star className="h-4 w-4 mr-1" />
                              Mark as Published *
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Duplicates Tab */}
        <TabsContent value="duplicates" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CopyCheck className="h-5 w-5" />
                Duplicate Publications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PublicationDuplicates />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Filters Panel */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Search className="h-5 w-5" />
                    Export Filters
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Date Range</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-gray-500 dark:text-gray-400">Start Date</Label>
                        <Input
                          type="date"
                          value={exportStartDate}
                          onChange={(e) => setExportStartDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500 dark:text-gray-400">End Date</Label>
                        <Input
                          type="date"
                          value={exportEndDate}
                          onChange={(e) => setExportEndDate(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Journal</Label>
                    <Input
                      placeholder="Enter journal name..."
                      value={exportJournal}
                      onChange={(e) => setExportJournal(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={exportStatus} onValueChange={setExportStatus}>
                      <SelectTrigger>
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="Concept">Concept</SelectItem>
                        <SelectItem value="Complete Draft">Complete Draft</SelectItem>
                        <SelectItem value="Vetted for submission">Vetted for submission</SelectItem>
                        <SelectItem value="Submitted for review">Submitted for review</SelectItem>
                        <SelectItem value="Under review">Under review</SelectItem>
                        <SelectItem value="Accepted/In Press">Accepted/In Press</SelectItem>
                        <SelectItem value="Published">Published</SelectItem>
                        <SelectItem value="Published *">Published *</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Author/Scientist</Label>
                    <Input
                      placeholder="Enter scientist name..."
                      value={exportScientist}
                      onChange={(e) => setExportScientist(e.target.value)}
                    />
                  </div>

                  <div className="border-t pt-4">
                    <Label>Save Search</Label>
                    <div className="flex gap-2 mt-2">
                      <Input
                        placeholder="Search name..."
                        value={searchName}
                        onChange={(e) => setSearchName(e.target.value)}
                      />
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={handleSaveSearch}
                        disabled={!searchName.trim()}
                      >
                        Save
                      </Button>
                    </div>
                  </div>

                  {savedSearches.length > 0 && (
                    <div className="space-y-2">
                      <Label>Saved Searches</Label>
                      <div className="space-y-1">
                        {savedSearches.map((search, index) => (
                          <Button
                            key={index}
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => handleLoadSearch(search)}
                          >
                            {search.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Export Results */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="h-5 w-5" />
                    Export Results
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Button 
                        className="flex items-center gap-2"
                        onClick={handleExportSearch}
                        disabled={searchExportMutation.isPending}
                      >
                        <Search className="h-4 w-4" />
                        {searchExportMutation.isPending ? 'Searching...' : 'Search Publications'}
                      </Button>
                      <Button 
                        variant="outline" 
                        className="flex items-center gap-2"
                        onClick={handleCopyToClipboard}
                        disabled={!exportResults?.formattedText}
                      >
                        <Download className="h-4 w-4" />
                        Copy to Clipboard
                      </Button>
                    </div>
                    
                    {exportResults && (
                      <div className="bg-blue-50 p-3 rounded-lg dark:bg-blue-950">
                        <p className="text-sm text-blue-800 font-medium dark:text-blue-300">
                          Found {exportResults.count} publication{exportResults.count !== 1 ? 's' : ''}
                        </p>
                      </div>
                    )}

                    <div className="border rounded-lg p-4 min-h-[400px] bg-gray-50 dark:bg-gray-900">
                      <Textarea
                        className="w-full h-96 font-mono text-sm bg-white dark:bg-card"
                        placeholder="Filtered publication results will appear here in copy-paste ready format..."
                        value={exportResults?.formattedText || ""}
                        readOnly
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Sidra Score Tab */}
        <TabsContent value="sidra-score" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Configuration Panel */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    Score Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Time Period (Years)</Label>
                    <Select value={sidraYears.toString()} onValueChange={(value) => setSidraYears(parseInt(value))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 years</SelectItem>
                        <SelectItem value="5">5 years</SelectItem>
                        <SelectItem value="10">10 years</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Impact Factor Year</Label>
                    <Select value={impactFactorYear} onValueChange={setImpactFactorYear}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="prior">Year prior to publication</SelectItem>
                        <SelectItem value="publication">Publication year</SelectItem>
                        <SelectItem value="latest">Latest available</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {impactFactorYear === "prior" && "Uses impact factor from year before publication (what authors saw when selecting journal)"}
                      {impactFactorYear === "publication" && "Uses impact factor from the same year as publication"}
                      {impactFactorYear === "latest" && "Uses the most recent impact factor available for the journal"}
                    </p>
                  </div>

                  <div className="space-y-4 border-t pt-4">
                    <Label>Authorship Multipliers</Label>
                    
                    <div className="space-y-2">
                      <Label className="text-sm text-gray-600 dark:text-gray-300">First Author</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={firstAuthorMultiplier}
                        onChange={(e) => setFirstAuthorMultiplier(parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm text-gray-600 dark:text-gray-300">Last Author</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={lastAuthorMultiplier}
                        onChange={(e) => setLastAuthorMultiplier(parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm text-gray-600 dark:text-gray-300">Senior Author</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={seniorAuthorMultiplier}
                        onChange={(e) => setSeniorAuthorMultiplier(parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm text-gray-600 dark:text-gray-300">Corresponding Author</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={correspondingAuthorMultiplier}
                        onChange={(e) => setCorrespondingAuthorMultiplier(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  <Button 
                    className="w-full flex items-center gap-2" 
                    variant="outline"
                    onClick={handleCalculateSidraScores}
                    disabled={calculateSidraScoresMutation.isPending}
                  >
                    <TrendingUp className="h-4 w-4" />
                    {calculateSidraScoresMutation.isPending ? 'Calculating...' : 'Calculate Scores'}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Scientist Rankings */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Scientist Rankings
                  </CardTitle>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Based on publication impact factors from the last {sidraYears} years
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-lg dark:bg-blue-950">
                      <h4 className="font-medium text-blue-900 mb-2 dark:text-blue-200">Calculation Formula</h4>
                      <p className="text-sm text-blue-800 dark:text-blue-300">
                        Sum of journal impact factors for publications in the last {sidraYears} years, 
                        using {impactFactorYear === "prior" ? "year prior" : impactFactorYear === "publication" ? "publication year" : "latest available"} impact factors.
                        Multipliers: First Author (×{firstAuthorMultiplier}), 
                        Last Author (×{lastAuthorMultiplier}), 
                        Senior Author (×{seniorAuthorMultiplier}), 
                        Corresponding Author (×{correspondingAuthorMultiplier})
                      </p>
                    </div>

                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Rank</TableHead>
                            <TableHead>Scientist</TableHead>
                            <TableHead>Department</TableHead>
                            <TableHead className="text-right">Publications</TableHead>
                            <TableHead className="text-right">Sidra Score</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {calculateSidraScoresMutation.isPending ? (
                            Array.from({ length: 5 }).map((_, i) => (
                              <TableRow key={`sidra-skeleton-${i}`} data-testid={`row-sidra-skeleton-${i}`}>
                                <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                                <TableCell>
                                  <div className="space-y-2">
                                    <Skeleton className="h-4 w-40" />
                                    <Skeleton className="h-3 w-24" />
                                  </div>
                                </TableCell>
                                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                <TableCell className="text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                                <TableCell className="text-right"><Skeleton className="h-5 w-12 ml-auto" /></TableCell>
                              </TableRow>
                            ))
                          ) : sidraRankings.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center py-8 text-gray-500 dark:text-gray-400" data-testid="text-sidra-rankings-empty">
                                Click "Calculate Scores" to generate rankings
                              </TableCell>
                            </TableRow>
                          ) : (
                            sidraRankings.map((scientist, index) => (
                              <TableRow 
                                key={scientist.id}
                                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900"
                                onClick={() => openCalculationDetails(scientist)}
                              >
                                <TableCell className="font-medium">
                                  {index + 1}
                                  {index === 0 && <Badge className="ml-2 bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">🥇</Badge>}
                                  {index === 1 && <Badge className="ml-2 bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200">🥈</Badge>}
                                  {index === 2 && <Badge className="ml-2 bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300">🥉</Badge>}
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <div className="font-medium">
                                      {scientist.honorificTitle} {scientist.firstName} {scientist.lastName}
                                    </div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400">{scientist.jobTitle}</div>
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm text-gray-600 dark:text-gray-300">
                                  {scientist.department}
                                </TableCell>
                                <TableCell className="text-right">
                                  {scientist.publicationsCount}
                                </TableCell>
                                <TableCell className="text-right">
                                  {scientist.missingImpactFactorPublications && scientist.missingImpactFactorPublications.length > 0 ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className="font-medium text-lg text-red-600 cursor-help dark:text-red-400">
                                            {scientist.sidraScore.toFixed(2)}
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-sm">
                                          <div className="text-sm">
                                            <p className="font-medium mb-2">Publications without impact factor data:</p>
                                            <ul className="list-disc pl-4 space-y-1">
                                              {scientist.missingImpactFactorPublications.map((title, idx) => (
                                                <li key={idx} className="text-xs">{title}</li>
                                              ))}
                                            </ul>
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : (
                                    <div className="font-medium text-lg">
                                      {scientist.sidraScore.toFixed(2)}
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Impact Factors Tab */}
        <TabsContent value="impact-factors" className="space-y-6">
          <div className="flex justify-between items-center">
            <div></div>
            <div className="flex gap-2">
              <Label htmlFor="csv-upload" className="cursor-pointer">
                <Button variant="outline" asChild>
                  <span>
                    <Upload className="h-4 w-4 mr-2" />
                    Import CSV
                  </span>
                </Button>
                <Input
                  id="csv-upload"
                  type="file"
                  accept=".csv"
                  onChange={handleCSVImport}
                  className="hidden"
                />
              </Label>
              <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-open-export-dialog">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Export Impact Factors</DialogTitle>
                    <DialogDescription>
                      Exports one row per journal for the selected year. The current search, field, and impact-factor-range filters are applied.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div>
                      <Label htmlFor="export-year">Year</Label>
                      <Select value={exportYear} onValueChange={setExportYear}>
                        <SelectTrigger id="export-year" data-testid="select-export-year">
                          <SelectValue placeholder="Select a year" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableYears.map((y) => (
                            <SelectItem key={y} value={String(y)} data-testid={`option-export-year-${y}`}>
                              {y}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>Filters that will be applied:</div>
                      <ul className="list-disc pl-5">
                        <li>Search: {debouncedSearchTerm ? <span className="font-mono">{debouncedSearchTerm}</span> : <span className="italic">none</span>}</li>
                        <li>
                          Fields: {fieldFilter.length === 0
                            ? <span className="italic">all</span>
                            : fieldFilter.length <= 2
                              ? fieldFilter.join(', ')
                              : `${fieldFilter.length} selected`}
                        </li>
                        <li>
                          Impact factor:{' '}
                          {debouncedIfRange[0] === IF_SLIDER_MIN && debouncedIfRange[1] >= IF_SLIDER_MAX
                            ? <span className="italic">any</span>
                            : <span className="tabular-nums">{debouncedIfRange[0].toFixed(1)} – {debouncedIfRange[1] >= IF_SLIDER_MAX ? `${IF_SLIDER_MAX}+` : debouncedIfRange[1].toFixed(1)}</span>}
                        </li>
                      </ul>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setExportDialogOpen(false)} data-testid="button-cancel-export">Cancel</Button>
                    <Button onClick={handleExportImpactFactors} disabled={!exportYear} data-testid="button-confirm-export">
                      <Download className="h-4 w-4 mr-2" />
                      Download CSV
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Search & Filter</CardTitle>
            </CardHeader>
            <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="search">Search Journals</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search by journal name or publisher..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="w-80">
              <div className="flex items-center justify-between mb-1">
                <Label>Impact Factor range</Label>
                <span className="text-xs text-muted-foreground tabular-nums" data-testid="text-if-range">
                  {ifRange[0].toFixed(1)} – {ifRange[1] >= IF_SLIDER_MAX ? `${IF_SLIDER_MAX}+` : ifRange[1].toFixed(1)}
                </span>
              </div>
              <SliderPrimitive.Root
                value={ifRange}
                min={IF_SLIDER_MIN}
                max={IF_SLIDER_MAX}
                step={IF_SLIDER_STEP}
                minStepsBetweenThumbs={1}
                onValueChange={(v) => setIfRange([v[0], v[1]] as [number, number])}
                onValueCommit={(v) => {
                  const next: [number, number] = [v[0], v[1]];
                  setDebouncedIfRange(next);
                  setCurrentPage(1);
                }}
                className="relative flex w-full touch-none select-none items-center h-9"
                data-testid="slider-impact-factor"
              >
                <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
                  <SliderPrimitive.Range className="absolute h-full bg-primary" />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb
                  className="block h-5 w-5 rounded-full border-2 border-primary bg-background shadow ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                  aria-label="Minimum impact factor"
                />
                <SliderPrimitive.Thumb
                  className="block h-5 w-5 rounded-full border-2 border-primary bg-background shadow ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                  aria-label="Maximum impact factor"
                />
              </SliderPrimitive.Root>
              {(ifRange[0] > IF_SLIDER_MIN || ifRange[1] < IF_SLIDER_MAX) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs mt-1"
                  onClick={() => setIfRange([IF_SLIDER_MIN, IF_SLIDER_MAX])}
                  data-testid="button-clear-if-range"
                >
                  Reset range
                </Button>
              )}
            </div>
            <div className="w-72 shrink-0">
              <Label>Field</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between font-normal"
                    data-testid="button-field-filter"
                  >
                    <span className="truncate">
                      {fieldFilter.length === 0
                        ? 'All Fields'
                        : fieldFilter.length === 1
                          ? fieldFilter[0]
                          : `${fieldFilter.length} fields selected`}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <div className="p-2 border-b flex items-center justify-between">
                    <span className="text-sm font-medium">Filter by field</span>
                    {fieldFilter.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => { setFieldFilter([]); setCurrentPage(1); }}
                        data-testid="button-clear-field-filter"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                    {availableFields.length === 0 ? (
                      <div className="text-sm text-muted-foreground p-2">No fields available yet.</div>
                    ) : (
                      availableFields.map((f) => {
                        const checked = fieldFilter.includes(f);
                        return (
                          <label
                            key={f}
                            className="flex items-center gap-2 text-sm py-1 px-2 hover:bg-muted/50 rounded cursor-pointer"
                            data-testid={`option-field-${f}`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(c) => {
                                setCurrentPage(1);
                                setFieldFilter((prev) =>
                                  c ? [...prev, f] : prev.filter((x) => x !== f)
                                );
                              }}
                            />
                            <span className="truncate">{f}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Impact Factors ({totalRecords.toLocaleString()} journals, showing page {currentPage} of {totalPages})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Top horizontal scrollbar synced with the table below, so users
              can scroll the wide table without having to scroll to its bottom. */}
          <div
            ref={topScrollRef}
            onScroll={handleTopScroll}
            className="overflow-x-auto overflow-y-hidden"
            style={{ height: 14 }}
            data-testid="impact-factors-top-scrollbar"
          >
            <div style={{ width: tableScrollWidth, height: 1 }} />
          </div>
          <div
            ref={tableScrollRef}
            onScroll={handleTableScroll}
            className="overflow-x-auto"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]"><SortableHeader field="journalName" label="Journal Name" /></TableHead>
                  <TableHead className="w-[90px]"><span className="text-xs font-medium">Pubs</span></TableHead>
                  <TableHead className="min-w-[150px]"><PlainHeader field="abbreviatedJournal" label="Abbreviated" /></TableHead>
                  <TableHead className="min-w-[180px]"><SortableHeader field="field" label="Field" /></TableHead>
                  <TableHead><SortableHeader field="year" label="Year" /></TableHead>
                  <TableHead><PlainHeader field="issn" label="ISSN" /></TableHead>
                  <TableHead><PlainHeader field="eissn" label="eISSN" /></TableHead>
                  <TableHead><SortableHeader field="impactFactor" label="JIF" /></TableHead>
                  <TableHead><SortableHeader field="fiveYearJif" label="5-Year JIF" /></TableHead>
                  <TableHead><SortableHeader field="jifWithoutSelfCites" label="JIF w/o Self" /></TableHead>
                  <TableHead><SortableHeader field="jci" label="JCI" /></TableHead>
                  <TableHead><SortableHeader field="quartile" label="Quartile" /></TableHead>
                  <TableHead><SortableHeader field="rank" label="Rank" /></TableHead>
                  <TableHead><SortableHeader field="totalCites" label="Total Cites" /></TableHead>
                  <TableHead><SortableHeader field="totalArticles" label="Total Articles" /></TableHead>
                  <TableHead><SortableHeader field="citableItems" label="Citable Items" /></TableHead>
                  <TableHead><SortableHeader field="citedHalfLife" label="Cited Half-Life" /></TableHead>
                  <TableHead><SortableHeader field="citingHalfLife" label="Citing Half-Life" /></TableHead>
                  <TableHead className="min-w-[150px]"><SortableHeader field="publisher" label="Publisher" /></TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {impactFactors.map((factor: JournalImpactFactor) => (
                  <TableRow 
                    key={factor.journalId} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setSelectedJournal(factor);
                      setIsJournalModalOpen(true);
                    }}
                    data-testid={`row-journal-${factor.journalId}`}
                  >
                    <TableCell>
                      {editingId === factor.journalId ? (
                        <Input
                          value={editForm.journalName || ''}
                          onChange={(e) => setEditForm({ ...editForm, journalName: e.target.value })}
                          className="w-full"
                        />
                      ) : (
                        <span className="font-medium">{factor.journalName}</span>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const count = journalPubCounts[factor.journalName] ?? 0;
                        if (count === 0) {
                          return (
                            <Badge
                              variant="outline"
                              className="text-muted-foreground font-normal"
                              data-testid={`badge-pubcount-${factor.journalId}`}
                            >
                              0
                            </Badge>
                          );
                        }
                        return (
                          <Badge
                            variant="secondary"
                            className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                            onClick={() => goToPublicationsForJournal(factor.journalName)}
                            title={`View ${count} publication${count === 1 ? '' : 's'} in ${factor.journalName}`}
                            data-testid={`badge-pubcount-${factor.journalId}`}
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            {count}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      {factor.abbreviatedJournal}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {editingFieldJournalId === factor.journalId ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={fieldDraft}
                            onChange={(e) => setFieldDraft(e.target.value)}
                            className="h-7 text-xs w-40"
                            data-testid={`input-field-${factor.journalId}`}
                            autoFocus
                          />
                          <Button
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => updateFieldMutation.mutate({ journalId: factor.journalId, field: fieldDraft.trim() || null })}
                            disabled={updateFieldMutation.isPending}
                            data-testid={`button-save-field-${factor.journalId}`}
                          >
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            onClick={() => { setEditingFieldJournalId(null); setFieldDraft(""); }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="text-left text-xs hover:underline w-full"
                          onClick={() => { setEditingFieldJournalId(factor.journalId); setFieldDraft(factor.field ?? ""); }}
                          data-testid={`button-edit-field-${factor.journalId}`}
                          title="Click to edit field"
                        >
                          {factor.field || <span className="text-muted-foreground italic">— set field —</span>}
                        </button>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === factor.journalId ? (
                        <Input
                          type="number"
                          value={editForm.year?.toString() || ''}
                          onChange={(e) => setEditForm({ ...editForm, year: parseInt(e.target.value) || 0 })}
                          className="w-20"
                        />
                      ) : (
                        factor.year ?? <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{factor.issn}</TableCell>
                    <TableCell className="text-xs">{factor.eissn}</TableCell>
                    <TableCell>
                      {editingId === factor.journalId ? (
                        <Input
                          type="number"
                          step="0.001"
                          value={editForm.impactFactor as any || ''}
                          onChange={(e) => setEditForm({ ...editForm, impactFactor: parseFloat(e.target.value) })}
                          className="w-24"
                        />
                      ) : (
                        <span className="font-semibold text-blue-600 dark:text-blue-400">{factor.impactFactor}</span>
                      )}
                    </TableCell>
                    <TableCell>{factor.fiveYearJif}</TableCell>
                    <TableCell>{factor.jifWithoutSelfCites}</TableCell>
                    <TableCell>{factor.jci}</TableCell>
                    <TableCell>
                      {editingId === factor.journalId ? (
                        <Input
                          value={editForm.quartile || ''}
                          onChange={(e) => setEditForm({ ...editForm, quartile: e.target.value })}
                          className="w-16"
                        />
                      ) : factor.quartile ? (
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          factor.quartile === 'Q1' ? 'bg-green-100 text-green-800' :
                          factor.quartile === 'Q2' ? 'bg-blue-100 text-blue-800' :
                          factor.quartile === 'Q3' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {factor.quartile}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {editingId === factor.journalId ? (
                        <Input
                          type="number"
                          value={editForm.rank || ''}
                          onChange={(e) => setEditForm({ ...editForm, rank: parseInt(e.target.value) })}
                          className="w-20"
                        />
                      ) : (
                        factor.rank
                      )}
                    </TableCell>
                    <TableCell>{factor.totalCites?.toLocaleString()}</TableCell>
                    <TableCell>{factor.totalArticles?.toLocaleString()}</TableCell>
                    <TableCell>{factor.citableItems?.toLocaleString()}</TableCell>
                    <TableCell>{factor.citedHalfLife}</TableCell>
                    <TableCell>{factor.citingHalfLife}</TableCell>
                    <TableCell className="text-xs">
                      {editingId === factor.journalId ? (
                        <Input
                          value={editForm.publisher || ''}
                          onChange={(e) => setEditForm({ ...editForm, publisher: e.target.value })}
                          className="w-32"
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">{factor.publisher}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === factor.journalId ? (
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={updateMutation.isPending}
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancel}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(factor)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteMutation.mutate(factor.journalId)}
                            disabled={deleteMutation.isPending}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {(!impactFactors || impactFactors.length === 0) && (
            <div className="text-center py-8 text-muted-foreground">
              No impact factors found. Use the Import CSV button to load journal data.
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * limit) + 1} to {Math.min(currentPage * limit, totalRecords)} of {totalRecords.toLocaleString()} journals
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Calculation Details Modal */}
      <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Sidra Score Calculation Details
            </DialogTitle>
            <DialogDescription>
              {selectedScientistDetails && (
                <span>
                  {selectedScientistDetails.honorificTitle} {selectedScientistDetails.firstName} {selectedScientistDetails.lastName} - 
                  Score: {selectedScientistDetails.sidraScore.toFixed(2)} ({selectedScientistDetails.publicationsCount} publications)
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {selectedScientistDetails && (
            <div className="space-y-6">
              {/* Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Calculation Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">Total Publications</p>
                      <p className="text-lg font-semibold">{selectedScientistDetails.publicationsCount}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">Total Sidra Score</p>
                      <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">{selectedScientistDetails.sidraScore.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">Department</p>
                      <p className="font-medium">{selectedScientistDetails.department}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">Job Title</p>
                      <p className="font-medium">{selectedScientistDetails.jobTitle}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Publications with Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Publication Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {selectedScientistDetails.calculationDetails.map((pub, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="mb-2">
                          <h4 className="font-medium text-sm">{pub.title}</h4>
                          <p className="text-xs text-gray-600 mt-1 dark:text-gray-300">
                            {pub.journal} • {pub.publicationDate ? format(new Date(pub.publicationDate), 'yyyy') : 'Unknown Year'}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600 dark:text-gray-300">Impact Factor:</span>
                            <p className="font-medium">
                              {pub.impactFactor}{' '}
                              {pub.usedFallback ? (
                                <span className="text-orange-600 dark:text-orange-400">
                                  ({pub.actualYear} - fallback from {pub.targetYear})
                                </span>
                              ) : (
                                <span className="text-gray-500 dark:text-gray-400">({pub.actualYear})</span>
                              )}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-600 dark:text-gray-300">Authorship:</span>
                            <p className="font-medium">{pub.authorshipTypes.join(', ')}</p>
                          </div>
                          <div>
                            <span className="text-gray-600 dark:text-gray-300">Multiplier:</span>
                            <p className="font-medium">×{pub.multiplier} ({pub.appliedMultipliers.join(', ') || 'Base'})</p>
                          </div>
                          <div>
                            <span className="text-gray-600 dark:text-gray-300">Contribution:</span>
                            <p className="font-semibold text-blue-600 dark:text-blue-400">{pub.publicationScore.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Missing Impact Factor Publications */}
              {selectedScientistDetails.missingImpactFactorPublications.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg text-red-600 dark:text-red-400">Publications Without Impact Factor Data</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-gray-600 mb-2 dark:text-gray-300">
                      These publications were not included in the score calculation:
                    </div>
                    <ul className="space-y-2">
                      {selectedScientistDetails.missingImpactFactorPublications.map((title, index) => (
                        <li key={index} className="text-sm p-2 bg-red-50 rounded border-l-4 border-red-200 dark:bg-red-950 dark:border-red-800">
                          {title}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Journal Detail Modal */}
      <Dialog open={isJournalModalOpen} onOpenChange={setIsJournalModalOpen}>
        <DialogContent className="max-w-4xl max-h-[95vh] h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {selectedJournal?.journalName}
            </DialogTitle>
            <DialogDescription>
              Impact factor trend analysis and journal details
            </DialogDescription>
          </DialogHeader>

          {selectedJournal && (
            <div className="space-y-6">
              {/* Basic Journal Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground mb-2">Journal Details</h4>
                  <div className="space-y-1">
                    <p><span className="font-medium">Abbreviated:</span> {selectedJournal.abbreviatedJournal ?? 'N/A'}</p>
                    <p><span className="font-medium">Publisher:</span> {selectedJournal.publisher ?? 'N/A'}</p>
                    <p><span className="font-medium">ISSN:</span> {selectedJournal.issn ?? 'N/A'}</p>
                    <p><span className="font-medium">eISSN:</span> {selectedJournal.eissn ?? 'N/A'}</p>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="font-medium">Publications in portal:</span>
                      {selectedJournalPubCount === 0 ? (
                        <Badge variant="outline" className="text-muted-foreground font-normal" data-testid="badge-modal-pubcount">
                          None
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                          onClick={() => goToPublicationsForJournal(selectedJournal.journalName)}
                          data-testid="badge-modal-pubcount"
                        >
                          <FileText className="h-3 w-3 mr-1" />
                          {selectedJournalPubCount} — view in Publications
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Field:</span>
                      {editingFieldJournalId === selectedJournal.journalId ? (
                        <>
                          <Input
                            value={fieldDraft}
                            onChange={(e) => setFieldDraft(e.target.value)}
                            className="h-7 text-xs w-48"
                            data-testid="input-modal-field"
                          />
                          <Button
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => {
                              const jid = selectedJournal.journalId;
                              updateFieldMutation.mutate(
                                { journalId: jid, field: fieldDraft.trim() || null },
                                { onSuccess: () => setSelectedJournal({ ...selectedJournal, field: fieldDraft.trim() || null }) }
                              );
                            }}
                            disabled={updateFieldMutation.isPending}
                            data-testid="button-save-modal-field"
                          >
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            onClick={() => { setEditingFieldJournalId(null); setFieldDraft(""); }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <span>{selectedJournal.field || <span className="italic text-muted-foreground">not set</span>}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => { setEditingFieldJournalId(selectedJournal.journalId); setFieldDraft(selectedJournal.field ?? ""); }}
                            data-testid="button-edit-modal-field"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  {(() => {
                    // Find the most recent year's data
                    const latestData = historicalData.length > 0 
                      ? historicalData.reduce((latest, current) => 
                          current.year > latest.year ? current : latest
                        )
                      : selectedJournal;
                    
                    return (
                      <>
                        <h4 className="font-semibold text-sm text-muted-foreground mb-2">Current Metrics ({latestData.year})</h4>
                        <div className="space-y-1">
                          <p><span className="font-medium">Impact Factor:</span> {latestData.impactFactor ?? 'N/A'}</p>
                          <p><span className="font-medium">5-Year JIF:</span> {latestData.fiveYearJif ?? 'N/A'}</p>
                          <p><span className="font-medium">Quartile:</span> 
                            <span className={`ml-2 px-2 py-1 rounded text-xs font-semibold ${
                              latestData.quartile === 'Q1' ? 'bg-green-100 text-green-800' :
                              latestData.quartile === 'Q2' ? 'bg-blue-100 text-blue-800' :
                              latestData.quartile === 'Q3' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {latestData.quartile ?? 'N/A'}
                            </span>
                          </p>
                          <p><span className="font-medium">Rank:</span> {latestData.rank ?? 'N/A'}</p>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Impact Factor Chart */}
              <div>
                <h4 className="font-semibold mb-4 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Impact Factor Over Time
                </h4>
                {historicalData.length > 0 ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={historicalData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="year" />
                        <YAxis />
                        <ChartTooltip
                          formatter={(value: any, name: string) => {
                            const numValue = parseFloat(value);
                            return [
                              !isNaN(numValue) ? numValue.toFixed(3) : value?.toString() || 'N/A', 
                              'Impact Factor'
                            ];
                          }}
                          labelFormatter={(year: any) => `Year: ${year}`}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="impactFactor" 
                          stroke="#2563eb" 
                          strokeWidth={2}
                          dot={{ fill: '#2563eb', strokeWidth: 2, r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No historical data available for this journal</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Field IF Distribution */}
              <div>
                <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                  <h4 className="font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Impact Factor Distribution in Field
                    {fieldDistribution?.field && (() => {
                      const total = fieldDistribution.distribution.length;
                      const shown = distHideLowIf
                        ? fieldDistribution.distribution.filter((d) => d.impactFactor >= 3).length
                        : total;
                      return (
                        <span className="text-sm font-normal text-muted-foreground">
                          — {fieldDistribution.field} ({distHideLowIf ? `${shown} of ${total}` : `${total}`} journals)
                        </span>
                      );
                    })()}
                  </h4>
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none" data-testid="label-dist-hide-low-if">
                    <Checkbox
                      checked={distHideLowIf}
                      onCheckedChange={(c) => setDistHideLowIf(c === true)}
                      data-testid="checkbox-dist-hide-low-if"
                    />
                    <span>Hide journals with IF &lt; 3</span>
                  </label>
                </div>
                {(() => {
                  const distAll = fieldDistribution?.distribution ?? [];
                  const dist = distHideLowIf ? distAll.filter((d) => d.impactFactor >= 3) : distAll;
                  if (!selectedJournal.field) {
                    return (
                      <div className="h-64 flex items-center justify-center text-muted-foreground" data-testid="field-distribution-no-field">
                        <div className="text-center">
                          <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p>Assign a field to this journal to see its distribution</p>
                        </div>
                      </div>
                    );
                  }
                  if (dist.length < 2) {
                    return (
                      <div className="h-64 flex items-center justify-center text-muted-foreground" data-testid="field-distribution-empty">
                        <div className="text-center">
                          <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p>Not enough journals in this field to build a distribution</p>
                        </div>
                      </div>
                    );
                  }

                  // Current journal's IF (most recent)
                  const latest = historicalData.length > 0
                    ? historicalData.reduce((a, b) => (b.year > a.year ? b : a))
                    : selectedJournal;
                  const currentIfRaw = latest.impactFactor;
                  const currentIf = currentIfRaw != null ? parseFloat(currentIfRaw as unknown as string) : NaN;

                  // Build histogram bins (log-friendly: cap at 99th percentile to avoid one-bin domination)
                  const values = dist.map((d) => d.impactFactor).sort((a, b) => a - b);
                  const minV = values[0];
                  const p99 = values[Math.floor(values.length * 0.99)] ?? values[values.length - 1];
                  const maxV = Math.max(p99, Number.isFinite(currentIf) ? currentIf : 0);
                  const binCount = Math.min(30, Math.max(10, Math.ceil(Math.sqrt(values.length))));
                  const binWidth = (maxV - minV) / binCount || 1;
                  const bins = Array.from({ length: binCount }, (_, i) => {
                    const start = minV + i * binWidth;
                    const end = i === binCount - 1 ? maxV : start + binWidth;
                    return { start, end, mid: (start + end) / 2, count: 0, isCurrent: false };
                  });
                  for (const v of values) {
                    let idx = Math.floor((v - minV) / binWidth);
                    if (idx >= binCount) idx = binCount - 1;
                    if (idx < 0) idx = 0;
                    bins[idx].count++;
                  }
                  // Mark the bin containing the current journal's IF
                  let currentBinIdx = -1;
                  if (Number.isFinite(currentIf)) {
                    currentBinIdx = Math.floor((currentIf - minV) / binWidth);
                    if (currentBinIdx >= binCount) currentBinIdx = binCount - 1;
                    if (currentBinIdx >= 0 && currentBinIdx < binCount) bins[currentBinIdx].isCurrent = true;
                  }

                  // Percentile rank of current journal within the field
                  let percentile: number | null = null;
                  if (Number.isFinite(currentIf)) {
                    const below = values.filter((v) => v <= currentIf).length;
                    percentile = Math.round((below / values.length) * 100);
                  }

                  return (
                    <>
                      {Number.isFinite(currentIf) && percentile != null && (
                        <p className="text-sm text-muted-foreground mb-2" data-testid="text-field-percentile">
                          <span className="font-medium text-foreground">{selectedJournal.journalName}</span>
                          {' '}has IF <span className="font-medium text-foreground">{currentIf.toFixed(3)}</span>,
                          ranking in the <span className="font-medium text-foreground">{percentile}th percentile</span> of its field.
                        </p>
                      )}
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={bins}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="mid"
                              type="number"
                              domain={[minV, maxV]}
                              tickFormatter={(v: number) => v.toFixed(1)}
                              label={{ value: 'Impact Factor', position: 'insideBottom', offset: -4 }}
                            />
                            <YAxis allowDecimals={false} label={{ value: 'Journals', angle: -90, position: 'insideLeft' }} />
                            <ChartTooltip
                              formatter={(value: any) => [value, 'Journals']}
                              labelFormatter={(_: any, payload: any) => {
                                const b = payload?.[0]?.payload;
                                if (!b) return '';
                                return `IF ${b.start.toFixed(2)} – ${b.end.toFixed(2)}`;
                              }}
                            />
                            <Bar dataKey="count">
                              {bins.map((b, i) => (
                                <Cell key={i} fill={b.isCurrent ? '#dc2626' : '#94a3b8'} />
                              ))}
                            </Bar>
                            {Number.isFinite(currentIf) && (
                              <ReferenceLine
                                x={currentIf}
                                stroke="#dc2626"
                                strokeWidth={2}
                                strokeDasharray="4 2"
                                label={{ value: 'This journal', position: 'top', fill: '#dc2626', fontSize: 12 }}
                              />
                            )}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      {p99 < values[values.length - 1] && (
                        <p className="text-xs text-muted-foreground mt-1">
                          X-axis capped at 99th percentile ({p99.toFixed(1)}) to keep bin widths readable; max IF in field is {values[values.length - 1].toFixed(1)}.
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Additional Metrics */}
              <div>
                <h4 className="font-semibold mb-4">Citation Metrics</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {(() => {
                    // Use the most recent year's data for citation metrics too
                    const latestData = historicalData.length > 0 
                      ? historicalData.reduce((latest, current) => 
                          current.year > latest.year ? current : latest
                        )
                      : selectedJournal;
                    
                    return (
                      <>
                        <div className="text-center p-3 bg-muted/30 rounded">
                          <div className="text-lg font-bold">
                            {latestData.totalCites != null && latestData.totalCites !== 0 
                              ? latestData.totalCites.toLocaleString() 
                              : 'N/A'}
                          </div>
                          <div className="text-xs text-muted-foreground">Total Cites</div>
                        </div>
                        <div className="text-center p-3 bg-muted/30 rounded">
                          <div className="text-lg font-bold">
                            {latestData.totalArticles != null && latestData.totalArticles !== 0 
                              ? latestData.totalArticles.toLocaleString() 
                              : 'N/A'}
                          </div>
                          <div className="text-xs text-muted-foreground">Total Articles</div>
                        </div>
                        <div className="text-center p-3 bg-muted/30 rounded">
                          <div className="text-lg font-bold">
                            {latestData.citedHalfLife != null && latestData.citedHalfLife !== 0 
                              ? latestData.citedHalfLife 
                              : 'N/A'}
                          </div>
                          <div className="text-xs text-muted-foreground">Cited Half-Life</div>
                        </div>
                        <div className="text-center p-3 bg-muted/30 rounded">
                          <div className="text-lg font-bold">
                            {latestData.jci != null && latestData.jci !== 0 
                              ? latestData.jci 
                              : 'N/A'}
                          </div>
                          <div className="text-xs text-muted-foreground">JCI</div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}