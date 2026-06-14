import { useState } from "react";
import { useLocation, useRoute, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Edit, FileText, Calendar,
  MessageSquare, CheckCircle, Send, Info
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Scientist } from "@shared/schema";

interface HistoryEvent {
  timestamp: string;
  action: string;
  user: string;
  comment: string;
}

interface PmoApplication {
  id: number;
  applicationId: string;
  title: string;
  status: string;
  form_type: "RA-200" | "RA-205A";
  leadScientistId: number | null;
  budgetHolderId: number | null;
  projectId: number | null;
  budgetSource: string | null;
  abstract: string | null;
  durationMonths: number | null;
  coreLabs: string[] | null;
  reviewHistory: HistoryEvent[] | null;
  officeComments: any[] | null;
  piComments: any[] | null;
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

export default function PmoApplicationDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/pmo/applications/:id");
  const search = useSearch();
  const { toast } = useToast();

  const [newComment, setNewComment] = useState("");

  const applicationId = params?.id;
  const formTypeParam = new URLSearchParams(search).get("type");

  const { data: applications = [], isLoading } = useQuery<PmoApplication[]>({
    queryKey: ['/api/pmo-applications'],
  });

  const application = applications.find(
    (app) =>
      app.id === Number(applicationId) &&
      (!formTypeParam || app.form_type === formTypeParam)
  );

  const { data: scientists = [] } = useQuery<Scientist[]>({
    queryKey: ['/api/scientists'],
  });

