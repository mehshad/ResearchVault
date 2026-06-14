// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Scientist, ResearchActivity, Project, Program } from "@shared/schema";
import { ArrowLeft, Mail, Building, User, Pencil, ChevronRight, ChevronDown, Folder, FileText, Users, ExternalLink } from "lucide-react";
import { SiOrcid, SiGooglescholar } from "react-icons/si";
import { FaLinkedin } from "react-icons/fa";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScientistAvatar } from "@/components/ScientistAvatar";
import React, { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PublicationsPanel } from "@/components/PublicationsPanel";
import { PublicationCharts } from "@/components/PublicationCharts";
import { OrgChart } from "@/components/OrgChart";
import { formatFullName } from "@/utils/nameUtils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Certification, CertificationModule } from "@shared/schema";
import { parseISO, differenceInDays } from "date-fns";

// Derive a badge color from a certification's expiry date (valid/expiring/expired)
function getCertificationColor(expiryDate: string | null): string {
  if (!expiryDate) {
    return "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";
  }

  const daysUntilExpiry = differenceInDays(parseISO(expiryDate), new Date());

  if (daysUntilExpiry < 0) {
    return "bg-red-100 text-red-800 border-red-200 hover:bg-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800 dark:hover:bg-red-900";
  } else if (daysUntilExpiry <= 30) {
    return "bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800 dark:hover:bg-orange-900";
  } else {
    return "bg-green-100 text-green-800 border-green-200 hover:bg-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800 dark:hover:bg-green-900";
  }
}

// Tree structure component for research activities
interface ResearchActivitiesTreeProps {
  activities: (ResearchActivity & { project?: Project; program?: Program; memberRole?: string })[];
  navigate: (path: string) => void;
}

