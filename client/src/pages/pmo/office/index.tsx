import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Eye, Search, ClipboardCheck, Clock, AlertCircle, CheckCircle,
  MessageSquare, Calendar
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Scientist } from "@shared/schema";

interface PmoApplication {
  id: number;
  applicationId: string;
  title: string;
  status: string;
  form_type: "RA-200" | "RA-205A";
  leadScientistId: number | null;
  projectId: number | null;
  durationMonths: number | null;
  createdAt: string | null;
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  submitted: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  under_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  revision_requested: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
};

const statusIcons: Record<string, typeof Clock> = {
  draft: Clock,
  submitted: Clock,
  under_review: AlertCircle,
  revision_requested: MessageSquare,
  approved: CheckCircle,
  rejected: AlertCircle
};

export default function PmoOfficeReview() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: applications = [], isLoading } = useQuery<PmoApplication[]>({
    queryKey: ['/api/pmo-applications']
  });

  const { data: scientists = [] } = useQuery<Scientist[]>({
    queryKey: ['/api/scientists']
  });

  const scientistName = (id: number | null) => {
    if (!id) return "Unassigned";
    const s = scientists.find((sc) => sc.id === id);
    return s ? `${s.honorificTitle} ${s.firstName} ${s.lastName}` : "Unassigned";
  };

  const filteredApplications = applications.filter((app) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      app.title.toLowerCase().includes(term) ||
      (app.applicationId || "").toLowerCase().includes(term) ||
      scientistName(app.leadScientistId).toLowerCase().includes(term);
    const matchesStatus = statusFilter === "all" || app.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const countBy = (status: string) => applications.filter((a) => a.status === status).length;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">PMO Office Review</h1>
          <p className="text-muted-foreground mt-1">
            Review and manage PMO applications from Principal Investigators
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-sm text-muted-foreground">Submitted</p>
                <p className="text-2xl font-bold" data-testid="stat-submitted">{countBy('submitted')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              <div>
                <p className="text-sm text-muted-foreground">Under Review</p>
                <p className="text-2xl font-bold" data-testid="stat-under-review">{countBy('under_review')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <div>
                <p className="text-sm text-muted-foreground">Needs Revision</p>
                <p className="text-2xl font-bold" data-testid="stat-revision">{countBy('revision_requested')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              <div>
                <p className="text-sm text-muted-foreground">Approved</p>
                <p className="text-2xl font-bold" data-testid="stat-approved">{countBy('approved')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold" data-testid="stat-total">{applications.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search applications by title, ID, or lead scientist..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-applications"
                />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {([
                ["all", "All"],
                ["submitted", "Submitted"],
                ["under_review", "Under Review"],
                ["revision_requested", "Needs Revision"],
                ["approved", "Approved"],
              ] as const).map(([value, label]) => (
                <Button
                  key={value}
                  variant={statusFilter === value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(value)}
                  data-testid={`filter-${value}`}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Applications for Review */}
      <Card>
        <CardHeader>
          <CardTitle>Applications for Review</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading applications…</div>
          ) : filteredApplications.length === 0 ? (
            <div className="text-center py-8">
              <ClipboardCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No applications found</h3>
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== "all"
                  ? "Try adjusting your search or filters"
                  : "No applications are currently pending review"
                }
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredApplications.map((application) => {
                const StatusIcon = statusIcons[application.status] || Clock;

                return (
                  <div key={`${application.form_type}-${application.id}`} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors" data-testid={`card-application-${application.form_type}-${application.id}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-medium text-lg">{application.title}</h3>
                          <Badge className={statusColors[application.status]}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {application.status.replace('_', ' ').toUpperCase()}
                          </Badge>
                          <Badge variant="outline">{application.form_type}</Badge>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-muted-foreground mb-3">
                          <div>
                            <span className="font-medium">Application ID:</span>
                            <div>{application.applicationId}</div>
                          </div>
                          <div>
                            <span className="font-medium">Lead Scientist:</span>
                            <div>{scientistName(application.leadScientistId)}</div>
                          </div>
                          <div>
                            <span className="font-medium">Project:</span>
                            <div>{application.projectId ? `#${application.projectId}` : '—'}</div>
                          </div>
                          <div>
                            <span className="font-medium">Duration:</span>
                            <div>{application.durationMonths ? `${application.durationMonths} months` : '—'}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>Created: {formatDate(application.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 ml-4">
                        <Link href={`/pmo/office/review/${application.id}`}>
                          <Button data-testid={`button-review-${application.id}`}>
                            <Eye className="h-4 w-4 mr-1" />
                            Review
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
