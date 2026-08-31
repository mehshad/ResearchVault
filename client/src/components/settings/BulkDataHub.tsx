import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Archive,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Globe,
  Info,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PublicationOffice, { type PublicationOfficeTab } from "@/pages/publication-office";

type Section = {
  id: string;
  label: string;
  description: string;
  sheets: Array<{ name: string; description: string; businessKey: string }>;
};
type PreviewRow = {
  sheetName: string;
  rowNumber: number;
  action: "create" | "update" | "skip" | "error";
  key: string;
  reason?: string;
  changes?: string[] | Record<string, unknown>;
};
type Preview = {
  sectionId: string;
  rows: PreviewRow[];
  sheets: Array<{ sheetName: string; total: number; create: number; update: number; skip: number; error: number }>;
  canApply: boolean;
  fingerprint: string;
};
type ApplyResult = {
  sectionId: string;
  counts: Record<string, { created: number; updated: number; skipped: number }>;
  /** Rows dropped because they failed validation, when skipping was chosen. */
  rejected?: Array<{ sheetName: string; rowNumber: number; key: string; reason: string }>;
};
type BulkDataArchive = {
  id: string;
  status: "pending" | "running" | "succeeded" | "failed";
  source: "manual" | "scheduled";
  scheduleDate: string | null;
  fileName: string | null;
  byteSize: number | null;
  checksum: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};
type ArchiveListResponse = {
  archives: BulkDataArchive[];
  schedule: {
    timezone: string;
    time: string;
    retention: number;
  };
};

const MAX_FILE_BYTES = 8 * 1024 * 1024;

const operations = [
  {
    value: "section-workbooks",
    label: "Section Workbooks",
    description: "Export, review, and import structured records by Q-BRIDGE section.",
    icon: FileSpreadsheet,
  },
  {
    value: "find-papers",
    label: "Discover & Import Papers",
    description: "Find papers from trusted publication sources and import selected records.",
    icon: Globe,
  },
  {
    value: "new-publications",
    label: "Publication Links Workbook",
    description: "Review new publications and import publication-to-SDR or staff links.",
    icon: Upload,
  },
  {
    value: "export",
    label: "Publication Export",
    description: "Search, filter, and export publication records.",
    icon: Download,
  },
  {
    value: "impact-factors",
    label: "Journal Impact Factors",
    description: "Maintain and exchange journal impact-factor data.",
    icon: BarChart3,
  },
] as const;

type Operation = typeof operations[number]["value"];

