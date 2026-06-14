import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, AlertTriangle, UserX, CheckCircle2, ExternalLink } from "lucide-react";

interface FlaggedPublication {
  publication: {
    id: number;
    title: string;
    authors: string | null;
    journal: string | null;
    publicationDate: string | null;
  };
  reason: "no_internal_authors" | "author_mismatch";
  mismatchedAuthors?: { scientistId: number; firstName: string; lastName: string }[];
}

interface PublicationsToFixProps {
  /** Optional className for the wrapping card */
  className?: string;
  /** Render as a section inside another card (no own Card chrome). */
  embedded?: boolean;
}

export function PublicationsToFix({ className, embedded = false }: PublicationsToFixProps) {
  const [enabled, setEnabled] = useState(false);

  const { data: flagged = [], isLoading, isFetching, refetch } = useQuery<FlaggedPublication[]>({
    queryKey: ["/api/publications/needs-author-fix"],
    enabled,
    // Always re-run the scan when triggered so a publication fixed elsewhere
    // (e.g. on its detail page) drops off the list instead of showing stale data.
    staleTime: 0,
  });

  const handleFind = () => {
    if (enabled) {
      refetch();
    } else {
      setEnabled(true);
    }
  };

  const loading = enabled && (isLoading || isFetching);

  const button = (
    <Button
      variant="outline"
      size="sm"
      onClick={handleFind}
      disabled={loading}
      data-testid="button-check-internal-author-links"
    >
      <Users className="h-4 w-4 mr-2" />
      {loading ? "Checking…" : "Check internal author links"}
    </Button>
  );

  const resultsInner = (
        <>
          {loading ? (
            <div className="space-y-3" data-testid="loading-internal-author-links">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : flagged.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center text-center py-8 text-muted-foreground"
              data-testid="empty-internal-author-links"
            >
              <CheckCircle2 className="h-8 w-8 mb-2 text-green-600 dark:text-green-400" />
              <p>All your publications have correct internal author links.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {flagged.map(({ publication, reason, mismatchedAuthors }) => (
                <Link
                  key={publication.id}
                  href={`/publications/${publication.id}`}
                  data-testid={`link-internal-author-publication-${publication.id}`}
                >
                  <div className="border rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer dark:hover:bg-gray-900">
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0">
                        <h4 className="font-medium text-gray-900 leading-tight dark:text-gray-100">
                          {publication.title}
                        </h4>
                        {publication.authors && (
                          <p className="text-sm text-gray-600 mt-1 dark:text-gray-300 line-clamp-2">
                            {publication.authors}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 mt-1 dark:text-gray-300">
                          {publication.journal && <span>{publication.journal}</span>}
                          {publication.publicationDate && (
                            <span>({new Date(publication.publicationDate).getFullYear()})</span>
                          )}
                        </div>
                      </div>
                      <ExternalLink className="h-4 w-4 text-gray-400 shrink-0 mt-1" />
                    </div>

                    <div className="mt-2">
                      {reason === "no_internal_authors" ? (
                        <Badge
                          variant="secondary"
                          className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          data-testid={`reason-no-authors-${publication.id}`}
                        >
                          <UserX className="h-3 w-3 mr-1" />
                          No internal authors linked
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                          data-testid={`reason-mismatch-${publication.id}`}
                        >
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Author mismatch
                          {mismatchedAuthors && mismatchedAuthors.length > 0 && (
                            <span className="ml-1 font-normal">
                              ({mismatchedAuthors
                                .map((a) => `${a.firstName} ${a.lastName}`)
                                .join(", ")})
                            </span>
                          )}
                        </Badge>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
  );

  if (embedded) {
    return (
      <div data-testid="section-internal-author-links">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-2">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" />
              Internal Author Links
            </h3>
            <p className="text-sm text-muted-foreground">
              Review your publications where internal authors are missing or don't match the listed authors.
            </p>
          </div>
          {button}
        </div>
        {enabled && <div className="mt-2">{resultsInner}</div>}
      </div>
    );
  }

  return (
    <Card className={className} data-testid="card-internal-author-links">
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Internal Author Links
            </CardTitle>
            <CardDescription>
              Review your publications where internal authors are missing or don't match the listed authors.
            </CardDescription>
          </div>
          {button}
        </div>
      </CardHeader>

      {enabled && <CardContent>{resultsInner}</CardContent>}
    </Card>
  );
}
