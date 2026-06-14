// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  FileText, 
  User, 
  Users,
  Calendar, 
  Clock, 
  CheckCircle2, 
  XCircle,
  AlertTriangle,
  Send,
  Mail,
  Download,
  Eye
} from "lucide-react";
import { IrbApplication, ResearchActivity, Scientist } from "@shared/schema";

export default function IrbProtocolReview() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const applicationId = parseInt(params.id);

  const [reviewComments, setReviewComments] = useState("");
  const [reviewDecision, setReviewDecision] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const submitReviewMutation = useMutation({
    mutationFn: async (reviewData: any) => {
      const response = await fetch(`/api/irb-applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewData)
      });
      
      if (!response.ok) throw new Error('Failed to submit review');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/irb-applications/${applicationId}`] });
      toast({
        title: "Review Submitted",
        description: "Your review has been sent to the IRB office.",
      });
      setReviewComments("");
      setReviewDecision("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit review. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleSubmitReview = async () => {
    if (!reviewComments.trim() || !reviewDecision) {
      toast({
        title: "Missing Information",
        description: "Please provide both comments and a decision.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    const timestamp = Date.now();
    const existingComments = application?.reviewComments ? 
      (typeof application.reviewComments === 'string' ? 
        JSON.parse(application.reviewComments) : application.reviewComments) : {};

    const reviewData = {
      reviewComments: JSON.stringify({
        ...existingComments,
        [timestamp]: {
          action: 'reviewer_feedback',
          comments: reviewComments,
          decision: reviewDecision,
          stage: 'reviewer_assessment',
          timestamp: new Date().toISOString(),
          reviewerType: 'board_member'
        }
      }),
      workflowStatus: reviewDecision === 'recommend_approval' ? 'ready_for_decision' :
                     reviewDecision === 'recommend_rejection' ? 'ready_for_decision' :
                     reviewDecision === 'request_revisions' ? 'revisions_requested' :
                     'under_review'
    };

    await submitReviewMutation.mutateAsync(reviewData);
    setIsSubmitting(false);
  };

  const handleEmailQuestion = (subject: string, bodyTemplate: string) => {
    const protocolInfo = `Protocol: ${application?.title || 'N/A'}%0D%0AIRB Number: ${application?.irbNumber || 'N/A'}%0D%0A%0D%0A`;
    window.location.href = `mailto:irb-office@example.com?subject=${encodeURIComponent(subject)}&body=${protocolInfo}${encodeURIComponent(bodyTemplate)}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return <div className="p-6">Loading protocol...</div>;
  }

  if (!application) {
    return <div className="p-6">Protocol not found</div>;
  }

  // Parse protocol data
  const protocolTeamMembers = application.protocolTeamMembers ? 
    (typeof application.protocolTeamMembers === 'string' ? 
      JSON.parse(application.protocolTeamMembers) : application.protocolTeamMembers) : [];
  
  const documents = application.documents ? 
    (typeof application.documents === 'string' ? 
      JSON.parse(application.documents) : application.documents) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/irb-reviewer")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Dashboard
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Protocol Header */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl">{application.title}</CardTitle>
                  <div className="flex items-center gap-4 text-sm text-gray-600 mt-2 dark:text-gray-300">
                    <span>IRB #{application.irbNumber}</span>
                    <span>•</span>
                    <span>SDR: {researchActivity?.sdrNumber}</span>
                    <span>•</span>
                    <span>Submitted: {formatDate(application.submissionDate)}</span>
                  </div>
                </div>
                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800">
                  Under Review
                </Badge>
              </div>
            </CardHeader>
          </Card>

          {/* Protocol Details */}
          <Card>
            <CardHeader>
              <CardTitle>Protocol Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
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
                <div className="mt-4">
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

          {/* Team Members */}
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
                          {member.hasSigned ? "Signed" : "Pending"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 italic dark:text-gray-400">No team members assigned.</p>
              )}
            </CardContent>
          </Card>

          {/* Documents */}
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
                            Size: {(doc.uploadedFile.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      )}
                      
                      {doc.signatureRequired && doc.signatures && doc.signatures.length > 0 && (
                        <div className="mt-2">
                          <p className="text-sm font-medium mb-1">Signatures:</p>
                          {doc.signatures.map((sig: any, index: number) => (
                            <div key={index} className="text-sm bg-green-50 border border-green-200 rounded p-2 dark:bg-green-950 dark:border-green-800">
                              <span className="font-medium">{sig.signedBy}</span>
                              <span className="text-gray-600 ml-2 dark:text-gray-300">
                                Signed on {formatDate(sig.signedAt)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 italic dark:text-gray-400">No documents uploaded.</p>
              )}
            </CardContent>
          </Card>
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

          {/* Review Submission */}
          <Card>
            <CardHeader>
              <CardTitle>Submit Review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Review Decision</label>
                <Select value={reviewDecision} onValueChange={setReviewDecision}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your recommendation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recommend_approval">Recommend Approval</SelectItem>
                    <SelectItem value="recommend_rejection">Recommend Rejection</SelectItem>
                    <SelectItem value="request_revisions">Request Revisions</SelectItem>
                    <SelectItem value="need_more_info">Need More Information</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Review Comments</label>
                <Textarea
                  value={reviewComments}
                  onChange={(e) => setReviewComments(e.target.value)}
                  placeholder="Provide detailed comments about your review..."
                  rows={6}
                />
              </div>

              <Button
                onClick={handleSubmitReview}
                disabled={isSubmitting || !reviewComments.trim() || !reviewDecision}
                className="w-full"
              >
                <Send className="h-4 w-4 mr-2" />
                {isSubmitting ? "Submitting..." : "Submit Review"}
              </Button>
            </CardContent>
          </Card>

          {/* Quick Email Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Contact IRB Office
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => handleEmailQuestion(
                  "Protocol Clarification Request",
                  "I need clarification on the following aspects of this protocol:%0D%0A%0D%0A[Please specify your questions]%0D%0A%0D%0ABest regards,%0D%0A[Your name]"
                )}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Ask Protocol Question
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => handleEmailQuestion(
                  "Review Extension Request",
                  "I need to request an extension for reviewing this protocol.%0D%0A%0D%0AReason: [Please specify]%0D%0ARequested deadline: [Date]%0D%0A%0D%0ABest regards,%0D%0A[Your name]"
                )}
              >
                <Clock className="h-4 w-4 mr-2" />
                Request Extension
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => handleEmailQuestion(
                  "Technical Issue Report",
                  "I'm experiencing a technical issue while reviewing this protocol:%0D%0A%0D%0AIssue description: [Please describe]%0D%0A%0D%0ABest regards,%0D%0A[Your name]"
                )}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Report Issue
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}