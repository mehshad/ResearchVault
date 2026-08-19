import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Info, LockKeyhole, Wrench } from "lucide-react";
import type { SidraScoreResult } from "@shared/sidraScore";
import { Link } from "wouter";

interface SidraScoreDetailsProps {
  result: SidraScoreResult;
  missingPapers?: Array<{ doi: string; title: string; journal: string; year: number | null; source: string; isPreprint?: boolean }>;
}

export function SidraScoreDetails({ result, missingPapers = [] }: SidraScoreDetailsProps) {
  const settings = result.settings;
  const publicationIssues = result.publicationIssues ?? [];
  const range = settings.startMonth && settings.endMonth
    ? `${settings.startMonth} to ${settings.endMonth}`
    : `the last ${settings.years} years`;
  const roleText = Object.entries(settings.multipliers).map(([role, value]) => `${role} ×${value}`).join(" · ");
  const issueLabel = {
    missing_sdr_link: "Missing SDR link",
    missing_internal_author_link: "Possible missing internal-author link",
    author_text_mismatch: "Author-link mismatch",
  } as const;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-lg border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">Total score</p><p className="mt-1 text-2xl font-semibold text-primary">{result.sidraScore.toFixed(2)}</p></div>
        <div className="rounded-lg border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">Included works</p><p className="mt-1 text-2xl font-semibold">{result.publicationsCount}</p></div>
        <div className="rounded-lg border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">Excluded works</p><p className="mt-1 text-2xl font-semibold">{result.excludedPublications.length}</p></div>
        <div className="rounded-lg border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">Records to review</p><p className="mt-1 text-2xl font-semibold">{publicationIssues.length}</p></div>
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
      <Card className="border-orange-200 bg-orange-50/40 dark:border-orange-900 dark:bg-orange-950/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4 text-orange-600" />
            Review and fix publication records
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            You can correct unsealed publication records yourself. Outcome Office gives final approval and can also make a correction for you. A sealed <strong className="text-foreground">Published *</strong> record must first be reopened by Outcome Office.
          </p>
          {publicationIssues.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              No missing SDR or internal author-link issues were found.
            </p>
          ) : (
            <div className="space-y-3">
              {publicationIssues.map((publication) => (
                <div key={publication.publicationId} className="rounded-md border border-orange-200 bg-background p-3 dark:border-orange-900">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{publication.title}</p>
                        {publication.isSealed && (
                          <Badge variant="secondary" className="gap-1">
                            <LockKeyhole className="h-3 w-3" />
                            Sealed
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {publication.journal || "Journal not recorded"}
                        {publication.status ? ` · ${publication.status}` : ""}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="outline" className="shrink-0">
                      <Link href={`/publications/${publication.publicationId}`}>
                        Open publication
                        <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {publication.issues.map((issue) => (
                      <div key={issue.code} className="rounded-md bg-orange-50 p-2.5 dark:bg-orange-950/40">
                        <Badge variant="outline" className="mb-1 border-orange-300 text-orange-800 dark:border-orange-800 dark:text-orange-300">
                          {issueLabel[issue.code]}
                        </Badge>
                        <p className="text-xs text-muted-foreground">{issue.reason}</p>
                        <p className="mt-1 text-xs font-medium text-orange-900 dark:text-orange-200">Next step: {issue.action}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
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
        <CardContent>{result.excludedPublications.length === 0 ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-600" />No manuscripts were excluded.</p> : <div className="space-y-2">{result.excludedPublications.map((pub) => <div key={pub.publicationId} className="rounded-md border border-amber-200 bg-background p-3"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-sm">{pub.title}</p>{pub.isSealed && <Badge variant="secondary" className="gap-1"><LockKeyhole className="h-3 w-3" />Sealed</Badge>}</div><p className="text-xs text-muted-foreground">{pub.journal || "Journal not recorded"} · {pub.reason}</p><p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-300">Next step: {pub.action}</p></div><Button asChild size="sm" variant="outline" className="shrink-0"><Link href={`/publications/${pub.publicationId}`}>Review publication<ArrowUpRight className="ml-1.5 h-3.5 w-3.5" /></Link></Button></div></div>)}</div>}</CardContent>
      </Card>
      {missingPapers.length > 0 && <Card className="border-sky-200 bg-sky-50/40 dark:bg-sky-950/20"><CardHeader><CardTitle className="text-base">External manuscripts to review</CardTitle></CardHeader><CardContent><p className="mb-3 text-sm text-muted-foreground">These works were found externally and are not yet linked to this profile. Use the Missing Publications section to review and import them, or contact Outcome Office.</p><div className="space-y-2">{missingPapers.map((paper) => <div key={paper.doi} className="rounded-md border bg-background p-3"><p className="text-sm font-medium">{paper.title}</p><p className="text-xs text-muted-foreground">{paper.journal} {paper.year ? `· ${paper.year}` : ""} · {paper.source}</p></div>)}</div></CardContent></Card>}
    </div>
  );
}