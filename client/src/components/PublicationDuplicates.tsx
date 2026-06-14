import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  GitMerge,
  AlertTriangle,
} from "lucide-react";

interface DuplicatePublication {
  id: number;
  title: string;
  abstract: string | null;
  authors: string | null;
  journal: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  doi: string | null;
  pmid: string | null;
  publicationDate: string | null;
  publicationType: string | null;
  status: string | null;
  prepublicationUrl: string | null;
  prepublicationSite: string | null;
  researchActivityId: number | null;
  authorCount: number;
}

interface DuplicateGroup {
  reasons: string[];
  isPreprintPair: boolean;
  defaultSurvivorId: number;
  publications: DuplicatePublication[];
}

const REASON_LABELS: Record<string, string> = {
  doi: "Same DOI",
  pmid: "Same PMID",
  metadata: "Same title, year & author",
  "preprint-pair": "Preprint ↔ published",
};

// Fields the officer can pick a value for, in display order.
const MERGE_FIELDS: { key: keyof DuplicatePublication; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "authors", label: "Authors" },
  { key: "journal", label: "Journal" },
  { key: "publicationDate", label: "Publication date" },
  { key: "doi", label: "DOI" },
  { key: "pmid", label: "PMID" },
  { key: "volume", label: "Volume" },
  { key: "issue", label: "Issue" },
  { key: "pages", label: "Pages" },
  { key: "publicationType", label: "Type" },
  { key: "status", label: "Status" },
  { key: "abstract", label: "Abstract" },
  { key: "prepublicationUrl", label: "Prepublication URL" },
  { key: "prepublicationSite", label: "Prepublication site" },
  { key: "researchActivityId", label: "Research activity" },
];

function formatValue(key: keyof DuplicatePublication, value: any): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "publicationDate") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
  }
  if (key === "researchActivityId") return `RA #${value}`;
  return String(value);
}

function isEmpty(value: any): boolean {
  return value === null || value === undefined || value === "";
}

