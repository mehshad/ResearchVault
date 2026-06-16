/**
 * UploadingModal
 *
 * A blocking overlay modal shown while a file upload / import is in progress.
 * Use it anywhere an upload can take more than a moment so the user knows
 * something is happening and doesn't click away or re-submit.
 *
 * Usage:
 *   <UploadingModal open={isUploading} label="Importing CSV…" />
 *
 * Props:
 *   open    — whether to show the modal
 *   label   — primary message (e.g. "Uploading file…")
 *   sublabel — optional secondary line (e.g. file name or record count)
 */
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface UploadingModalProps {
  open: boolean;
  label?: string;
  sublabel?: string;
}

export function UploadingModal({
  open,
  label = "Uploading…",
  sublabel,
}: UploadingModalProps) {
  return (
    <Dialog open={open} modal>
      {/* No DialogClose — user cannot dismiss while upload is in progress */}
      <DialogContent
        className="sm:max-w-xs text-center gap-6 py-10 [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">{label}</p>
            {sublabel && (
              <p className="text-sm text-muted-foreground">{sublabel}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Please wait, do not close this window.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
