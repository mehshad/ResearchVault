import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { summariseSdrSkips } from "@shared/sdrImportReasons";

interface SdrImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Import SDRs from the template.
 *
 * Preview then apply, the same shape as the grants import: the file is
 * re-parsed on the server for both, so what is applied is what was shown and
 * nothing depends on values the browser could have edited in between.
 *
 * The preview leads with why rows were skipped, grouped. A file of several
 * hundred rows otherwise answers "why did most of this not go in" only by
 * scrolling through every one of them.
 */
export function SdrImportDialog({ open, onOpenChange }: SdrImportDialogProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<{ base64: string; name: string } | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [result, setResult] = useState<any | null>(null);

  const reset = () => { setFile(null); setPreview(null); setResult(null); };

  const onFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(",")[1] ?? "";
      setFile({ base64, name: chosen.name });
      setPreview(null);
      setResult(null);
    };
    reader.readAsDataURL(chosen);
  };

  const previewMutation = useMutation({
    mutationFn: async ({ base64, name }: { base64: string; name: string }) => {
      const res = await apiRequest("POST", "/api/research-activities/import/preview", {
        fileBase64: base64, fileName: name,
      });
      return await res.json();
    },
    onSuccess: (data) => setPreview(data),
    onError: (error: any) => {
      toast({ title: "Could not read that file", description: error?.message, variant: "destructive" });
      reset();
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/research-activities/import/apply", {
        fileBase64: file!.base64, fileName: file!.name,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/research-activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Import complete",
        description:
          `${data.created} created, ${data.updated} updated` +
          (data.projectsCreated ? `, ${data.projectsCreated} new project${data.projectsCreated === 1 ? "" : "s"}` : "") +
          `, ${data.skipped?.length ?? 0} skipped.`,
      });
    },
    onError: (error: any) => {
      toast({ title: "Import failed", description: error?.message, variant: "destructive" });
    },
  });

  const skipSummary = summariseSdrSkips(preview?.rows ?? []);
  const canApply = preview && (preview.summary.create + preview.summary.update) > 0;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto overflow-x-hidden" data-testid="dialog-sdr-import">
        <DialogHeader>
          <DialogTitle>Import SDRs</DialogTitle>
          <DialogDescription>
            SDRs are matched on SDR Number: an existing number is updated, a new one is created. A
            project number that does not exist yet is created from the name given alongside it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="/api/research-activities/import/template" download data-testid="link-sdr-template">
              <Download className="mr-2 h-4 w-4" />
              Download template
            </a>
          </Button>
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={onFile}
            className="text-sm"
            data-testid="input-sdr-file"
          />
        </div>

        {file && !preview && !result && (
          <Button
            onClick={() => previewMutation.mutate(file)}
            disabled={previewMutation.isPending}
            data-testid="button-sdr-preview"
          >
            {previewMutation.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <FileSpreadsheet className="mr-2 h-4 w-4" />}
            Check {file.name}
          </Button>
        )}

        {preview && !result && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">{preview.summary.create} new</Badge>
              <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">{preview.summary.update} updates</Badge>
              <Badge variant="secondary">{preview.summary.skip} skipped</Badge>
              {preview.summary.newProjects > 0 && (
                <Badge variant="outline">
                  {preview.summary.newProjects} project{preview.summary.newProjects === 1 ? "" : "s"} to create
                </Badge>
              )}
            </div>

            {skipSummary.length > 0 && (
              <div className="rounded-md border bg-muted/40 p-3">
                <div className="mb-2 text-sm font-medium">
                  Why {preview.summary.skip} row{preview.summary.skip === 1 ? " was" : "s were"} skipped
                </div>
                <div className="space-y-1.5">
                  {skipSummary.map((reason) => (
                    <div key={reason.code} className="flex items-baseline gap-3 text-sm">
                      <span className="w-12 shrink-0 text-right font-mono font-medium tabular-nums">
                        {reason.count}
                      </span>
                      <span className="min-w-0 break-words">
                        <span className="font-medium">{reason.label}</span>
                        <span className="text-muted-foreground"> &mdash; {reason.hint}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="max-h-[35vh] divide-y overflow-y-auto rounded-md border text-sm">
              {preview.rows.map((row: any) => (
                <div key={row.rowNumber} className="flex items-start gap-3 px-3 py-2">
                  <Badge variant={row.action === "skip" ? "secondary" : "default"} className="mt-0.5 shrink-0">
                    {row.action}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs">{row.sdrNumber || "(no number)"}</div>
                    <div className="break-words">{row.title}</div>
                    {row.reason && <div className="break-words text-xs text-muted-foreground">{row.reason}</div>}
                    {row.createsProject && (
                      <div className="break-words text-xs text-blue-700 dark:text-blue-300">
                        creates project {row.createsProject.projectNumber} &mdash; {row.createsProject.projectName}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-2 text-sm">
            <p>
              <strong>{result.created}</strong> created, <strong>{result.updated}</strong> updated,{" "}
              <strong>{result.projectsCreated}</strong> projects created,{" "}
              <strong>{result.skipped?.length ?? 0}</strong> skipped.
            </p>
            {result.failed?.length > 0 && (
              <div className="rounded-md border border-destructive/40 p-3">
                <div className="mb-1 font-medium text-destructive">{result.failed.length} failed to save</div>
                {result.failed.slice(0, 8).map((f: any) => (
                  <div key={f.rowNumber} className="text-xs text-muted-foreground">
                    row {f.rowNumber} {f.sdrNumber}: {f.reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button
              onClick={() => applyMutation.mutate()}
              disabled={!canApply || applyMutation.isPending}
              data-testid="button-sdr-apply"
            >
              {applyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
