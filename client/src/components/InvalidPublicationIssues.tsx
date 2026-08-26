import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, Pencil, Send, Undo2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

interface InvalidPublicationIssue {
  id?: number;
  publicationId?: number;
  title?: string;
  invalidReason?: string | null;
  invalidatedAt?: string | null;
  updatedAt?: string | null;
  publication?: {
    id: number;
    title: string;
    invalidReason?: string | null;
    invalidatedAt?: string | null;
    updatedAt?: string | null;
  };
}

interface InvalidPublicationIssuesProps {
  scientistId: number;
  canAct: boolean;
  demoViewerRole?: string;
  demoViewerScientistId?: number;
}

export function InvalidPublicationIssues({
  scientistId,
  canAct,
  demoViewerRole,
  demoViewerScientistId,
}: InvalidPublicationIssuesProps) {
  const { toast } = useToast();
  const [withdrawId, setWithdrawId] = useState<number | null>(null);
  const params = new URLSearchParams({ scientistId: String(scientistId) });
  if (demoViewerRole) params.set("viewerRole", demoViewerRole);
  if (demoViewerScientistId) params.set("viewerScientistId", String(demoViewerScientistId));
  const endpoint = `/api/publications/invalid-issues?${params.toString()}`;

  const { data: issues = [], isLoading } = useQuery<InvalidPublicationIssue[]>({
    queryKey: [endpoint],
    queryFn: async () => (await apiRequest("GET", endpoint)).json(),
    staleTime: 0,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: [endpoint] });
    queryClient.invalidateQueries({ queryKey: ["/api/publications"] });
    queryClient.invalidateQueries({ queryKey: ["/api/scientists", scientistId] });
  };

  const correctionMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/publications/${id}/submit-correction`),
    onSuccess: () => {
      refresh();
      toast({
        title: "Correction submitted",
        description: "The publication has returned to Published for Outcome Office review.",
      });
    },
    onError: (error: Error) => toast({ title: "Could not submit correction", description: error.message, variant: "destructive" }),
  });

  const withdrawMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/publications/${id}/withdraw-invalid`),
    onSuccess: () => {
      setWithdrawId(null);
      refresh();
      toast({ title: "Publication withdrawn", description: "The publication was withdrawn and its history was preserved." });
    },
    onError: (error: Error) => toast({ title: "Could not withdraw publication", description: error.message, variant: "destructive" }),
  });

  if (isLoading) {
    return <Skeleton className="h-28 w-full" data-testid="loading-invalid-publications" />;
  }
  if (!issues.length) return null;

  return (
    <section className="space-y-3" aria-labelledby="invalid-publications-heading" data-testid="section-invalid-publications">
      <div>
        <h3 id="invalid-publications-heading" className="font-semibold flex items-center gap-2 text-red-800 dark:text-red-300">
          <AlertTriangle className="h-4 w-4" />
          Publications requiring correction
        </h3>
        <p className="text-sm text-muted-foreground">
          The Outcome Office found an issue. Fix the publication, then submit it for review or withdraw it.
        </p>
      </div>
      {issues.map((issue) => {
        const publication = issue.publication ?? issue;
        const publicationId = issue.publicationId ?? publication.id!;
        const reason = issue.invalidReason ?? issue.publication?.invalidReason;
        const timestamp = issue.invalidatedAt ?? issue.publication?.invalidatedAt ?? issue.updatedAt ?? issue.publication?.updatedAt;
        return (
          <div key={publicationId} className="rounded-lg border border-red-300 bg-red-50/60 p-4 dark:border-red-800 dark:bg-red-950/20">
            <Badge variant="destructive" className="mb-2">Published - Invalid</Badge>
            <h4 className="font-medium">{publication.title}</h4>
            <div className="mt-2 rounded-md bg-background/80 p-3 text-sm">
              <span className="font-medium">Outcome Office reason: </span>
              <span className="whitespace-pre-wrap">{reason || "No reason was provided."}</span>
            </div>
            {timestamp && (
              <p className="mt-2 text-xs text-muted-foreground">
                Flagged {new Date(timestamp).toLocaleString()}
              </p>
            )}
            {canAct && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/publications/${publicationId}/edit`}>
                    <Pencil className="mr-1.5 h-4 w-4" /> Fix publication
                  </Link>
                </Button>
                <Button
                  size="sm"
                  onClick={() => correctionMutation.mutate(publicationId)}
                  disabled={correctionMutation.isPending || withdrawMutation.isPending}
                  data-testid={`button-submit-correction-${publicationId}`}
                >
                  <Send className="mr-1.5 h-4 w-4" />
                  {correctionMutation.isPending ? "Submitting…" : "Submit correction"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setWithdrawId(publicationId)}
                  disabled={correctionMutation.isPending || withdrawMutation.isPending}
                  data-testid={`button-withdraw-invalid-${publicationId}`}
                >
                  <Undo2 className="mr-1.5 h-4 w-4" /> Withdraw
                </Button>
              </div>
            )}
          </div>
        );
      })}

      <AlertDialog open={withdrawId !== null} onOpenChange={(open) => !open && setWithdrawId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw this publication?</AlertDialogTitle>
            <AlertDialogDescription>
              This changes its status to Withdrawn. The publication and audit history will be kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={withdrawMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (withdrawId !== null) withdrawMutation.mutate(withdrawId);
              }}
              disabled={withdrawMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {withdrawMutation.isPending ? "Withdrawing…" : "Withdraw publication"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}