function MergeDialog({
  group,
  open,
  onOpenChange,
}: {
  group: DuplicateGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const pubs = group.publications;

  const [survivorId, setSurvivorId] = useState<number>(group.defaultSurvivorId);

  // For each field, which record's value to keep (record id). Defaults favour
  // the survivor's non-empty value, otherwise the first record that has one.
  const computeDefaults = (survId: number): Record<string, number> => {
    const survivor = pubs.find((p) => p.id === survId)!;
    // Order other records by: prepublication fields favour the preprint, but
    // generally just iterate the group as returned (already ranked server-side).
    const ordered = [survivor, ...pubs.filter((p) => p.id !== survId)];
    const choices: Record<string, number> = {};
    for (const { key } of MERGE_FIELDS) {
      const withValue = ordered.find((p) => !isEmpty(p[key]));
      choices[key as string] = withValue ? withValue.id : survId;
    }
    return choices;
  };

  const [fieldChoices, setFieldChoices] = useState<Record<string, number>>(() =>
    computeDefaults(group.defaultSurvivorId),
  );

  const handleSurvivorChange = (id: number) => {
    setSurvivorId(id);
    setFieldChoices(computeDefaults(id));
  };

  const mergeMutation = useMutation({
    mutationFn: async () => {
      const survivor = pubs.find((p) => p.id === survivorId)!;
      const fields: Record<string, any> = {};
      for (const { key } of MERGE_FIELDS) {
        const sourceId = fieldChoices[key as string] ?? survivorId;
        const source = pubs.find((p) => p.id === sourceId) ?? survivor;
        fields[key as string] = source[key];
      }
      const mergeIds = pubs.map((p) => p.id).filter((id) => id !== survivorId);
      const res = await apiRequest("POST", "/api/publications/merge", {
        survivorId,
        mergeIds,
        fields,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/publications/duplicates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/publications/duplicates/count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/publications"] });
      toast({ title: "Merged", description: "The duplicate records were merged into the surviving publication." });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        title: "Merge failed",
        description: err?.message || "Could not merge the publications.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" data-testid="dialog-merge-publications">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            Merge duplicate publications
          </DialogTitle>
          <DialogDescription>
            Choose which record survives and which value to keep for each field. The
            other {pubs.length - 1} record{pubs.length - 1 === 1 ? "" : "s"} will be
            removed and their author links, history, and research-activity link moved
            onto the survivor. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {/* Survivor selection */}
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">Surviving record</h4>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${pubs.length}, minmax(0, 1fr))` }}>
            {pubs.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSurvivorChange(p.id)}
                data-testid={`button-select-survivor-${p.id}`}
                className={`text-left border rounded-lg p-3 transition-colors ${
                  survivorId === p.id
                    ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                    : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-mono text-muted-foreground">#{p.id}</span>
                  {survivorId === p.id && (
                    <Badge className="text-xs">Survivor</Badge>
                  )}
                </div>
                <p className="text-sm font-medium line-clamp-2">{p.title}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {p.status && <Badge variant="outline" className="text-xs">{p.status}</Badge>}
                  {p.doi && <Badge variant="secondary" className="text-xs">DOI</Badge>}
                  {p.pmid && <Badge variant="secondary" className="text-xs">PMID</Badge>}
                  <Badge variant="secondary" className="text-xs">{p.authorCount} author{p.authorCount === 1 ? "" : "s"}</Badge>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Field-by-field selection */}
        <div className="space-y-3 mt-2">
          <h4 className="font-semibold text-sm">Field values to keep</h4>
          {MERGE_FIELDS.map(({ key, label }) => {
            // Distinct candidate values across the group for this field.
            const candidates: { id: number; display: string }[] = [];
            const seen = new Set<string>();
            for (const p of pubs) {
              const display = formatValue(key, p[key]);
              const sig = display;
              if (seen.has(sig)) continue;
              seen.add(sig);
              candidates.push({ id: p.id, display });
            }
            // If every record shares one value, just show it read-only.
            const allSame = candidates.length === 1;
            return (
              <div key={key as string} className="border rounded-lg p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {label}
                </div>
                {allSame ? (
                  <p className="text-sm break-words" data-testid={`value-${key}-shared`}>
                    {candidates[0].display}
                  </p>
                ) : (
                  <RadioGroup
                    value={String(fieldChoices[key as string])}
                    onValueChange={(v) =>
                      setFieldChoices((prev) => ({ ...prev, [key as string]: Number(v) }))
                    }
                    className="space-y-1"
                  >
                    {pubs.map((p) => (
                      <div key={p.id} className="flex items-start gap-2">
                        <RadioGroupItem
                          value={String(p.id)}
                          id={`field-${key}-${p.id}`}
                          className="mt-1"
                          data-testid={`radio-field-${key}-${p.id}`}
                        />
                        <Label
                          htmlFor={`field-${key}-${p.id}`}
                          className="text-sm font-normal break-words cursor-pointer flex-1"
                        >
                          <span className="text-xs font-mono text-muted-foreground mr-2">#{p.id}</span>
                          {formatValue(key, p[key])}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-merge">
            Cancel
          </Button>
          <Button
            onClick={() => mergeMutation.mutate()}
            disabled={mergeMutation.isPending}
            data-testid="button-confirm-merge"
          >
            <GitMerge className="h-4 w-4 mr-2" />
            {mergeMutation.isPending ? "Merging…" : `Merge ${pubs.length} into #${survivorId}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PublicationDuplicates() {
  const { data: groups = [], isLoading } = useQuery<DuplicateGroup[]>({
    queryKey: ["/api/publications/duplicates"],
    staleTime: 0,
  });

  const [activeGroup, setActiveGroup] = useState<DuplicateGroup | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="loading-duplicates">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center text-center py-12 text-muted-foreground"
        data-testid="empty-duplicates"
      >
        <CheckCircle2 className="h-10 w-10 mb-3 text-green-600 dark:text-green-400" />
        <p className="font-medium">No duplicate publications detected.</p>
        <p className="text-sm">Records with the same DOI, PMID, metadata, or preprint pairs will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="list-duplicate-groups">
      {groups.map((group, idx) => (
        <Card
          key={idx}
          className={group.isPreprintPair ? "border-purple-300 dark:border-purple-800" : undefined}
          data-testid={`card-duplicate-group-${idx}`}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex flex-wrap items-center gap-2">
                {group.isPreprintPair && (
                  <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                    <FlaskConical className="h-3 w-3 mr-1" />
                    Preprint ↔ published
                  </Badge>
                )}
                {group.reasons
                  .filter((r) => !(group.isPreprintPair && r === "preprint-pair"))
                  .map((r) => (
                    <Badge key={r} variant="secondary" data-testid={`badge-reason-${r}`}>
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {REASON_LABELS[r] || r}
                    </Badge>
                  ))}
                <span className="text-sm text-muted-foreground">
                  {group.publications.length} records
                </span>
              </div>
              <Button
                size="sm"
                onClick={() => setActiveGroup(group)}
                data-testid={`button-review-merge-${idx}`}
              >
                <GitMerge className="h-4 w-4 mr-2" />
                Review &amp; merge
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(group.publications.length, 3)}, minmax(0, 1fr))` }}>
              {group.publications.map((p) => (
                <div key={p.id} className="border rounded-lg p-3" data-testid={`duplicate-pub-${p.id}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-mono text-muted-foreground">#{p.id}</span>
                    {p.id === group.defaultSurvivorId && (
                      <Badge variant="outline" className="text-xs">Default survivor</Badge>
                    )}
                  </div>
                  <Link href={`/publications/${p.id}`}>
                    <h4 className="font-medium text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 cursor-pointer line-clamp-2 flex items-start gap-1">
                      {p.title}
                      <ExternalLink className="h-3 w-3 shrink-0 mt-0.5" />
                    </h4>
                  </Link>
                  {p.authors && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.authors}</p>
                  )}
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    {p.journal && <div>{p.journal}</div>}
                    <div className="flex flex-wrap gap-2">
                      {p.publicationDate && <span>{new Date(p.publicationDate).getFullYear()}</span>}
                      {p.doi && <span>DOI: {p.doi}</span>}
                      {p.pmid && <span>PMID: {p.pmid}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {activeGroup && (
        <MergeDialog
          group={activeGroup}
          open={!!activeGroup}
          onOpenChange={(o) => {
            if (!o) setActiveGroup(null);
          }}
        />
      )}
    </div>
  );
}