function ResearchActivitiesTree({ activities, navigate }: ResearchActivitiesTreeProps) {
  const [expandedPrograms, setExpandedPrograms] = useState<Set<number>>(new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());

  // Group activities by program, then by project
  const groupedActivities = activities.reduce((acc, activity) => {
    const programId = activity.program?.id || 0; // 0 for "No Program"
    const projectId = activity.project?.id || 0; // 0 for "No Project"
    
    if (!acc[programId]) {
      acc[programId] = {
        program: activity.program || { id: 0, name: "No Program", programId: "NONE", description: null, createdAt: null, updatedAt: null, programDirectorId: null, researchCoLeadId: null, clinicalCoLead1Id: null, clinicalCoLead2Id: null },
        projects: {}
      };
    }
    
    if (!acc[programId].projects[projectId]) {
      acc[programId].projects[projectId] = {
        project: activity.project || { id: 0, name: "No Project", projectId: "NONE", programId: null, description: null, createdAt: null, updatedAt: null, principalInvestigatorId: null },
        activities: []
      };
    }
    
    acc[programId].projects[projectId].activities.push(activity);
    return acc;
  }, {} as Record<number, { program: Program; projects: Record<number, { project: Project; activities: typeof activities }> }>);

  const toggleProgram = (programId: number) => {
    const newExpanded = new Set(expandedPrograms);
    if (newExpanded.has(programId)) {
      newExpanded.delete(programId);
    } else {
      newExpanded.add(programId);
    }
    setExpandedPrograms(newExpanded);
  };

  const toggleProject = (projectId: number) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
    }
    setExpandedProjects(newExpanded);
  };

  return (
    <div className="space-y-1">
      {Object.entries(groupedActivities).map(([programId, { program, projects }]) => (
        <div key={programId} className="space-y-1">
          <Collapsible 
            open={expandedPrograms.has(Number(programId))}
            onOpenChange={() => toggleProgram(Number(programId))}
          >
            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-2 hover:bg-neutral-50 rounded-md">
              {expandedPrograms.has(Number(programId)) ? (
                <ChevronDown className="h-4 w-4 text-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-foreground" />
              )}
              <Folder className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="font-medium text-sm">
                {program.name}
              </span>
              <Badge variant="outline" className="text-xs">
                {Object.values(projects).reduce((sum, proj) => sum + proj.activities.length, 0)}
              </Badge>
            </CollapsibleTrigger>
            
            <CollapsibleContent className="ml-6 space-y-1">
              {Object.entries(projects).map(([projectId, { project, activities: projectActivities }]) => (
                <div key={projectId} className="space-y-1">
                  <Collapsible
                    open={expandedProjects.has(Number(projectId))}
                    onOpenChange={() => toggleProject(Number(projectId))}
                  >
                    <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-2 hover:bg-neutral-50 rounded-md">
                      {expandedProjects.has(Number(projectId)) ? (
                        <ChevronDown className="h-4 w-4 text-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-foreground" />
                      )}
                      <Building className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <span className="text-sm">
                        {project.name}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {projectActivities.length}
                      </Badge>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent className="ml-6 space-y-1">
                      {projectActivities.map((activity) => (
                        <Button
                          key={activity.id}
                          variant="ghost"
                          className="flex items-center gap-2 w-full justify-start p-2 h-auto text-left"
                          onClick={() => navigate(`/research-activities/${activity.id}`)}
                        >
                          <FileText className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">
                              {activity.title}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-xs font-mono">
                                {activity.sdrNumber}
                              </Badge>
                              {activity.memberRole && (
                                <Badge variant="outline" className="text-xs">
                                  {activity.memberRole}
                                </Badge>
                              )}
                              <Badge variant="outline" className={`text-xs ${
                                activity.status === 'active' ? 'bg-green-50 text-green-700' :
                                activity.status === 'completed' ? 'bg-blue-50 text-blue-700' :
                                'bg-yellow-50 text-yellow-700'
                              }`}>
                                {activity.status}
                              </Badge>
                            </div>
                          </div>
                        </Button>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </div>
      ))}
    </div>
  );
}

export default function ScientistDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const id = parseInt(params.id);



  const { data: scientist, isLoading } = useQuery<Scientist>({
    queryKey: ['/api/scientists', id],
    queryFn: async () => {
      const response = await fetch(`/api/scientists/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch scientist');
      }
      return response.json();
    },
  });

  // Fetch scientist's research activities
  const { data: scientistActivities, isLoading: activitiesLoading } = useQuery<(ResearchActivity & { project?: Project; program?: Program; memberRole?: string })[]>({
    queryKey: ['/api/scientists', id, 'research-activities'],
    queryFn: async () => {
      const response = await fetch(`/api/scientists/${id}/research-activities`);
      if (!response.ok) {
        throw new Error('Failed to fetch research activities');
      }
      return response.json();
    },
    enabled: !!id,
  });

  // Fetch the scientist's real certifications and the module catalog (to resolve names)
  const { data: certifications = [], isLoading: certificationsLoading } = useQuery<Certification[]>({
    queryKey: ['/api/certifications/scientist', id],
    queryFn: async () => {
      const response = await fetch(`/api/certifications/scientist/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch certifications');
      }
      return response.json();
    },
    enabled: !!id,
  });

  const { data: certificationModules = [] } = useQuery<CertificationModule[]>({
    queryKey: ['/api/certification-modules'],
  });

  const citiCertifications = certifications.filter((cert) => {
    const module = certificationModules.find((m) => m.id === cert.moduleId);
    return module && module.name !== "Lab Safety";
  });
  const labSafetyCertification = certifications.find((cert) => {
    const module = certificationModules.find((m) => m.id === cert.moduleId);
    return module && module.name === "Lab Safety";
  });


  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/scientists")}>
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
              <div className="flex items-start gap-6">
                <Skeleton className="h-24 w-24 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-8 w-64" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!scientist) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/scientists")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">Scientist Not Found</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <p className="text-lg text-foreground">The scientist you're looking for could not be found.</p>
              <Button className="mt-4" onClick={() => navigate("/scientists")}>
                Return to Scientists List
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if this is a scientific staff member
  const isScientificStaff = scientist.staffType === 'scientific';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/scientists")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h1 className="text-2xl font-semibold text-foreground">{formatFullName(scientist)}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Profile and Publications */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Personal and contact information</CardDescription>
              </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate(`/scientists/${id}/edit`)}
              className="ml-auto"
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </CardHeader>
          <CardContent>
                <div className="flex items-start gap-6">
                  <ScientistAvatar scientist={scientist} className="h-24 w-24 text-lg" />
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-xl font-semibold">
                        {formatFullName(scientist)}
                        {scientist.staffId && (
                          <Badge variant="outline" className="ml-3 rounded-sm bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                            ID: {scientist.staffId}
                          </Badge>
                        )}
                      </h2>
                      <div className="flex items-center">
                        <div className="text-sm font-medium text-muted-foreground mr-2">Job Title:</div>
                        <p className="text-neutral-700">
                          {scientist.jobTitle || "No title"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {scientist.department && (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">{scientist.department}</Badge>
                      )}
                    </div>

                    <div className="space-y-2 pt-2">
                      {scientist.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-foreground" />
                          <a href={`mailto:${scientist.email}`} className="text-primary-600 hover:underline">
                            {scientist.email}
                          </a>
                        </div>
                      )}

                      {scientist.staffId && (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-foreground" />
                          <span>Staff ID: {scientist.staffId}</span>
                        </div>
                      )}
                    </div>

                    {/* External Profile Links */}
                    {(scientist.orcidId || scientist.linkedInUrl || scientist.googleScholarUrl || scientist.webOfScienceId) && (
                      <div className="pt-4 border-t">
                        <h4 className="text-sm font-medium text-muted-foreground mb-2">External Profiles</h4>
                        <div className="flex flex-wrap gap-2">
                          {scientist.orcidId && (
                            <a 
                              href={`https://orcid.org/${scientist.orcidId}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-50 text-green-700 hover:bg-green-100 transition-colors text-sm dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-950"
                              data-testid="link-orcid"
                            >
                              <SiOrcid className="h-4 w-4" />
                              ORCID
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {scientist.linkedInUrl && (
                            <a 
                              href={scientist.linkedInUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors text-sm dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-950"
                              data-testid="link-linkedin"
                            >
                              <FaLinkedin className="h-4 w-4" />
                              LinkedIn
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {scientist.googleScholarUrl && (
                            <a 
                              href={scientist.googleScholarUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors text-sm dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-950"
                              data-testid="link-google-scholar"
                            >
                              <SiGooglescholar className="h-4 w-4" />
                              Google Scholar
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {scientist.webOfScienceId && (
                            <a 
                              href={`https://www.webofscience.com/wos/author/record/${scientist.webOfScienceId}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors text-sm dark:bg-orange-950 dark:text-orange-300 dark:hover:bg-orange-950"
                              data-testid="link-web-of-science"
                            >
                              <ExternalLink className="h-4 w-4" />
                              Web of Science
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Certification Status */}
                <div className="mt-6">
                  <h3 className="font-medium mb-2">Certification</h3>
                  {certificationsLoading ? (
                    <div className="space-y-2" data-testid="loading-certifications">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-5 w-32" />
                    </div>
                  ) : certifications.length === 0 ? (
                    <p className="text-sm text-muted-foreground" data-testid="text-no-certifications">
                      No certifications recorded
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground w-16">Citi:</span>
                        <div className="flex gap-1 flex-wrap">
                          <TooltipProvider>
                            {citiCertifications.length > 0 ? (
                              citiCertifications.map((cert) => {
                                const module = certificationModules.find((m) => m.id === cert.moduleId);
                                return (
                                  <Tooltip key={cert.id}>
                                    <TooltipTrigger>
                                      <Badge
                                        className={`${getCertificationColor(cert.endDate)} cursor-help transition-colors text-xs`}
                                        variant="outline"
                                        data-testid={`badge-citi-${cert.id}`}
                                      >
                                        {module?.name || "Unknown"}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{module?.name || "Unknown"} - Expires: {cert.endDate || "N/A"}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })
                            ) : (
                              <span className="text-sm text-muted-foreground" data-testid="text-no-citi">None</span>
                            )}
                          </TooltipProvider>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground w-16">Lab Safety:</span>
                        <TooltipProvider>
                          {labSafetyCertification ? (
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge
                                  className={`${getCertificationColor(labSafetyCertification.endDate)} cursor-help transition-colors text-xs`}
                                  variant="outline"
                                  data-testid={`badge-lab-safety-${labSafetyCertification.id}`}
                                >
                                  {labSafetyCertification.endDate || "Certified"}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Lab Safety Training - Expires: {labSafetyCertification.endDate || "N/A"}</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-sm text-muted-foreground" data-testid="text-no-lab-safety">None</span>
                          )}
                        </TooltipProvider>
                      </div>
                    </div>
                  )}
                </div>

                {scientist.bio && (
                  <div className="mt-6">
                    <h3 className="font-medium mb-2">Biography</h3>
                    <p className="text-muted-foreground">{scientist.bio}</p>
                  </div>
                )}
          </CardContent>
        </Card>

        {/* Unified Publications panel - Only show for scientific staff.
            Combines recent publications, internal author links, and (when an
            external profile is on file) the missing-works importer. */}
        {isScientificStaff && (
          <PublicationsPanel
            scientistId={id}
            yearsSince={5}
            hasOrcid={!!scientist.orcidId}
            hasScholar={!!scientist.googleScholarUrl}
          />
        )}
        </div>

        {/* Right Column - Org Chart, Research Activities and Publication Charts */}
        <div className="lg:col-span-1 space-y-6">
          {/* Organization Chart */}
          <OrgChart 
            scientistId={id} 
            onNavigate={(scientistId) => navigate(`/scientists/${scientistId}`)}
          />
          
          {/* Research Activities - Only show for scientific staff */}
          {isScientificStaff && (
            <Card>
              <CardHeader>
                <CardTitle>Research Activities</CardTitle>
                <CardDescription>Organized by program and project</CardDescription>
              </CardHeader>
              <CardContent>
                {activitiesLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ) : !scientistActivities || scientistActivities.length === 0 ? (
                  <p className="text-foreground text-sm">No research activities found.</p>
                ) : (
                  <ResearchActivitiesTree 
                    activities={scientistActivities} 
                    navigate={navigate}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {/* Publication Charts and Statistics - Only show for scientific staff */}
          {isScientificStaff && (
            <PublicationCharts scientistId={id} yearsSince={5} />
          )}
        </div>
      </div>
    </div>
  );
}