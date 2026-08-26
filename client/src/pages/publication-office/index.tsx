// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useState, useEffect, useRef, useLayoutEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
import { Switch } from "@/components/ui/switch";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Pencil, Save, X, Upload, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, Star, Shield, FileText, BarChart3, Download, Calendar, User, Users, BookOpen, Award, TrendingUp, CopyCheck, AlertTriangle, UserX, Unlink, CheckCircle2, Sparkles, Loader2, Globe, Plus, RefreshCw, ExternalLink, Info } from "lucide-react";
import { UploadingModal } from "@/components/ui/upload-modal";
import { PublicationDuplicates } from "@/components/PublicationDuplicates";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation, useSearch } from "wouter";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer, BarChart, Bar, ReferenceLine, Cell } from "recharts";
import type { JournalImpactFactor, InsertJournalImpactFactor, Publication } from "@shared/schema";
import type { SidraScoreResult, SidraScoreSettings } from "@shared/sidraScore";
import {
  IP_VETTING_READY_STATUS,
  isReadyForIpVetting,
} from "@shared/publicationWorkflow";
import { SidraScoreDetails } from "@/components/SidraScoreDetails";

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

const PUBLICATION_OFFICE_TABS = [
  "ip-vetting",
  "new-publications",
  "find-papers",
  "duplicates",
  "export",
  "sidra-score",
  "impact-factors",
] as const;

export type PublicationOfficeTab = typeof PUBLICATION_OFFICE_TABS[number];

export interface PublicationOfficeProps {
  /**
   * Renders one existing workflow without the Outcome Office heading, office
   * tab navigation, or URL synchronization.
   */
  embeddedTab?: PublicationOfficeTab;
}

function getPublicationOfficeTab(search: string): PublicationOfficeTab {
  const requestedTab = new URLSearchParams(search).get("tab");
  return PUBLICATION_OFFICE_TABS.includes(requestedTab as PublicationOfficeTab)
    ? requestedTab as PublicationOfficeTab
    : "ip-vetting";
}

type SidraRanking = SidraScoreResult;

