import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import IbcProtocolDetailPage from "@/pages/ibc-office/protocol-detail";

export default function IbcApplicationPrintPage() {
  const params = useParams<{ id: string }>();
  const applicationId = parseInt(params.id);

  return (
    <div className="print-shell min-h-screen bg-white dark:bg-card">
      <div className="no-print sticky top-0 z-50 flex items-center justify-between border-b bg-white px-6 py-3 dark:bg-card">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Review the full application below, then print or save as PDF.
        </p>
        <div className="flex items-center gap-2">
          <Button onClick={() => window.print()} data-testid="button-print">
            <Printer className="h-4 w-4 mr-2" />
            Print / Save as PDF
          </Button>
          <Button
            variant="outline"
            onClick={() => window.close()}
            data-testid="button-close"
          >
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        </div>
      </div>
      <div className="print-body">
        <IbcProtocolDetailPage applicationId={applicationId} printMode />
      </div>
    </div>
  );
}
