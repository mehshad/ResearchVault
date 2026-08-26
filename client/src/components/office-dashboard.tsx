import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, BarChart3, CalendarDays, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartLegendContent, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import {
  dashboardWorkflowLinks,
  flattenDashboardBuckets,
  type DashboardBucket,
  type OfficeDashboardKind,
} from "@/lib/officeDashboard";

type Kind = OfficeDashboardKind;
type Bucket = DashboardBucket;
type Stock = Record<string, number>;
type Dashboard = {
  metadata: { partialData?: string[] };
  intakeByType?: Bucket[]; transitionsByOutcome?: Bucket[]; currentStatusStocks?: Stock;
  grantsByRecordedYear?: { year: number; submitted: number; awarded: number }[];
  contractIntake?: Bucket[]; contractStarts?: Bucket[]; contractEnds?: Bucket[];
  fundingTotalsByCurrency?: { requested: Stock; awarded: Stock };
  currentGrantStatusStocks?: Stock; currentContractStatusStocks?: Stock;
  publicationVolumeByType?: Bucket[]; manuscriptTransitions?: Bucket[]; ipVettingActivity?: Bucket[];
};
const colors = ["#157f7a", "#d47a45", "#3d6f9d", "#8a5b8c", "#b59a38", "#526b62"];
const title = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const ago = (months: number) => { const date = new Date(); date.setMonth(date.getMonth() - months); return date.toISOString().slice(0, 10); };

