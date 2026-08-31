import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  SDR_EXEMPTION_REASON_MAX_LENGTH,
  validateSdrExemptionReason,
} from "@shared/publicationWorkflow";

interface SdrExemptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing reason when the exception is being revised rather than claimed. */
  initialReason?: string;
  onConfirm: (reason: string) => void;
  /** Called when the scientist backs out, so the SDR select can revert. */
  onCancel?: () => void;
}

/**
 * Asks a scientist why a publication has no Scientific Data Record.
 *
 * Shared by the create and edit forms so the wording, the limit and the
 * validation are the same in both places — the explanation is read by the
 * Outcome Office, and it should not depend on which screen it was written on.
 */
export function SdrExemptionDialog({
  open,
  onOpenChange,
  initialReason = "",
  onConfirm,
  onCancel,
}: SdrExemptionDialogProps) {
  const [reason, setReason] = useState(initialReason);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setReason(initialReason);
      setTouched(false);
    }
  }, [open, initialReason]);

  const validation = validateSdrExemptionReason(reason);
  const error = touched && !validation.ok ? validation.message : null;
  const remaining = SDR_EXEMPTION_REASON_MAX_LENGTH - reason.trim().length;

  const confirm = () => {
    setTouched(true);
    if (!validation.ok) return;
    onConfirm(validation.reason);
    onOpenChange(false);
  };

  const cancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) cancel();
        else onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-xl" data-testid="dialog-sdr-exemption">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500" />
            This is an exception, not a shortcut
          </DialogTitle>
          <DialogDescription className="sr-only">
            Explain why this publication has no linked Scientific Data Record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            Publications are normally linked to a Scientific Data Record, so the work can be
            traced back to the research activity behind it. Occasionally there is genuinely
            nothing to link — most often when you have helped a colleague at another
            institution and been included as an author. That is what this is for.
          </p>
          <p>
            Tell the Outcome Office why no SDR applies. A sentence or two is enough; naming the
            collaborating institution and what you contributed helps.
          </p>
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="font-medium">What happens next</p>
            <p className="mt-1">
              Your explanation is recorded on the publication and goes to the Outcome Office,
              who read it before finalising the record. If they are not satisfied they will send
              it back for correction with a note, and you can either link an SDR or explain
              further.
            </p>
          </div>
          <p>
            If the work was carried out here, please link the SDR instead — an exception cannot
            stand in for one.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sdr-exemption-reason">Why does no SDR apply?</Label>
          <Textarea
            id="sdr-exemption-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onBlur={() => setTouched(true)}
            rows={4}
            maxLength={SDR_EXEMPTION_REASON_MAX_LENGTH}
            placeholder="e.g. Collaboration with the Institute of Molecular Medicine, Lisbon — I ran the flow cytometry panel and was included as fourth author. The study was theirs; there is no SDR here."
            aria-invalid={error ? true : undefined}
            data-testid="input-sdr-exemption-reason"
          />
          <div className="flex items-start justify-between gap-4 text-xs">
            <span className="text-destructive" data-testid="error-sdr-exemption-reason">
              {error}
            </span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {remaining.toLocaleString()} characters left
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={cancel} data-testid="button-sdr-exemption-cancel">
            Cancel
          </Button>
          <Button onClick={confirm} data-testid="button-sdr-exemption-confirm">
            Record this exception
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Sentinel value for the "no SDR" option in a research-activity select. */
export const NO_SDR_OPTION = "__no-sdr__";
