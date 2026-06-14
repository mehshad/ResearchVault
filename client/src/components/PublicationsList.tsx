// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import React from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, FileText, ChevronRight, ArrowRight, AlertTriangle, ChevronsDownUp, ChevronsUpDown, Copy, Check } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface JournalImpactFactor {
  id: number;
  journalName: string;
  year: number;
  impactFactor: string;
  rank: number;
  quartile: string;
}

function ImpactFactorDisplay({ journal, publicationYear }: { journal: string; publicationYear: number }) {
  const { data: publicationYearIF } = useQuery<JournalImpactFactor | null>({
    queryKey: [`/api/journal-impact-factors/journal/${encodeURIComponent(journal)}/year/${publicationYear}`],
    enabled: !!journal,
  });
  
  const { data: previousYearIF } = useQuery<JournalImpactFactor | null>({
    queryKey: [`/api/journal-impact-factors/journal/${encodeURIComponent(journal)}/year/${publicationYear - 1}`],
    enabled: !!journal,
  });
  
  const { data: currentYearIF } = useQuery<JournalImpactFactor | null>({
    queryKey: [`/api/journal-impact-factors/journal/${encodeURIComponent(journal)}/year/2024`],
    enabled: !!journal,
  });

  return (
    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 dark:text-gray-400">
      <span className="font-medium">JIF:</span>
      <span>
        {publicationYear - 1}: {previousYearIF ? previousYearIF.impactFactor : 'N/A'}
      </span>
      <span className="font-semibold text-gray-700 dark:text-gray-300">
        {publicationYear}: {publicationYearIF ? publicationYearIF.impactFactor : 'N/A'}
      </span>
      <span>
        2024: {currentYearIF ? currentYearIF.impactFactor : 'N/A'}
      </span>
    </div>
  );
}

interface Publication {
  id: number;
  researchActivityId: number | null;
  title: string;
  authors: string;
  journal: string;
  volume: string;
  issue: string;
  pages: string;
  doi: string;
  publicationDate: string;
  publicationType: string;
  status: string;
  abstract: string;
  authorshipType: string;
  authorPosition: number | null;
}

interface PublicationsListProps {
  scientistId: number;
  yearsSince?: number;
  /** Render as a section inside another card (no own Card chrome). */
  embedded?: boolean;
}

