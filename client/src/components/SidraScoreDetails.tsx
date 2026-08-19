import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { SidraScoreResult } from "@shared/sidraScore";

interface SidraScoreDetailsProps {
  result: SidraScoreResult;
  missingPapers?: Array<{ doi: string; title: string; journal: string; year: number | null; source: string; isPreprint?: boolean }>;
}

export function SidraScoreDetails({ result, missingPapers = [] }: SidraScoreDetailsProps) {
  const settings = result.settings;
  const range = settings.startMonth && settings.endMonth
    ? `${settings.startMonth} to ${settings.endMonth}`
    : `the last ${settings.years} years`;
  const roleText = Object.entries(settings.multipliers).map(([role, value]) => `${role} ×${value}`).join(" · ");
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">Total score</p><p className="mt-1 text-2xl font-semibold text-primary">{result.sidraScore.toFixed(2)}</p></div>
        <div className="rounded-lg border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">Included works</p><p className="mt-1 text-2xl font-semibold">{result.publicationsCount}</p></div>
        <div className="rounded-lg border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">Excluded works</p><p className="mt-1 text-2xl font-semibold">{result.excludedPublications.length}</p></div>
        <div className="rounded-lg border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">External works found</p><p className="mt-1 text-2xl font-semibold">{missingPapers.length}</p></div>
      </div>
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Info className="h-4 w-4 text-primary" />Official calculation rules</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p><strong className="text-foreground">Time range:</strong> {range}</p>
          <p><strong className="text-foreground">Impact factor year:</strong> {settings.impactFactorYear === "prior" ? "year before publication" : settings.impactFactorYear === "publication" ? "publication year" : "latest available"}</p>
          <p><strong className="text-foreground">Vetting rule:</strong> {settings.includeNonVetted ? "Non-vetted eligible works included." : "Only fully vetted Published works included."}</p>
          <p><strong className="text-foreground">Author multipliers:</strong> {roleText}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Included manuscript contributions</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {result.calculationDetails.length === 0 ? <p className="text-sm text-muted-foreground">No eligible manuscripts were found in this period.</p> : result.calculationDetails.map((pub, index) => (
            <div key={`${pub.title}-${index}`} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3"><div><p className="font-medium">{pub.title}</p><p className="text-xs text-muted-foreground">{pub.journal || "Journal not recorded"} · {pub.publicationDate ? new Date(pub.publicationDate).getFullYear() : "Year not recorded"}</p></div><Badge variant="secondary">+{pub.publicationScore.toFixed(2)}</Badge></div>
              <p className="mt-2 text-xs text-muted-foreground">Impact factor {pub.impactFactor} ({pub.actualYear}{pub.usedFallback ? `, fallback from ${pub.targetYear}` : ""}) · {pub.authorshipTypes.join(", ") || "Base contribution"} · multiplier ×{pub.multiplier}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="border-amber-200 bg-amber-50/40 dark:bg-amber-950/20">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-amber-600" />Not included in the score</CardTitle></CardHeader>
        <CardContent>{result.excludedPublications.length === 0 ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-600" />No manuscripts were excluded.</p> : <div className="space-y-2">{result.excludedPublications.map((pub, index) => <div key={`${pub.title}-${index}`} className="rounded-md border border-amber-200 bg-background p-3"><p className="font-medium text-sm">{pub.title}</p><p className="text-xs text-muted-foreground">{pub.journal || "Journal not recorded"} · {pub.reason}</p><p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-300">Next step: {pub.action}</p></div>)}</div>}</CardContent>
      </Card>
      {missingPapers.length > 0 && <Card className="border-sky-200 bg-sky-50/40 dark:bg-sky-950/20"><CardHeader><CardTitle className="text-base">External manuscripts to review</CardTitle></CardHeader><CardContent><p className="mb-3 text-sm text-muted-foreground">These works were found externally and are not yet linked to this profile. Use the Missing Publications section to review and import them, or contact Outcome Office.</p><div className="space-y-2">{missingPapers.map((paper) => <div key={paper.doi} className="rounded-md border bg-background p-3"><p className="text-sm font-medium">{paper.title}</p><p className="text-xs text-muted-foreground">{paper.journal} {paper.year ? `· ${paper.year}` : ""} · {paper.source}</p></div>)}</div></CardContent></Card>}
    </div>
  );
}