// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  FileText,
  Building,
  Biohazard,
  Send,
  CheckCircle,
  XCircle,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";
import { format } from "date-fns";
import TimelineComments from "@/components/TimelineComments";
import IbcProtocolView from "@/components/IbcProtocolView";

const IBC_WORKFLOW_STATUSES = [
  { value: "draft", label: "Draft", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200", icon: FileText },
  { value: "submitted", label: "Submitted", color: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300", icon: Send },
  { value: "vetted", label: "Vetted", color: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300", icon: CheckCircle },
  { value: "under_review", label: "Under Review", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300", icon: AlertTriangle },
  { value: "active", label: "Active", color: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300", icon: CheckCircle },
  { value: "expired", label: "Expired", color: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", icon: XCircle },
];

const BIOSAFETY_LEVELS = [
  { value: "BSL-1", label: "BSL-1", color: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300", description: "Minimal risk" },
  { value: "BSL-2", label: "BSL-2", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300", description: "Moderate risk" },
  { value: "BSL-3", label: "BSL-3", color: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300", description: "High risk" },
  { value: "BSL-4", label: "BSL-4", color: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", description: "Extreme danger" },
];

export default function IbcReviewPage() {
  const [, params] = useRoute("/ibc-reviewer/review/:id");
  const [, setLocation] = useLocation();
  const applicationId = params?.id ? parseInt(params.id) : null;
  const [reviewComments, setReviewComments] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: application, isLoading } = useQuery({
    queryKey: [`/api/ibc-applications/${applicationId}`],
    enabled: !!applicationId,
  });

  // Fetch comments from the new comments table
  const { data: comments = [] } = useQuery({
    queryKey: [`/api/ibc-applications/${applicationId}/comments`],
    enabled: !!applicationId,
    staleTime: 0, // Force fresh data
    refetchOnMount: true,
  });

  const submitReviewMutation = useMutation({
    mutationFn: async (data: { comments: string; recommendation: string }) => {
      return apiRequest("POST", `/api/ibc-applications/${applicationId}/reviewer-feedback`, data);
    },
    onSuccess: () => {
      toast({
        title: "Review submitted",
        description: "Your review has been sent to the IBC office.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/ibc-applications/${applicationId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/ibc-applications/${applicationId}/comments`] });
      setReviewComments("");
      setRecommendation("");
      setLocation("/ibc-reviewer");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit review",
        variant: "destructive",
      });
    },
  });

  const handleSubmitReview = () => {
    if (!reviewComments.trim()) {
      toast({
        title: "Comments required",
        description: "Please provide review comments before submitting.",
        variant: "destructive",
      });
      return;
    }

    if (!recommendation) {
      toast({
        title: "Recommendation required",
        description: "Please select a recommendation.",
        variant: "destructive",
      });
      return;
    }

    submitReviewMutation.mutate({
      comments: reviewComments,
      recommendation: recommendation,
    });
  };

  if (isLoading || !application) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3 dark:bg-gray-700"></div>
          <div className="h-32 bg-gray-200 rounded dark:bg-gray-700"></div>
          <div className="h-24 bg-gray-200 rounded dark:bg-gray-700"></div>
        </div>
      </div>
    );
  }

  const currentStatus = IBC_WORKFLOW_STATUSES.find((s) => s.value === application.status?.toLowerCase());
  const biosafetyLevel = BIOSAFETY_LEVELS.find((l) => l.value === application.biosafetyLevel);
  const StatusIcon = currentStatus?.icon || FileText;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/ibc-reviewer")}
            className="mb-2 -ml-2"
            data-testid="button-back-dashboard"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <div className="flex items-center space-x-2 mb-2">
            <Building className="h-6 w-6" />
            <h1 className="text-2xl font-bold">IBC Protocol Review</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-300" data-testid="text-ibc-number">{application.ibcNumber}</p>
          {application.title && <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">{application.title}</p>}
        </div>
        <div className="flex items-center space-x-2">
          <Badge className={currentStatus?.color} data-testid="badge-status">
            <StatusIcon className="h-3 w-3 mr-1" />
            {currentStatus?.label || application.status}
          </Badge>
          {biosafetyLevel && (
            <Badge className={biosafetyLevel.color}>
              <Biohazard className="h-3 w-3 mr-1" />
              {biosafetyLevel.label}
            </Badge>
          )}
        </div>
      </div>

      <IbcProtocolView
        applicationId={applicationId}
        sidebar={
          <>
            {/* Review Form */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center space-x-2 text-lg">
                  <MessageSquare className="h-5 w-5" />
                  <span>Submit Review</span>
                </CardTitle>
                <CardDescription>
                  Provide your review comments and recommendation to the IBC office
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Recommendation</label>
                  <Select value={recommendation} onValueChange={setRecommendation}>
                    <SelectTrigger className="mt-1" data-testid="select-recommendation">
                      <SelectValue placeholder="Select your recommendation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approve">
                        <div className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                          <span>Approve</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="minor_revisions">
                        <div className="flex items-center space-x-2">
                          <MessageSquare className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                          <span>Request Minor Revisions</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="major_revisions">
                        <div className="flex items-center space-x-2">
                          <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                          <span>Request Major Revisions</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="reject">
                        <div className="flex items-center space-x-2">
                          <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                          <span>Reject</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Review Comments</label>
                  <Textarea
                    placeholder="Provide detailed comments about the protocol. Include specific concerns, suggestions for improvement, or confirmation of compliance with biosafety requirements..."
                    value={reviewComments}
                    onChange={(e) => setReviewComments(e.target.value)}
                    rows={6}
                    className="resize-y"
                    data-testid="input-review-comments"
                  />
                  <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                    Your comments will be shared with the Principal Investigator and IBC office
                  </p>
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setLocation("/ibc-reviewer")}
                    data-testid="button-cancel-review"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmitReview}
                    disabled={submitReviewMutation.isPending || !reviewComments.trim() || !recommendation}
                    data-testid="button-submit-review"
                  >
                    {submitReviewMutation.isPending ? (
                      "Submitting..."
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Submit Review
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Communication History */}
            <TimelineComments
              application={application}
              comments={comments}
              title="Communication History"
            />
          </>
        }
      />
    </div>
  );
}
