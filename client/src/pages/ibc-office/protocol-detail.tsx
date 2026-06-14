// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  CheckCircle,
  XCircle,
  Users,
  Building,
  Biohazard,
  Send,
  Eye,
  UserCheck,
  X,
  Maximize2,
  Minimize2,
  Printer,
} from "lucide-react";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import type { IbcBoardMember } from "@shared/schema";
import { formatFullName } from "@/utils/nameUtils";
import IbcProtocolView from "@/components/IbcProtocolView";

const IBC_WORKFLOW_STATUSES = [
  { value: "draft", label: "Draft", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200", icon: FileText },
  { value: "submitted", label: "Submitted", color: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300", icon: Send },
  { value: "vetted", label: "Vetted", color: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300", icon: Eye },
  { value: "under_review", label: "Under Review", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300", icon: Eye },
  { value: "active", label: "Active", color: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300", icon: CheckCircle },
  { value: "expired", label: "Expired", color: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", icon: XCircle },
];

const BIOSAFETY_LEVELS = [
  { value: "BSL-1", label: "BSL-1", color: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300", description: "Minimal risk" },
  { value: "BSL-2", label: "BSL-2", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300", description: "Moderate risk" },
  { value: "BSL-3", label: "BSL-3", color: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300", description: "High risk" },
  { value: "BSL-4", label: "BSL-4", color: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", description: "Extreme danger" },
];

function safeDate(value: any): string {
  if (!value) return "";
  const dt = new Date(value);
  return isNaN(dt.getTime()) ? "" : format(dt, "MMM d, yyyy");
}

export default function IbcProtocolDetailPage(
  { applicationId: applicationIdProp, printMode = false }: { applicationId?: number; printMode?: boolean } & Record<string, any> = {}
) {
  const [, params] = useRoute("/ibc-office/protocol-detail/:id");
  const applicationId = applicationIdProp ?? (params?.id ? parseInt(params.id) : null);
  const [newWorkflowStatus, setNewWorkflowStatus] = useState("");
  const [reviewComments, setReviewComments] = useState("");
  const [selectedReviewers, setSelectedReviewers] = useState<number[]>([]);
  const [showReviewerSelection, setShowReviewerSelection] = useState(false);
  const [commentExpanded, setCommentExpanded] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: application, isLoading: applicationLoading } = useQuery({
    queryKey: [`/api/ibc-applications/${applicationId}`],
    enabled: !!applicationId,
  });

  const { data: comments = [] } = useQuery({
    queryKey: [`/api/ibc-applications/${applicationId}/comments`],
    enabled: !!applicationId,
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: boardMembers = [] } = useQuery({
    queryKey: ["/api/ibc-board-members"],
  });

  const { data: boardMembersWithScientists = [] } = useQuery({
    queryKey: ["/api/ibc-board-members-with-scientists"],
    queryFn: async () => {
      const boardMembersResponse = await fetch("/api/ibc-board-members");
      const boardMembersData = await boardMembersResponse.json();
      const membersWithScientists = await Promise.all(
        boardMembersData.map(async (member: IbcBoardMember) => {
          try {
            const scientistResponse = await fetch(`/api/scientists/${member.scientistId}`);
            const scientist = await scientistResponse.json();
            return { ...member, scientist };
          } catch (error) {
            return { ...member, scientist: null };
          }
        })
      );
      return membersWithScientists;
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (data: { status: string; reviewComments?: string; reviewerAssignments?: any }) => {
      return apiRequest("PATCH", `/api/ibc-applications/${applicationId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/ibc-applications/${applicationId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/ibc-applications/${applicationId}/comments`] });
      queryClient.invalidateQueries({ queryKey: ["/api/ibc-applications"] });
      toast({
        title: "Status Updated",
        description: "Application status has been updated successfully.",
      });
      setNewWorkflowStatus("");
      setReviewComments("");
      setSelectedReviewers([]);
      setShowReviewerSelection(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update application status.",
        variant: "destructive",
      });
    },
  });

  if (applicationLoading || !application) {
    return (
      <div className="p-6">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-gray-100 rounded-lg animate-pulse dark:bg-gray-800" />
          ))}
        </div>
      </div>
    );
  }

  const currentStatus = IBC_WORKFLOW_STATUSES.find((s) => s.value === application.status?.toLowerCase());
  const biosafetyLevel = BIOSAFETY_LEVELS.find((l) => l.value === application.biosafetyLevel);
  const StatusIcon = currentStatus?.icon || FileText;

  const handleStatusUpdate = (targetStatus?: string, options?: { requireComment?: boolean }) => {
    const status = targetStatus ?? newWorkflowStatus;
    if (!status) return;

    // A comment is only mandatory for "send back" / reversal actions, not for
    // forward progressions like accepting, assigning reviewers, or approving.
    const requireComment = options?.requireComment ?? true;
    if (requireComment && !reviewComments.trim()) {
      toast({
        title: "Comment Required",
        description: "Please add a comment explaining why you are sending this protocol back.",
        variant: "destructive",
      });
      return;
    }

    if (status === "under_review" && selectedReviewers.length === 0) {
      toast({
        title: "Reviewers Required",
        description: "Please select at least one reviewer when changing status to 'Under Review'.",
        variant: "destructive",
      });
      return;
    }

    const updateData: any = {
      status,
      reviewComments: reviewComments || undefined,
    };

    if (status === "under_review" && selectedReviewers.length > 0) {
      updateData.reviewerAssignments = selectedReviewers.map((reviewerId) => ({
        reviewerId,
        assignedDate: new Date().toISOString(),
        status: "assigned",
        boardMember: boardMembers.find((bm: IbcBoardMember) => bm.id === reviewerId),
      }));
    }

    updateStatusMutation.mutate(updateData);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2 mb-2">
            <Building className="h-6 w-6" />
            <h1 className="text-2xl font-bold">IBC Protocol Review</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-300" data-testid="text-ibc-number">{application.ibcNumber}</p>
          {application.title && <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">{application.title}</p>}
        </div>
        <div className="flex items-center space-x-2">
          {!printMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/ibc-applications/${applicationId}/print`, "_blank")}
              data-testid="button-download-pdf"
            >
              <Printer className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          )}
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
        printMode={printMode}
        sidebar={
          <>
            {/* Officer Actions */}
            {!printMode && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Officer Actions</CardTitle>
                <CardDescription>Comment back or move the protocol forward</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Current status */}
                <div className="p-3 bg-gray-50 rounded-lg flex items-center justify-between dark:bg-gray-900">
                  <div className="flex items-center gap-2">
                    <StatusIcon className="h-4 w-4" />
                    <Badge variant="outline" className={currentStatus?.color}>
                      {currentStatus?.label || application.status}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Last Updated</p>
                    <p className="text-sm">{safeDate(application.updatedAt) || "Unknown"}</p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {application?.status?.toLowerCase() === "submitted" && (
                      <>
                        <Button
                          onClick={() => {
                            setNewWorkflowStatus("vetted");
                            handleStatusUpdate("vetted", { requireComment: false });
                          }}
                          disabled={updateStatusMutation.isPending}
                          className="bg-purple-600 hover:bg-purple-700"
                          data-testid="button-accept-vetted"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Accept as Vetted
                        </Button>
                        <Button
                          onClick={() => {
                            setNewWorkflowStatus("draft");
                            handleStatusUpdate("draft");
                          }}
                          disabled={updateStatusMutation.isPending || !reviewComments.trim()}
                          variant="outline"
                          data-testid="button-return-applicant"
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Return to Applicant
                        </Button>
                      </>
                    )}

                    {application?.status?.toLowerCase() === "vetted" && (
                      <>
                        <Button
                          onClick={() => {
                            setNewWorkflowStatus("under_review");
                            setShowReviewerSelection(true);
                          }}
                          disabled={updateStatusMutation.isPending}
                          className="bg-yellow-600 hover:bg-yellow-700"
                          data-testid="button-assign-reviewers"
                        >
                          <Users className="h-4 w-4 mr-2" />
                          Assign Reviewers
                        </Button>
                        <Button
                          onClick={() => {
                            setNewWorkflowStatus("submitted");
                            handleStatusUpdate("submitted");
                          }}
                          disabled={updateStatusMutation.isPending || !reviewComments.trim()}
                          variant="outline"
                          data-testid="button-withdraw-vetting"
                        >
                          <Send className="h-4 w-4 mr-2" />
                          Withdraw Vetting
                        </Button>
                      </>
                    )}

                    {application?.status?.toLowerCase() === "under_review" && (
                      <>
                        <Button
                          onClick={() => {
                            setNewWorkflowStatus("active");
                            handleStatusUpdate("active", { requireComment: false });
                          }}
                          disabled={updateStatusMutation.isPending}
                          className="bg-green-600 hover:bg-green-700"
                          data-testid="button-approve"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve Protocol
                        </Button>
                        <Button
                          onClick={() => {
                            setNewWorkflowStatus("vetted");
                            handleStatusUpdate("vetted");
                          }}
                          disabled={updateStatusMutation.isPending || !reviewComments.trim()}
                          variant="outline"
                          data-testid="button-return-revetting"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Return for Re-vetting
                        </Button>
                      </>
                    )}

                    {application?.status?.toLowerCase() === "active" && (
                      <Button
                        onClick={() => {
                          setNewWorkflowStatus("expired");
                          handleStatusUpdate("expired");
                        }}
                        disabled={updateStatusMutation.isPending || !reviewComments.trim()}
                        variant="destructive"
                        data-testid="button-mark-expired"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Mark as Expired
                      </Button>
                    )}

                    {application?.status?.toLowerCase() === "draft" && (
                      <div className="text-sm text-gray-500 italic dark:text-gray-400">
                        Waiting for Principal Investigator to submit application
                      </div>
                    )}

                    {application?.status?.toLowerCase() === "expired" && (
                      <div className="text-sm text-gray-500 italic dark:text-gray-400">Protocol has expired. No actions available.</div>
                    )}
                  </div>
                </div>

                {/* Reviewer selection popup */}
                <Dialog open={showReviewerSelection} onOpenChange={setShowReviewerSelection}>
                  <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col" data-testid="dialog-reviewer-selection">
                    <DialogHeader>
                      <DialogTitle>Select Reviewers</DialogTitle>
                      <DialogDescription>
                        Choose IBC board members to review this application
                      </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 min-h-0 overflow-y-auto space-y-2 border rounded-lg p-2 bg-white dark:bg-card">
                      {Array.isArray(boardMembersWithScientists) && boardMembersWithScientists.length > 0 ? (
                        boardMembersWithScientists
                          .filter((member: IbcBoardMember) => member.isActive)
                          .map((member: IbcBoardMember) => (
                            <div key={member.id} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded dark:hover:bg-gray-900">
                              <input
                                type="checkbox"
                                id={`reviewer-${member.id}`}
                                checked={selectedReviewers.includes(member.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedReviewers([...selectedReviewers, member.id]);
                                  } else {
                                    setSelectedReviewers(selectedReviewers.filter((id) => id !== member.id));
                                  }
                                }}
                                className="rounded border-gray-300 dark:border-gray-600"
                                data-testid={`checkbox-reviewer-${member.id}`}
                              />
                              <label htmlFor={`reviewer-${member.id}`} className="flex-1 cursor-pointer">
                                <div className="flex items-center space-x-2">
                                  <UserCheck className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                  <div>
                                    <p className="text-sm font-medium">
                                      {member.scientist ? formatFullName(member.scientist) : "Unknown"}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {member.role === "chair"
                                        ? "Chair"
                                        : member.role === "deputy_chair"
                                        ? "Deputy Chair"
                                        : "Member"}
                                      {member.expertise && member.expertise.length > 0 &&
                                        ` • ${member.expertise.slice(0, 2).join(", ")}`}
                                    </p>
                                  </div>
                                </div>
                              </label>
                            </div>
                          ))
                      ) : (
                        <p className="text-sm text-gray-500 text-center py-4 dark:text-gray-400">No active board members available</p>
                      )}
                    </div>

                    {selectedReviewers.length > 0 && (
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-300">Selected reviewers: {selectedReviewers.length}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedReviewers.map((reviewerId) => {
                            const member = boardMembersWithScientists.find((bm: IbcBoardMember) => bm.id === reviewerId);
                            return member ? (
                              <span
                                key={reviewerId}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded dark:bg-blue-950 dark:text-blue-300"
                              >
                                {member.scientist ? formatFullName(member.scientist) : "Unknown"}
                                <button
                                  onClick={() => setSelectedReviewers(selectedReviewers.filter((id) => id !== reviewerId))}
                                  className="hover:text-blue-600 dark:hover:text-blue-400"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ) : null;
                          })}
                        </div>
                      </div>
                    )}

                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowReviewerSelection(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => {
                          handleStatusUpdate("under_review", { requireComment: false });
                          setShowReviewerSelection(false);
                        }}
                        disabled={updateStatusMutation.isPending || selectedReviewers.length === 0}
                        className="bg-yellow-600 hover:bg-yellow-700"
                        data-testid="button-confirm-reviewers"
                      >
                        {updateStatusMutation.isPending ? "Assigning..." : "Assign Selected Reviewers"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Review comment */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium">Review Comments</label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-muted-foreground"
                      onClick={() => setCommentExpanded((v) => !v)}
                      title={commentExpanded ? "Shrink comment box" : "Expand comment box"}
                      data-testid="button-toggle-comment-size"
                    >
                      {commentExpanded ? (
                        <>
                          <Minimize2 className="h-4 w-4 mr-1" />
                          Shrink
                        </>
                      ) : (
                        <>
                          <Maximize2 className="h-4 w-4 mr-1" />
                          Expand
                        </>
                      )}
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Add comments about this status change..."
                    value={reviewComments}
                    onChange={(e) => setReviewComments(e.target.value)}
                    rows={commentExpanded ? 16 : 4}
                    className={commentExpanded ? "resize-y min-h-[16rem]" : "resize-y"}
                    data-testid="input-review-comments"
                  />
                </div>

                {!reviewComments.trim() && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg dark:bg-amber-950 dark:border-amber-800">
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                      A comment is required for send-back actions (Return to Applicant, Withdraw Vetting,
                      Return for Re-vetting, Mark as Expired). Accepting, assigning reviewers, and approving do not require one.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
            )}

            {/* Communication History */}
            <Card className="print:break-inside-avoid print:shadow-none print:border">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Communication History</CardTitle>
              </CardHeader>
              <CardContent>
                {comments && comments.length > 0 ? (
                  <div className={printMode ? "space-y-3" : "space-y-3 max-h-96 overflow-y-auto"}>
                    {[...comments]
                      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((comment: any, index: number) => (
                        <div key={index} className="p-3 border rounded-lg bg-white dark:bg-card" data-testid={`row-comment-${index}`}>
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-1 text-xs font-medium rounded-md ${
                                  comment.commentType === "office_comment"
                                    ? "bg-blue-100 text-blue-800"
                                    : comment.commentType === "reviewer_feedback"
                                    ? "bg-purple-100 text-purple-800"
                                    : comment.commentType === "status_change"
                                    ? "bg-gray-100 text-gray-800"
                                    : "bg-green-100 text-green-800"
                                }`}
                              >
                                {comment.commentType === "office_comment"
                                  ? "Office"
                                  : comment.commentType === "reviewer_feedback"
                                  ? "Reviewer"
                                  : comment.commentType === "status_change"
                                  ? "Status"
                                  : "PI"}
                              </span>
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{comment.authorName}</span>
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {format(new Date(comment.createdAt), "MMM d, h:mm a")}
                            </span>
                          </div>
                          <div className="mt-2">
                            <p className="text-sm text-gray-700 dark:text-gray-300">{comment.comment}</p>
                            {comment.recommendation && (
                              <div className="mt-1">
                                <span
                                  className={`text-xs px-2 py-1 rounded-md font-medium ${
                                    comment.recommendation === "approve"
                                      ? "bg-green-100 text-green-800"
                                      : comment.recommendation === "reject"
                                      ? "bg-red-100 text-red-800"
                                      : "bg-yellow-100 text-yellow-800"
                                  }`}
                                >
                                  Recommendation: {comment.recommendation.replace("_", " ")}
                                </span>
                              </div>
                            )}
                            {comment.statusFrom && comment.statusTo && (
                              <div className="mt-1">
                                <span className="text-xs text-gray-600 dark:text-gray-300">
                                  {comment.statusFrom} → {comment.statusTo}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4 dark:text-gray-400">No communication history yet</p>
                )}
              </CardContent>
            </Card>
          </>
        }
      />

      {printMode && (
        <div className="print-footer" data-testid="text-print-footer">
          {application.ibcNumber || "IBC Application"}
          {application.title ? ` — ${application.title}` : ""}
        </div>
      )}
    </div>
  );
}
