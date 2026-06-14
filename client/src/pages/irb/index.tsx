import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, TableBody, TableCell, TableHead, 
  TableHeader, TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EnhancedIrbApplication } from "@/lib/types";
import { Plus, Search, MoreHorizontal, CalendarRange, FileText, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNameWithJobTitle } from "@/utils/nameUtils";

export default function IrbList() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: applications, isLoading } = useQuery<EnhancedIrbApplication[]>({
    queryKey: ['/api/irb-applications'],
  });

  const formatDate = (date: string | Date | undefined) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short',
      day: 'numeric'
    });
  };

  const statusColors = {
    draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    submitted: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
    under_review: "bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400",
    approved: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    rejected: "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400",
    pending: "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
    expired: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
  };

  const riskLevelColors = {
    minimal: "bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400",
    "greater than minimal": "bg-yellow-50 text-yellow-600 dark:bg-yellow-950 dark:text-yellow-400",
    high: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400"
  };

  const filteredApplications = applications?.filter(app => {
    return (
      app.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (app.description && app.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (app.irbNumber && app.irbNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (app.principalInvestigator && app.principalInvestigator.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (app.researchActivity && app.researchActivity.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (app.researchActivity && app.researchActivity.sdrNumber.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">IRB Applications</h1>
        <div className="flex gap-2">
          <Link href="/irb/templates">
            <Button variant="outline" data-testid="button-document-templates">
              <FileText className="h-4 w-4 mr-2" />
              Document Templates
            </Button>
          </Link>
          <Link href="/irb/create">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="button-new-irb-application">
              New Application
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>IRB Applications</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
              <Input
                type="search"
                placeholder="Search applications..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-irb"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-3">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-64" />
                    <div className="flex gap-4">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30%]">Application</TableHead>
                  <TableHead>Protocol #</TableHead>
                  <TableHead>Principal Investigator</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Risk Level</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApplications?.map((application) => (
                  <TableRow key={application.id}>
                    <TableCell>
                      <div className="font-medium">
                        <Link href={`/irb/${application.id}`} className="hover:text-primary-500 transition-colors">{application.title}</Link>
                      </div>
                      {application.researchActivity && (
                        <div className="text-sm text-muted-foreground mt-1">
                          Research Activity: <Link href={`/research-activities/${application.researchActivity.id}`} className="text-primary-500 hover:text-primary-600 transition-colors">
                            {application.researchActivity.sdrNumber} - {application.researchActivity.title}
                          </Link>
                        </div>
                      )}
                      {application.workflowStatus === 'draft' && (
                        <div className="mt-2">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.location.href = `/irb/${application.id}/assembly`;
                            }}
                            data-testid={`button-assemble-protocol-${application.id}`}
                          >
                            Assemble Protocol
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <FileText className="h-4 w-4 mr-1 text-muted-foreground" />
                        <span>{application.irbNumber || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {application.principalInvestigator ? (
                        <div className="flex items-center">
                          <div className="h-7 w-7 rounded-full bg-primary-200 flex items-center justify-center text-xs text-primary-700 font-medium mr-2">
                            {application.principalInvestigator.profileImageInitials}
                          </div>
                          <span>{formatNameWithJobTitle(application.principalInvestigator)}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {application.submissionDate && (
                          <div className="flex items-center mb-1">
                            <CalendarRange className="h-3 w-3 mr-1 text-muted-foreground" />
                            <span>Submitted: {formatDate(application.submissionDate)}</span>
                          </div>
                        )}
                        {application.expirationDate && (
                          <div className="flex items-center">
                            <CalendarRange className="h-3 w-3 mr-1 text-muted-foreground" />
                            <span>Expires: {formatDate(application.expirationDate)}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {(application.workflowStatus || application.status) && (
                        <Badge 
                          variant="outline"
                          className={`capitalize ${statusColors[(application.workflowStatus || application.status).toLowerCase() as keyof typeof statusColors] || "bg-gray-100 text-gray-600"}`}
                        >
                          {(application.workflowStatus || application.status).replace('_', ' ')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {application.riskLevel ? (
                        <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${riskLevelColors[application.riskLevel.toLowerCase() as keyof typeof riskLevelColors] || "bg-gray-100 text-gray-600"}`}>
                          <AlertCircle className="h-3 w-3 mr-1" />
                          {application.riskLevel}
                        </div>
                      ) : (
                        <span>—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredApplications?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No IRB applications found matching your search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
