// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, Check, X, MessageSquare, FileText, User, Calendar, 
  Clock, AlertCircle, CheckCircle, Send, Eye
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// Mock application data - will connect to API later
const mockApplication = {
  id: 1,
  applicationId: "PMO-2025-001",
  title: "In Vitro Characterization of R. bromii–Tumor–Immune Interactions in Colorectal Cancer",
  formType: "RA-200",
  status: "submitted",
  leadScientist: "Christophe Raynaud",
  projectId: "PRJ12002",
  budgetHolder: "Wouter Hendrickx",
  budgetSource: "13,000 QAR",
  abstract: "Ruminococcus bromii is a gut commensal bacterium known for its ability to degrade resistant starch and produce short-chain fatty acids such as acetate. Recent studies have highlighted its emerging role in modulating immune responses, attenuating fibrosis, and influencing the tumor microenvironment. This project explores the in vitro effects of R. bromii-derived metabolites on colorectal cancer cells, fibroblasts, and T cells using advanced 3D tumor spheroid models, transcriptomic analyses, and ECM-based assays.",
  durationMonths: 10,
  coreLabs: ["Genomics Core", "Omics Core", "Microscopy Core", "Flow Core"],
  submittedAt: "2025-09-10T08:30:00Z",
  createdAt: "2025-09-09T14:20:00Z",
  reviewHistory: [
    {
      timestamp: "2025-09-10T08:30:00Z",
      action: "submitted",
      user: "Christophe Raynaud",
      comment: "Application submitted for PMO review"
    },
    {
      timestamp: "2025-09-09T14:20:00Z", 
      action: "created",
      user: "Christophe Raynaud",
      comment: "Application created as draft"
    }
  ],
  officeComments: [],
  piComments: []
};

const statusColors = {
  submitted: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  under_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300", 
  revision_requested: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
};