// Render an affiliation string with the searched term highlighted, so staff can
// visually verify the match that triggered the discovery.
function highlightAffiliation(text: string, term: string) {
  const clean = (term || "").trim();
  if (!clean) return <>{text}</>;
  const tokens = [clean, ...clean.split(/\s+/).filter((w) => w.length >= 4)];
  const escaped = tokens
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${escaped.join("|")})`, "ig");
  const testRe = new RegExp(`^(?:${escaped.join("|")})$`, "i");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        part.trim() && testRe.test(part) ? (
          <mark
            key={i}
            className="bg-yellow-200 text-yellow-900 dark:bg-yellow-500/30 dark:text-yellow-200 rounded px-0.5"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function PublicationOffice({ embeddedTab }: PublicationOfficeProps = {}) {
  const isEmbedded = embeddedTab !== undefined;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Tab state
  // Restore only known tabs from the URL so malformed deep links cannot leave
  // the controlled Tabs component without matching content, while returning
  // from a publication still lands on the tab being worked on.
  const [activeTab, setActiveTab] = useState<PublicationOfficeTab>(() =>
    embeddedTab ?? getPublicationOfficeTab(window.location.search)
  );

  // New Publications tab filters (issue/tag, scientist, publication date range)
  const [npTagFilter, setNpTagFilter] = useState<string>("all");
  const [npScientistId, setNpScientistId] = useState<string>("all");
  const [npDateFrom, setNpDateFrom] = useState<string>("");
  const [npDateTo, setNpDateTo] = useState<string>("");

  // IP Vetting defaults to the actual workflow stage. The wider unvetted
  // backlog is available for review by publication year when needed.
  const [showAllUnvettedForIp, setShowAllUnvettedForIp] = useState(false);
  const [ipVettingYear, setIpVettingYear] = useState(() =>
    String(new Date().getFullYear())
  );

  // Import Links dialog: bulk-link publications to SDRs / staff via Excel upload.
  const [linkImportOpen, setLinkImportOpen] = useState(false);
  const [linkImportRows, setLinkImportRows] = useState<any[] | null>(null);
  const [linkImportBusy, setLinkImportBusy] = useState(false);
  const linkImportFileRef = useRef<HTMLInputElement>(null);

  // Auto-connect internal authors dialog: which publication is open, and which
  // suggested scientist links the user has selected to confirm.
  const [autoConnectPub, setAutoConnectPub] = useState<Publication | null>(null);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<Set<number>>(new Set());
  const [suggestionRoles, setSuggestionRoles] = useState<Record<number, string>>({});

  // Find Papers (multi-source discovery) tab state.
  const [fpMode, setFpMode] = useState<"institution" | "scientist" | "keyword">("institution");
  const [fpAffiliation, setFpAffiliation] = useState<string>("Sidra Medicine");
  const [fpScientistIds, setFpScientistIds] = useState<number[]>([]);
  const [fpQuery, setFpQuery] = useState<string>("");
  const [fpYearFrom, setFpYearFrom] = useState<string>(String(new Date().getFullYear()));
  const [fpYearTo, setFpYearTo] = useState<string>(String(new Date().getFullYear()));
  const [fpSources, setFpSources] = useState<Record<string, boolean>>({
    openalex: true,
    pubmed: true,
    crossref: true,
    europepmc: true,
    orcid: true,
  });
  const [fpResults, setFpResults] = useState<Array<{
    doi: string;
    title: string;
    journal: string;
    year: number | null;
    authors: string;
    sources: string[];
    matchedAffiliation?: string | null;
    alreadyExists: boolean;
  }>>([]);
  const [fpSelectedDois, setFpSelectedDois] = useState<Set<string>>(new Set());
  const [fpSearched, setFpSearched] = useState(false);

  type PreprintRepairCandidate = {
    id: number;
    title: string;
    doi: string | null;
    publicationType: string | null;
    status: string | null;
    prepublicationUrl: string | null;
    prepublicationSite: string | null;
    evidence: string[];
    proposed: {
      status: string;
      publicationType: string;
      prepublicationUrl: string | null;
      prepublicationSite: string | null;
    };
  };
  type PreprintRepairResult = {
    updated: Array<{ id: number; title: string }>;
    skipped: Array<{ id: number; reason: string }>;
    updatedCount: number;
    skippedCount: number;
  };
  const [repairSelectedIds, setRepairSelectedIds] = useState<Set<number>>(new Set());
  const [repairConfirmOpen, setRepairConfirmOpen] = useState(false);
  const [repairResult, setRepairResult] = useState<PreprintRepairResult | null>(null);

  const preprintRepairQuery = useQuery<{ candidates: PreprintRepairCandidate[]; count: number }>({
    queryKey: ["/api/publications/preprint-repair-candidates"],
    queryFn: async () => {
      const response = await fetch("/api/publications/preprint-repair-candidates", { credentials: "include" });
      if (!response.ok) throw new Error("Unable to load preprint repair candidates");
      return response.json();
    },
    enabled: activeTab === "find-papers",
  });
  const preprintRepairCandidates = preprintRepairQuery.data?.candidates ?? [];
  const repairMutation = useMutation({
    mutationFn: async (publicationIds: number[]) => {
      const response = await fetch("/api/publications/preprint-repair", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicationIds }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || "Unable to apply preprint repair");
      }
      return response.json() as Promise<PreprintRepairResult>;
    },
    onSuccess: (result) => {
      setRepairResult(result);
      setRepairSelectedIds(new Set());
      setRepairConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/publications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/publications/preprint-repair-candidates"] });
      toast({
        title: "Repair review complete",
        description: `${result.updatedCount} record${result.updatedCount === 1 ? "" : "s"} updated${result.skippedCount ? `; ${result.skippedCount} skipped` : ""}.`,
      });
    },
    onError: (error: Error) => toast({ title: "Repair could not be applied", description: error.message, variant: "destructive" }),
  });
  
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
  const [sidraRangeMode, setSidraRangeMode] = useState<"years" | "custom">("years");
  const [sidraStartMonth, setSidraStartMonth] = useState(""); // YYYY-MM
  const [sidraEndMonth, setSidraEndMonth] = useState(""); // YYYY-MM
  const [firstAuthorMultiplier, setFirstAuthorMultiplier] = useState(2);
  const [lastAuthorMultiplier, setLastAuthorMultiplier] = useState(2);
  const [secondAuthorMultiplier, setSecondAuthorMultiplier] = useState(1.5);
  const [correspondingAuthorMultiplier, setCorrespondingAuthorMultiplier] = useState(2);
  const [impactFactorYear, setImpactFactorYear] = useState("publication"); // "prior", "publication", "latest"
  const [sidraIncludeNonVetted, setSidraIncludeNonVetted] = useState(false);
  const [sidraRankings, setSidraRankings] = useState<SidraRanking[]>([]);
  const [selectedScientistDetails, setSelectedScientistDetails] = useState<SidraRanking | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [sidraSettingsLoading, setSidraSettingsLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== "sidra-score") return;
    setSidraSettingsLoading(true);
    fetch("/api/sidra-score/settings", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((settings: SidraScoreSettings | null) => {
        if (!settings) return;
        setSidraYears(settings.years);
        setSidraRangeMode(settings.startMonth && settings.endMonth ? "custom" : "years");
        setSidraStartMonth(settings.startMonth || "");
        setSidraEndMonth(settings.endMonth || "");
        setImpactFactorYear(settings.impactFactorYear);
        setSidraIncludeNonVetted(settings.includeNonVetted);
        setFirstAuthorMultiplier(settings.multipliers["First Author"]);
        setSecondAuthorMultiplier(settings.multipliers["Second or Second Last Author"]);
        setLastAuthorMultiplier(settings.multipliers["Last Author"]);
        setCorrespondingAuthorMultiplier(settings.multipliers["Corresponding Author"]);
      })
      .finally(() => setSidraSettingsLoading(false));
  }, [activeTab]);

  // Function to open calculation details modal
  const openCalculationDetails = (scientist: SidraRanking) => {
    setSelectedScientistDetails(scientist);
    setIsDetailsModalOpen(true);
  };
  
  // Impact Factor CSV import loading state
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvFileName, setCsvFileName] = useState("");

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
  const search = useSearch();
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState("rank");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [editingFieldJournalId, setEditingFieldJournalId] = useState<number | null>(null);
  const [fieldDraft, setFieldDraft] = useState<string>("");

  useEffect(() => {
    if (isEmbedded) return;
    const tabFromUrl = getPublicationOfficeTab(search);
    setActiveTab((currentTab) => currentTab === tabFromUrl ? currentTab : tabFromUrl);
  }, [isEmbedded, search]);

  useEffect(() => {
    if (embeddedTab) setActiveTab(embeddedTab);
  }, [embeddedTab]);

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
  const { data: ipVettingSourcePublications = [], isLoading: ipPublicationsLoading } = useQuery<Publication[]>({
    queryKey: ['/api/publications', 'ip-vetting'],
    queryFn: async () => {
      const response = await fetch('/api/publications?officeAccess=true');
      if (!response.ok) throw new Error('Failed to fetch publications');
      return response.json();
    },
    enabled: activeTab === "ip-vetting"
  });

  const unvettedPublicationsForIp = useMemo(
    () =>
      ipVettingSourcePublications.filter(
        (pub: Publication) =>
          pub.vettedForSubmissionByIpOffice !== true &&
          !pub.status?.includes("*")
      ),
    [ipVettingSourcePublications]
  );

  const ipVettingYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set<number>([currentYear]);

    unvettedPublicationsForIp.forEach((pub: Publication) => {
      if (!pub.publicationDate) return;
      const year = new Date(pub.publicationDate).getFullYear();
      if (!Number.isNaN(year) && year <= currentYear) years.add(year);
    });

    return Array.from(years).sort((a, b) => b - a);
  }, [unvettedPublicationsForIp]);

  const publicationsForIP = useMemo(() => {
    if (!showAllUnvettedForIp) {
      return unvettedPublicationsForIp.filter(isReadyForIpVetting);
    }

    return unvettedPublicationsForIp.filter((pub: Publication) => {
      if (!pub.publicationDate) return false;
      return String(new Date(pub.publicationDate).getFullYear()) === ipVettingYear;
    });
  }, [
    ipVettingYear,
    showAllUnvettedForIp,
    unvettedPublicationsForIp,
  ]);

  // Count of duplicate publication groups for the Duplicates tab badge.
  // staleTime 0 (overriding the app-wide Infinity) so the badge re-syncs with
  // the panel whenever the page mounts instead of showing a stale count after
  // records are edited, deleted, or imported elsewhere.
  const { data: duplicateCount = { count: 0 }, refetch: refetchDuplicateCount } = useQuery<{ count: number }>({
    queryKey: ['/api/publications/duplicates/count'],
    staleTime: 0,
  });

  const { data: newPublications = [], isLoading: newPublicationsLoading } = useQuery<Publication[]>({
    queryKey: ['/api/publications', 'new-publications'],
    queryFn: async () => {
      const response = await fetch('/api/publications?officeAccess=true');
      if (!response.ok) throw new Error('Failed to fetch publications');
      const publications = await response.json();
      // Surface publications that are NOT yet finalized/vetted by the office so
      // staff can see records still needing attention (data-quality fixes,
      // author links, SDR links) before they are marked Published *.
      // A record is finalized when EITHER the vetted flag is set OR its status
      // already carries the "*" (Published *) final marker — some records have
      // the final status without the flag, and those must not reappear here.
      return publications.filter((pub: Publication) =>
        pub.vettedForSubmissionByIpOffice !== true &&
        !pub.status?.includes('*')
      );
    },
    enabled: activeTab === "new-publications"
  });

  // Per-publication internal author counts, used to flag publications with no
  // linked internal scientist/author records on the New Publications tab.
  const { data: authorCounts = {} } = useQuery<Record<number, number>>({
    queryKey: ['/api/publications/author-counts'],
    enabled: activeTab === "new-publications"
  });

  // Per-publication linked internal scientists, used to power the "filter by
  // scientist" control on the New Publications tab.
  const { data: authorMap = {} } = useQuery<Record<number, Array<{ id: number; name: string }>>>({
    queryKey: ['/api/publications/author-map'],
    enabled: activeTab === "new-publications"
  });

  // Suggested internal-author links for the publication whose auto-connect
  // dialog is currently open. The backend infers role + position from the
  // free-text author list and excludes already-linked scientists.
  const { data: suggestionData, isLoading: suggestionsLoading, isError: suggestionsError } = useQuery<{
    suggestions: Array<{
      scientistId: number;
      authorshipType: string;
      authorPosition: number | null;
      scientist: { id: number; firstName?: string | null; lastName?: string | null; honorificTitle?: string | null } | null;
    }>;
  }>({
    queryKey: [`/api/publications/${autoConnectPub?.id}/author-suggestions`],
    enabled: !!autoConnectPub?.id,
  });
  const suggestions = suggestionData?.suggestions ?? [];

  // Default every suggestion to selected whenever a new set arrives.
  useEffect(() => {
    if (suggestions.length > 0) {
      setSelectedSuggestionIds(new Set(suggestions.map((s) => s.scientistId)));
      setSuggestionRoles(
        Object.fromEntries(suggestions.map((s) => [s.scientistId, s.authorshipType]))
      );
    } else {
      setSelectedSuggestionIds(new Set());
      setSuggestionRoles({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestionData]);

  const confirmAutoConnectMutation = useMutation({
    mutationFn: async ({ publicationId, links }: { publicationId: number; links: any[] }) => {
      const response = await fetch(`/api/publications/${publicationId}/authors/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links }),
      });
      if (!response.ok) throw new Error('Failed to link authors');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Authors linked",
        description: `Linked ${data.createdCount} internal author${data.createdCount === 1 ? '' : 's'}.`,
      });
      setAutoConnectPub(null);
      queryClient.invalidateQueries({ queryKey: ['/api/publications', 'new-publications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/publications/author-counts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/publications/author-map'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to link internal authors", variant: "destructive" });
    },
  });

  // Scientists list, used by the Find Papers "by scientist" mode selector.
  const { data: allScientistsList = [] } = useQuery<Array<{ id: number; firstName?: string | null; lastName?: string | null; honorificTitle?: string | null }>>({
    queryKey: ['/api/scientists'],
    enabled: activeTab === "find-papers",
  });
  const fpScientistOptions = useMemo(
    () =>
      allScientistsList
        .map((s) => ({
          value: String(s.id),
          label: [s.honorificTitle, s.firstName, s.lastName].filter(Boolean).join(" ").trim() || `Scientist #${s.id}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [allScientistsList],
  );

  // Multi-source paper discovery search.
  const discoverMutation = useMutation({
    mutationFn: async (payload: any) => {
      const response = await fetch('/api/publications/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to discover papers');
      }
      return response.json();
    },
    onSuccess: (data) => {
      setFpResults(data.results || []);
      // Default-select the importable (not-yet-existing) results.
      setFpSelectedDois(new Set((data.results || []).filter((r: any) => !r.alreadyExists).map((r: any) => r.doi)));
      setFpSearched(true);
      toast({ title: "Search complete", description: `Found ${data.count} unique paper${data.count === 1 ? '' : 's'}.` });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message || "Failed to discover papers", variant: "destructive" });
    },
  });

  const importDiscoveredMutation = useMutation({
    mutationFn: async (papers: any[]) => {
      const response = await fetch('/api/publications/discover/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ papers }),
      });
      if (!response.ok) throw new Error('Failed to import papers');
      return response.json();
    },
    onSuccess: (data) => {
      const linked = (data.created || []).reduce((sum: number, c: any) => sum + (c.linkedAuthors || 0), 0);
      toast({
        title: "Import complete",
        description: `Imported ${data.createdCount} paper${data.createdCount === 1 ? '' : 's'} (${linked} author link${linked === 1 ? '' : 's'}); skipped ${data.skippedCount}.`,
      });
      // Mark imported DOIs as existing so the table disables re-import.
      const importedDois = new Set((data.created || []).map((c: any) => c.doi));
      setFpResults((prev) => prev.map((r) => (importedDois.has(r.doi) ? { ...r, alreadyExists: true } : r)));
      setFpSelectedDois(new Set());
      queryClient.invalidateQueries({ queryKey: ['/api/publications', 'new-publications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/publications/author-counts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/publications/author-map'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to import papers", variant: "destructive" });
    },
  });

  const handleDiscoverSearch = () => {
    const sources = Object.entries(fpSources).filter(([, v]) => v).map(([k]) => k);
    if (sources.length === 0) {
      toast({ title: "Select a source", description: "Choose at least one source to search.", variant: "destructive" });
      return;
    }
    const payload: any = {
      mode: fpMode,
      sources,
      yearFrom: fpYearFrom ? Number(fpYearFrom) : undefined,
      yearTo: fpYearTo ? Number(fpYearTo) : undefined,
    };
    if (fpMode === "institution") payload.affiliation = fpAffiliation;
    else if (fpMode === "scientist") payload.scientistIds = fpScientistIds;
    else payload.query = fpQuery;
    discoverMutation.mutate(payload);
  };

  // Shared data-quality / vetting issue computation so the filter and the
  // rendered badges stay in sync.
  const getPubIssues = (pub: Publication) => {
    const missingFields: string[] = [];
    if (!pub.journal?.trim()) missingFields.push('journal');
    if (!pub.publicationDate) missingFields.push('publication date');
    if (!pub.doi?.trim() && !pub.pmid?.trim()) missingFields.push('DOI/PMID');
    if (!pub.authors?.trim()) missingFields.push('authors');
    if (!pub.abstract?.trim()) missingFields.push('abstract');
    const hasInternalAuthors = (authorCounts[pub.id] || 0) > 0;
    const hasSdr = !!pub.researchActivityId;
    const isVetted = !!pub.status?.includes('*');
    const hasIssues = missingFields.length > 0 || !hasInternalAuthors || !hasSdr;
    return { missingFields, hasInternalAuthors, hasSdr, isVetted, hasIssues };
  };

  // Scientist options (only those actually linked to current new publications).
  const npScientistOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const pub of newPublications) {
      for (const s of authorMap[pub.id] || []) {
        if (!seen.has(s.id)) seen.set(s.id, s.name);
      }
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ value: String(id), label: name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [newPublications, authorMap]);

  // Apply the New Publications filters (issue/tag, scientist, date range).
  const filteredNewPublications = useMemo(() => {
    return newPublications.filter((pub) => {
      const { missingFields, hasInternalAuthors, hasSdr, isVetted, hasIssues } = getPubIssues(pub);

      if (npTagFilter !== "all") {
        if (npTagFilter === "missing-data" && missingFields.length === 0) return false;
        if (npTagFilter === "no-internal-authors" && hasInternalAuthors) return false;
        if (npTagFilter === "no-sdr" && hasSdr) return false;
        if (npTagFilter === "not-vetted" && isVetted) return false;
        if (npTagFilter === "no-issues" && hasIssues) return false;
      }

      if (npScientistId !== "all") {
        const ids = (authorMap[pub.id] || []).map((s) => s.id);
        if (!ids.includes(Number(npScientistId))) return false;
      }

      if (npDateFrom || npDateTo) {
        if (!pub.publicationDate) return false;
        const d = new Date(pub.publicationDate);
        if (npDateFrom && d < new Date(npDateFrom)) return false;
        if (npDateTo) {
          const to = new Date(npDateTo);
          to.setHours(23, 59, 59, 999);
          if (d > to) return false;
        }
      }

      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newPublications, authorCounts, authorMap, npTagFilter, npScientistId, npDateFrom, npDateTo]);

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
        ...(sidraRangeMode === "custom" && sidraStartMonth && sidraEndMonth
          ? { startMonth: sidraStartMonth, endMonth: sidraEndMonth }
          : {}),
        impactFactorYear: impactFactorYear,
        includeNonVetted: sidraIncludeNonVetted,
        multipliers: {
          'First Author': firstAuthorMultiplier,
          'Last Author': lastAuthorMultiplier,
          'Second or Second Last Author': secondAuthorMultiplier,
          'Corresponding Author': correspondingAuthorMultiplier
        }
      };
      
      const response = await fetch('/api/scientists/sidra-scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: "include",
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
    setCsvFileName(file.name);
    setCsvImporting(true);

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
      setCsvImporting(false);
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
    } finally {
      setCsvImporting(false);
      event.target.value = '';
    }
  };

  const markAsVettedMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/publications/${id}/ip-vet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || 'Failed to mark as vetted');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/publications'] });
      toast({
        title: "IP vetting complete",
        description: "Publication moved to Vetted for submission.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const markAsPublishedMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/publications/${id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || 'Failed to finalize publication');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/publications'] });
      toast({
        title: "Publication finalized",
        description: "Publication marked as Published * and sealed.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const [invalidPublication, setInvalidPublication] = useState<Publication | null>(null);
  const [invalidReason, setInvalidReason] = useState("");
  const markInvalidMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const response = await fetch(`/api/publications/${id}/mark-invalid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || "Failed to mark publication invalid");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/publications"] });
      queryClient.invalidateQueries({
        predicate: (query) => String(query.queryKey[0]).startsWith("/api/publications/invalid-issues"),
      });
      setInvalidPublication(null);
      setInvalidReason("");
      toast({
        title: "Correction requested",
        description: "The publication is now 7. Published - Invalid and its linked authors have been notified.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Could not request correction", description: error.message, variant: "destructive" });
    },
  });

  // Revert final approval (Export tab, rarely used)
  const [revertSearch, setRevertSearch] = useState("");
  const [revertConfirmId, setRevertConfirmId] = useState<number | null>(null);
  const { data: allPublicationsForRevert = [] } = useQuery<Publication[]>({
    queryKey: ['/api/publications'],
    enabled: activeTab === 'export',
  });
  const sealedPublications = useMemo(() => {
    const q = revertSearch.trim().toLowerCase();
    if (!q) return []; // show nothing until the officer types a search
    return (allPublicationsForRevert as Publication[])
      .filter((p) => p.status === 'Published *')
      .filter((p) => p.title?.toLowerCase().includes(q)
        || p.doi?.toLowerCase().includes(q)
        || p.journal?.toLowerCase().includes(q));
  }, [allPublicationsForRevert, revertSearch]);

  const revertFinalMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/publications/${id}/revert-final`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || 'Failed to revert final approval');
      }
      return response.json();
    },
    onSuccess: () => {
      setRevertConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/publications'] });
      toast({ title: "Reverted", description: "The publication is unsealed and back in Published status." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
    <>
    <UploadingModal
      open={csvImporting}
      label="Importing Impact Factors…"
      sublabel={csvFileName}
    />
    <div className="space-y-6">
      {!isEmbedded && (
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-foreground">Outcome Office</h1>
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(tab) => {
          const nextTab = tab as PublicationOfficeTab;
          setActiveTab(nextTab);
          if (!isEmbedded) {
            const params = new URLSearchParams(window.location.search);
            params.set("tab", nextTab);
            navigate(`${window.location.pathname}?${params.toString()}${window.location.hash}`);
          }
          // Keep the badge in sync with the panel when the Duplicates tab opens.
          if (tab === "duplicates") refetchDuplicateCount();
        }}
        className="space-y-6"
      >
        {!isEmbedded && <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="ip-vetting" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            IP Vetting ({publicationsForIP.length})
          </TabsTrigger>
          <TabsTrigger value="new-publications" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            New Publications ({newPublications.length})
          </TabsTrigger>
          <TabsTrigger value="find-papers" className="flex items-center gap-2" data-testid="tab-find-papers">
            <Globe className="h-4 w-4" />
            Find Papers
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
        </TabsList>}

        {/* IP Vetting Tab */}
        <TabsContent value="ip-vetting" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Publications to be Vetted for IP
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {showAllUnvettedForIp
                      ? `Reviewing unvetted publications from ${ipVettingYear}.`
                      : `Showing only publications at the ${IP_VETTING_READY_STATUS} stage.`}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="switch-show-all-unvetted" className="text-sm">
                      Show all unvetted
                    </Label>
                    <Switch
                      id="switch-show-all-unvetted"
                      checked={showAllUnvettedForIp}
                      onCheckedChange={setShowAllUnvettedForIp}
                      data-testid="switch-show-all-unvetted-ip"
                    />
                  </div>
                  {showAllUnvettedForIp && (
                    <Select value={ipVettingYear} onValueChange={setIpVettingYear}>
                      <SelectTrigger
                        className="w-[150px]"
                        data-testid="select-ip-vetting-year"
                      >
                        <SelectValue placeholder="Publication year" />
                      </SelectTrigger>
                      <SelectContent>
                        {ipVettingYears.map((year) => (
                          <SelectItem key={year} value={String(year)}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {ipPublicationsLoading ? (
                <div className="text-center py-8">Loading publications...</div>
              ) : publicationsForIP.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {showAllUnvettedForIp
                    ? `No unvetted publications from ${ipVettingYear}`
                    : "No Complete Draft publications are pending IP vetting"}
                </div>
              ) : (
                <div className="space-y-4">
                  {publicationsForIP.map((pub: Publication) => (
                    <div key={pub.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <Link href={`/publications/${pub.id}?from=${encodeURIComponent('/outcome-office?tab=ip-vetting')}`}>
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
                          {isReadyForIpVetting(pub) ? (
                            <Button
                              size="sm"
                              onClick={() => markAsVettedMutation.mutate(pub.id)}
                              disabled={markAsVettedMutation.isPending}
                            >
                              Mark as Vetted
                            </Button>
                          ) : (
                            <Badge variant="secondary">
                              Not in Complete Draft
                            </Badge>
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

        {/* New Publications Tab */}
        <TabsContent value="new-publications" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  New Publications
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setLinkImportOpen(true); setLinkImportRows(null); }}
                  data-testid="button-import-links"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import Links
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {newPublicationsLoading ? (
                <div className="text-center py-8">Loading publications...</div>
              ) : newPublications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No new publications
                </div>
              ) : (
                <>
                  {/* Filters: focus the list by data-quality/vetting issue,
                      linked scientist, and publication date range. */}
                  <div className="flex flex-wrap items-end gap-3 mb-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Issue / tag</Label>
                      <Select value={npTagFilter} onValueChange={setNpTagFilter}>
                        <SelectTrigger className="w-[210px]" data-testid="select-np-tag">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All publications</SelectItem>
                          <SelectItem value="not-vetted">Not marked as vetted</SelectItem>
                          <SelectItem value="missing-data">Missing data</SelectItem>
                          <SelectItem value="no-internal-authors">No internal users linked</SelectItem>
                          <SelectItem value="no-sdr">Not linked to an SDR</SelectItem>
                          <SelectItem value="no-issues">No issues</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Scientist</Label>
                      <SearchableSelect
                        options={[{ value: "all", label: "All scientists" }, ...npScientistOptions]}
                        value={npScientistId}
                        onChange={setNpScientistId}
                        placeholder="All scientists"
                        searchPlaceholder="Search scientists..."
                        triggerClassName="w-[230px]"
                        data-testid="select-np-scientist"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">From date</Label>
                      <Input
                        type="date"
                        value={npDateFrom}
                        onChange={(e) => setNpDateFrom(e.target.value)}
                        className="w-[160px]"
                        data-testid="input-np-date-from"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">To date</Label>
                      <Input
                        type="date"
                        value={npDateTo}
                        onChange={(e) => setNpDateTo(e.target.value)}
                        className="w-[160px]"
                        data-testid="input-np-date-to"
                      />
                    </div>
                    {(npTagFilter !== "all" || npScientistId !== "all" || npDateFrom || npDateTo) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setNpTagFilter("all");
                          setNpScientistId("all");
                          setNpDateFrom("");
                          setNpDateTo("");
                        }}
                        data-testid="button-np-clear-filters"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Clear
                      </Button>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mb-3" data-testid="text-np-result-count">
                    Showing {filteredNewPublications.length} of {newPublications.length} publications
                  </div>
                  {filteredNewPublications.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No publications match the current filters
                    </div>
                  ) : (
                <div className="space-y-4">
                  {filteredNewPublications.map((pub: Publication) => {
                    // Compute data-quality issues so staff can see what each
                    // record is missing before it gets vetted/finalized.
                    const { missingFields, hasInternalAuthors, hasSdr, hasIssues } = getPubIssues(pub);
                    return (
                    <div
                      key={pub.id}
                      className={`border rounded-lg p-4 space-y-3 ${hasIssues ? 'border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20' : 'border-green-300 dark:border-green-800 bg-green-50/40 dark:bg-green-950/20'}`}
                      data-testid={`row-new-publication-${pub.id}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <Link href={`/publications/${pub.id}?from=${encodeURIComponent('/outcome-office?tab=new-publications')}`}>
                            <h3 className="font-semibold text-blue-600 hover:text-blue-800 cursor-pointer dark:text-blue-400 dark:hover:text-blue-300">
                              {pub.title}
                            </h3>
                          </Link>
                          <p className="text-sm text-gray-600 mt-1 dark:text-gray-300">{pub.authors || <span className="italic text-gray-400">No authors listed</span>}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {pub.journal || 'No journal'} • {pub.publicationDate ? format(new Date(pub.publicationDate), 'yyyy') : 'No date'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={pub.status === "Published - Invalid" ? "destructive" : pub.status?.includes('*') ? 'default' : 'outline'}
                            className={pub.status === "Published - Invalid"
                              ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                              : pub.status?.includes('*') ? 'bg-green-600 hover:bg-green-700' : ''}
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
                            <div className="flex flex-col items-stretch gap-2">
                              {!hasInternalAuthors && pub.authors?.trim() && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setAutoConnectPub(pub)}
                                  data-testid={`button-auto-connect-${pub.id}`}
                                >
                                  <Users className="h-4 w-4 mr-1" />
                                  Auto-connect authors
                                </Button>
                              )}
                              {pub.status !== "Published - Invalid" && (
                                <Button
                                  size="sm"
                                  onClick={() => markAsPublishedMutation.mutate(pub.id)}
                                  disabled={markAsPublishedMutation.isPending || hasIssues}
                                  title={hasIssues
                                    ? `Resolve all issues first${missingFields.length ? ` (missing: ${missingFields.join(', ')})` : ''}${!hasSdr ? ' (no linked SDR)' : ''}${!hasInternalAuthors ? ' (no linked internal authors)' : ''}`
                                    : 'Finalize and seal this publication'}
                                  data-testid={`button-mark-published-${pub.id}`}
                                >
                                  <Star className="h-4 w-4 mr-1" />
                                  Mark as Published *
                                </Button>
                              )}
                              {pub.status === "Published" && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    setInvalidPublication(pub);
                                    setInvalidReason("");
                                  }}
                                  data-testid={`button-mark-invalid-${pub.id}`}
                                >
                                  <AlertTriangle className="h-4 w-4 mr-1" />
                                  7. Published - Invalid
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      {pub.status === "Published - Invalid" && pub.invalidReason && (
                        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                          <span className="font-medium">Correction reason: </span>
                          <span className="whitespace-pre-wrap">{pub.invalidReason}</span>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2" data-testid={`flags-publication-${pub.id}`}>
                        {!hasIssues ? (
                          <Badge
                            variant="secondary"
                            className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                            data-testid={`flag-complete-${pub.id}`}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            No issues
                          </Badge>
                        ) : (
                          <>
                            {missingFields.length > 0 && (
                              <Badge
                                variant="secondary"
                                className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                data-testid={`flag-missing-data-${pub.id}`}
                              >
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Missing: {missingFields.join(', ')}
                              </Badge>
                            )}
                            {!hasInternalAuthors && (
                              <Badge
                                variant="secondary"
                                className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                                data-testid={`flag-no-internal-authors-${pub.id}`}
                              >
                                <UserX className="h-3 w-3 mr-1" />
                                No internal users linked
                              </Badge>
                            )}
                            {!hasSdr && (
                              <Badge
                                variant="secondary"
                                className="bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300"
                                data-testid={`flag-no-sdr-${pub.id}`}
                              >
                                <Unlink className="h-3 w-3 mr-1" />
                                Not linked to an SDR
                              </Badge>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Find Papers Tab — institution-wide multi-source discovery */}
        <TabsContent value="find-papers" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Find Papers
              </CardTitle>
              <CardDescription>
                Search ORCID, OpenAlex, PubMed, Crossref, and Europe PMC for papers,
                then import the ones missing from the portal. Imported papers auto-link
                matching internal scientists.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search mode */}
              <div className="flex flex-col gap-4 md:flex-row md:items-end">
                <div className="space-y-2">
                  <Label>Search by</Label>
                  <Select value={fpMode} onValueChange={(v) => setFpMode(v as any)}>
                    <SelectTrigger className="w-[200px]" data-testid="select-fp-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="institution">Institution / Affiliation</SelectItem>
                      <SelectItem value="scientist">Scientist(s)</SelectItem>
                      <SelectItem value="keyword">Keyword / Title / DOI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {fpMode === "institution" && (
                  <div className="flex-1 space-y-2">
                    <Label>Affiliation</Label>
                    <Input
                      placeholder="e.g. Sidra Medicine"
                      value={fpAffiliation}
                      onChange={(e) => setFpAffiliation(e.target.value)}
                      data-testid="input-fp-affiliation"
                    />
                  </div>
                )}
                {fpMode === "keyword" && (
                  <div className="flex-1 space-y-2">
                    <Label>Query</Label>
                    <Input
                      placeholder="Keywords, title, author, or DOI"
                      value={fpQuery}
                      onChange={(e) => setFpQuery(e.target.value)}
                      data-testid="input-fp-query"
                    />
                  </div>
                )}
                {fpMode === "scientist" && (
                  <div className="flex-1 space-y-2">
                    <Label>Scientists</Label>
                    <SearchableSelect
                      options={fpScientistOptions}
                      value={fpScientistIds.length ? String(fpScientistIds[fpScientistIds.length - 1]) : ""}
                      onChange={(v) => {
                        const id = Number(v);
                        if (!Number.isInteger(id)) return;
                        setFpScientistIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
                      }}
                      placeholder="Add a scientist..."
                      data-testid="select-fp-scientist"
                    />
                    {fpScientistIds.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {fpScientistIds.map((id) => {
                          const opt = fpScientistOptions.find((o) => o.value === String(id));
                          return (
                            <Badge key={id} variant="secondary" className="gap-1" data-testid={`badge-fp-scientist-${id}`}>
                              {opt?.label || `#${id}`}
                              <X
                                className="h-3 w-3 cursor-pointer"
                                onClick={() => setFpScientistIds((prev) => prev.filter((x) => x !== id))}
                              />
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Year range + sources */}
              <div className="flex flex-col gap-4 md:flex-row md:items-end">
                <div className="space-y-2">
                  <Label>Year from</Label>
                  <Input
                    type="number"
                    className="w-[120px]"
                    placeholder="2015"
                    value={fpYearFrom}
                    onChange={(e) => setFpYearFrom(e.target.value)}
                    data-testid="input-fp-year-from"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Year to</Label>
                  <Input
                    type="number"
                    className="w-[120px]"
                    placeholder="2026"
                    value={fpYearTo}
                    onChange={(e) => setFpYearTo(e.target.value)}
                    data-testid="input-fp-year-to"
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <Label>Sources</Label>
                  <div className="flex flex-wrap gap-3">
                    {[
                      { key: "openalex", label: "OpenAlex" },
                      { key: "pubmed", label: "PubMed" },
                      { key: "crossref", label: "Crossref" },
                      { key: "europepmc", label: "Europe PMC" },
                      { key: "orcid", label: "ORCID" },
                    ].map((src) => (
                      <label key={src.key} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={fpSources[src.key]}
                          onCheckedChange={(c) =>
                            setFpSources((prev) => ({ ...prev, [src.key]: !!c }))
                          }
                          data-testid={`checkbox-source-${src.key}`}
                        />
                        {src.label}
                        {src.key === "orcid" && fpMode !== "scientist" && (
                          <span className="text-xs text-muted-foreground">(scientist mode)</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <Button
                  onClick={handleDiscoverSearch}
                  disabled={discoverMutation.isPending}
                  data-testid="button-fp-search"
                >
                  {discoverMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  Search
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {fpSearched && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {fpResults.length} paper{fpResults.length === 1 ? "" : "s"} found
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1" data-testid="text-fp-summary">
                      Showing {fpResults.length} paper{fpResults.length === 1 ? "" : "s"},{" "}
                      {fpResults.filter((r) => r.alreadyExists).length} already in system
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={fpSelectedDois.size === 0 || importDiscoveredMutation.isPending}
                    onClick={() => {
                      const papers = fpResults
                        .filter((r) => fpSelectedDois.has(r.doi) && !r.alreadyExists)
                        .map((r) => ({ doi: r.doi, title: r.title, journal: r.journal, year: r.year, authors: r.authors }));
                      if (papers.length > 0) importDiscoveredMutation.mutate(papers);
                    }}
                    data-testid="button-fp-import"
                  >
                    {importDiscoveredMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    Import selected ({fpSelectedDois.size})
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {fpResults.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No papers found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]">
                          {(() => {
                            const importable = fpResults.filter((r) => !r.alreadyExists);
                            const allSelected =
                              importable.length > 0 &&
                              importable.every((r) => fpSelectedDois.has(r.doi));
                            return (
                              <Checkbox
                                checked={allSelected}
                                disabled={importable.length === 0}
                                onCheckedChange={(c) =>
                                  setFpSelectedDois(
                                    c ? new Set(importable.map((r) => r.doi)) : new Set()
                                  )
                                }
                                data-testid="checkbox-fp-select-all"
                              />
                            );
                          })()}
                        </TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead className="w-[140px]">Journal</TableHead>
                        <TableHead className="w-[70px]">Year</TableHead>
                        <TableHead className="w-[160px]">Sources</TableHead>
                        <TableHead className="w-[100px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fpResults.map((r) => (
                        <TableRow key={r.doi} data-testid={`row-fp-result-${r.doi}`}>
                          <TableCell>
                            <Checkbox
                              checked={fpSelectedDois.has(r.doi)}
                              disabled={r.alreadyExists}
                              onCheckedChange={(c) =>
                                setFpSelectedDois((prev) => {
                                  const next = new Set(prev);
                                  if (c) next.add(r.doi);
                                  else next.delete(r.doi);
                                  return next;
                                })
                              }
                              data-testid={`checkbox-fp-${r.doi}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{r.title}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[420px]">
                              {r.authors || "No authors listed"}
                            </div>
                            <a
                              href={`https://doi.org/${r.doi}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                            >
                              {r.doi}
                            </a>
                            {fpMode === "institution" && (
                              <div
                                className="mt-1 text-xs"
                                data-testid={`text-fp-affiliation-${r.doi}`}
                              >
                                {r.matchedAffiliation ? (
                                  <span className="text-muted-foreground">
                                    Affiliation:{" "}
                                    {highlightAffiliation(r.matchedAffiliation, fpAffiliation)}
                                  </span>
                                ) : (
                                  <span className="italic text-amber-600 dark:text-amber-400">
                                    No affiliation returned — verify manually
                                  </span>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{r.journal || "—"}</TableCell>
                          <TableCell className="text-sm">{r.year ?? "—"}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {r.sources.map((s) => (
                                <Badge key={s} variant="outline" className="text-xs">
                                  {s}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            {r.alreadyExists ? (
                              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                                In portal
                              </Badge>
                            ) : (
                              <Badge variant="outline">New</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        {/* Preprint repair is intentionally adjacent to discovery: it turns
            evidence from external indexes into a controlled office action. */}
          <Card className="border-amber-200 shadow-sm dark:border-amber-900/60">
            <CardHeader className="border-b border-amber-100 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <RefreshCw className="h-5 w-5 text-amber-700 dark:text-amber-400" />
                    Preprint status repair
                  </CardTitle>
                  <CardDescription className="mt-1 max-w-3xl">
                    Review strong primary-record evidence where a preprint was recorded as published.
                    Select records to apply the proposed correction. Sealed records and published
                    survivors carrying only preprint lineage are excluded.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setRepairResult(null); preprintRepairQuery.refetch(); }}
                  disabled={preprintRepairQuery.isFetching}
                  className="shrink-0 gap-2"
                  data-testid="button-refresh-preprint-repairs"
                >
                  <RefreshCw className={`h-4 w-4 ${preprintRepairQuery.isFetching ? "animate-spin" : ""}`} />
                  Refresh candidates
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p><span className="font-semibold">Evidence safeguard:</span> a prepublication link alone is not sufficient. Each candidate below includes the evidence used for review.</p>
              </div>

              {preprintRepairQuery.isLoading ? (
                <div className="space-y-3" aria-label="Loading repair candidates">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="grid gap-3 rounded-lg border p-4 md:grid-cols-[auto_1.5fr_1fr_1fr]">
                      <Skeleton className="h-4 w-4" />
                      <div className="space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  ))}
                </div>
              ) : preprintRepairQuery.isError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm">
                  <p className="font-medium text-destructive">Candidates could not be loaded.</p>
                  <p className="mt-1 text-muted-foreground">Try again before making a publication status change.</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => preprintRepairQuery.refetch()}>Try again</Button>
                </div>
              ) : preprintRepairCandidates.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
                  <p className="mt-3 font-medium">No repair candidates</p>
                  <p className="mt-1 text-sm text-muted-foreground">The publication register has no eligible ORCID preprint corrections right now.</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-muted-foreground">
                      <span className="font-semibold text-foreground">{preprintRepairCandidates.length}</span> candidate{preprintRepairCandidates.length === 1 ? "" : "s"} · <span className="font-semibold text-foreground">{repairSelectedIds.size}</span> selected
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="text-sm font-medium text-primary hover:underline"
                        onClick={() => setRepairSelectedIds(new Set(preprintRepairCandidates.map((candidate) => candidate.id)))}
                        data-testid="button-select-all-preprint-repairs"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                        onClick={() => setRepairSelectedIds(new Set())}
                      >
                        Clear
                      </button>
                      <Button
                        size="sm"
                        className="gap-2"
                        disabled={repairSelectedIds.size === 0 || repairMutation.isPending}
                        onClick={() => setRepairConfirmOpen(true)}
                        data-testid="button-review-preprint-repair"
                      >
                        <Shield className="h-4 w-4" />
                        Review & apply ({repairSelectedIds.size})
                      </Button>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-lg border">
                    <div className="hidden grid-cols-[auto_1.5fr_1fr_1fr] gap-4 border-b bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
                      <span className="w-4" />
                      <span>Publication</span><span>Current record</span><span>Proposed correction</span>
                    </div>
                    <div className="divide-y">
                      {preprintRepairCandidates.map((candidate) => {
                        const selected = repairSelectedIds.has(candidate.id);
                        return (
                          <div key={candidate.id} className={`grid gap-3 px-4 py-4 transition-colors md:grid-cols-[auto_1.5fr_1fr_1fr] ${selected ? "bg-primary/[0.04]" : "bg-card"}`} data-testid={`row-preprint-repair-${candidate.id}`}>
                            <Checkbox
                              checked={selected}
                              onCheckedChange={(checked) => setRepairSelectedIds((previous) => {
                                const next = new Set(previous);
                                if (checked) next.add(candidate.id); else next.delete(candidate.id);
                                return next;
                              })}
                              aria-label={`Select ${candidate.title}`}
                              className="mt-1"
                            />
                            <div className="min-w-0">
                              <p className="font-medium leading-snug">{candidate.title}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                <span>Publication #{candidate.id}</span>
                                {candidate.doi && <a href={`https://doi.org/${candidate.doi}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><ExternalLink className="h-3 w-3" />{candidate.doi}</a>}
                              </div>
                              <div className="mt-3 space-y-1">
                                <p className="text-xs font-semibold text-muted-foreground">Evidence</p>
                                {candidate.evidence.length > 0 ? candidate.evidence.map((item, index) => <p key={index} className="text-xs leading-relaxed text-muted-foreground">• {item}</p>) : <p className="text-xs italic text-muted-foreground">No evidence details returned</p>}
                              </div>
                            </div>
                            <div className="rounded-md bg-muted/40 p-3 text-sm">
                              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Current</p>
                              <p><span className="text-muted-foreground">Status:</span> {candidate.status || "Not set"}</p>
                              <p><span className="text-muted-foreground">Type:</span> {candidate.publicationType || "Not set"}</p>
                              {(candidate.prepublicationSite || candidate.prepublicationUrl) && <p className="mt-1 truncate text-xs text-muted-foreground">{candidate.prepublicationSite || candidate.prepublicationUrl}</p>}
                            </div>
                            <div className="rounded-md border border-primary/20 bg-primary/[0.04] p-3 text-sm">
                              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-primary">Proposed</p>
                              <p><span className="text-muted-foreground">Status:</span> {candidate.proposed.status}</p>
                              <p><span className="text-muted-foreground">Type:</span> {candidate.proposed.publicationType}</p>
                              {(candidate.proposed.prepublicationSite || candidate.proposed.prepublicationUrl) && <p className="mt-1 truncate text-xs text-muted-foreground">{candidate.proposed.prepublicationSite || candidate.proposed.prepublicationUrl}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {repairResult && (
                <div className="rounded-lg border border-primary/25 bg-primary/[0.04] p-4" data-testid="preprint-repair-result">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">Repair results</p>
                      <p className="text-sm text-muted-foreground">{repairResult.updatedCount} updated{repairResult.skippedCount ? ` · ${repairResult.skippedCount} skipped` : ""}</p>
                      {repairResult.skipped.length > 0 && <div className="mt-2 space-y-1 text-xs text-muted-foreground">{repairResult.skipped.map((item) => <p key={item.id}>Publication #{item.id}: {item.reason}</p>)}</div>}
                    </div>
                  </div>
                </div>
              )}
              <Dialog open={repairConfirmOpen} onOpenChange={setRepairConfirmOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Confirm preprint status repair</DialogTitle>
                    <DialogDescription>
                      You are about to update {repairSelectedIds.size} publication record{repairSelectedIds.size === 1 ? "" : "s"}. The selected records will receive the proposed status and publication type shown above.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                    This is an auditable record change. Confirm that the evidence supports the correction; a prepublication link by itself is not sufficient.
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setRepairConfirmOpen(false)} disabled={repairMutation.isPending}>Cancel</Button>
                    <Button
                      onClick={() => repairMutation.mutate(Array.from(repairSelectedIds))}
                      disabled={repairMutation.isPending || repairSelectedIds.size === 0}
                      className="gap-2"
                      data-testid="button-confirm-preprint-repair"
                    >
                      {repairMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      {repairMutation.isPending ? "Applying repair..." : "Confirm and apply"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
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
                        <SelectItem value="Published - Invalid">Published - Invalid</SelectItem>
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

          {/* Revert Final Approval (rarely used) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-5 w-5" />
                Revert Final Approval
              </CardTitle>
              <CardDescription>
                Unseal a finalized (Published *) publication so it can be edited again. Use sparingly — the record returns to Published status and must be re-vetted.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Search sealed publications by title, DOI, or journal..."
                value={revertSearch}
                onChange={(e) => setRevertSearch(e.target.value)}
                data-testid="input-revert-search"
              />
              {sealedPublications.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {revertSearch.trim() ? 'No sealed publications match your search.' : 'Type a title, DOI, or journal to find a sealed publication.'}
                </p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {sealedPublications.slice(0, 20).map((pub) => (
                    <div key={pub.id} className="flex items-center justify-between gap-3 border rounded-lg p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{pub.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {pub.journal || 'No journal'}{pub.doi ? ` • ${pub.doi}` : ''}
                        </p>
                      </div>
                      {revertConfirmId === pub.id ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => revertFinalMutation.mutate(pub.id)}
                            disabled={revertFinalMutation.isPending}
                            data-testid={`button-confirm-revert-${pub.id}`}
                          >
                            Confirm revert
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setRevertConfirmId(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={() => setRevertConfirmId(pub.id)}
                          data-testid={`button-revert-${pub.id}`}
                        >
                          Revert
                        </Button>
                      )}
                    </div>
                  ))}
                  {sealedPublications.length > 20 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Showing first 20 of {sealedPublications.length} — refine your search.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
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
                    <Label>Time Period</Label>
                    <Select
                      value={sidraRangeMode === "custom" ? "custom" : sidraYears.toString()}
                      onValueChange={(value) => {
                        if (value === "custom") {
                          setSidraRangeMode("custom");
                        } else {
                          setSidraRangeMode("years");
                          setSidraYears(parseInt(value));
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">Last 3 years</SelectItem>
                        <SelectItem value="5">Last 5 years</SelectItem>
                        <SelectItem value="10">Last 10 years</SelectItem>
                        <SelectItem value="custom">Custom range...</SelectItem>
                      </SelectContent>
                    </Select>
                    {sidraRangeMode === "custom" && (
                      <div className="flex items-center gap-2 pt-1">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs text-gray-500 dark:text-gray-400">From</Label>
                          <Input
                            type="month"
                            value={sidraStartMonth}
                            onChange={(e) => setSidraStartMonth(e.target.value)}
                          />
                        </div>
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs text-gray-500 dark:text-gray-400">To</Label>
                          <Input
                            type="month"
                            value={sidraEndMonth}
                            onChange={(e) => setSidraEndMonth(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                    {sidraRangeMode === "custom" && (!sidraStartMonth || !sidraEndMonth) && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">Select both "From" and "To" months.</p>
                    )}
                    {sidraRangeMode === "custom" && sidraStartMonth && sidraEndMonth && sidraStartMonth > sidraEndMonth && (
                      <p className="text-xs text-red-600 dark:text-red-400">"From" must be before "To".</p>
                    )}
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

                  <div className="space-y-2 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="include-non-vetted">Include non-vetted publications</Label>
                      <Switch
                        id="include-non-vetted"
                        checked={sidraIncludeNonVetted}
                        onCheckedChange={setSidraIncludeNonVetted}
                        data-testid="switch-include-non-vetted"
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {sidraIncludeNonVetted
                        ? "Counting all eligible publications, including those not yet fully vetted (Published, Accepted/In Press)."
                        : "Only fully vetted publications (Published *) count toward the score."}
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
                      <Label className="text-sm text-gray-600 dark:text-gray-300">Second or Second Last Author</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={secondAuthorMultiplier}
                        onChange={(e) => setSecondAuthorMultiplier(parseFloat(e.target.value) || 0)}
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
                    disabled={
                      sidraSettingsLoading ||
                      calculateSidraScoresMutation.isPending ||
                      (sidraRangeMode === "custom" &&
                        (!sidraStartMonth || !sidraEndMonth || sidraStartMonth > sidraEndMonth))
                    }
                  >
                    <TrendingUp className="h-4 w-4" />
                    {sidraSettingsLoading
                      ? 'Loading official settings...'
                      : calculateSidraScoresMutation.isPending
                        ? 'Calculating and saving...'
                        : 'Calculate and save official scores'}
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
                    {sidraRangeMode === "custom" && sidraStartMonth && sidraEndMonth
                      ? `Based on publication impact factors from ${sidraStartMonth} to ${sidraEndMonth}`
                      : `Based on publication impact factors from the last ${sidraYears} years`}
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-lg dark:bg-blue-950">
                      <h4 className="font-medium text-blue-900 mb-2 dark:text-blue-200">Calculation Formula</h4>
                      <p className="text-sm text-blue-800 dark:text-blue-300">
                        Sum of journal impact factors for publications {sidraRangeMode === "custom" && sidraStartMonth && sidraEndMonth ? `from ${sidraStartMonth} to ${sidraEndMonth}` : `in the last ${sidraYears} years`}, 
                        using {impactFactorYear === "prior" ? "year prior" : impactFactorYear === "publication" ? "publication year" : "latest available"} impact factors.
                        Multipliers: First Author (×{firstAuthorMultiplier}), 
                        Second or Second Last Author (×{secondAuthorMultiplier}), 
                        Last Author (×{lastAuthorMultiplier}), 
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

      {/* Auto-connect internal authors dialog */}
      {/* Import Links dialog: bulk-link publications to SDRs / staff via Excel template */}
      <Dialog open={linkImportOpen} onOpenChange={(o) => { setLinkImportOpen(o); if (!o) setLinkImportRows(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Links</DialogTitle>
            <DialogDescription>
              Bulk-link publications to SDRs or internal staff from an Excel file.
            </DialogDescription>
          </DialogHeader>

          {!linkImportRows ? (
            <div className="space-y-4">
              <div className="text-sm space-y-2">
                <p>How it works:</p>
                <ol className="list-decimal ml-5 space-y-1">
                  <li>Download the template below. It has 4 columns:
                    <span className="font-medium"> Publication ID</span> (DOI or PMID),
                    <span className="font-medium"> Publication ID Type</span> (DOI / PMID),
                    <span className="font-medium"> Link Type</span> (SDR / Staff), and
                    <span className="font-medium"> Link</span> — an SDR number like SDR200079, or a staff name like John Smith.</li>
                  <li>Fill in one row per link and save the file.</li>
                  <li>Upload it here. You'll get a preview of every link found — with the SDR title or staff job title as confirmation of the match — plus anything that couldn't be matched, before anything is saved.</li>
                </ol>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => { window.location.href = '/api/publications/link-import/template'; }}
                  data-testid="button-download-link-template"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
                <Button
                  onClick={() => linkImportFileRef.current?.click()}
                  disabled={linkImportBusy}
                  data-testid="button-upload-link-file"
                >
                  {linkImportBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  Upload Filled File
                </Button>
                <input
                  ref={linkImportFileRef}
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    setLinkImportBusy(true);
                    try {
                      const buf = await file.arrayBuffer();
                      let binary = '';
                      const bytes = new Uint8Array(buf);
                      for (let i = 0; i < bytes.length; i += 0x8000) {
                        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as any);
                      }
                      const res = await fetch('/api/publications/link-import/preview', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ fileBase64: btoa(binary), fileName: file.name }),
                      });
                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}));
                        throw new Error(err.message || 'Failed to parse the file');
                      }
                      const data = await res.json();
                      setLinkImportRows(data.rows ?? []);
                    } catch (err: any) {
                      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
                    } finally {
                      setLinkImportBusy(false);
                    }
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {(() => {
                const toApply = linkImportRows.filter((r) => r.status === 'matched' && !r.alreadyLinked);
                const alreadyLinked = linkImportRows.filter((r) => r.status === 'matched' && r.alreadyLinked);
                const ignored = linkImportRows.filter((r) => r.status === 'ignored');
                return (
                  <>
                    <div className="text-sm text-muted-foreground">
                      {toApply.length} link{toApply.length === 1 ? '' : 's'} ready to import
                      {alreadyLinked.length > 0 && <> · {alreadyLinked.length} already linked</>}
                      {ignored.length > 0 && <> · {ignored.length} ignored</>}
                    </div>

                    {toApply.length > 0 && (
                      <div className="space-y-2">
                        <div className="font-medium text-sm">Links found</div>
                        {toApply.map((r) => (
                          <div key={r.row} className="border rounded-md p-2 text-sm" data-testid={`row-link-matched-${r.row}`}>
                            <div className="font-medium line-clamp-1">{r.publicationTitle}</div>
                            {r.researchActivityId ? (
                              <div className="text-muted-foreground">
                                → SDR <span className="font-medium">{r.sdrNumber}</span>: {r.sdrTitle}
                                {r.reason && <span className="text-amber-600 dark:text-amber-400"> — {r.reason}</span>}
                              </div>
                            ) : (
                              <div className="text-muted-foreground">
                                → Staff <span className="font-medium">{r.scientistName}</span>
                                {r.scientistJobTitle && <> ({r.scientistJobTitle})</>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {alreadyLinked.length > 0 && (
                      <div className="space-y-2">
                        <div className="font-medium text-sm">Already linked (skipped)</div>
                        {alreadyLinked.map((r) => (
                          <div key={r.row} className="border rounded-md p-2 text-sm opacity-70" data-testid={`row-link-existing-${r.row}`}>
                            <div className="line-clamp-1">{r.publicationTitle}</div>
                            <div className="text-muted-foreground">
                              {r.researchActivityId ? <>SDR {r.sdrNumber}: {r.sdrTitle}</> : <>{r.scientistName}{r.scientistJobTitle && <> ({r.scientistJobTitle})</>}</>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {ignored.length > 0 && (
                      <div className="space-y-2">
                        <div className="font-medium text-sm flex items-center gap-1">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                          Ignored / unmatched
                        </div>
                        {ignored.map((r) => (
                          <div key={r.row} className="border border-amber-200 dark:border-amber-900 rounded-md p-2 text-sm" data-testid={`row-link-ignored-${r.row}`}>
                            <div className="line-clamp-1">
                              Row {r.row}: {r.idValue || '(no ID)'} — {r.linkType || '?'} → {r.linkValue || '(no link)'}
                            </div>
                            <div className="text-amber-600 dark:text-amber-400">{r.reason}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" onClick={() => setLinkImportRows(null)} data-testid="button-link-import-back">
                        Upload Different File
                      </Button>
                      <Button
                        disabled={toApply.length === 0 || linkImportBusy}
                        onClick={async () => {
                          setLinkImportBusy(true);
                          try {
                            const res = await fetch('/api/publications/link-import/apply', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              credentials: 'include',
                              body: JSON.stringify({
                                links: toApply.map((r) => ({
                                  publicationId: r.publicationId,
                                  researchActivityId: r.researchActivityId,
                                  scientistId: r.scientistId,
                                })),
                              }),
                            });
                            if (!res.ok) {
                              const err = await res.json().catch(() => ({}));
                              throw new Error(err.message || 'Import failed');
                            }
                            const result = await res.json();
                            toast({
                              title: 'Links imported',
                              description: `${result.sdrLinks} SDR link${result.sdrLinks === 1 ? '' : 's'} and ${result.staffLinks} staff link${result.staffLinks === 1 ? '' : 's'} created${result.skipped?.length ? `, ${result.skipped.length} skipped` : ''}.`,
                            });
                            queryClient.invalidateQueries({ queryKey: ['/api/publications'] });
                            setLinkImportOpen(false);
                            setLinkImportRows(null);
                          } catch (err: any) {
                            toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
                          } finally {
                            setLinkImportBusy(false);
                          }
                        }}
                        data-testid="button-confirm-link-import"
                      >
                        {linkImportBusy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Import {toApply.length} Link{toApply.length === 1 ? '' : 's'}
                      </Button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!autoConnectPub} onOpenChange={(o) => !o && setAutoConnectPub(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-auto-connect">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Auto-connect internal authors
            </DialogTitle>
            <DialogDescription>
              Review the internal scientists matched against this publication's author
              list. Confirm the ones to link — each link is recorded as an automatic
              link made by you.
            </DialogDescription>
          </DialogHeader>

          {autoConnectPub && (
            <div className="space-y-4">
              <div className="text-sm">
                <div className="font-medium">{autoConnectPub.title}</div>
                <div className="text-muted-foreground">{autoConnectPub.authors}</div>
              </div>

              {suggestionsLoading ? (
                <div className="flex items-center gap-2 py-6 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Matching internal scientists…
                </div>
              ) : suggestionsError ? (
                <div className="text-center py-6 text-destructive" data-testid="text-suggestions-error">
                  Couldn't load author suggestions — the matching request failed. Please
                  try again; if it keeps failing, the server may need to be redeployed.
                </div>
              ) : suggestions.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground" data-testid="text-no-suggestions">
                  No internal scientists matched this author list.
                </div>
              ) : (
                <div className="space-y-2">
                  {suggestions.map((s) => {
                    const name = [s.scientist?.honorificTitle, s.scientist?.firstName, s.scientist?.lastName]
                      .filter(Boolean)
                      .join(" ")
                      .trim() || `Scientist #${s.scientistId}`;
                    const checked = selectedSuggestionIds.has(s.scientistId);
                    const role = suggestionRoles[s.scientistId] ?? s.authorshipType;
                    return (
                      <div
                        key={s.scientistId}
                        className="flex items-center gap-3 rounded-md border p-3 hover:bg-muted/50"
                        data-testid={`suggestion-row-${s.scientistId}`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) =>
                            setSelectedSuggestionIds((prev) => {
                              const next = new Set(prev);
                              if (c) next.add(s.scientistId);
                              else next.delete(s.scientistId);
                              return next;
                            })
                          }
                          data-testid={`checkbox-suggestion-${s.scientistId}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{name}</div>
                          <div className="text-xs text-muted-foreground">
                            Suggested: {s.authorshipType}
                            {s.authorPosition ? ` • position ${s.authorPosition}` : ""}
                          </div>
                        </div>
                        <Select
                          value={role}
                          onValueChange={(v) =>
                            setSuggestionRoles((prev) => ({ ...prev, [s.scientistId]: v }))
                          }
                        >
                          <SelectTrigger
                            className="w-[180px]"
                            data-testid={`select-role-${s.scientistId}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="First Author">First Author</SelectItem>
                            <SelectItem value="Contributing Author">Contributing Author</SelectItem>
                            <SelectItem value="Second or Second Last Author">Second or Second Last Author</SelectItem>
                            <SelectItem value="Last Author">Last Author</SelectItem>
                            <SelectItem value="Corresponding Author">Corresponding Author</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setAutoConnectPub(null)} data-testid="button-cancel-auto-connect">
                  Cancel
                </Button>
                <Button
                  disabled={selectedSuggestionIds.size === 0 || confirmAutoConnectMutation.isPending}
                  onClick={() => {
                    const links = suggestions
                      .filter((s) => selectedSuggestionIds.has(s.scientistId))
                      .map((s) => ({
                        scientistId: s.scientistId,
                        authorshipType: suggestionRoles[s.scientistId] ?? s.authorshipType,
                        authorPosition: s.authorPosition,
                      }));
                    confirmAutoConnectMutation.mutate({ publicationId: autoConnectPub.id, links });
                  }}
                  data-testid="button-confirm-auto-connect"
                >
                  {confirmAutoConnectMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Link {selectedSuggestionIds.size} author{selectedSuggestionIds.size === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
            <SidraScoreDetails result={selectedScientistDetails} />
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
      <Dialog
        open={invalidPublication !== null}
        onOpenChange={(open) => {
          if (!open && !markInvalidMutation.isPending) {
            setInvalidPublication(null);
            setInvalidReason("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mark publication as invalid</DialogTitle>
            <DialogDescription>
              Request a correction from every linked author of “{invalidPublication?.title}”.
              The publication will remain editable and will not be treated as finalized.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="invalid-publication-reason">Reason for correction</Label>
            <Textarea
              id="invalid-publication-reason"
              value={invalidReason}
              onChange={(event) => setInvalidReason(event.target.value.slice(0, 2000))}
              placeholder="Clearly describe what the authors need to correct…"
              rows={6}
              maxLength={2000}
              disabled={markInvalidMutation.isPending}
              aria-describedby="invalid-reason-help"
              data-testid="textarea-invalid-reason"
            />
            <div id="invalid-reason-help" className="flex justify-between text-xs text-muted-foreground">
              <span>A reason is required.</span>
              <span>{invalidReason.length}/2000</span>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setInvalidPublication(null);
                setInvalidReason("");
              }}
              disabled={markInvalidMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (invalidPublication && invalidReason.trim()) {
                  markInvalidMutation.mutate({ id: invalidPublication.id, reason: invalidReason });
                }
              }}
              disabled={!invalidReason.trim() || invalidReason.trim().length > 2000 || markInvalidMutation.isPending}
              data-testid="button-confirm-mark-invalid"
            >
              {markInvalidMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Marking invalid…</>
              ) : (
                "Mark Published - Invalid"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}