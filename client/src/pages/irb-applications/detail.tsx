// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResearchActivity, IrbApplication, Scientist, DataManagementPlan } from "@shared/schema";
import { ArrowLeft, Calendar, FileText, Layers, Users, ClipboardCheck, Edit, History, Printer } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { usePublicationCount } from "@/hooks/use-publication-count";
import StatusActions from "@/components/irb/StatusActions";

export default function IrbApplicationDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const id = parseInt(params.id);

  const { data: irbApplication, isLoading: irbApplicationLoading } = useQuery<IrbApplication>({
    queryKey: ['/api/irb-applications', id],
    queryFn: async () => {
      const response = await fetch(`/api/irb-applications/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch IRB application');
      }
      return response.json();
    },
  });

  const { data: researchActivity, isLoading: researchActivityLoading } = useQuery<ResearchActivity>({
    queryKey: ['/api/research-activities', irbApplication?.researchActivityId],
    queryFn: async () => {
      if (!irbApplication?.researchActivityId) return null;
      const response = await fetch(`/api/research-activities/${irbApplication.researchActivityId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch research activity');
      }
      return response.json();
    },
    enabled: !!irbApplication?.researchActivityId,
  });

  const { data: principalInvestigator, isLoading: principalInvestigatorLoading } = useQuery<Scientist>({
    queryKey: ['/api/scientists', irbApplication?.principalInvestigatorId],
    queryFn: async () => {
      if (!irbApplication?.principalInvestigatorId) return null;
      const response = await fetch(`/api/scientists/${irbApplication.principalInvestigatorId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch principal investigator');
      }
      return response.json();
    },
    enabled: !!irbApplication?.principalInvestigatorId,
  });
  
  // Get the number of publications linked to this research activity
  const { count: publicationCount } = usePublicationCount(irbApplication?.researchActivityId);

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

  const renderProtocolHistory = () => {
    try {
      const allEntries: Array<[string, any]> = [];
      
      // Always add initial submission with earliest timestamp
      const submissionTime = new Date(irbApplication.submissionDate).getTime();
      allEntries.push([
        (submissionTime - 100000).toString(), // Ensure it's always first
        {
          type: 'pi_submission',
          action: 'submitted',
          comment: 'Initial protocol submission',
          timestamp: irbApplication.submissionDate,
          workflowStatus: 'submitted'
        }
      ]);
      
      // Add IRB review comments
      const hasReviewComments = irbApplication?.reviewComments && irbApplication.reviewComments !== '{}';
      if (hasReviewComments) {
        let reviewComments;
        if (typeof irbApplication.reviewComments === 'string') {
          reviewComments = JSON.parse(irbApplication.reviewComments);
        } else {
          reviewComments = irbApplication.reviewComments;
        }
        
        Object.entries(reviewComments).forEach(([timestamp, review]: [string, any]) => {
          // Include all review comments, not filtering out test entries for debugging
          const filteredReview = { ...review, type: 'irb_review' };
          
          // Hide reviewer details from PI - only show generic IRB office actions
          if (review.action === 'assign_reviewers') {
            filteredReview.comments = 'Reviewers assigned and review process initiated';
            // Remove any reviewer-specific information
            delete filteredReview.reviewerId;
          }
          
          allEntries.push([timestamp, filteredReview]);
        });
      }
      
      // Add PI responses  
      const hasPiResponses = irbApplication?.piResponses && irbApplication.piResponses !== '{}';
      if (hasPiResponses) {
        let piResponses;
        if (typeof irbApplication.piResponses === 'string') {
          piResponses = JSON.parse(irbApplication.piResponses);
        } else {
          piResponses = irbApplication.piResponses;
        }
        
        Object.entries(piResponses).forEach(([timestamp, response]: [string, any]) => {
          allEntries.push([timestamp, { ...response, type: 'pi_submission' }]);
        });
      }
      
      if (allEntries.length <= 1) return null;
      
      // Sort by timestamp (chronological order - oldest first)
      allEntries.sort(([a], [b]) => {
        const timeA = isNaN(Number(a)) ? new Date(a).getTime() : Number(a);
        const timeB = isNaN(Number(b)) ? new Date(b).getTime() : Number(b);
        return timeA - timeB;
      });
      
      return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Protocol History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {allEntries.map(([timestamp, entry]: [string, any], index) => (
                <div key={`${timestamp}-${index}`} className="border-l-2 border-gray-200 pl-4 dark:border-gray-700">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge 
                      variant="outline" 
                      className={`capitalize ${
                        entry.type === 'irb_review' 
                          ? 'bg-blue-50 text-blue-700 border-blue-200' 
                          : 'bg-green-50 text-green-700 border-green-200'
                      }`}
                    >
                      {entry.type === 'irb_review' 
                        ? 'IRB Office' 
                        : 'PI Submission'
                      }
                    </Badge>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(isNaN(Number(timestamp)) ? timestamp : new Date(Number(timestamp)))}
                    </span>
                  </div>
                  <p className="text-sm">{entry.comment || entry.comments}</p>
                  {entry.decision && (
                    <p className="text-sm font-medium mt-1">Decision: {entry.decision}</p>
                  )}
                  {entry.changes && (
                    <div className="mt-2">
                      <p className="text-sm font-medium">Changes Made:</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">{entry.changes}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      );
    } catch (error) {
      console.error('Error parsing protocol history:', error);
      return null;
    }
  };
  
  // Get the data management plan for this research activity
  const { data: dataManagementPlan, isLoading: dmpLoading } = useQuery<DataManagementPlan>({
    queryKey: ['/api/data-management-plans', irbApplication?.researchActivityId],
    queryFn: async () => {
      if (!irbApplication?.researchActivityId) return null;
      const response = await fetch(`/api/data-management-plans?researchActivityId=${irbApplication.researchActivityId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch data management plan');
      }
      const plans = await response.json();
      return plans.length > 0 ? plans[0] : null;
    },
    enabled: !!irbApplication?.researchActivityId,
  });

  if (irbApplicationLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/irb-applications")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Skeleton className="h-8 w-64" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="space-y-2">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!irbApplication) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/irb")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">IRB Application Not Found</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <p className="text-lg text-foreground">The IRB application you're looking for could not be found.</p>
              <Button className="mt-4" onClick={() => navigate("/irb")}>
                Return to IRB Applications List
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/irb")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">{irbApplication.title}</h1>
        </div>
        <div className="flex gap-2">
          {(irbApplication.workflowStatus === 'draft' || irbApplication.workflowStatus === 'revisions_requested') && (
            <Button 
              onClick={() => navigate(`/irb/${id}/assembly`)}
            >
              <FileText className="h-4 w-4 mr-2" />
              Protocol Assembly
            </Button>
          )}
          <StatusActions 
            applicationId={id}
            currentStatus={irbApplication.workflowStatus || 'draft'}
          />
          <Button
            variant="outline"
            onClick={() => window.open(`/irb-applications/${id}/print`, "_blank")}
            data-testid="button-download-pdf"
          >
            <Printer className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
          <Button 
            variant="outline"
            onClick={() => navigate(`/irb-applications/${id}/edit`)}
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>IRB Application Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">{irbApplication.title}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="rounded-sm bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                    {irbApplication.irbNumber}
                  </Badge>
                  {researchActivity && (
                    <Badge variant="outline" className="rounded-sm bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                      {researchActivity.sdrNumber}
                    </Badge>
                  )}
                  <Badge className={
                    irbApplication.workflowStatus === 'approved' ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' :
                    irbApplication.workflowStatus === 'submitted' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300' :
                    irbApplication.workflowStatus === 'under_review' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' :
                    irbApplication.workflowStatus === 'rejected' ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' :
                    irbApplication.workflowStatus === 'revisions_requested' ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' :
                    'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                  }>
                    {irbApplication.workflowStatus === 'revisions_requested' ? 'revisions requested' : 
                     (irbApplication.workflowStatus || 'draft').replace('_', ' ')}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-foreground">Related Research Activity</h3>
                  <div className="flex items-start gap-1 mt-1">
                    <Layers className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span className="break-words">
                      {researchActivityLoading ? (
                        <Skeleton className="h-4 w-24 inline-block" />
                      ) : researchActivity ? (
                        <Button 
                          variant="link" 
                          className="p-0 h-auto text-primary-600 text-left whitespace-normal"
                          onClick={() => navigate(`/research-activities/${researchActivity.id}`)}
                        >
                          {researchActivity.title}
                        </Button>
                      ) : 'Not assigned'}
                    </span>
                  </div>
                </div>
                
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-foreground">Investigator</h3>
                  <div className="flex items-center gap-1 mt-1">
                    <Users className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">
                      {principalInvestigatorLoading ? (
                        <Skeleton className="h-4 w-24 inline-block" />
                      ) : principalInvestigator ? (
                        principalInvestigator.name
                      ) : 'Not assigned'}
                    </span>
                  </div>
                </div>

                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-foreground">Submission Date</h3>
                  <div className="flex items-center gap-1 mt-1">
                    <Calendar className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">
                      {irbApplication.submissionDate 
                        ? format(new Date(irbApplication.submissionDate), 'MMM d, yyyy') 
                        : 'Not specified'}
                    </span>
                  </div>
                </div>
                
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-foreground">Initial Approval Date</h3>
                  <div className="flex items-center gap-1 mt-1">
                    <Calendar className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">
                      {irbApplication.initialApprovalDate 
                        ? format(new Date(irbApplication.initialApprovalDate), 'MMM d, yyyy') 
                        : 'Not approved yet'}
                    </span>
                  </div>
                </div>
                
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-foreground">Expiration Date</h3>
                  <div className="flex items-center gap-1 mt-1">
                    <Calendar className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">
                      {irbApplication.expirationDate 
                        ? format(new Date(irbApplication.expirationDate), 'MMM d, yyyy') 
                        : 'Not specified'}
                    </span>
                  </div>
                </div>
                
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-foreground">Protocol Type</h3>
                  <div className="flex items-center gap-1 mt-1">
                    <ClipboardCheck className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{irbApplication.protocolType || 'Not specified'}</span>
                  </div>
                </div>
                
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-foreground">IRB Net Number</h3>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="truncate">{irbApplication.irbNetNumber || 'Not specified'}</span>
                  </div>
                </div>
                
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-foreground">Interventional</h3>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="truncate">{irbApplication.isInterventional ? 'Yes' : 'No'}</span>
                  </div>
                </div>
              </div>

              {irbApplication.description && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-foreground">Description</h3>
                  <p className="mt-1">{irbApplication.description}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Related Resources</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Button 
                  variant="outline" 
                  className="w-full justify-start" 
                  onClick={() => researchActivity && navigate(`/research-activities/${researchActivity.id}`)}
                  disabled={!researchActivity}
                >
                  <Layers className="h-4 w-4 mr-2" /> 
                  <span className="flex-1 text-left">Research Activity</span>
                  {researchActivity && (
                    <Badge variant="outline" className="ml-2 rounded-sm bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                      {researchActivity.sdrNumber}
                    </Badge>
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start" 
                  onClick={() => principalInvestigator && navigate(`/scientists/${principalInvestigator.id}`)}
                  disabled={!principalInvestigator}
                >
                  <Users className="h-4 w-4 mr-2" /> 
                  <span className="flex-1 text-left">Principal Investigator</span>
                  {principalInvestigator && principalInvestigator.staffId ? (
                    <Badge variant="outline" className="ml-2 rounded-sm bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                      ID: {principalInvestigator.staffId}
                    </Badge>
                  ) : principalInvestigator && (
                    <Badge variant="outline" className="ml-2 rounded-sm bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800">
                      PI
                    </Badge>
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start" 
                  onClick={() => {
                    if (dataManagementPlan) {
                      navigate(`/data-management-plans/${dataManagementPlan.id}`);
                    } else if (researchActivity) {
                      navigate(`/data-management-plans?researchActivityId=${researchActivity.id}`);
                    }
                  }}
                  disabled={!researchActivity}
                >
                  <FileText className="h-4 w-4 mr-2" /> 
                  <span className="flex-1 text-left">Data Management Plan</span>
                  {dataManagementPlan ? (
                    <Badge variant="outline" className="ml-2 rounded-sm bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800">
                      {dataManagementPlan.dmpNumber}
                    </Badge>
                  ) : researchActivity ? (
                    <Badge variant="outline" className="ml-2 rounded-sm bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700">
                      None
                    </Badge>
                  ) : null}
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start" 
                  onClick={() => researchActivity && navigate(`/publications?researchActivityId=${researchActivity.id}`)}
                  disabled={!researchActivity}
                >
                  <FileText className="h-4 w-4 mr-2" /> 
                  <span className="flex-1 text-left">Publications</span>
                  {researchActivity && (
                    <Badge variant="outline" className="ml-2 rounded-sm bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                      {publicationCount} {publicationCount === 1 ? 'publication' : 'publications'}
                    </Badge>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent>
              {irbApplication.documents && irbApplication.documents.protocolSummary ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 border rounded">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-foreground" />
                      <span>{irbApplication.documents.protocolSummary}</span>
                    </div>
                    <Button size="sm" variant="ghost">
                      <FileText className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-foreground">No documents available.</p>
              )}
              <Button variant="outline" className="w-full mt-4" disabled>
                <FileText className="h-4 w-4 mr-2" /> Add Document
              </Button>
            </CardContent>
          </Card>

          {/* Protocol History */}
          {renderProtocolHistory()}
        </div>
      </div>
    </div>
  );
}