function configFor(rows: Record<string, unknown>[]) {
  const hidden = new Set(["period", "total", "year"]);
  const keys = [...new Set(rows.flatMap(row => Object.keys(row).filter(key => !hidden.has(key) && typeof row[key] === "number")))];
  return { keys, config: Object.fromEntries(keys.map((key, i) => [key, { label: title(key), color: colors[i % colors.length] }])) as ChartConfig };
}
function ChartCard({ heading, note, buckets, type = "line" }: { heading: string; note: string; buckets: Bucket[]; type?: "line" | "bar" }) {
  const rows = flattenDashboardBuckets(buckets);
  const { keys, config } = configFor(rows);
  const Chart = type === "bar" ? BarChart : LineChart;
  return <Card className="min-h-[300px] overflow-hidden"><CardHeader className="pb-0"><CardTitle className="text-base">{heading}</CardTitle><CardDescription>{note}</CardDescription></CardHeader><CardContent className="pt-4">{!rows.length || !keys.length ? <div className="flex h-[215px] items-center justify-center text-sm text-muted-foreground">No recorded movement in this period.</div> : <ChartContainer config={config} className="h-[215px] w-full aspect-auto"><Chart data={rows} margin={{ left: -18, right: 8, top: 8 }}><CartesianGrid vertical={false} strokeDasharray="2 4" /><XAxis dataKey="period" tickLine={false} axisLine={false} minTickGap={26} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} width={34} /><Tooltip content={<ChartTooltipContent />} /><Legend content={<ChartLegendContent />} />{keys.map((key, i) => type === "bar" ? <Bar key={key} dataKey={key} fill={colors[i % colors.length]} radius={[3, 3, 0, 0]} /> : <Line key={key} dataKey={key} type="monotone" stroke={colors[i % colors.length]} strokeWidth={2.25} dot={false} />)}</Chart></ChartContainer>}</CardContent></Card>;
}
function YearChart({ data }: { data: Dashboard["grantsByRecordedYear"] }) {
  const rows = (data ?? []).map(item => ({ period: String(item.year), submitted: item.submitted, awarded: item.awarded }));
  return <Card className="min-h-[300px]"><CardHeader className="pb-0"><CardTitle className="text-base">Grant movement by recorded year</CardTitle><CardDescription>Submission and award records have year precision.</CardDescription></CardHeader><CardContent className="pt-4">{!rows.length ? <div className="flex h-[215px] items-center justify-center text-sm text-muted-foreground">No grant records in this period.</div> : <ChartContainer config={{ submitted: { label: "Submitted", color: colors[0] }, awarded: { label: "Awarded", color: colors[1] } }} className="h-[215px] w-full aspect-auto"><BarChart data={rows} margin={{ left: -18, right: 8, top: 8 }}><CartesianGrid vertical={false} strokeDasharray="2 4" /><XAxis dataKey="period" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} width={34} /><Tooltip content={<ChartTooltipContent />} /><Legend content={<ChartLegendContent />} /><Bar dataKey="submitted" fill={colors[0]} radius={[3,3,0,0]} /><Bar dataKey="awarded" fill={colors[1]} radius={[3,3,0,0]} /></BarChart></ChartContainer>}</CardContent></Card>;
}
function StockCard({ label, values }: { label: string; values?: Stock }) {
  const entries = Object.entries(values ?? {});
  return <Card><CardHeader className="pb-2"><CardTitle className="text-base">{label}</CardTitle><CardDescription>Current stock, not historical activity.</CardDescription></CardHeader><CardContent className="space-y-2">{entries.length ? entries.map(([key, count]) => <div key={key} className="flex justify-between border-b pb-2 text-sm last:border-0"><span>{title(key)}</span><span className="font-mono font-semibold">{Number(count).toLocaleString()}</span></div>) : <p className="py-3 text-sm text-muted-foreground">No current stock reported.</p>}</CardContent></Card>;
}
function FundingCard({ funding }: { funding?: Dashboard["fundingTotalsByCurrency"] }) {
  const rows = [...new Set([...Object.keys(funding?.requested ?? {}), ...Object.keys(funding?.awarded ?? {})])].map(currency => ({ currency, requested: funding?.requested[currency] ?? 0, awarded: funding?.awarded[currency] ?? 0 }));
  return <Card><CardHeader className="pb-2"><CardTitle className="text-base">Funding totals by currency</CardTitle><CardDescription>Amounts remain separated by currency.</CardDescription></CardHeader><CardContent className="space-y-2">{rows.length ? rows.map(row => <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b pb-2 text-sm last:border-0" key={row.currency}><span className="font-medium">{row.currency}</span><span className="font-mono text-muted-foreground">Req. {row.requested.toLocaleString()}</span><span className="font-mono">Award. {row.awarded.toLocaleString()}</span></div>) : <p className="py-3 text-sm text-muted-foreground">No funding totals reported.</p>}</CardContent></Card>;
}

export function OfficeDashboard({ kind }: { kind: Kind }) {
  const [from, setFrom] = useState(() => ago(11)); const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10)); const [interval, setInterval] = useState("month");
  const query = useMemo(() => new URLSearchParams({ from, to, interval }).toString(), [from, to, interval]);
  const { data, isLoading, isError, refetch } = useQuery<Dashboard>({ queryKey: ["office-dashboard", kind, query], queryFn: async () => { const response = await fetch(`/api/office-dashboards/${kind}?${query}`, { credentials: "include" }); if (!response.ok) throw new Error("Dashboard unavailable"); return response.json(); } });
  const copy = { pmo: ["PMO movement desk", "Intake, review transitions, and live workload—kept deliberately distinct."], research: ["Research office pulse", "Funding and agreement movement without mistaking live stock for history."], outcome: ["Outcome office overview", "Publication evidence and operational follow-through in one readout."] }[kind];
  const links = dashboardWorkflowLinks[kind];
  return <section className="space-y-5"><div className="rounded-2xl border border-primary/20 bg-[linear-gradient(120deg,hsl(var(--primary)/.1),hsl(var(--card))_52%)] p-5 md:p-6"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-primary"><BarChart3 className="h-4 w-4" />Operational telemetry</p><h1 className="text-2xl font-semibold tracking-tight">{copy[0]}</h1><p className="mt-1 text-sm text-muted-foreground">{copy[1]}</p></div><div className="flex flex-wrap gap-2"><input aria-label="From date" className="h-9 rounded-md border bg-background px-2 text-sm" type="date" value={from} onChange={event => setFrom(event.target.value)} /><input aria-label="To date" className="h-9 rounded-md border bg-background px-2 text-sm" type="date" value={to} onChange={event => setTo(event.target.value)} /><Select value={interval} onValueChange={setInterval}><SelectTrigger className="h-9 w-28"><CalendarDays className="mr-2 h-3.5 w-3.5" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="month">Monthly</SelectItem><SelectItem value="quarter">Quarterly</SelectItem><SelectItem value="year">Yearly</SelectItem></SelectContent></Select></div></div></div>
    {isLoading ? <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-[300px]" /><Skeleton className="h-[300px]" /></div> : isError ? <Card><CardContent className="flex min-h-40 flex-col items-center justify-center gap-3 text-center"><AlertTriangle className="h-6 w-6 text-destructive" /><div><p className="font-medium">The dashboard is unavailable</p><p className="text-sm text-muted-foreground">Workflows remain available while the reporting feed is retried.</p></div><Button variant="outline" onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button></CardContent></Card> : data ? <><details className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm"><summary className="cursor-pointer font-medium">Data notes & reporting boundaries</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">{(data.metadata.partialData ?? []).map(note => <li key={note}>{note}</li>)}</ul></details>
      {kind === "pmo" && <><div className="grid gap-4 xl:grid-cols-2"><ChartCard heading="Intake by application form" note="Created applications by recorded period." buckets={data.intakeByType ?? []} /><ChartCard heading="Review transitions & outcomes" note="Timestamped review-history events only." buckets={data.transitionsByOutcome ?? []} type="bar" /></div><StockCard label="Current workload by status" values={data.currentStatusStocks} /></>}
      {kind === "research" && <><div className="grid gap-4 xl:grid-cols-2"><YearChart data={data.grantsByRecordedYear} /><ChartCard heading="Contract intake" note="Initiation-requested dates, with named fallbacks." buckets={data.contractIntake ?? []} /></div><div className="grid gap-4 xl:grid-cols-2"><ChartCard heading="Contract starts & expirations" note="Recorded contract start events." buckets={data.contractStarts ?? []} /><ChartCard heading="Contract ends" note="Recorded contract end events." buckets={data.contractEnds ?? []} type="bar" /></div><div className="grid gap-4 xl:grid-cols-3"><FundingCard funding={data.fundingTotalsByCurrency} /><StockCard label="Current grant workload" values={data.currentGrantStatusStocks} /><StockCard label="Current contract workload" values={data.currentContractStatusStocks} /></div></>}
      {kind === "outcome" && <><div className="grid gap-4 xl:grid-cols-2"><ChartCard heading="Publication volume by type" note="Publication dates by recorded type." buckets={data.publicationVolumeByType ?? []} type="bar" /><ChartCard heading="Recorded manuscript transitions" note="Workflow history events by destination status." buckets={data.manuscriptTransitions ?? []} /></div><div className="grid gap-4 xl:grid-cols-2"><ChartCard heading="IP-vetting activity" note="Explicitly recorded vetting transitions only." buckets={data.ipVettingActivity ?? []} type="bar" /><StockCard label="Current publication queues" values={data.currentStatusStocks} /></div></>}
      <Card><CardHeader><CardTitle className="text-base">Workflow routes</CardTitle><CardDescription>Continue into the records behind this dashboard.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2">{links.map(item => <Link key={item.href} href={item.href} className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent">{item.label}<ArrowRight className="ml-2 h-3.5 w-3.5" /></Link>)}</CardContent></Card></> : null}</section>;
}