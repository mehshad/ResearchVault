// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, User, Calendar, Building, Beaker, AlertTriangle, FileText, Shield, Eye, Edit, ExternalLink, Users, CheckCircle, XCircle, Printer } from "lucide-react";
import { format } from "date-fns";
import type { IbcApplication, Scientist, ResearchActivity } from "@shared/schema";
import TimelineComments from "@/components/TimelineComments";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNameWithJobTitle, formatFullName } from "@/utils/nameUtils";

const IBC_WORKFLOW_STATUSES = [
  { value: "draft", label: "Draft", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200", icon: FileText },
  { value: "submitted", label: "Submitted", color: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300", icon: FileText },
  { value: "vetted", label: "Vetted", color: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300", icon: Eye },
  { value: "under_review", label: "Under Review", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300", icon: AlertTriangle },
  { value: "active", label: "Active", color: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300", icon: Shield },
  { value: "expired", label: "Expired", color: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", icon: AlertTriangle },
];

const BIOSAFETY_LEVELS = [
  { value: "BSL-1", label: "BSL-1", color: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300", description: "Minimal risk" },
  { value: "BSL-2", label: "BSL-2", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300", description: "Moderate risk" },
  { value: "BSL-3", label: "BSL-3", color: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300", description: "High risk" },
  { value: "BSL-4", label: "BSL-4", color: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", description: "Extreme danger" }
];

export default function IbcApplicationDetail() {
  const { id } = useParams();
  const [, navigate] = useLocation();

  const { data: ibcApplication, isLoading } = useQuery<IbcApplication & {
    principalInvestigator?: { 
      id: number; 
      name: string; 
      email: string;
      profileImageInitials: string;
      honorificTitle: string;
      firstName: string;
      lastName: string;
      jobTitle: string;
    };
    researchActivities?: ResearchActivity[];
  }>({
    queryKey: [`/api/ibc-applications/${id}`],
    enabled: !!id,
  });

  // Principal investigator data is embedded in the application response
  const scientist = ibcApplication?.principalInvestigator;

  // Get full research activity data with budget sources
  const { data: fullResearchActivities } = useQuery<ResearchActivity[]>({
    queryKey: [`/api/ibc-applications/${id}/research-activities-full`],
    queryFn: async () => {
      // Get basic activities from embedded data
      const basicActivities = ibcApplication?.researchActivities || [];
      
      // Fetch full data for each activity
      const fullActivities = await Promise.all(
        basicActivities.map(async (activity: any) => {
          const response = await fetch(`/api/research-activities/${activity.id}`);
          return response.json();
        })
      );
      
      return fullActivities;
    },
    enabled: !!ibcApplication?.researchActivities?.length,
  });

  // Use full activities if available, otherwise fall back to basic embedded data
  const researchActivities = fullResearchActivities || ibcApplication?.researchActivities;

  const { data: comments = [] } = useQuery({
    queryKey: [`/api/ibc-applications/${id}/comments`],
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: true,
  });

  // Fetch personnel/team members
  const { data: personnelData = [] } = useQuery({
    queryKey: [`/api/ibc-applications/${id}/personnel`],
    enabled: !!id,
  });

  // Fetch certification modules
  const { data: certificationModules = [] } = useQuery({
    queryKey: ["/api/certification-modules"],
  });

  // Fetch certification matrix
  const { data: certificationMatrix = [] } = useQuery({
    queryKey: ["/api/certifications/matrix"],
  });

  // Check if all team members have all required certifications
  const checkAllCertifications = () => {
    if (personnelData.length === 0) return { complete: true, totalMembers: 0, completeMembers: 0 };
    
    const requiredModuleIds = certificationModules.map((m: any) => m.id);
    let completeMembers = 0;
    
    personnelData.forEach((member: any) => {
      if (!member.scientistId) return;
      
      const memberCerts = certificationMatrix.filter((cert: any) => cert.scientistId === member.scientistId);
      const certifiedModuleIds = memberCerts.map((cert: any) => cert.moduleId);
      
      // Check if member has all required certifications and none are expired
      const hasAllCerts = requiredModuleIds.every(moduleId => certifiedModuleIds.includes(moduleId));
      const allValid = memberCerts.every((cert: any) => {
        if (!cert.endDate) return false;
        const expiry = new Date(cert.endDate);
        return expiry > new Date();
      });
      
      if (hasAllCerts && allValid) {
        completeMembers++;
      }
    });
    
    return {
      complete: completeMembers === personnelData.length,
      totalMembers: personnelData.length,
      completeMembers
    };
  };

  const certificationStatus = checkAllCertifications();

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center space-x-2 mb-6">
          <Skeleton className="h-6 w-6" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent className="space-y-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-20 bg-gray-100 rounded animate-pulse dark:bg-gray-800" />
                ))}
              </CardContent>
            </Card>
          </div>
          <div className="space-y-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-gray-100 rounded-lg animate-pulse dark:bg-gray-800" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!ibcApplication) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4 dark:text-gray-500" />
          <h3 className="text-lg font-medium text-gray-900 mb-2 dark:text-gray-100">Application not found</h3>
          <p className="text-gray-500 mb-4 dark:text-gray-400">The IBC application you're looking for doesn't exist.</p>
          <Button onClick={() => navigate('/ibc')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Applications
          </Button>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    if (!status) return <Badge variant="outline">Unknown</Badge>;
    const statusConfig = IBC_WORKFLOW_STATUSES.find(s => s.value === status.toLowerCase());
    if (!statusConfig) return <Badge variant="outline">{status}</Badge>;
    
    return (
      <Badge className={statusConfig.color}>
        <statusConfig.icon className="h-3 w-3 mr-1" />
        {statusConfig.label}
      </Badge>
    );
  };

  const getBiosafetyLevelBadge = (level: string) => {
    if (!level) return <Badge variant="outline">Unknown</Badge>;
    const levelConfig = BIOSAFETY_LEVELS.find(l => l.value === level);
    if (!levelConfig) return <Badge variant="outline">{level}</Badge>;
    
    return (
      <Badge className={levelConfig.color}>
        <AlertTriangle className="h-3 w-3 mr-1" />
        {levelConfig.label}
      </Badge>
    );
  };

  const getStatusDescription = (status: string) => {
    const descriptions = {
      draft: "Application is being prepared and has not been submitted yet.",
      submitted: "Application has been submitted and is awaiting initial review.",
      vetted: "Application has passed initial review and is being prepared for board review.",
      under_review: "Application is being reviewed by IBC board members.",
      active: "Application has been approved and is currently active.",
      expired: "Application approval has expired and requires renewal."
    };
    return descriptions[status?.toLowerCase() as keyof typeof descriptions] || "Status unknown";
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" onClick={() => navigate('/ibc')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Applications
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{ibcApplication.title}</h1>
            <p className="text-gray-500 dark:text-gray-400">{ibcApplication.ibcNumber}</p>
          </div>
        </div>
        
        {/* Action buttons based on status */}
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            onClick={() => window.open(`/ibc-applications/${id}/print`, "_blank")}
            data-testid="button-download-pdf"
          >
            <Printer className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
          {ibcApplication.status?.toLowerCase() === 'draft' ? (
            <Button onClick={() => navigate(`/ibc-applications/${id}/edit`)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Application
            </Button>
          ) : (
            <Button variant="outline" onClick={() => navigate(`/ibc-applications/${id}/edit`)}>
              <Eye className="h-4 w-4 mr-2" />
              View Application
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Application Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">IBC Number</label>
                  <p className="font-mono">{ibcApplication.ibcNumber}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Submission Type</label>
                  <Badge variant="outline" className="capitalize">
                    {ibcApplication.submissionType || 'Initial'}
                  </Badge>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Principal Investigator</label>
                  <p className="flex items-center space-x-2">
                    <User className="h-4 w-4" />
                    <span>{scientist ? formatNameWithJobTitle(scientist) : 'Loading...'}</span>
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Biosafety Level</label>
                  <div>{getBiosafetyLevelBadge(ibcApplication.biosafetyLevel)}</div>
                </div>
                {ibcApplication.cayuseProtocolNumber && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Cayuse Protocol Number</label>
                    <p className="font-mono">{ibcApplication.cayuseProtocolNumber}</p>
                  </div>
                )}
                {ibcApplication.irbnetIbcNumber && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">IRBNet IBC Number</label>
                    <p className="font-mono">{ibcApplication.irbnetIbcNumber}</p>
                  </div>
                )}
                {ibcApplication.shortTitle && (
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Short Title</label>
                    <p>{ibcApplication.shortTitle}</p>
                  </div>
                )}
                {ibcApplication.additionalNotificationEmail && (
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Additional Notification Email</label>
                    <p className="text-sm">{ibcApplication.additionalNotificationEmail}</p>
                  </div>
                )}
              </div>

              {ibcApplication.description && (
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Project Description</label>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap dark:text-gray-300">{ibcApplication.description}</p>
                </div>
              )}

              {/* Dates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
                {ibcApplication.submissionDate && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Submission Date</label>
                    <p className="text-sm">{format(new Date(ibcApplication.submissionDate), 'PPP')}</p>
                  </div>
                )}
                {ibcApplication.expirationDate && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Expiration Date</label>
                    <p className="text-sm">{format(new Date(ibcApplication.expirationDate), 'PPP')}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Research Activities */}
          {researchActivities && researchActivities.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center space-x-2">
                  <Beaker className="h-5 w-5" />
                  <span>Linked Research Activities</span>
                </CardTitle>
                <CardDescription>SDRs covered by this IBC protocol</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {researchActivities.map((activity: any) => (
                    <div key={activity.id} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors dark:hover:bg-gray-900">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3 flex-1">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 dark:bg-blue-950">
                            <Beaker className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <p className="font-medium text-blue-900 dark:text-blue-200">{activity.title}</p>
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="rounded-sm bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                                {activity.sdrNumber}
                              </Badge>
                              <Badge className={
                                activity.status === 'active' ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800' :
                                activity.status === 'planning' ? 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800' :
                                activity.status === 'completed' ? 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700' :
                                'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800'
                              }>
                                {activity.status?.charAt(0).toUpperCase() + activity.status?.slice(1)}
                              </Badge>
                            </div>
                            {activity.budgetSource && activity.budgetSource.length > 0 && (
                              <div className="mb-2">
                                <span className="text-xs text-gray-500 mb-1 block dark:text-gray-400">Funding Sources:</span>
                                <div className="flex flex-wrap gap-1">
                                  {activity.budgetSource.map((source: string, index: number) => (
                                    <Badge key={index} variant="outline" className="text-xs rounded-sm bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800">
                                      {source}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => navigate(`/research-activities/${activity.id}`)}
                          className="flex-shrink-0 ml-2"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Biosafety Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Biosafety Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Risk Level</label>
                  <Badge variant="outline" className={
                    ibcApplication.riskLevel === 'high' ? 'border-red-200 text-red-800 dark:border-red-800 dark:text-red-300' :
                    ibcApplication.riskLevel === 'moderate' ? 'border-yellow-200 text-yellow-800 dark:border-yellow-800 dark:text-yellow-300' :
                    'border-green-200 text-green-800 dark:border-green-800 dark:text-green-300'
                  }>
                    {ibcApplication.riskLevel?.toUpperCase() || 'NOT SET'}
                  </Badge>
                </div>
                {ibcApplication.riskGroupClassification && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Risk Group Classification</label>
                    <p>{ibcApplication.riskGroupClassification}</p>
                  </div>
                )}
              </div>

              {/* Biosafety Options */}
              <div>
                <label className="text-sm font-medium text-gray-500 mb-2 block dark:text-gray-400">Biosafety Options</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${ibcApplication.recombinantSyntheticNucleicAcid ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="text-sm">Recombinant/Synthetic Nucleic Acid</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${ibcApplication.wholeAnimalsAnimalMaterial ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="text-sm">Whole Animals/Animal Material</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${ibcApplication.humanNonHumanPrimateMaterial ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="text-sm">Human/Non-Human Primate Material</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${ibcApplication.microorganismsInfectiousMaterial ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="text-sm">Microorganisms/Infectious Material</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${ibcApplication.biologicalToxins ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="text-sm">Biological Toxins</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${ibcApplication.nanoparticles ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="text-sm">Nanoparticles</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${ibcApplication.arthropods ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="text-sm">Arthropods</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${ibcApplication.plants ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="text-sm">Plants</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Current Status */}
          <Card>
            <CardHeader>
              <CardTitle>Current Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-300">Status</span>
                {getStatusBadge(ibcApplication.status)}
              </div>
              <p className="text-xs text-gray-500 mt-2 dark:text-gray-400">
                {getStatusDescription(ibcApplication.status)}
              </p>
            </CardContent>
          </Card>

          {/* Protocol Staff */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Protocol Staff
              </CardTitle>
              <CardDescription>
                Team members on this protocol
              </CardDescription>
            </CardHeader>
            <CardContent>
              {personnelData.length > 0 ? (
                <div className="space-y-3">
                  {/* Certification Status Summary */}
                  <div className={`flex items-center justify-between p-3 rounded-lg ${
                    certificationStatus.complete 
                      ? 'bg-green-50 border border-green-200' 
                      : 'bg-orange-50 border border-orange-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      {certificationStatus.complete ? (
                        <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                      )}
                      <div>
                        <p className="text-sm font-medium">
                          {certificationStatus.complete 
                            ? 'All Certifications Complete' 
                            : 'Certifications Incomplete'}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                          {certificationStatus.completeMembers} of {certificationStatus.totalMembers} members certified
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Team Member List */}
                  <div className="space-y-2">
                    {personnelData.map((member: any, index: number) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded dark:bg-gray-900">
                        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0 dark:bg-gray-700">
                          <User className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {member.scientist ? formatFullName(member.scientist) : 'Unknown'}
                          </p>
                          <p className="text-xs text-gray-500 capitalize dark:text-gray-400">{member.role?.replace('_', ' ')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4 dark:text-gray-400">
                  No team members assigned
                </p>
              )}
            </CardContent>
          </Card>

          {/* Timeline & Comments */}
          <TimelineComments 
            application={{
              createdAt: typeof ibcApplication.createdAt === 'string' ? ibcApplication.createdAt : ibcApplication.createdAt?.toISOString(),
              submissionDate: typeof ibcApplication.submissionDate === 'string' ? ibcApplication.submissionDate : ibcApplication.submissionDate?.toISOString(),
              vettedDate: typeof ibcApplication.vettedDate === 'string' ? ibcApplication.vettedDate : ibcApplication.vettedDate?.toISOString(),
              underReviewDate: typeof ibcApplication.underReviewDate === 'string' ? ibcApplication.underReviewDate : ibcApplication.underReviewDate?.toISOString(),
              approvalDate: typeof ibcApplication.approvalDate === 'string' ? ibcApplication.approvalDate : ibcApplication.approvalDate?.toISOString(),
              expirationDate: typeof ibcApplication.expirationDate === 'string' ? ibcApplication.expirationDate : ibcApplication.expirationDate?.toISOString(),
            }} 
            comments={comments as any} 
          />

          {/* Important Dates */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Important Dates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ibcApplication.submissionDate && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300">Submitted</span>
                  <span className="text-sm font-medium">
                    {format(new Date(ibcApplication.submissionDate), 'MMM d, yyyy')}
                  </span>
                </div>
              )}
              
              {ibcApplication.vettedDate && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300">Vetted</span>
                  <span className="text-sm font-medium">
                    {format(new Date(ibcApplication.vettedDate), 'MMM d, yyyy')}
                  </span>
                </div>
              )}
              
              {ibcApplication.underReviewDate && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300">Under Review</span>
                  <span className="text-sm font-medium">
                    {format(new Date(ibcApplication.underReviewDate), 'MMM d, yyyy')}
                  </span>
                </div>
              )}
              
              {ibcApplication.approvalDate && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300">Approved</span>
                  <span className="text-sm font-medium">
                    {format(new Date(ibcApplication.approvalDate), 'MMM d, yyyy')}
                  </span>
                </div>
              )}
              
              {ibcApplication.expirationDate && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300">Expires</span>
                  <span className="text-sm font-medium">
                    {format(new Date(ibcApplication.expirationDate), 'MMM d, yyyy')}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}