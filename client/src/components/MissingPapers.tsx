import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Download, ExternalLink, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface MissingPaper {
  doi: string;
  title: string;
  journal: string;
  year: number | null;
  source: string;
}

interface MissingPapersResponse {
  orcidAttempted: boolean;
  orcidAvailable: boolean;
  scholarAttempted: boolean;
  scholarAvailable: boolean;
  missing: MissingPaper[];
  message?: string;
}

interface MissingPapersProps {
  scientistId: number;
  hasOrcid: boolean;
  hasScholar: boolean;
  /** Render as a section inside another card (no own Card chrome). */
  embedded?: boolean;
}

export function MissingPapers({ scientistId, hasOrcid, hasScholar, embedded = false }: MissingPapersProps) {
  const { toast } = useToast();
  const [result, setResult] = useState<MissingPapersResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const checkMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/scientists/${scientistId}/missing-papers`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to check for missing publications");
      }
      return (await res.json()) as MissingPapersResponse;
    },
    onSuccess: (data) => {
      setResult(data);
      setSelected(new Set());
    },
    onError: () => {
      toast({
        title: "Could not check for missing publications",
        description: "Something went wrong while contacting the external sources. Please try again.",
        variant: "destructive",
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (papers: MissingPaper[]) => {
      const res = await apiRequest("POST", `/api/scientists/${scientistId}/import-papers`, { papers });
      return (await res.json()) as {
        createdCount: number;
        skippedCount: number;
      };
    },
    onSuccess: (data) => {
      toast({
        title: "Import complete",
        description: `Imported ${data.createdCount} publication${data.createdCount === 1 ? "" : "s"}${
          data.skippedCount > 0 ? `, skipped ${data.skippedCount}` : ""
        }.`,
      });
      // Refresh the person's publications and re-run the missing-publications check
      // so imported publications no longer appear as missing.
      queryClient.invalidateQueries({ queryKey: ["/api/scientists", scientistId, "publications"] });
      queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          (q.queryKey[0] as string).includes(`/api/scientists/${scientistId}/publications`),
      });
      checkMutation.mutate();
    },
    onError: () => {
      toast({
        title: "Import failed",
        description: "The selected publications could not be imported. Please try again.",
        variant: "destructive",
      });
    },
  });

  const toggle = (doi: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(doi)) next.delete(doi);
      else next.add(doi);
      return next;
    });
  };

  const missing = result?.missing ?? [];
  const allSelected = missing.length > 0 && selected.size === missing.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(missing.map((m) => m.doi)));
    }
  };

  const button = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => checkMutation.mutate()}
      disabled={checkMutation.isPending || importMutation.isPending}
      data-testid="button-check-missing-publications"
    >
      {checkMutation.isPending ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Search className="h-4 w-4 mr-2" />
      )}
      Check for missing publications
    </Button>
  );

  const contentInner = (
        <>
        {checkMutation.isPending ? (
          <div className="animate-pulse space-y-3" data-testid="loading-missing-publications">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-200 rounded dark:bg-gray-700"></div>
            ))}
          </div>
        ) : !result ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Click "Check for missing publications" to compare ORCID
            {hasScholar ? " / Google Scholar" : ""} works against the publications already in the
            system.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Source status notices */}
            {result.message && (
              <div
                className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-3"
                data-testid="text-missing-papers-message"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{result.message}</span>
              </div>
            )}
            {result.scholarAttempted && !result.scholarAvailable && (
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Google Scholar was attempted but returned nothing (it has no official API and
                  blocks automated access). ORCID results are shown above.
                </span>
              </div>
            )}

            {missing.length > 0 && (
              <>
                <div className="flex items-center justify-between border-b pb-2">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      data-testid="checkbox-select-all-missing"
                    />
                    Select all ({missing.length})
                  </label>
                  <Button
                    size="sm"
                    onClick={() =>
                      importMutation.mutate(missing.filter((m) => selected.has(m.doi)))
                    }
                    disabled={selected.size === 0 || importMutation.isPending}
                    data-testid="button-import-missing-papers"
                  >
                    {importMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    Import selected ({selected.size})
                  </Button>
                </div>

                <div className="space-y-2">
                  {missing.map((paper) => (
                    <div
                      key={paper.doi}
                      className="flex items-start gap-3 border rounded-lg p-3 hover:bg-gray-50 transition-colors dark:hover:bg-gray-900"
                      data-testid={`row-missing-paper-${paper.doi}`}
                    >
                      <Checkbox
                        checked={selected.has(paper.doi)}
                        onCheckedChange={() => toggle(paper.doi)}
                        className="mt-1"
                        data-testid={`checkbox-missing-paper-${paper.doi}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 dark:text-gray-100 leading-snug">
                          {paper.title || "Untitled work"}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground mt-1">
                          {paper.journal && <span>{paper.journal}</span>}
                          {paper.year && <span>({paper.year})</span>}
                          <Badge variant="outline" className="text-[10px]">
                            {paper.source === "Google Scholar"
                              ? "Google Scholar (best-effort)"
                              : "ORCID"}
                          </Badge>
                        </div>
                        <a
                          href={`https://doi.org/${paper.doi}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 mt-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {paper.doi}
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {missing.length === 0 && !result.message && (result.orcidAvailable || result.scholarAvailable) && (
              <div
                className="flex items-center gap-2 text-sm text-muted-foreground justify-center py-4"
                data-testid="text-no-missing-papers"
              >
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                No missing publications — everything is already in the system.
              </div>
            )}
          </div>
        )}
        </>
  );

  if (embedded) {
    return (
      <div data-testid="section-missing-publications">
        <div className="flex flex-row items-start justify-between gap-4 mb-2">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Search className="h-4 w-4" />
              Missing Publications
            </h3>
            <p className="text-sm text-muted-foreground">
              Pull this person's published works from ORCID
              {hasScholar ? " (and Google Scholar, best-effort)" : ""} and find publications not yet in
              the system.
            </p>
          </div>
          {button}
        </div>
        <div className="mt-2">{contentInner}</div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Missing Publications
            </CardTitle>
            <CardDescription>
              Pull this person's published works from ORCID
              {hasScholar ? " (and Google Scholar, best-effort)" : ""} and find publications not yet in
              the system.
            </CardDescription>
          </div>
          {button}
        </div>
      </CardHeader>
      <CardContent>{contentInner}</CardContent>
    </Card>
  );
}
