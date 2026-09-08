/**
 * Research Office configuration.
 *
 * The lists the office fills its own forms from: grant statuses, institutions
 * and contract types. Each is editable here rather than in code, and each can
 * be bulk-loaded from a pasted list and cleaned of the near-duplicates a
 * typed-into list always grows.
 *
 * Statuses are the odd one out and get the most room. Adding one means saying
 * what it *means* — whether it marks the grant awarded, whether the work has
 * dates, whether other sections may see it — which is why they cannot be added
 * inline from the grant form the way an institution can.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Merge, Upload, Loader2, EyeOff, Eye } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { PermissionWrapper } from "@/components/PermissionWrapper";
import {
  GRANT_STATUS_STAGES,
  GRANT_STATUS_STAGE_DESCRIPTIONS,
  type GrantStatusStage,
} from "@shared/grantStatusStages";

interface StatusRow {
  id: number;
  value: string;
  label: string;
  stage: GrantStatusStage;
  sortOrder: number;
  isBuiltIn: boolean;
  retiredAt: string | null;
}

interface DuplicatePair {
  left: { id: number; name: string };
  right: { id: number; name: string };
  similarity: number;
  reason: "contains" | "similar";
  leftUsage: Array<{ label: string; count: number }>;
  rightUsage: Array<{ label: string; count: number }>;
}

const usageSummary = (usage: Array<{ label: string; count: number }>) => {
  const used = usage.filter((u) => u.count > 0);
  if (used.length === 0) return "not used";
  return used.map((u) => `${u.count} ${u.label}`).join(", ");
};

// ── Grant statuses ──────────────────────────────────────────────────────────

function GrantStatusesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [stage, setStage] = useState<GrantStatusStage | "">("");

  const { data: statuses = [], isLoading } = useQuery<StatusRow[]>({
    queryKey: ["/api/grant-statuses"],
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/grant-statuses"] });
    // Every grant screen reads the status list to render.
    queryClient.invalidateQueries({ queryKey: ["/api/grants"] });
  };

  const addStatus = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/grant-statuses", { label, stage });
      return response.json();
    },
    onSuccess: () => {
      setLabel("");
      setStage("");
      invalidate();
      toast({ title: "Status added" });
    },
    onError: (error: any) =>
      toast({
        title: "Could not add the status",
        description: error?.message,
        variant: "destructive",
      }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, ...patch }: { id: number } & Record<string, unknown>) => {
      const response = await apiRequest("PATCH", `/api/grant-statuses/${id}`, patch);
      return response.json();
    },
    onSuccess: invalidate,
    onError: (error: any) =>
      toast({ title: "Could not update", description: error?.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a status</CardTitle>
          <CardDescription>
            Say what it means as well as what it is called. Every rule that depends on a
            status — whether the grant counts as awarded, whether SDRs can be linked, whether
            other sections can see it — reads the stage, not the name.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-56">
              <label className="text-sm font-medium mb-2 block">Name</label>
              <Input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="e.g. Award Pending - Vetted"
                data-testid="input-status-label"
              />
            </div>
            <div className="min-w-56">
              <label className="text-sm font-medium mb-2 block">What it means</label>
              <Select value={stage} onValueChange={(value) => setStage(value as GrantStatusStage)}>
                <SelectTrigger data-testid="select-status-stage">
                  <SelectValue placeholder="Choose a stage" />
                </SelectTrigger>
                <SelectContent>
                  {GRANT_STATUS_STAGES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => addStatus.mutate()}
              disabled={!label.trim() || !stage || addStatus.isPending}
              data-testid="button-add-status"
            >
              {addStatus.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Add
            </Button>
          </div>
          {stage && (
            <p className="text-xs text-muted-foreground mt-3">
              {GRANT_STATUS_STAGE_DESCRIPTIONS[stage]}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{statuses.length} statuses</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>What it means</TableHead>
                  <TableHead>Stored as</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {statuses.map((status) => (
                  <TableRow key={status.id} data-testid={`row-status-${status.value}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={status.retiredAt ? "text-muted-foreground line-through" : ""}>
                          {status.label}
                        </span>
                        {status.isBuiltIn && (
                          <Badge variant="outline" className="text-xs font-normal">
                            built in
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={status.stage}
                        onValueChange={(value) => updateStatus.mutate({ id: status.id, stage: value })}
                      >
                        <SelectTrigger className="w-44 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GRANT_STATUS_STAGES.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {status.value}
                    </TableCell>
                    <TableCell>
                      {/* Built-in statuses stay: grants hold them and the
                          lifecycle moves grants onto some of them by name. */}
                      {!status.isBuiltIn && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            updateStatus.mutate({ id: status.id, retired: !status.retiredAt })
                          }
                        >
                          {status.retiredAt ? (
                            <>
                              <Eye className="h-4 w-4 mr-1" /> Restore
                            </>
                          ) : (
                            <>
                              <EyeOff className="h-4 w-4 mr-1" /> Retire
                            </>
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="text-xs text-muted-foreground mt-4">
            Retiring takes a status out of the dropdown without touching the grants that already
            carry it — they keep meaning what they meant. The statuses the system ships with
            cannot be retired, because the grant lifecycle moves grants onto some of them by name.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── A curated name list: institutions, contract types ───────────────────────

function NameListTab({
  path,
  noun,
  addLabel,
}: {
  path: "institutions" | "contract-types";
  noun: string;
  addLabel: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [importText, setImportText] = useState("");
  const [preview, setPreview] = useState<any>(null);

  const { data: entries = [], isLoading } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: [`/api/${path}`],
  });

  const { data: duplicates = [], isLoading: duplicatesLoading } = useQuery<DuplicatePair[]>({
    queryKey: [`/api/${path}/duplicates`],
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/${path}`] });
    queryClient.invalidateQueries({ queryKey: [`/api/${path}/duplicates`] });
  };

  const merge = useMutation({
    mutationFn: async ({ keepId, mergeId }: { keepId: number; mergeId: number }) => {
      const response = await apiRequest("POST", `/api/${path}/merge`, { keepId, mergeId });
      return response.json();
    },
    onSuccess: (result: any) => {
      invalidate();
      const moved = (result.moved ?? [])
        .filter((m: any) => m.count > 0)
        .map((m: any) => `${m.count} ${m.label}`)
        .join(", ");
      toast({
        title: `Merged into "${result.kept}"`,
        description: moved ? `Moved ${moved}.` : "Nothing was pointing at it.",
      });
    },
    onError: (error: any) =>
      toast({ title: "Could not merge", description: error?.message, variant: "destructive" }),
  });

  const runPreview = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/${path}/import/preview`, { text: importText });
      return response.json();
    },
    onSuccess: setPreview,
    onError: (error: any) =>
      toast({ title: "Could not read that", description: error?.message, variant: "destructive" }),
  });

  const runApply = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/${path}/import/apply`, { text: importText });
      return response.json();
    },
    onSuccess: (result: any) => {
      setImportText("");
      setPreview(null);
      invalidate();
      toast({ title: `Added ${result.added} ${noun}`, description: `${result.alreadyThere} were already on the list.` });
    },
    onError: (error: any) =>
      toast({ title: "Import failed", description: error?.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Possible duplicates
            {!duplicatesLoading && duplicates.length > 0 && ` — ${duplicates.length} to look at`}
          </CardTitle>
          <CardDescription>
            Pairs that look like the same {noun.replace(/s$/, "")} written two ways. These are
            suggestions: nothing is merged until you say which to keep. The counts show what each
            one is already used by, which is usually how you decide.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {duplicatesLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : duplicates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing looks duplicated.</p>
          ) : (
            <div className="space-y-3">
              {duplicates.map((pair, index) => (
                <div
                  key={`${pair.left.id}-${pair.right.id}`}
                  className="rounded-lg border p-3"
                  data-testid={`duplicate-pair-${index}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-xs font-normal">
                      {pair.reason === "contains" ? "one contains the other" : "similar names"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(pair.similarity * 100)}% alike
                    </span>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {[
                      { side: pair.left, usage: pair.leftUsage, other: pair.right },
                      { side: pair.right, usage: pair.rightUsage, other: pair.left },
                    ].map(({ side, usage, other }) => (
                      <div key={side.id} className="flex items-center justify-between gap-2 rounded border p-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{side.name}</div>
                          <div className="text-xs text-muted-foreground">{usageSummary(usage)}</div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={merge.isPending}
                          onClick={() => merge.mutate({ keepId: side.id, mergeId: other.id })}
                        >
                          <Merge className="h-3.5 w-3.5 mr-1" />
                          Keep this
                        </Button>
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
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{addLabel}</CardTitle>
          <CardDescription>
            One per line. {path === "institutions" && "A comma or tab after the name is taken as the country. "}
            Anything already on the list is skipped, however it is spelled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            rows={6}
            value={importText}
            onChange={(event) => {
              setImportText(event.target.value);
              setPreview(null);
            }}
            placeholder={
              path === "institutions"
                ? "Osaka University, Japan\nKyoto Institute of Genomics, Japan"
                : "Data Sharing Agreement\nEquipment Loan Agreement"
            }
            data-testid="textarea-import"
          />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => runPreview.mutate()}
              disabled={!importText.trim() || runPreview.isPending}
              data-testid="button-preview-import"
            >
              {runPreview.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Check what this would add
            </Button>
            {preview && (
              <Button
                onClick={() => runApply.mutate()}
                disabled={preview.toAdd.length === 0 || runApply.isPending}
                data-testid="button-apply-import"
              >
                Add {preview.toAdd.length}
              </Button>
            )}
          </div>
          {preview && (
            <div className="rounded-lg border p-3 text-sm space-y-1">
              <div>
                <strong>{preview.toAdd.length}</strong> to add
                {preview.alreadyThere.length > 0 && (
                  <>
                    , <strong>{preview.alreadyThere.length}</strong> already on the list
                  </>
                )}
                {preview.unusable.length > 0 && (
                  <>
                    , <strong>{preview.unusable.length}</strong> unusable
                  </>
                )}
              </div>
              {preview.toAdd.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  {preview.toAdd.slice(0, 8).map((e: any) => e.name).join(", ")}
                  {preview.toAdd.length > 8 && ` and ${preview.toAdd.length - 8} more`}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {isLoading ? noun : `${entries.length} ${noun}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="max-h-80 overflow-y-auto text-sm space-y-1">
              {entries.map((entry) => (
                <div key={entry.id} className="py-1 border-b last:border-0">
                  {entry.name}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ResearchOfficeConfiguration() {
  const { currentUser } = useCurrentUser();

  return (
    <PermissionWrapper currentUserRole={currentUser.role} navigationItem="research-office">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Research Office configuration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The lists the grant and contract forms are filled in from.
          </p>
        </div>

        <Tabs defaultValue="statuses">
          <TabsList>
            <TabsTrigger value="statuses" data-testid="tab-statuses">
              Grant statuses
            </TabsTrigger>
            <TabsTrigger value="institutions" data-testid="tab-institutions">
              Institutions
            </TabsTrigger>
            <TabsTrigger value="contract-types" data-testid="tab-contract-types">
              Contract types
            </TabsTrigger>
          </TabsList>

          <TabsContent value="statuses" className="mt-6">
            <GrantStatusesTab />
          </TabsContent>
          <TabsContent value="institutions" className="mt-6">
            <NameListTab path="institutions" noun="institutions" addLabel="Add institutions" />
          </TabsContent>
          <TabsContent value="contract-types" className="mt-6">
            <NameListTab path="contract-types" noun="contract types" addLabel="Add contract types" />
          </TabsContent>
        </Tabs>
      </div>
    </PermissionWrapper>
  );
}
