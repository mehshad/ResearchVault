import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Project, Program, ResearchActivity, Scientist } from "@shared/schema";
import { ArrowLeft, Calendar, FileText, Layers, Users, Edit, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatFullName } from "@/utils/nameUtils";

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const id = parseInt(params.id);

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ['/api/projects', id],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch project');
      }
      return response.json();
    },
  });

  const { data: program, isLoading: programLoading } = useQuery<Program>({
    queryKey: ['/api/programs', project?.programId],
    queryFn: async () => {
      if (!project?.programId) return null;
      const response = await fetch(`/api/programs/${project.programId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch program');
      }
      return response.json();
    },
    enabled: !!project?.programId,
  });

  const { data: researchActivities, isLoading: researchActivitiesLoading } = useQuery<ResearchActivity[]>({
    queryKey: ['/api/projects', id, 'research-activities'],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${id}/research-activities`);
      if (!response.ok) {
        throw new Error('Failed to fetch research activities');
      }
      return response.json();
    },
    enabled: !!id
  });

  const { data: principalInvestigator, isLoading: piLoading } = useQuery<Scientist>({
    queryKey: ['/api/scientists', project?.principalInvestigatorId],
    queryFn: async () => {
      if (!project?.principalInvestigatorId) return null;
      const response = await fetch(`/api/scientists/${project.principalInvestigatorId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch principal investigator');
      }
      return response.json();
    },
    enabled: !!project?.principalInvestigatorId,
  });

  if (projectLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/projects")}>
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

  if (!project) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/projects")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">Project Not Found</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <p className="text-lg text-foreground">The project you're looking for could not be found.</p>
              <Button className="mt-4" onClick={() => navigate("/projects")}>
                Return to Projects List
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
          <Button variant="ghost" size="sm" onClick={() => navigate("/projects")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">{project.name}</h1>
        </div>
        <Button 
          className="bg-sidra-teal hover:bg-sidra-teal-dark text-white font-medium px-4 py-2 shadow-sm"
          onClick={() => navigate(`/projects/${project.id}/edit`)}
        >
          <Edit className="h-4 w-4 mr-2" />
          Edit
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Project Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">{project.name}</h2>
                <div className="text-foreground flex items-center gap-1 mt-1">
                  <Badge variant="outline" className="rounded-sm bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">{project.projectId}</Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <h3 className="text-sm font-medium text-foreground">Program</h3>
                  <div className="flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    <span>
                      {programLoading ? (
                        <Skeleton className="h-4 w-24 inline-block" />
                      ) : program ? (
                        <Button 
                          variant="link" 
                          className="p-0 h-auto text-primary-600"
                          onClick={() => navigate(`/programs/${program.id}`)}
                        >
                          {program.name}
                        </Button>
                      ) : 'Not assigned'}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-foreground">Project Lead Investigator</h3>
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span>
                      {piLoading ? (
                        <Skeleton className="h-4 w-24 inline-block" />
                      ) : principalInvestigator ? (
                        <Button 
                          variant="link" 
                          className="p-0 h-auto text-primary-600"
                          onClick={() => navigate(`/scientists/${principalInvestigator.id}`)}
                        >
                          {formatFullName(principalInvestigator)}
                        </Button>
                      ) : 'Not assigned'}
                    </span>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-foreground">Added Date</h3>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{project.createdAt ? format(new Date(project.createdAt), 'MMM d, yyyy') : 'Not specified'}</span>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-foreground">Last Updated</h3>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{project.updatedAt ? format(new Date(project.updatedAt), 'MMM d, yyyy') : 'Not specified'}</span>
                  </div>
                </div>
              </div>

              {project.description && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-foreground">Description</h3>
                  <p className="mt-1">{project.description}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Research Activities</CardTitle>
            </CardHeader>
            <CardContent>
              {researchActivitiesLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                </div>
              ) : researchActivities && researchActivities.length > 0 ? (
                <div className="space-y-2">
                  {researchActivities.map((activity) => (
                    <div 
                      key={activity.id} 
                      className="flex justify-between items-center p-2 hover:bg-gray-50 rounded cursor-pointer dark:hover:bg-gray-900"
                      onClick={() => navigate(`/research-activities/${activity.id}`)}
                    >
                      <div>
                        <p className="font-medium">{activity.title}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{activity.sdrNumber}</p>
                      </div>
                      <Badge>{activity.status}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-foreground">No research activities found for this project.</p>
              )}
              <Button 
                variant="outline" 
                className="w-full mt-4" 
                onClick={() => navigate("/research-activities/create")}
              >
                <Layers className="h-4 w-4 mr-2" /> Add Research Activity
              </Button>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-foreground">No documents available.</p>
              <Button variant="outline" className="w-full mt-4" disabled>
                <FileText className="h-4 w-4 mr-2" /> Add Document
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}