  const scientistName = (id: number | null | undefined) => {
    if (!id) return "Unassigned";
    const s = scientists.find((sc) => sc.id === id);
    return s ? `${s.honorificTitle} ${s.firstName} ${s.lastName}` : "Unassigned";
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) {
      toast({
        title: "Comment required",
        description: "Please enter a comment",
        variant: "destructive"
      });
      return;
    }
    toast({
      title: "Coming soon",
      description: "Adding PI comments from this view is not enabled yet.",
    });
  };

  if (isLoading) {
    return <div className="p-6 text-center text-muted-foreground">Loading application…</div>;
  }

  if (!application) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <Button variant="outline" onClick={() => setLocation('/pmo/applications')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Applications
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3" />
            <h2 className="text-lg font-medium mb-1">Application not found</h2>
            <p>This PMO application doesn't exist or has been removed.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canEdit = application.status === 'draft' || application.status === 'revision_requested';
  const reviewHistory = application.reviewHistory || [];
  const officeComments = application.officeComments || [];
  const piComments = application.piComments || [];
  const coreLabs = application.coreLabs || [];
  const editPath = application.form_type === 'RA-205A'
    ? `/pmo/applications/${applicationId}/edit-ra205a`
    : `/pmo/applications/${applicationId}/edit-ra200`;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={() => setLocation('/pmo/applications')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Applications
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold" data-testid="text-application-title">{application.title}</h1>
            <Badge className={statusColors[application.status]}>
              {application.status.replace('_', ' ').toUpperCase()}
            </Badge>
            <Badge variant="outline">{application.form_type}</Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{application.applicationId}</span>
            <span>•</span>
            <span>Lead: {scientistName(application.leadScientistId)}</span>
            <span>•</span>
            <span>Created: {formatDate(application.createdAt)}</span>
          </div>
        </div>
        {canEdit && (
          <Button onClick={() => setLocation(editPath)} data-testid="button-edit-application">
            <Edit className="h-4 w-4 mr-2" />
            Edit Application
          </Button>
        )}
      </div>

      <Tabs defaultValue="application" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="application">Application Details</TabsTrigger>
          <TabsTrigger value="comments">Comments & Discussion</TabsTrigger>
          <TabsTrigger value="history">History & Timeline</TabsTrigger>
          <TabsTrigger value="guide">User Guide</TabsTrigger>
        </TabsList>

        {/* Application Details */}
        <TabsContent value="application" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Research Activity Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Abstract</Label>
                    <div className="mt-1 p-3 bg-muted rounded border text-sm">
                      {application.abstract || "No abstract provided."}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Duration</Label>
                      <div className="mt-1 text-sm">
                        {application.durationMonths ? `${application.durationMonths} months` : "—"}
                      </div>
                    </div>
                    <div>
                      <Label>Budget Source</Label>
                      <div className="mt-1 text-sm">{application.budgetSource || "—"}</div>
                    </div>
                  </div>

                  <div>
                    <Label>Core Labs Required</Label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {coreLabs.length === 0 ? (
                        <span className="text-sm text-muted-foreground">None specified</span>
                      ) : (
                        coreLabs.map((lab, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {lab}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Application Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Application ID</Label>
                    <div className="mt-1 text-sm font-mono">{application.applicationId}</div>
                  </div>
                  <div>
                    <Label>Form Type</Label>
                    <div className="mt-1 text-sm">{application.form_type}</div>
                  </div>
                  <div>
                    <Label>Lead Scientist</Label>
                    <div className="mt-1 text-sm">{scientistName(application.leadScientistId)}</div>
                  </div>
                  <div>
                    <Label>Project</Label>
                    <div className="mt-1 text-sm">{application.projectId ? `#${application.projectId}` : "—"}</div>
                  </div>
                  <div>
                    <Label>Budget Holder</Label>
                    <div className="mt-1 text-sm">{scientistName(application.budgetHolderId)}</div>
                  </div>
                  <div>
                    <Label>Created</Label>
                    <div className="mt-1 text-sm">{formatDate(application.createdAt)}</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Comments & Discussion */}
        <TabsContent value="comments" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Add Comment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="comment">Your Comment</Label>
                  <Textarea
                    id="comment"
                    placeholder="Add a comment or question for the PMO office..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={4}
                    className="mt-1"
                    data-testid="input-comment"
                  />
                </div>
                <Button
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                  className="w-full"
                  data-testid="button-add-comment"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Add Comment
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Comments & Feedback</CardTitle>
              </CardHeader>
              <CardContent>
                {officeComments.length === 0 && piComments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2" />
                    <p>No comments yet</p>
                    <p className="text-xs">Comments will appear here once the PMO office reviews your application</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {[...officeComments, ...piComments]
                      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                      .map((c, idx) => (
                        <div key={idx} className="border-b border-muted pb-3 last:border-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">{c.user}</Badge>
                            <span className="text-xs text-muted-foreground">{formatDate(c.timestamp)}</span>
                          </div>
                          <p className="text-sm">{c.comment}</p>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* History & Timeline */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Application Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {reviewHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-2" />
                  <p>No timeline events yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {reviewHistory.map((event, index) => (
                    <div key={index} className="flex items-start gap-4 pb-4 border-b border-muted last:border-0">
                      <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary mt-2"></div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium capitalize">{event.action.replace('_', ' ')}</span>
                          <Badge variant="outline" className="text-xs">{event.user}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-1">{event.comment}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDate(event.timestamp)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* User Guide */}
        <TabsContent value="guide">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                PMO Application Process Guide
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-blue-100 dark:bg-blue-900/20 text-blue-600 rounded-full p-1 mt-0.5 dark:text-blue-400">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium">1. Complete RA-200 Form</div>
                      <div className="text-muted-foreground text-sm">
                        Fill out all required sections including research details, requirements, duration, and core lab needs. Save as draft to continue later.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="bg-green-100 dark:bg-green-900/20 text-green-600 rounded-full p-1 mt-0.5 dark:text-green-400">
                      <Send className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium">2. Submit for Review</div>
                      <div className="text-muted-foreground text-sm">
                        Once complete, submit your application to the PMO office for review. You'll receive notifications about status changes.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 rounded-full p-1 mt-0.5 dark:text-yellow-400">
                      <MessageSquare className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium">3. Respond to Feedback</div>
                      <div className="text-muted-foreground text-sm">
                        Monitor comments and respond to any questions from the PMO office. If revisions are requested, update your application and resubmit.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="bg-purple-100 dark:bg-purple-900/20 text-purple-600 rounded-full p-1 mt-0.5 dark:text-purple-400">
                      <CheckCircle className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium">4. Approval & SDR Creation</div>
                      <div className="text-muted-foreground text-sm">
                        Upon approval, your application creates a new Research Activity (SDR) entry. You can then begin your research activities.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-muted p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Application Status Types</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200">DRAFT</Badge>
                      <span className="text-muted-foreground">Application is being prepared and can be edited</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">SUBMITTED</Badge>
                      <span className="text-muted-foreground">Application submitted and awaiting PMO review</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">UNDER REVIEW</Badge>
                      <span className="text-muted-foreground">PMO office is actively reviewing the application</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300">REVISION REQUESTED</Badge>
                      <span className="text-muted-foreground">Changes requested - application can be edited and resubmitted</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">APPROVED</Badge>
                      <span className="text-muted-foreground">Application approved - SDR automatically created</span>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Need Help?</h4>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>• Contact the PMO office at: <strong>researchpmo@sidra.org</strong></div>
                    <div>• Use the Comments section to ask questions during review</div>
                    <div>• Check the History tab to track all application activities</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