function OperationSelector({
  value,
  onValueChange,
}: {
  value: Operation;
  onValueChange: (value: Operation) => void;
}) {
  const selected = operations.find((operation) => operation.value === value) ?? operations[0];

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Data import & export operations
        </CardTitle>
        <CardDescription className="max-w-3xl">
          Publication operations below execute the same Publication Office workflows and APIs inline.
          They are the authoritative tools, not copied import or export pipelines.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="md:hidden">
          <Label htmlFor="data-operation">Operation</Label>
          <Select value={value} onValueChange={(next) => onValueChange(next as Operation)}>
            <SelectTrigger id="data-operation" className="mt-2 w-full" data-testid="select-data-operation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {operations.map((operation) => (
                <SelectItem key={operation.value} value={operation.value}>{operation.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Tabs
          value={value}
          onValueChange={(next) => onValueChange(next as Operation)}
          className="hidden md:block"
        >
          <div className="overflow-x-auto pb-1">
            <TabsList className="grid h-auto min-w-[850px] grid-cols-5">
              {operations.map(({ value: operationValue, label, icon: Icon }) => (
                <TabsTrigger
                  key={operationValue}
                  value={operationValue}
                  className="h-full whitespace-normal px-3 py-2 text-center"
                  data-testid={`tab-data-operation-${operationValue}`}
                >
                  <Icon className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
        <p className="text-sm text-muted-foreground">{selected.description}</p>
      </CardContent>
    </Card>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("The workbook could not be read."));
    reader.readAsDataURL(file);
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function actionClass(action: PreviewRow["action"]) {
  if (action === "create") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300";
  if (action === "update") return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300";
  if (action === "error") return "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300";
  return "border-border bg-muted text-muted-foreground";
}

function formatBytes(value: number | null) {
  if (value == null) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function archiveStatusClass(status: BulkDataArchive["status"]) {
  if (status === "succeeded") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300";
  return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300";
}

export default function BulkDataHub() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [operation, setOperation] = useState<Operation>("section-workbooks");
  const [publicationOperation, setPublicationOperation] = useState<PublicationOfficeTab>("find-papers");
  const [publicationWorkspaceMounted, setPublicationWorkspaceMounted] = useState(false);
  const [sectionId, setSectionId] = useState("");
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // A single unreadable cell otherwise costs the whole section: one bad
  // quartile in 33,407 impact-factor rows blocks every publication and author
  // link in the workbook. The server has always supported skipping those rows;
  // nothing offered it.
  const [skipInvalidRows, setSkipInvalidRows] = useState(false);

  const sectionsQuery = useQuery<{ sections: Section[] }>({
    queryKey: ["/api/bulk-data/sections"],
  });
  const sections = sectionsQuery.data?.sections ?? [];
  const selectedSection = sections.find((section) => section.id === sectionId);
  const archivesQuery = useQuery<ArchiveListResponse>({
    queryKey: ["/api/bulk-data/archives"],
    enabled: operation === "section-workbooks",
    refetchInterval: (query) => {
      const archives = query.state.data?.archives ?? [];
      return archives.some((archive) => archive.status === "pending" || archive.status === "running")
        ? 2_000
        : false;
    },
  });
  const archives = archivesQuery.data?.archives ?? [];

  useEffect(() => {
    if (!sectionId && sections[0]) setSectionId(sections[0].id);
  }, [sections, sectionId]);

  const resetWorkbook = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const previewMutation = useMutation({
    mutationFn: async (payload: { fileBase64: string; fileName: string }) => {
      const response = await apiRequest("POST", `/api/bulk-data/${sectionId}/preview`, payload);
      return response.json() as Promise<Preview>;
    },
    onSuccess: setPreview,
    onError: (error: Error) => toast({ title: "Preview unavailable", description: error.message, variant: "destructive" }),
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!file || !preview) throw new Error("Choose a workbook first.");
      const response = await apiRequest("POST", `/api/bulk-data/${sectionId}/apply`, {
        fileBase64: file.base64,
        fileName: file.name,
        fingerprint: preview.fingerprint,
        skipInvalidRows,
      });
      return response.json() as Promise<ApplyResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      setConfirmOpen(false);
      toast({ title: "Workbook applied", description: "The selected records were updated successfully." });
    },
    onError: (error: Error) => toast({ title: "Apply failed", description: error.message, variant: "destructive" }),
  });

  const generateArchiveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/bulk-data/archives", {});
      return response.json() as Promise<{ archive: BulkDataArchive }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bulk-data/archives"] });
      toast({ title: "Archive generation started", description: "The saved ZIP will appear below when generation finishes." });
    },
    onError: (error: Error) => toast({ title: "Archive generation failed", description: error.message, variant: "destructive" }),
  });

  const handleSectionChange = (value: string) => {
    setSectionId(value);
    resetWorkbook();
  };

  const handleOperationChange = (next: Operation) => {
    setOperation(next);
    if (next !== "section-workbooks") {
      setPublicationOperation(next);
      setPublicationWorkspaceMounted(true);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    resetWorkbook();
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".xlsx")) {
      toast({ title: "Unsupported file", description: "Select an .xlsx workbook.", variant: "destructive" });
      return;
    }
    if (selected.size > MAX_FILE_BYTES) {
      toast({ title: "Workbook is too large", description: "Files must be 8 MB or smaller.", variant: "destructive" });
      return;
    }
    try {
      const base64 = await fileToBase64(selected);
      setFile({ name: selected.name, base64 });
      previewMutation.mutate({ fileBase64: base64, fileName: selected.name });
    } catch (error) {
      toast({ title: "Could not read workbook", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    }
  };

  const handleDownload = async (kind: "export" | "template") => {
    if (!sectionId) return;
    try {
      const response = await fetch(`/api/bulk-data/${sectionId}/${kind}`, { credentials: "include" });
      if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
      downloadBlob(await response.blob(), `qbridge-${sectionId}-${kind}.xlsx`);
      toast({ title: kind === "export" ? "Export downloaded" : "Template downloaded" });
    } catch (error) {
      toast({ title: "Download failed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    }
  };

  const handleExportAll = async () => {
    try {
      const response = await fetch("/api/bulk-data/export-all", { credentials: "include" });
      if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="?([^"]+)"?/i);
      downloadBlob(await response.blob(), match?.[1] ?? `qbridge-bulk-data-${new Date().toISOString().slice(0, 10)}.zip`);
      toast({ title: "Complete archive downloaded" });
    } catch (error) {
      toast({ title: "Export all failed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    }
  };

  const handleArchiveDownload = async (archive: BulkDataArchive) => {
    try {
      const response = await fetch(`/api/bulk-data/archives/${archive.id}/download`, { credentials: "include" });
      if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
      downloadBlob(await response.blob(), archive.fileName ?? `qbridge-bulk-data-archive-${archive.id}.zip`);
    } catch (error) {
      toast({ title: "Archive download failed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    }
  };

  const counts = preview?.sheets.reduce(
    (total, sheet) => ({ total: total.total + sheet.total, create: total.create + sheet.create, update: total.update + sheet.update, skip: total.skip + sheet.skip, error: total.error + sheet.error }),
    { total: 0, create: 0, update: 0, skip: 0, error: 0 },
  );
  const errorCount = counts?.error || 0;
  // With skipping on, rows that failed validation are dropped and the rest is
  // written, so a workbook the preview marks unapplyable can still go in.
  const applyReady = Boolean(
    (preview?.canApply || (skipInvalidRows && errorCount > 0)) &&
    (counts?.create || 0) + (counts?.update || 0) > 0 &&
    !applyMutation.isPending,
  );

  if (operation === "section-workbooks" && sectionsQuery.isLoading) {
    return <div className="space-y-6"><OperationSelector value={operation} onValueChange={handleOperationChange} /><Card><CardHeader><Skeleton className="h-6 w-64" /><Skeleton className="h-4 w-96" /></CardHeader><CardContent><Skeleton className="h-10 w-full" /></CardContent></Card></div>;
  }
  if (operation === "section-workbooks" && sectionsQuery.isError) {
    const message = sectionsQuery.error instanceof Error
      ? sectionsQuery.error.message
      : "The server did not return the available data sections.";
    return (
      <div className="space-y-6">
        <OperationSelector value={operation} onValueChange={handleOperationChange} />
        <Card>
          <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 text-destructive">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <div className="font-medium">Unable to load bulk data sections</div>
                <div className="mt-1 text-sm">{message}</div>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => sectionsQuery.refetch()}
              disabled={sectionsQuery.isFetching}
            >
              {sectionsQuery.isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OperationSelector value={operation} onValueChange={handleOperationChange} />
      {operation === "section-workbooks" && (
      <>
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20 pb-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg"><FileSpreadsheet className="h-5 w-5 text-primary" />Bulk data workbook</CardTitle>
              <CardDescription className="mt-1 max-w-2xl">Move structured records between Q-BRIDGE sections with a reviewed preview before anything is written.</CardDescription>
            </div>
            <Badge variant="outline" className="w-fit gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />Administrator workflow</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-4 md:p-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-2">
              <Label htmlFor="bulk-section">Data section</Label>
              <Select value={sectionId} onValueChange={handleSectionChange}>
                <SelectTrigger id="bulk-section" data-testid="select-bulk-section"><SelectValue placeholder="Select a section" /></SelectTrigger>
                <SelectContent>{sections.map((section) => <SelectItem key={section.id} value={section.id}>{section.label}</SelectItem>)}</SelectContent>
              </Select>
              {selectedSection && <p className="text-xs text-muted-foreground">{selectedSection.description}</p>}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Button variant="outline" onClick={() => handleDownload("template")} disabled={!sectionId} data-testid="button-download-template"><Download className="mr-2 h-4 w-4" />Template</Button>
              <Button variant="outline" onClick={() => handleDownload("export")} disabled={!sectionId} data-testid="button-export-bulk-data"><Download className="mr-2 h-4 w-4" />Export current</Button>
              <Button onClick={handleExportAll} data-testid="button-export-all-bulk-data"><Archive className="mr-2 h-4 w-4" />Export all</Button>
            </div>
          </div>

          {selectedSection && (
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Info className="h-3.5 w-3.5" />Workbook sheets</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {selectedSection.sheets.map((sheet) => <div key={sheet.name} className="rounded border bg-background px-3 py-2 text-sm"><div className="font-medium">{sheet.name}</div><div className="text-xs text-muted-foreground">{sheet.description}</div><div className="mt-1 font-mono text-[11px] text-muted-foreground">Key: {sheet.businessKey}</div></div>)}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 rounded-md border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="font-medium">Upload edited workbook</div><div className="text-xs text-muted-foreground">.xlsx only · maximum 8 MB · existing keys are matched for updates</div></div>
            <div className="flex items-center gap-2">
              <Input ref={inputRef} id="bulk-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFileChange} className="max-w-[230px]" data-testid="input-bulk-file" />
              {file && <Badge variant="secondary" className="max-w-[180px] truncate">{file.name}</Badge>}
            </div>
          </div>

          {previewMutation.isPending && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Inspecting workbook and checking business keys…</div>}
          {preview && !previewMutation.isPending && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                {([["Create", counts?.create, "text-emerald-700"], ["Update", counts?.update, "text-blue-700"], ["Skip", counts?.skip, "text-muted-foreground"], ["Errors", counts?.error, "text-red-700"], ["Rows", counts?.total, "text-foreground"]] as const).map(([label, value, color]) => <div key={label} className="rounded border bg-muted/20 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 text-xl font-semibold ${color}`}>{value ?? 0}</div></div>)}
              </div>
              {preview.sheets.length > 0 && <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Sheet</TableHead><TableHead>Total</TableHead><TableHead>Create</TableHead><TableHead>Update</TableHead><TableHead>Skip</TableHead><TableHead>Errors</TableHead></TableRow></TableHeader><TableBody>{preview.sheets.map((sheet) => <TableRow key={sheet.sheetName}><TableCell className="font-medium">{sheet.sheetName}</TableCell><TableCell>{sheet.total}</TableCell><TableCell className="text-emerald-700">{sheet.create}</TableCell><TableCell className="text-blue-700">{sheet.update}</TableCell><TableCell>{sheet.skip}</TableCell><TableCell className="text-red-700">{sheet.error}</TableCell></TableRow>)}</TableBody></Table></div>}
              <div className="rounded-md border">
                <div className="flex items-center justify-between border-b px-3 py-2"><div className="text-sm font-medium">Row review <span className="font-normal text-muted-foreground">({preview.rows.length})</span></div><div className="text-xs text-muted-foreground">Review errors before applying</div></div>
                <div className="max-h-80 overflow-y-auto divide-y">{preview.rows.length === 0 ? <div className="p-4 text-sm text-muted-foreground">No data rows found in this workbook.</div> : preview.rows.map((row) => <details key={`${row.sheetName}-${row.rowNumber}`} className={`group px-3 py-2 text-sm ${row.action === "error" ? "bg-red-50/40 dark:bg-red-950/10" : ""}`}><summary className="flex cursor-pointer list-none items-center gap-2"><Badge variant="outline" className={`uppercase ${actionClass(row.action)}`}>{row.action}</Badge><span className="font-mono text-xs text-muted-foreground">{row.sheetName} · row {row.rowNumber}</span><span className="truncate font-medium">{row.key || "No business key"}</span><ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" /></summary><div className="ml-[76px] mt-2 space-y-1 text-xs text-muted-foreground">{row.reason && <div>{row.reason}</div>}{row.changes && <div>Changes: {Array.isArray(row.changes) ? row.changes.join(", ") : Object.keys(row.changes).join(", ")}</div>}</div></details>)}</div>
              </div>
              {errorCount > 0 && (
                <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20" data-testid="label-skip-invalid-rows">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={skipInvalidRows}
                    onChange={(event) => setSkipInvalidRows(event.target.checked)}
                    data-testid="checkbox-skip-invalid-rows"
                  />
                  <span>
                    <span className="font-medium">Skip the {errorCount} row{errorCount === 1 ? "" : "s"} that failed validation</span>
                    <span className="block text-muted-foreground">
                      Everything else in the workbook is written, and each skipped row is
                      listed afterwards so you know exactly what was left out. Without this
                      a single unreadable cell holds back the whole section.
                    </span>
                  </span>
                </label>
              )}
              {(preview.canApply || (skipInvalidRows && errorCount > 0)) && <div className="flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><span>Applying will write {((counts?.create || 0) + (counts?.update || 0))} reviewed record changes{errorCount > 0 && skipInvalidRows ? `, skipping ${errorCount}` : ""}. This action should be treated as irreversible.</span></div><Button onClick={() => setConfirmOpen(true)} disabled={!applyReady} data-testid="button-apply-bulk-data"><Upload className="mr-2 h-4 w-4" />Review and apply</Button></div>}
            </div>
          )}
          {result && <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20"><div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" />Workbook applied successfully</div><div className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">{Object.entries(result.counts).map(([name, values]) => <div key={name} className="rounded border border-emerald-200/70 bg-background/70 p-2 dark:border-emerald-900"><div className="font-medium">{name}</div><div className="text-muted-foreground">{values.created} created · {values.updated} updated · {values.skipped} skipped</div></div>)}</div>
            {result.rejected && result.rejected.length > 0 && (
              <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40" data-testid="list-rejected-rows">
                <div className="font-medium text-amber-900 dark:text-amber-200">
                  {result.rejected.length} row{result.rejected.length === 1 ? " was" : "s were"} skipped and not written
                </div>
                <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto text-amber-900/90 dark:text-amber-200/90">
                  {result.rejected.map((row, index) => (
                    <li key={`${row.sheetName}-${row.rowNumber}-${index}`}>
                      <span className="font-medium">{row.sheetName} row {row.rowNumber}</span>
                      {row.key ? ` [${row.key}]` : ""}: {row.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>}
        </CardContent>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarClock className="h-5 w-5 text-primary" />
                Saved workbook archives
              </CardTitle>
              <CardDescription className="mt-1">
                A complete ZIP is generated daily at {archivesQuery.data?.schedule.time ?? "02:00"} ({archivesQuery.data?.schedule.timezone ?? "Asia/Riyadh"}).
                The latest {archivesQuery.data?.schedule.retention ?? 30} successful versions are retained.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => archivesQuery.refetch()}
                disabled={archivesQuery.isFetching}
                data-testid="button-refresh-bulk-archives"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${archivesQuery.isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => generateArchiveMutation.mutate()}
                disabled={generateArchiveMutation.isPending || archives.some((archive) => archive.status === "pending" || archive.status === "running")}
                data-testid="button-generate-bulk-archive"
              >
                {generateArchiveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}
                Generate saved version
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {archivesQuery.isLoading ? (
            <div className="space-y-3 p-5"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : archivesQuery.isError ? (
            <div className="flex items-center gap-2 p-5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              Archive history could not be loaded.
            </div>
          ) : archives.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No saved versions yet. Generate one now or wait for the next scheduled export.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Created</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Download</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {archives.map((archive) => (
                    <TableRow key={archive.id}>
                      <TableCell>
                        <div className="font-medium">{new Date(archive.createdAt).toLocaleString()}</div>
                        {archive.scheduleDate && <div className="text-xs text-muted-foreground">Scheduled date: {archive.scheduleDate}</div>}
                      </TableCell>
                      <TableCell className="capitalize">{archive.source}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={archiveStatusClass(archive.status)}>
                          {(archive.status === "pending" || archive.status === "running") && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          {archive.status}
                        </Badge>
                        {archive.errorMessage && <div className="mt-1 max-w-sm text-xs text-destructive">{archive.errorMessage}</div>}
                      </TableCell>
                      <TableCell>{formatBytes(archive.byteSize)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleArchiveDownload(archive)}
                          disabled={archive.status !== "succeeded"}
                          data-testid={`button-download-bulk-archive-${archive.id}`}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Apply this workbook?</AlertDialogTitle><AlertDialogDescription>This will create {counts?.create ?? 0} records and update {counts?.update ?? 0} records in {selectedSection?.label ?? "this section"}. Verify the preview carefully before continuing.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel data-testid="button-cancel-bulk-apply">Cancel</AlertDialogCancel><AlertDialogAction onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending} data-testid="button-confirm-bulk-apply">{applyMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Applying…</> : "Yes, apply workbook"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </>
      )}
      {publicationWorkspaceMounted && (
        <div hidden={operation === "section-workbooks"}>
          <PublicationOffice embeddedTab={publicationOperation} />
        </div>
      )}
    </div>
  );
}