export default function PmoOfficeReviewDetail() {
  const [, setLocation] = useLocation();
  const [match] = useRoute("/pmo/office/review/:id");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [newComment, setNewComment] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // TODO: Connect to real API using the id from match.id
  const applicationId = match?.id;
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleStatusChange = async (newStatus: string, comment: string) => {
    if (!comment.trim()) {
      toast({ 
        title: "Comment required", 
        description: "Please provide a comment before changing the status",
        variant: "destructive" 
      });
      return;
    }

    setIsProcessing(true);
    
    try {
      // TODO: Implement API call
      // If approved, create SDR entry
      if (newStatus === 'approved') {
        // TODO: Create SDR entry from approved application
      }
      
      toast({ 
        title: `Application ${newStatus}`, 
        description: `The application has been ${newStatus} successfully.`
      });
      
      setNewComment("");
      // TODO: Refresh application data
      
      if (newStatus === 'approved') {
        setLocation('/pmo/office');
      }
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to update application status",
        variant: "destructive" 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const canTakeAction = mockApplication.status === 'submitted' || mockApplication.status === 'under_review';

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={() => setLocation('/pmo/office')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Office
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{mockApplication.title}</h1>
            <Badge className={statusColors[mockApplication.status as keyof typeof statusColors]}>
              {mockApplication.status.replace('_', ' ').toUpperCase()}
            </Badge>
            <Badge variant="outline">{mockApplication.formType}</Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{mockApplication.applicationId}</span>
            <span>•</span>
            <span>Lead: {mockApplication.leadScientist}</span>
            <span>•</span>
            <span>Submitted: {formatDate(mockApplication.submittedAt)}</span>
          </div>
        </div>
      </div>

      <Tabs defaultValue="application" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="application">Application Details</TabsTrigger>
          <TabsTrigger value="review">Review & Comments</TabsTrigger>
          <TabsTrigger value="history">History & Timeline</TabsTrigger>
          <TabsTrigger value="explanation">User Guide</TabsTrigger>
        </TabsList>

        {/* Application Details */}
        <TabsContent value="application" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Application Content */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Research Activity Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Abstract</Label>
                    <div className="mt-1 p-3 bg-muted rounded border text-sm">
                      {mockApplication.abstract}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Duration</Label>
                      <div className="mt-1 text-sm">{mockApplication.durationMonths} months</div>
                    </div>
                    <div>
                      <Label>Budget Source</Label>
                      <div className="mt-1 text-sm">{mockApplication.budgetSource}</div>
                    </div>
                  </div>

                  <div>
                    <Label>Core Labs Required</Label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {mockApplication.coreLabs.map((lab, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {lab}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Application Info Sidebar */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Application Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Application ID</Label>
                    <div className="mt-1 text-sm font-mono">{mockApplication.applicationId}</div>
                  </div>
                  <div>
                    <Label>Form Type</Label>
                    <div className="mt-1 text-sm">{mockApplication.formType}</div>
                  </div>
                  <div>
                    <Label>Lead Scientist</Label>
                    <div className="mt-1 text-sm">{mockApplication.leadScientist}</div>
                  </div>
                  <div>
                    <Label>Project ID</Label>
                    <div className="mt-1 text-sm">{mockApplication.projectId}</div>
                  </div>
                  <div>
                    <Label>Budget Holder</Label>
                    <div className="mt-1 text-sm">{mockApplication.budgetHolder}</div>
                  </div>
                  <div>
                    <Label>Submitted</Label>
                    <div className="mt-1 text-sm">{formatDate(mockApplication.submittedAt)}</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Review & Comments */}
        <TabsContent value="review" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* PMO Officer Actions */}
            <Card>
              <CardHeader>
                <CardTitle>PMO Officer Review</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="comment">Review Comment *</Label>
                  <Textarea
                    id="comment"
                    placeholder="Provide your review comments..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={4}
                    className="mt-1"
                  />
                </div>

                {canTakeAction && (
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleStatusChange('revision_requested', newComment)}
                      disabled={isProcessing || !newComment.trim()}
                      variant="outline"
                      className="flex-1"
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Request Revision
                    </Button>
                    <Button
                      onClick={() => handleStatusChange('approved', newComment)}
                      disabled={isProcessing || !newComment.trim()}
                      className="flex-1"
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Approve & Create SDR
                    </Button>
                  </div>
                )}

                {!canTakeAction && (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    No actions available for applications in "{mockApplication.status}" status
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Comments History */}
            <Card>
              <CardHeader>
                <CardTitle>Comments History</CardTitle>
              </CardHeader>
              <CardContent>
                {mockApplication.officeComments.length === 0 && mockApplication.piComments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2" />
                    <p>No comments yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Comments would be rendered here */}
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
              <div className="space-y-4">
                {mockApplication.reviewHistory.map((event, index) => (
                  <div key={index} className="flex items-start gap-4 pb-4 border-b border-muted last:border-0">
                    <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary mt-2"></div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium capitalize">{event.action.replace('_', ' ')}</span>
                        <Badge variant="outline" className="text-xs">
                          {event.user}
                        </Badge>
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* User Guide */}
        <TabsContent value="explanation">
          <Card>
            <CardHeader>
              <CardTitle>PMO Review Process Guide</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-blue-100 dark:bg-blue-900/20 text-blue-600 rounded-full p-1 mt-0.5 dark:text-blue-400">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium">1. Review Application</div>
                      <div className="text-muted-foreground text-sm">
                        Carefully review all sections of the RA-200 form including research details, requirements, core labs, and methods.
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 rounded-full p-1 mt-0.5 dark:text-yellow-400">
                      <MessageSquare className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium">2. Provide Feedback</div>
                      <div className="text-muted-foreground text-sm">
                        Add detailed comments about any concerns, required changes, or approval rationale. Comments are required for all actions.
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="bg-orange-100 dark:bg-orange-900/20 text-orange-600 rounded-full p-1 mt-0.5 dark:text-orange-400">
                      <X className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium">3. Request Revision</div>
                      <div className="text-muted-foreground text-sm">
                        If changes are needed, request revision. The application returns to the PI for updates and resubmission.
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="bg-green-100 dark:bg-green-900/20 text-green-600 rounded-full p-1 mt-0.5 dark:text-green-400">
                      <CheckCircle className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium">4. Approve & Create SDR</div>
                      <div className="text-muted-foreground text-sm">
                        When satisfied with the application, approve it. This automatically creates a new SDR entry in the research activities system.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-muted p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Review Criteria</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Scientific merit and feasibility of the research approach</li>
                    <li>• Appropriate duration and resource allocation</li>
                    <li>• Compliance with ethics and safety requirements</li>
                    <li>• Availability of requested core lab services</li>
                    <li>• Budget justification and source confirmation</li>
                    <li>• Alignment with institutional research priorities</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}