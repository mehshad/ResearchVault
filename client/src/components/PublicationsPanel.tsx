import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FileText } from "lucide-react";
import { PublicationsList } from "./PublicationsList";
import { PublicationsToFix } from "./PublicationsToFix";
import { MissingPapers } from "./MissingPapers";

interface PublicationsPanelProps {
  scientistId: number;
  yearsSince?: number;
  hasOrcid: boolean;
  hasScholar: boolean;
}

export function PublicationsPanel({
  scientistId,
  yearsSince = 5,
  hasOrcid,
  hasScholar,
}: PublicationsPanelProps) {
  const showMissing = hasOrcid || hasScholar;

  return (
    <Card data-testid="card-publications-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Publications
        </CardTitle>
        <CardDescription>
          Recent publications, internal author links, and missing works in one place.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <PublicationsList scientistId={scientistId} yearsSince={yearsSince} embedded />
        <Separator />
        <PublicationsToFix embedded />
        {showMissing && (
          <>
            <Separator />
            <MissingPapers
              scientistId={scientistId}
              hasOrcid={hasOrcid}
              hasScholar={hasScholar}
              embedded
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
