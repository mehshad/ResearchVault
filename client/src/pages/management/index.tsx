import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  Building2,
  CheckCircle2,
  Download,
  FileBarChart,
  FileText,
  FlaskConical,
  Handshake,
  Lightbulb,
  Loader2,
  RefreshCw,
  ShieldX,
  Sparkles,
  Target,
  Users,
  WalletCards,
} from "lucide-react";
import { OfficeDashboard } from "@/components/office-dashboard";
import PublicationOffice from "@/pages/publication-office";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePermissions } from "@/hooks/usePermissions";
import {
  buildManagementReportRequest,
  filenameFromDisposition,
  REPORT_DOMAINS,
  responseError,
  type ManagementReportConfig,
  type ReportDomain,
  type ReportTargetType,
} from "@/lib/managementReports";

type Option = { id: number; name?: string; label?: string; firstName?: string; lastName?: string; honorificTitle?: string };
type ReportOptions = {
  staff?: Option[];
  scientists?: Option[];
  sections?: Option[];
  publicationStatuses?: string[];
  contractStatuses?: string[];
  patentStatuses?: string[];
  statuses?: {
    publications?: string[];
    publication?: string[];
    contracts?: string[];
    contract?: string[];
    patents?: string[];
    patent?: string[];
  };
  defaults?: Partial<ManagementReportConfig>;
};
type Preview = {
  counts?: Record<string, number>;
  domains?: Record<string, { count?: number; total?: number } | number>;
  total?: number;
  recordCount?: number;
  definitions?: string[] | Record<string, string>;
  configSummary?: string[] | Record<string, unknown>;
  summary?: string[] | Record<string, unknown>;
  filterDefinitions?: Record<string, string>;
  [key: string]: unknown;
};

const domainCopy: Record<ReportDomain, { label: string; description: string; icon: typeof Target }> = {
  overview: { label: "Overview", description: "A concise cross-domain executive summary.", icon: BarChart3 },
  sdrs: { label: "SDRs", description: "Scientific data records owned by or linked to the target.", icon: FlaskConical },
  publications: { label: "Publications", description: "Research outputs and their current workflow status.", icon: BookOpen },
  grants: { label: "Grants", description: "Submitted and awarded funding linked to the target.", icon: WalletCards },
  contracts: { label: "Contracts", description: "Research agreements and their current status.", icon: Handshake },
  patents: { label: "Patents", description: "Intellectual-property records and filing outcomes.", icon: Lightbulb },
  sidra: { label: "SIDRA", description: "Official SIDRA publication score using shared settings.", icon: Sparkles },
};

function optionLabel(option: Option) {
  return option.label || option.name ||
    [option.honorificTitle, option.firstName, option.lastName].filter(Boolean).join(" ") ||
    `Record ${option.id}`;
}

function statusOptions(options: ReportOptions | undefined, domain: "publication" | "contract" | "patent") {
  const direct = domain === "publication"
    ? options?.publicationStatuses
    : domain === "contract"
      ? options?.contractStatuses
      : options?.patentStatuses;
  if (direct) return direct;
  return options?.statuses?.[`${domain}s` as keyof NonNullable<ReportOptions["statuses"]>] ??
    options?.statuses?.[domain] ?? [];
}

function previewCount(preview: Preview, domain: ReportDomain): number | null {
  if (typeof preview.counts?.[domain] === "number") return preview.counts[domain];
  const value = preview.domains?.[domain];
  if (typeof value === "number") return value;
  if (value && typeof value.count === "number") return value.count;
  if (value && typeof value.total === "number") return value.total;
  const direct = preview[domain];
  if (direct && typeof direct === "object") {
    const count = (direct as { count?: unknown; total?: unknown }).count ??
      (direct as { total?: unknown }).total;
    if (typeof count === "number") return count;
  }
  return null;
}

function StatusFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  if (!options.length) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onChange(selected.length === options.length ? [] : [...options])}
        >
          {selected.length === options.length ? "Clear" : "Select all"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((status) => {
          const checked = selected.includes(status);
          return (
            <label
              key={status}
              className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-2.5 py-2 text-xs hover:bg-accent"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(next) =>
                  onChange(next ? [...selected, status] : selected.filter((item) => item !== status))
                }
              />
              {status}
            </label>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">No selection includes every status.</p>
    </div>
  );
}

function ReportBuilder() {
  const optionsQuery = useQuery<ReportOptions>({
    queryKey: ["/api/management/report-options"],
    queryFn: async () => {
      const response = await fetch("/api/management/report-options", { credentials: "include" });
      if (!response.ok) throw await responseError(response, "Report options could not be loaded.");
      return response.json();
    },
  });
  const options = optionsQuery.data;
  const staff = options?.staff ?? options?.scientists ?? [];
  const sections = options?.sections ?? [];
  const publicationStatuses = statusOptions(options, "publication");
  const contractStatuses = statusOptions(options, "contract");
  const patentStatuses = statusOptions(options, "patent");
  const [config, setConfig] = useState<ManagementReportConfig>({
    targetType: "section",
    targetId: null,
    domains: [...REPORT_DOMAINS],
    lookbackYears: 5,
    activeSdrOnly: true,
    awardedGrantsOnly: false,
    publicationStatuses: [],
    contractStatuses: [],
    patentStatuses: [],
  });
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    if (!options?.defaults) return;
    setConfig((current) => ({ ...current, ...options.defaults }));
  }, [options?.defaults]);

  const previewMutation = useMutation({
    mutationFn: async () => {
      const request = buildManagementReportRequest(config);
      const response = await fetch("/api/management/reports/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw await responseError(response, "The report preview could not be generated.");
      return response.json() as Promise<Preview>;
    },
  });

  const pdfMutation = useMutation({
    mutationFn: async () => {
      setDownloadError("");
      const request = buildManagementReportRequest(config);
      const response = await fetch("/api/management/reports/pdf", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/pdf" },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw await responseError(response, "The PDF could not be generated.");
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/pdf")) {
        throw new Error("The server returned an invalid PDF response.");
      }
      return {
        blob: await response.blob(),
        filename: filenameFromDisposition(response.headers.get("content-disposition")),
      };
    },
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },
    onError: (error: Error) => setDownloadError(error.message),
  });

  const selectedTarget = useMemo(() => {
    const source = config.targetType === "staff" ? staff : sections;
    return source.find((item) => item.id === config.targetId);
  }, [config.targetId, config.targetType, sections, staff]);
  const preview = previewMutation.data;

  if (optionsQuery.isLoading) {
    return <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,.7fr)]"><Skeleton className="h-[620px]" /><Skeleton className="h-[420px]" /></div>;
  }
  if (optionsQuery.isError) {
    return (
      <Card>
        <CardContent className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
          <AlertCircle className="h-7 w-7 text-destructive" />
          <div><p className="font-medium">Report controls are unavailable</p><p className="text-sm text-muted-foreground">{(optionsQuery.error as Error).message}</p></div>
          <Button variant="outline" onClick={() => optionsQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/25">
          <CardTitle className="flex items-center gap-2"><FileBarChart className="h-5 w-5 text-primary" />Report control panel</CardTitle>
          <CardDescription>Choose one organizational target, then compose independent evidence domains.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 p-5 md:p-6">
          <section className="space-y-3">
            <div><h3 className="text-sm font-semibold">1. Reporting target</h3><p className="text-xs text-muted-foreground">Staff reports follow linked records; section reports include records assigned to that section.</p></div>
            <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
              <Select
                value={config.targetType}
                onValueChange={(value: ReportTargetType) => {
                  setConfig((current) => ({ ...current, targetType: value, targetId: null }));
                  previewMutation.reset();
                }}
              >
                <SelectTrigger aria-label="Target type"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="staff">Staff member</SelectItem><SelectItem value="section">Section</SelectItem></SelectContent>
              </Select>
              <Select
                value={config.targetId ? String(config.targetId) : undefined}
                onValueChange={(value) => { setConfig((current) => ({ ...current, targetId: Number(value) })); previewMutation.reset(); }}
              >
                <SelectTrigger aria-label={`Select ${config.targetType}`}><SelectValue placeholder={`Select a ${config.targetType}…`} /></SelectTrigger>
                <SelectContent>
                  {(config.targetType === "staff" ? staff : sections).map((option) =>
                    <SelectItem key={option.id} value={String(option.id)}>{optionLabel(option)}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div><h3 className="text-sm font-semibold">2. Evidence domains</h3><p className="text-xs text-muted-foreground">Each domain can be included or excluded independently.</p></div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfig((current) => ({ ...current, domains: current.domains.length === REPORT_DOMAINS.length ? [] : [...REPORT_DOMAINS] }))}>{config.domains.length === REPORT_DOMAINS.length ? "Clear all" : "Select all"}</Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {REPORT_DOMAINS.map((domain) => {
                const item = domainCopy[domain];
                const Icon = item.icon;
                const checked = config.domains.includes(domain);
                return (
                  <label key={domain} className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${checked ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40"}`}>
                    <Checkbox
                      className="mt-0.5"
                      checked={checked}
                      onCheckedChange={(next) => {
                        setConfig((current) => ({ ...current, domains: next ? [...current.domains, domain] : current.domains.filter((value) => value !== domain) }));
                        previewMutation.reset();
                      }}
                    />
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span><span className="block text-sm font-medium">{item.label}</span><span className="block text-xs leading-relaxed text-muted-foreground">{item.description}</span></span>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="space-y-4">
            <div><h3 className="text-sm font-semibold">3. Boundaries & filters</h3><p className="text-xs text-muted-foreground">Filters only affect their relevant domain and do not redefine the other counts.</p></div>
            <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-3">
              <div className="space-y-2"><Label>Lookback period</Label><Select value={String(config.lookbackYears)} onValueChange={(value) => setConfig((current) => ({ ...current, lookbackYears: Number(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[1, 2, 3, 5, 10, 15, 20].map((year) => <SelectItem key={year} value={String(year)}>{year} year{year === 1 ? "" : "s"}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Applied to dated evidence.</p></div>
              <div className="flex items-start justify-between gap-3 rounded-md bg-muted/35 p-3"><div><Label htmlFor="active-sdr">Active SDRs only</Label><p className="mt-1 text-xs text-muted-foreground">Exclude completed, paused, and planning SDRs.</p></div><Switch id="active-sdr" checked={config.activeSdrOnly} onCheckedChange={(value) => setConfig((current) => ({ ...current, activeSdrOnly: value }))} /></div>
              <div className="flex items-start justify-between gap-3 rounded-md bg-muted/35 p-3"><div><Label htmlFor="awarded-grants">Awarded grants only</Label><p className="mt-1 text-xs text-muted-foreground">Exclude pre-award and unsuccessful applications.</p></div><Switch id="awarded-grants" checked={config.awardedGrantsOnly} onCheckedChange={(value) => setConfig((current) => ({ ...current, awardedGrantsOnly: value }))} /></div>
            </div>
            {config.domains.includes("publications") && <StatusFilter label="Publication status" options={publicationStatuses} selected={config.publicationStatuses} onChange={(value) => setConfig((current) => ({ ...current, publicationStatuses: value }))} />}
            {config.domains.includes("contracts") && <StatusFilter label="Contract status" options={contractStatuses} selected={config.contractStatuses} onChange={(value) => setConfig((current) => ({ ...current, contractStatuses: value }))} />}
            {config.domains.includes("patents") && <StatusFilter label="Patent status" options={patentStatuses} selected={config.patentStatuses} onChange={(value) => setConfig((current) => ({ ...current, patentStatuses: value }))} />}
          </section>

          {(previewMutation.isError || downloadError) && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>{downloadError ? "PDF download failed" : "Preview failed"}</AlertTitle><AlertDescription>{downloadError || (previewMutation.error as Error)?.message}</AlertDescription></Alert>}
          <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
            <Button variant="outline" disabled={previewMutation.isPending || pdfMutation.isPending} onClick={() => previewMutation.mutate()}>{previewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BarChart3 className="mr-2 h-4 w-4" />}Preview counts</Button>
            <Button disabled={previewMutation.isPending || pdfMutation.isPending} onClick={() => pdfMutation.mutate()}>{pdfMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Download PDF</Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-5 xl:sticky xl:top-5">
        <Card>
          <CardHeader><CardTitle className="text-base">Configuration summary</CardTitle><CardDescription>The exact boundaries sent to preview and PDF.</CardDescription></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Target</span><span className="text-right font-medium">{selectedTarget ? optionLabel(selectedTarget) : "Not selected"}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Target type</span><span className="capitalize">{config.targetType}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Lookback</span><span>{config.lookbackYears} year{config.lookbackYears === 1 ? "" : "s"}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">SDR boundary</span><span>{config.activeSdrOnly ? "Active only" : "All statuses"}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Grant boundary</span><span>{config.awardedGrantsOnly ? "Awarded only" : "All grants"}</span></div>
            <div><span className="text-muted-foreground">Included domains</span><div className="mt-2 flex flex-wrap gap-1">{config.domains.length ? config.domains.map((domain) => <Badge key={domain} variant="secondary">{domainCopy[domain].label}</Badge>) : <span className="text-destructive">None selected</span>}</div></div>
            {[
              ["Publication", config.publicationStatuses],
              ["Contract", config.contractStatuses],
              ["Patent", config.patentStatuses],
            ].map(([label, statuses]) => (
              <div key={label as string} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{label as string} statuses</span>
                <span className="max-w-[60%] text-right">{(statuses as string[]).length ? (statuses as string[]).join(", ") : "All"}</span>
              </div>
            ))}
            <div className="rounded-md bg-muted/45 p-3 text-xs leading-relaxed text-muted-foreground">Status lists left empty mean all statuses. SDR and grant switches apply only to those domains. SIDRA uses the official shared score settings.</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Preview</CardTitle><CardDescription>Counts are generated by the same report boundary rules.</CardDescription></CardHeader>
          <CardContent>
            {!preview ? (
              <div className="flex min-h-40 flex-col items-center justify-center text-center"><FileText className="mb-3 h-8 w-8 text-muted-foreground/50" /><p className="text-sm font-medium">No preview yet</p><p className="mt-1 max-w-xs text-xs text-muted-foreground">Select a target and preview before downloading to confirm report coverage.</p></div>
            ) : (
              <div className="space-y-2">
                {config.domains.map((domain) => {
                  const count = previewCount(preview, domain);
                  return <div key={domain} className="flex items-center justify-between rounded-md border px-3 py-2.5"><span className="text-sm">{domainCopy[domain].label}</span>{count === null ? <span className="text-xs text-muted-foreground">Included</span> : <span className="font-mono text-sm font-semibold">{count.toLocaleString()}</span>}</div>;
                })}
                {(
                  preview.total === 0 ||
                  preview.recordCount === 0 ||
                  (config.domains.length > 0 && config.domains.every((domain) => previewCount(preview, domain) === 0))
                ) && <div className="mt-3 rounded-md border border-dashed p-4 text-center"><p className="text-sm font-medium">No matching records</p><p className="mt-1 text-xs text-muted-foreground">Broaden the lookback or status filters, or choose another target.</p></div>}
                {(typeof preview.total === "number" || typeof preview.recordCount === "number") && <div className="flex justify-between border-t pt-3 text-sm font-semibold"><span>Total records</span><span>{(preview.total ?? preview.recordCount ?? 0).toLocaleString()}</span></div>}
              </div>
            )}
          </CardContent>
        </Card>

        <Alert><CheckCircle2 className="h-4 w-4 text-primary" /><AlertTitle>Definitions stay visible</AlertTitle><AlertDescription>“Current status” is a live stock; dated records are limited by lookback. Monetary values and SIDRA scores are not combined into one synthetic performance score.</AlertDescription></Alert>
        {preview?.filterDefinitions && (
          <Card>
            <CardHeader><CardTitle className="text-base">Report definitions</CardTitle><CardDescription>Server-applied inclusion rules for this preview.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(preview.filterDefinitions).map(([key, definition]) => (
                <div key={key}><p className="text-xs font-semibold capitalize">{key.replace(/([A-Z])/g, " $1")}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{definition}</p></div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function ManagementHub() {
  const { currentUser } = useCurrentUser();
  const { canViewAs } = usePermissions();
  if (!canViewAs(currentUser, "management")) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <Card className="max-w-md"><CardContent className="flex flex-col items-center p-8 text-center"><ShieldX className="mb-4 h-10 w-10 text-muted-foreground" /><h1 className="text-xl font-semibold">Management access required</h1><p className="mt-2 text-sm text-muted-foreground">This hub contains institution-wide reporting and is only available to authorized management roles.</p></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="rounded-2xl border border-primary/20 bg-[linear-gradient(120deg,hsl(var(--primary)/.12),hsl(var(--card))_58%)] p-5 md:p-7">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div><p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-primary"><Building2 className="h-4 w-4" />Institutional oversight</p><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Management hub</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Cross-office operational evidence, official SIDRA scoring, and defensible staff or section reports in one protected workspace.</p></div>
          <Badge variant="outline" className="w-fit bg-background/70"><Users className="mr-1.5 h-3.5 w-3.5" />Management access</Badge>
        </div>
      </div>
      <Tabs defaultValue="reports" className="space-y-5">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto bg-muted/55 p-1">
          <TabsTrigger value="reports">Report builder</TabsTrigger>
          <TabsTrigger value="pmo">PMO</TabsTrigger>
          <TabsTrigger value="research">Research office</TabsTrigger>
          <TabsTrigger value="outcome">Outcome office</TabsTrigger>
          <TabsTrigger value="sidra">SIDRA score</TabsTrigger>
        </TabsList>
        <TabsContent value="reports"><ReportBuilder /></TabsContent>
        <TabsContent value="pmo"><OfficeDashboard kind="pmo" /></TabsContent>
        <TabsContent value="research"><OfficeDashboard kind="research" /></TabsContent>
        <TabsContent value="outcome"><OfficeDashboard kind="outcome" /></TabsContent>
        <TabsContent value="sidra">
          <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4"><h2 className="font-semibold">Official SIDRA score workspace</h2><p className="mt-1 text-sm text-muted-foreground">This is the shared Publication Office SIDRA workflow. Its institutional settings and multipliers are not copied or overridden by Management Hub.</p></div>
          <PublicationOffice embeddedTab="sidra-score" />
        </TabsContent>
      </Tabs>
    </div>
  );
}