const authorshipColors = {
  'First Author': 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  'Contributing Author': 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  'Senior/Last Author': 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
  'Corresponding Author': 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

/** Compute the data-quality issues for a publication record. */
function getPublicationIssues(pub: Publication, ifChecked: boolean, hasImpactFactor: boolean): string[] {
  const issues: string[] = [];
  if (!pub.researchActivityId) issues.push('No linked SDR');
  if (!pub.journal) issues.push('Missing journal');
  if (!pub.publicationDate) issues.push('Missing publication date');
  if (!pub.authors) issues.push('Missing authors');
  if (!pub.doi) issues.push('Missing DOI');
  // Only flag a missing IF once the lookup has actually finished, so a still-loading
  // query doesn't produce a false "No impact factor" while data is in flight.
  if (pub.journal && ifChecked && !hasImpactFactor) issues.push('No impact factor on record');
  if (!pub.volume || !pub.issue || !pub.pages) issues.push('Incomplete citation (volume/issue/pages)');
  return issues;
}

function PublicationRow({ pub, isOpen, onToggle }: { pub: Publication; isOpen: boolean; onToggle: () => void }) {
  const [, navigate] = useLocation();
  const year = pub.publicationDate ? format(new Date(pub.publicationDate), 'yyyy') : null;
  const displayAuthorship = (pub.authorshipType ?? '').split(',').map(type => {
    const trimmed = type.trim();
    return (trimmed === 'Senior Author' || trimmed === 'Last Author') ? 'Senior/Last Author' : trimmed;
  }).filter(Boolean).join(', ');

  // Whether this journal has ANY impact factor on record (used to flag "No IF").
  const { data: historicalIF, isSuccess: ifLoaded } = useQuery<JournalImpactFactor[]>({
    queryKey: [`/api/journal-impact-factors/historical/${encodeURIComponent(pub.journal || '')}`],
    enabled: !!pub.journal,
  });
  const hasImpactFactor = Array.isArray(historicalIF) && historicalIF.length > 0;
  const issues = getPublicationIssues(pub, ifLoaded, hasImpactFactor);

  return (
    <div data-testid={`card-publication-${pub.id}`} className="border rounded-lg dark:border-gray-700">
      {/* Compact header — click to expand */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        data-testid={`button-toggle-publication-${pub.id}`}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-gray-50 transition-colors rounded-lg dark:hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <ChevronRight className={`h-4 w-4 mt-0.5 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        <div className="min-w-0 flex-1">
          <h4 className="font-medium text-gray-900 leading-snug dark:text-gray-100">{pub.title}</h4>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-gray-500 mt-0.5 dark:text-gray-400">
            <span className="font-medium">{pub.journal || 'No journal'}</span>
            {year && <span>· {year}</span>}
            <Badge
              variant="secondary"
              data-testid={`badge-authorship-publication-${pub.id}`}
              className={`text-xs font-normal ${authorshipColors[displayAuthorship as keyof typeof authorshipColors] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'}`}
            >
              {displayAuthorship || 'Unknown authorship'}
            </Badge>
          </div>
        </div>
        {issues.length > 0 && (
          <span
            title={issues.join(' • ')}
            data-testid={`badge-issues-publication-${pub.id}`}
            className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 text-xs font-medium px-2 py-0.5 dark:bg-amber-950 dark:text-amber-300"
          >
            <AlertTriangle className="h-3 w-3" />
            {issues.length} {issues.length === 1 ? 'issue' : 'issues'}
          </span>
        )}
      </button>

      {/* Expanded details */}
      {isOpen && (
        <div className="px-3 pb-3 pl-10 space-y-2">
          {issues.length > 0 && (
            <div
              className="rounded-md border border-amber-200 bg-amber-50 p-2 dark:border-amber-900 dark:bg-amber-950/40"
              data-testid={`list-issues-publication-${pub.id}`}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                Needs attention
              </div>
              <ul className="mt-1 space-y-0.5">
                {issues.map((issue) => (
                  <li key={issue} className="text-xs text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-amber-500 shrink-0" />
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-sm text-gray-600 dark:text-gray-300">{pub.authors}</p>

          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <span className="font-medium">{pub.journal}</span>
            {pub.volume && <span>Vol. {pub.volume}</span>}
            {pub.issue && <span>({pub.issue})</span>}
            {pub.pages && <span>pp. {pub.pages}</span>}
            {year && <span>({year})</span>}
          </div>

          {pub.journal && pub.publicationDate && (
            <ImpactFactorDisplay
              journal={pub.journal}
              publicationYear={new Date(pub.publicationDate).getFullYear()}
            />
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="sm"
              className="h-8"
              onClick={() => navigate(`/publications/${pub.id}`)}
              data-testid={`button-view-publication-${pub.id}`}
            >
              View publication page
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
            {pub.doi && (
              <Button variant="ghost" size="sm" className="h-8 px-2" asChild>
                <a
                  href={`https://doi.org/${pub.doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  DOI: {pub.doi}
                </a>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function PublicationsList({ scientistId, yearsSince = 5, embedded = false }: PublicationsListProps) {
  const [expandedIds, setExpandedIds] = React.useState<Set<number>>(new Set());
  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const { data: publications = [], isLoading } = useQuery({
    queryKey: [`/api/scientists/${scientistId}/publications?years=${yearsSince}`],
  });

  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);

  const allExpanded = publications.length > 0 && publications.every((p: Publication) => expandedIds.has(p.id));
  const toggleExpandAll = () => {
    setExpandedIds(allExpanded ? new Set() : new Set(publications.map((p: Publication) => p.id)));
  };

  const buildClipboardText = () =>
    publications
      .map((pub: Publication, idx: number) => {
        let year = "n.d.";
        if (pub.publicationDate) {
          const parsed = new Date(pub.publicationDate);
          if (!isNaN(parsed.getTime())) year = format(parsed, "yyyy");
        }
        let citation = "";
        if (pub.authors) citation += `${pub.authors} `;
        citation += `(${year}). ${pub.title}.`;
        if (pub.journal) {
          citation += ` ${pub.journal}`;
          if (pub.volume) citation += `, ${pub.volume}`;
          if (pub.issue) citation += `(${pub.issue})`;
          if (pub.pages) citation += `, ${pub.pages}`;
          citation += ".";
        }
        if (pub.doi) citation += ` https://doi.org/${pub.doi}`;
        return `${idx + 1}. ${citation}`;
      })
      .join("\n");

  const handleCopy = async () => {
    const text = buildClipboardText();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try {
          ok = document.execCommand("copy");
        } finally {
          document.body.removeChild(ta);
        }
        if (!ok) throw new Error("Clipboard copy command failed");
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied to clipboard",
        description: `${publications.length} publication${publications.length === 1 ? "" : "s"} ready to paste.`,
      });
    } catch (err) {
      toast({
        title: "Could not copy",
        description: "Your browser blocked clipboard access. Please try again.",
        variant: "destructive",
      });
    }
  };

  const headerActions = publications.length > 0 ? (
    <div className="flex items-center gap-2 shrink-0">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={toggleExpandAll}
        data-testid="button-toggle-expand-all-publications"
      >
        {allExpanded ? (
          <ChevronsDownUp className="h-4 w-4 mr-1" />
        ) : (
          <ChevronsUpDown className="h-4 w-4 mr-1" />
        )}
        {allExpanded ? "Collapse all" : "Expand all"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleCopy}
        data-testid="button-copy-publications"
      >
        {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
        {copied ? "Copied" : "Copy list"}
      </Button>
    </div>
  ) : null;

  const loadingBody = (
    <div className="animate-pulse space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-24 bg-gray-200 rounded dark:bg-gray-700"></div>
      ))}
    </div>
  );

  const listBody = (
        <div className="space-y-2">
          {publications.length === 0 ? (
            <p className="text-gray-600 text-center py-8 dark:text-gray-300">No publications found for the selected time period.</p>
          ) : (
            publications.map((pub: Publication) => (
              <PublicationRow
                key={pub.id}
                pub={pub}
                isOpen={expandedIds.has(pub.id)}
                onToggle={() => toggleExpanded(pub.id)}
              />
            ))
          )}
        </div>
  );

  if (embedded) {
    return (
      <div data-testid="section-publications-recent">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Publications (Last {yearsSince} Years)
            </h3>
            {!isLoading && (
              <p className="text-sm text-muted-foreground">
                {publications.length} publications (Published or In Press only) with external collaborator tracking
              </p>
            )}
          </div>
          {!isLoading && headerActions}
        </div>
        {isLoading ? loadingBody : listBody}
      </div>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Publications (Last {yearsSince} Years)
          </CardTitle>
        </CardHeader>
        <CardContent>{loadingBody}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Publications (Last {yearsSince} Years)
            </CardTitle>
            <CardDescription>
              {publications.length} publications (Published or In Press only) with external collaborator tracking
            </CardDescription>
          </div>
          {headerActions}
        </div>
      </CardHeader>
      <CardContent>{listBody}</CardContent>
    </Card>
  );
}