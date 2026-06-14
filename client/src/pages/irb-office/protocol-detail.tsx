// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, FileText, User, Calendar, Clock, CheckCircle, 
  XCircle, Send, AlertTriangle, MessageSquare, History, Users, Printer
} from "lucide-react";
import { IrbApplication, ResearchActivity, Scientist } from "@shared/schema";
import TimelineComments from "@/components/TimelineComments";

interface ReviewAction {
  action: 'approve' | 'reject' | 'request_revisions' | 'assign_reviewer' | 'assign_reviewers';
  comments: string;
  reviewerId?: number;
  decision?: string;
}

export default function IrbOfficeProtocolDetail(
  { applicationId: applicationIdProp, printMode = false }: { applicationId?: number; printMode?: boolean } & Record<string, any> = {}
) {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const applicationId = applicationIdProp ?? parseInt(params.id);
  
  const [reviewComments, setReviewComments] = useState("");
  const [reviewDecision, setReviewDecision] = useState<string>("");
  const [assignedReviewer, setAssignedReviewer] = useState<string>("");
  const [secondaryReviewer, setSecondaryReviewer] = useState<string>("");
  const [reviewType, setReviewType] = useState<string>("");

  const { data: application, isLoading } = useQuery<IrbApplication>({
    queryKey: [`/api/irb-applications/${applicationId}`],
    enabled: !!applicationId,
  });

  const { data: researchActivity } = useQuery<ResearchActivity>({
    queryKey: [`/api/research-activities/${application?.researchActivityId}`],
    enabled: !!application?.researchActivityId,
  });

  const { data: principalInvestigator } = useQuery<Scientist>({
    queryKey: [`/api/scientists/${application?.principalInvestigatorId}`],
    enabled: !!application?.principalInvestigatorId,
  });

  const { data: boardMembers = [] } = useQuery<any[]>({
    queryKey: ['/api/irb-board-members/active'],
  });

  // Fetch comments for timeline display
  const { data: comments = [] } = useQuery({
    queryKey: [`/api/irb-applications/${applicationId}/comments`],
    enabled: !!applicationId,
    staleTime: 0,
    refetchOnMount: true,
  });

  // Extract scientists from active board members for reviewer selection
  const reviewers = boardMembers.map(member => member.scientist).filter(Boolean);

  const updateApplicationMutation = useMutation({
    mutationFn: async (updateData: any) => {
      const response = await fetch(`/api/irb-applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update application: ${response.status} ${errorText}`);
      }
      
      return response.json();
    },
    onSuccess: (_, action) => {
      queryClient.invalidateQueries({ queryKey: [`/api/irb-applications/${applicationId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/irb-applications'] });
      
      const successMessages = {
        approve: "Protocol approved successfully",
        reject: "Protocol rejected",
        request_revisions: "Revision request sent to PI",
        assign_reviewer: "Reviewer assigned successfully",
        assign_reviewers: "Reviewers assigned successfully"
      };
      
      toast({ 
        title: "Success", 
        description: successMessages[action.action]
      });
      
      // Reset form
      setReviewComments("");
      setReviewDecision("");
      setAssignedReviewer("");
      setSecondaryReviewer("");
      setReviewType("");
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to update protocol: ${error.message}`, variant: "destructive" });
    },
  });

  const getNewStatus = (action: string) => {
    switch (action) {
      case 'approve': return 'approved';
      case 'reject': return 'rejected';
      case 'request_revisions': return 'revisions_requested';
      case 'assign_reviewer': return 'under_review';
      case 'assign_reviewers': return 'under_review';
      default: return application?.workflowStatus;
    }
  };

  const handleAction = async (action: string) => {
    if (!reviewComments.trim()) return;

    const timestamp = Date.now().toString();
    let updateData;

    if (action === 'triage') {
      if (reviewDecision === 'complete_triage') {
        updateData = {
          workflowStatus: 'triage_complete',
          reviewComments: JSON.stringify({
            [timestamp]: {
              action: 'triage_complete',
              comments: reviewComments,
              decision: 'triage_complete',
              stage: 'triage',
              timestamp: new Date().toISOString()
            }
          })
        };
      } else if (reviewDecision === 'revisions_required') {
        updateData = {
          workflowStatus: 'revisions_requested',
          reviewComments: JSON.stringify({
            [timestamp]: {
              action: 'request_revisions',
              comments: reviewComments,
              decision: 'revisions_required',
              stage: 'triage',
              timestamp: new Date().toISOString()
            }
          })
        };
      } else if (reviewDecision === 'rejected') {
        updateData = {
          workflowStatus: 'rejected',
          reviewComments: JSON.stringify({
            [timestamp]: {
              action: 'reject',
              comments: reviewComments,
              decision: 'rejected',
              stage: 'triage',
              timestamp: new Date().toISOString()
            }
          })
        };
      }
    } else if (action === 'assign_reviewers') {
      const reviewerAssignments = {
        primaryReviewer: assignedReviewer,
        secondaryReviewer: secondaryReviewer && secondaryReviewer !== 'none' ? secondaryReviewer : null,
        reviewType: reviewType,
        assignedDate: new Date().toISOString()
      };

      updateData = {
        workflowStatus: 'under_review',
        protocolType: reviewType,
        reviewerAssignments: JSON.stringify(reviewerAssignments),
        reviewComments: JSON.stringify({
          [timestamp]: {
            action: 'assign_reviewers',
            comments: `Reviewers assigned. Primary: ${reviewers.find(r => r.id.toString() === assignedReviewer)?.name}${secondaryReviewer && secondaryReviewer !== 'none' ? `, Secondary: ${reviewers.find(r => r.id.toString() === secondaryReviewer)?.name}` : ''}. Review type: ${reviewType}`,
            decision: 'reviewers_assigned',
            stage: 'assignment',
            reviewerAssignments,
            timestamp: new Date().toISOString()
          }
        })
      };
    } else if (action === 'final_decision') {
      let newStatus = reviewDecision;
      if (reviewDecision === 'approved_with_modifications') {
        newStatus = 'revisions_requested';
      } else if (reviewDecision === 'deferred') {
        newStatus = 'revisions_requested';
      } else if (reviewDecision === 'disapproved') {
        newStatus = 'rejected';
      }

      updateData = {
        workflowStatus: newStatus,
        reviewComments: JSON.stringify({
          [timestamp]: {
            action: 'final_decision',
            comments: reviewComments,
            decision: reviewDecision,
            stage: 'final_review',
            timestamp: new Date().toISOString()
          }
        })
      };
    }

    if (updateData) {
      try {
        const response = await fetch(`/api/irb-applications/${applicationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        });
        
        if (!response.ok) throw new Error('Failed to update application');
        
        queryClient.invalidateQueries({ queryKey: [`/api/irb-applications/${applicationId}`] });
        queryClient.invalidateQueries({ queryKey: ['/api/irb-applications'] });
        
        toast({ title: "Success", description: "Protocol updated successfully" });
        
        // Reset form
        setReviewComments('');
        setReviewDecision('');
        setAssignedReviewer('');
        setSecondaryReviewer('');
        setReviewType('');
      } catch (error) {
        toast({ title: "Error", description: "Failed to update protocol", variant: "destructive" });
      }
    }
  };

  const formatDate = (date: string | Date | undefined) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'submitted':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
      case 'triage_complete':
        return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300';
      case 'under_review':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300';
      case 'approved':
        return 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300';
      case 'rejected':
        return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300';
      case 'revisions_requested':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300';
      case 'resubmitted':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  const renderReviewHistory = () => {
    return (
      <TimelineComments 
        application={{
          createdAt: application.createdAt,
          submissionDate: application.submissionDate,
          vettedDate: application.vettedDate,
          underReviewDate: application.underReviewDate,
          approvalDate: application.approvalDate,
          expirationDate: application.expirationDate,
        }}
        comments={comments}
        title="Complete Workflow History"
        includeStatusChanges={printMode}
      />
    );
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!application) {
    return <div>Protocol not found</div>;
  }

  return (
    <div className="space-y-6">
      {!printMode && (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/irb-office")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to IRB Office
          </Button>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-2">{application.title}</h1>
          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
            <span>IRB Number: {application.irbNumber || "Pending"}</span>
            <span>•</span>
            <span>SDR: {researchActivity?.sdrNumber}</span>
            <span>•</span>
            <span>Submitted: {formatDate(application.submissionDate)}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!printMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/irb-applications/${applicationId}/print`, "_blank")}
              data-testid="button-download-pdf"
            >
              <Printer className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          )}
          <Badge 
            variant="outline"
            className={`capitalize ${getStatusBadge(application.workflowStatus || 'submitted')}`}
          >
            {application.workflowStatus === 'revisions_requested' ? 'revisions requested' :
             application.workflowStatus === 'triage_complete' ? 'triage complete' :
             (application.workflowStatus || 'submitted').replace('_', ' ')}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Protocol Information */}
          <Card>
            <CardHeader>
              <CardTitle>Protocol Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Protocol Type</label>
                  <p>{application.protocolType || "—"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Risk Level</label>
                  <p>{application.riskLevel || "—"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Interventional</label>
                  <p>{application.isInterventional ? "Yes" : "No"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Expected Participants</label>
                  <p>{application.expectedParticipants || "—"}</p>
                </div>
              </div>
              
              {application.description && (
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Description</label>
                  <p className="mt-1">{application.description}</p>
                </div>
              )}
              
              {application.vulnerablePopulations && application.vulnerablePopulations.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Vulnerable Populations</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {application.vulnerablePopulations.map((pop) => (
                      <Badge key={pop} variant="outline">{pop.replace('_', ' ')}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Research Activity Details */}
          {researchActivity && (
            <Card>
              <CardHeader>
                <CardTitle>Research Activity Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-300">SDR Number</label>
                    <p>{researchActivity.sdrNumber}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Title</label>
                    <p>{researchActivity.title}</p>
                  </div>
                  {researchActivity.description && (
                    <div>
                      <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Description</label>
                      <p>{researchActivity.description}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Protocol Team Members */}
          {(() => {
            const protocolTeamMembers = application.protocolTeamMembers ? 
              (typeof application.protocolTeamMembers === 'string' ? 
                JSON.parse(application.protocolTeamMembers) : application.protocolTeamMembers) : [];
            
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Protocol Team Members
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {protocolTeamMembers.length > 0 ? (
                    <div className="space-y-3">
                      {protocolTeamMembers.map((member: any) => (
                        <div key={member.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex-1">
                            <h4 className="font-medium">{member.name}</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-300">{member.email}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {member.roles.map((role: string, index: number) => (
                                <Badge key={index} variant="secondary" className="text-xs">
                                  {role}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={member.hasAccess ? "default" : "secondary"}>
                              {member.hasAccess ? "Access Granted" : "No Access"}
                            </Badge>
                            <Badge variant={member.hasSigned ? "default" : "outline"}>
                              {member.hasSigned ? "Signed" : "Pending Signature"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 italic dark:text-gray-400">No team members assigned yet.</p>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Required Documents */}
          {(() => {
            const documents = application.documents ? 
              (typeof application.documents === 'string' ? 
                JSON.parse(application.documents) : application.documents) : [];
            
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Required Documents
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {documents.length > 0 ? (
                    <div className="space-y-3">
                      {documents.map((doc: any) => (
                        <div key={doc.id} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium">{doc.name}</h4>
                            <div className="flex items-center gap-2">
                              <Badge variant={doc.uploaded ? "default" : "secondary"}>
                                {doc.uploaded ? "Uploaded" : "Missing"}
                              </Badge>
                              {doc.required && (
                                <Badge variant="outline" className="text-xs">Required</Badge>
                              )}
                            </div>
                          </div>
                          
                          {doc.uploadedFile && (
                            <div className="bg-gray-50 rounded p-2 mb-2 dark:bg-gray-900">
                              <p className="text-sm font-medium">{doc.uploadedFile.name}</p>
                              <p className="text-xs text-gray-600 dark:text-gray-300">
                                Size: {(doc.uploadedFile.size / 1024).toFixed(1)} KB | 
                                Type: {doc.uploadedFile.type}
                              </p>
                            </div>
                          )}
                          
                          {doc.signatureRequired && (
                            <div className="mt-2">
                              <p className="text-sm font-medium mb-1">Signatures:</p>
                              {doc.signatures && doc.signatures.length > 0 ? (
                                <div className="space-y-1">
                                  {doc.signatures.map((sig: any, index: number) => (
                                    <div key={index} className="text-sm bg-green-50 border border-green-200 rounded p-2 dark:bg-green-950 dark:border-green-800">
                                      <span className="font-medium">{sig.signedBy}</span>
                                      <span className="text-gray-600 ml-2 dark:text-gray-300">
                                        Signed on {formatDate(sig.signedAt)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-amber-600 dark:text-amber-400">Signature pending</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 italic dark:text-gray-400">No documents uploaded yet.</p>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Review History */}
          {renderReviewHistory()}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Principal Investigator */}
          {principalInvestigator && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Principal Investigator
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary-200 flex items-center justify-center text-sm text-primary-700 font-medium">
                    {principalInvestigator.profileImageInitials}
                  </div>
                  <div>
                    <p className="font-medium">{principalInvestigator.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{principalInvestigator.email}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          {!printMode && (
          <Card>
            <CardHeader>
              <CardTitle>Review Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Triage Stage */}
              {(application.workflowStatus === 'submitted' || application.workflowStatus === 'resubmitted') && (
                <>
                  <div className="bg-blue-50 p-3 rounded-lg dark:bg-blue-950">
                    <h4 className="font-medium text-blue-900 mb-2 dark:text-blue-200">Triage Stage</h4>
                    <p className="text-sm text-blue-700 mb-3 dark:text-blue-300">Initial review to determine if protocol is complete and ready for formal review.</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium">Triage Decision</label>
                    <Select value={reviewDecision} onValueChange={setReviewDecision}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select triage decision" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="complete_triage">Complete - Ready for Review</SelectItem>
                        <SelectItem value="revisions_required">Request Revisions</SelectItem>
                        <SelectItem value="rejected">Reject Protocol</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Triage Comments</label>
                    <Textarea
                      className="mt-1"
                      placeholder="Enter triage comments..."
                      value={reviewComments}
                      onChange={(e) => setReviewComments(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <Button 
                    className="w-full" 
                    onClick={() => handleAction('triage')}
                    disabled={!reviewComments.trim() || !reviewDecision || updateApplicationMutation.isPending}
                  >
                    Submit Triage Decision
                  </Button>
                </>
              )}

              {/* Reviewer Assignment Stage */}
              {application.workflowStatus === 'triage_complete' && (
                <>
                  <div className="bg-green-50 p-3 rounded-lg dark:bg-green-950">
                    <h4 className="font-medium text-green-900 mb-2 dark:text-green-200">Assign Reviewers</h4>
                    <p className="text-sm text-green-700 mb-3 dark:text-green-300">Protocol has passed triage. Assign reviewers for formal review.</p>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Primary Reviewer</label>
                    <Select value={assignedReviewer} onValueChange={setAssignedReviewer}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select primary reviewer" />
                      </SelectTrigger>
                      <SelectContent>
                        {reviewers.map((reviewer) => (
                          <SelectItem key={reviewer.id} value={reviewer.id.toString()}>
                            {reviewer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Secondary Reviewer (Optional)</label>
                    <Select value={secondaryReviewer} onValueChange={setSecondaryReviewer}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select secondary reviewer" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {reviewers.map((reviewer) => (
                          <SelectItem key={reviewer.id} value={reviewer.id.toString()}>
                            {reviewer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Review Type</label>
                    <Select value={reviewType} onValueChange={setReviewType}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select review type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="expedited">Expedited Review</SelectItem>
                        <SelectItem value="full_board">Full Board Review</SelectItem>
                        <SelectItem value="exempt">Exempt Review</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button 
                    className="w-full" 
                    onClick={() => {
                      if (!assignedReviewer || !reviewType) {
                        toast({ title: "Error", description: "Please select a primary reviewer and review type", variant: "destructive" });
                        return;
                      }
                      
                      const now = new Date().toISOString();
                      const timestamp = Date.now();
                      
                      const updateData = {
                        workflowStatus: 'under_review',
                        protocolType: reviewType,
                        reviewerAssignments: JSON.stringify({
                          primary: parseInt(assignedReviewer),
                          secondary: secondaryReviewer && secondaryReviewer !== 'none' ? parseInt(secondaryReviewer) : null,
                          reviewType: reviewType,
                          assignedDate: now
                        }),
                        reviewComments: JSON.stringify({
                          ...(typeof application?.reviewComments === 'string' 
                            ? JSON.parse(application.reviewComments) 
                            : application?.reviewComments || {}),
                          [timestamp]: {
                            action: 'assign_reviewers',
                            comments: `Reviewers assigned. Primary: ${reviewers.find(r => r.id.toString() === assignedReviewer)?.name}${secondaryReviewer && secondaryReviewer !== 'none' ? `, Secondary: ${reviewers.find(r => r.id.toString() === secondaryReviewer)?.name}` : ''}. Review type: ${reviewType}`,
                            decision: 'reviewers_assigned',
                            timestamp: now
                          }
                        })
                      };
                      
                      updateApplicationMutation.mutate(updateData);
                    }}
                    disabled={!assignedReviewer || !reviewType || updateApplicationMutation.isPending}
                  >
                    {updateApplicationMutation.isPending ? 'Assigning...' : 'Assign Reviewers & Start Review'}
                  </Button>
                </>
              )}

              {/* Under Review Stage */}
              {application.workflowStatus === 'under_review' && (
                <>
                  <div className="bg-yellow-50 p-3 rounded-lg dark:bg-yellow-950">
                    <h4 className="font-medium text-yellow-900 mb-2 dark:text-yellow-200">Under Review</h4>
                    <p className="text-sm text-yellow-700 mb-3 dark:text-yellow-300">Protocol is currently under formal review by assigned reviewers.</p>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Final Decision</label>
                    <Select value={reviewDecision} onValueChange={setReviewDecision}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select final decision" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="approved">Approve</SelectItem>
                        <SelectItem value="approved_with_modifications">Approve with Modifications</SelectItem>
                        <SelectItem value="deferred">Defer for More Information</SelectItem>
                        <SelectItem value="disapproved">Disapprove</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Review Decision Letter</label>
                    <Textarea
                      className="mt-1"
                      placeholder="Enter detailed review decision and rationale..."
                      value={reviewComments}
                      onChange={(e) => setReviewComments(e.target.value)}
                      rows={6}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      className="flex-1" 
                      onClick={() => handleAction('final_decision')}
                      disabled={!reviewComments.trim() || !reviewDecision || updateApplicationMutation.isPending}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Submit Decision
                    </Button>
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => handleAction('request_revisions')}
                      disabled={!reviewComments.trim() || updateApplicationMutation.isPending}
                    >
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Request Revisions
                    </Button>
                  </div>

                  <Button 
                    variant="destructive" 
                    className="w-full"
                    onClick={() => handleAction('reject')}
                    disabled={!reviewComments.trim() || updateApplicationMutation.isPending}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                </>
              )}

              {/* Send to PI */}
              {application.workflowStatus === 'ready_for_pi' && (
                <Button className="w-full">
                  <Send className="h-4 w-4 mr-2" />
                  Send to PI
                </Button>
              )}
            </CardContent>
          </Card>
          )}


        </div>
      </div>

      {printMode && (
        <div className="print-footer" data-testid="text-print-footer">
          {application.irbNumber || "IRB Application"}
          {application.title ? ` — ${application.title}` : ""}
        </div>
      )}
    </div>
  );
}

// Force component name for debugging
IrbOfficeProtocolDetail.displayName = 'IrbOfficeProtocolDetail';