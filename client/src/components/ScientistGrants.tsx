import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Coins, Landmark, FolderKanban } from "lucide-react";
import type { Grant } from "@shared/schema";
import { useState } from "react";
import { PREFERENCE_KEYS, readPreference, writePreference } from "@/lib/uiPreference";

export function ScientistGrants({ scientistId, canExpand }: { scientistId: number; canExpand: boolean }) {
  // Remembered per viewer, so reopening a profile shows the grants card the way
  // they left it rather than snapping back to lead-PI only.
  const [includeOther, setIncludeOther] = useState(
    () => readPreference(PREFERENCE_KEYS.profileGrantsIncludeOther) === "true",
  );
  const chooseIncludeOther = (next: boolean) => {
    setIncludeOther(next);
    writePreference(PREFERENCE_KEYS.profileGrantsIncludeOther, String(next));
  };
  const showOther = canExpand && includeOther;
  const { data, isLoading, isError } = useQuery<Grant[]>({
    queryKey: ["/api/scientists", scientistId, "grants", showOther],
    queryFn: async () => { const r = await fetch(`/api/scientists/${scientistId}/grants?includeOther=${showOther}`, { credentials: "include" }); if (!r.ok) throw new Error("Failed to load grants"); return r.json(); },
  });
  const money = (value: unknown) => value ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value)) : "Not recorded";
  return <Card><CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2"><FolderKanban className="h-5 w-5 text-primary" />Grants</CardTitle><p className="mt-1 text-sm text-muted-foreground">Lead-PI awards and active research support.</p></div>{canExpand && <label className="flex items-center gap-2 text-xs text-muted-foreground">Include other grants <Switch checked={includeOther} onCheckedChange={chooseIncludeOther} /></label>}</CardHeader><CardContent>{isLoading ? <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div> : isError ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Grants could not be loaded. Try again later.</p> : !data?.length ? <div className="rounded-lg border border-dashed p-6 text-center"><p className="font-medium">{showOther ? "No grants recorded" : "No active grants recorded"}</p><p className="mt-1 text-sm text-muted-foreground">Lead-PI grants will appear here once they are available.</p></div> : <div className="space-y-3">{data.map((grant) => <div key={grant.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{grant.title}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{grant.projectNumber}</p></div><div className="flex items-center gap-2"><Badge variant={grant.awarded ? "default" : "outline"}>{grant.awarded ? "Awarded" : "Not awarded"}</Badge><Badge variant="outline">{grant.status}</Badge></div></div><div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3"><span className="flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5" />{grant.fundingAgency || "Agency not recorded"}</span><span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{grant.startDate || "Start date not recorded"}{grant.endDate ? ` – ${grant.endDate}` : ""}</span><span className="flex items-center gap-1.5"><Coins className="h-3.5 w-3.5" />{money(grant.awardedAmount || grant.requestedAmount)}</span></div>{grant.description && <p className="mt-3 text-sm text-muted-foreground line-clamp-2">{grant.description}</p>}</div>)}</div>}</CardContent></Card>;
}