import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResearchActivity, DataManagementPlan } from "@shared/schema";
import { ArrowLeft, Calendar, FileText, Database, Layers, Edit } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { usePublicationCount } from "@/hooks/use-publication-count";

export default function DataManagementPlanDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const id = parseInt(params.id);

  const { data: dataManagementPlan, isLoading: dataManagementPlanLoading } = useQuery<DataManagementPlan>({
    queryKey: ['/api/data-management-plans', id],
    queryFn: async () => {
      const response = await fetch(`/api/data-management-plans/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch data management plan');
      }
      return response.json();
    },
  });

  const { data: researchActivity, isLoading: researchActivityLoading } = useQuery<ResearchActivity>({
    queryKey: ['/api/research-activities', dataManagementPlan?.researchActivityId],
    queryFn: async () => {
      if (!dataManagementPlan?.researchActivityId) return null;
      const response = await fetch(`/api/research-activities/${dataManagementPlan.researchActivityId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch research activity');
      }
      return response.json();
    },
    enabled: !!dataManagementPlan?.researchActivityId,
  });
  
  // Get the count of publications for this research activity
  const { count: publicationCount } = usePublicationCount(researchActivity?.id);

  if (dataManagementPlanLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/data-management-plans")}>
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

  if (!dataManagementPlan) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/data-management-plans")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">Data Management Plan Not Found</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <p className="text-lg text-foreground">The data management plan you're looking for could not be found.</p>
              <Button className="mt-4" onClick={() => navigate("/data-management-plans")}>
                Return to Data Management Plans List
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
          <Button variant="ghost" size="sm" onClick={() => navigate("/data-management")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">{dataManagementPlan.title}</h1>
        </div>
        <Button 
          onClick={() => navigate(`/data-management-plans/${id}/edit`)}
          className="bg-sidra-teal hover:bg-sidra-teal-dark text-white"
        >
          <Edit className="h-4 w-4 mr-2" />
          Edit
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Data Management Plan Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">{dataManagementPlan.title}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="rounded-sm bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800">
                    {dataManagementPlan.dmpNumber}
                  </Badge>
                  {researchActivity && (
                    <Badge variant="outline" className="rounded-sm bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                      {researchActivity.sdrNumber}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <h3 className="text-sm font-medium text-foreground">Related Research Activity</h3>
                  <div className="flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    <span>
                      {researchActivityLoading ? (
                        <Skeleton className="h-4 w-24 inline-block" />
                      ) : researchActivity ? (
                        <Button 
                          variant="link" 
                          className="p-0 h-auto text-primary-600"
                          onClick={() => navigate(`/research-activities/${researchActivity.id}`)}
                        >
                          {researchActivity.title}
                        </Button>
                      ) : 'Not assigned'}
                    </span>
                  </div>
                </div>
              </div>

              {dataManagementPlan.description && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-foreground">Description</h3>
                  <p className="mt-1">{dataManagementPlan.description}</p>
                </div>
              )}
              
              <div className="mt-6">
                <h3 className="text-md font-medium border-b pb-2">Data Collection Methods</h3>
                <p className="mt-2">{dataManagementPlan.dataCollectionMethods || 'Not specified'}</p>
              </div>
              
              <div className="mt-6">
                <h3 className="text-md font-medium border-b pb-2">Data Storage Plan</h3>
                <p className="mt-2">{dataManagementPlan.dataStoragePlan || 'Not specified'}</p>
              </div>
              
              <div className="mt-6">
                <h3 className="text-md font-medium border-b pb-2">Data Sharing Plan</h3>
                <p className="mt-2">{dataManagementPlan.dataSharingPlan || 'Not specified'}</p>
              </div>
              
              <div className="mt-6">
                <h3 className="text-md font-medium border-b pb-2">Retention Period</h3>
                <p className="mt-2">{dataManagementPlan.retentionPeriod || 'Not specified'}</p>
              </div>
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
                  onClick={() => researchActivity && navigate(`/publications?researchActivityId=${researchActivity.id}`)}
                  disabled={!researchActivity}
                >
                  <FileText className="h-4 w-4 mr-2" /> 
                  <span className="flex-1 text-left">Publications</span>
                  {researchActivity && (
                    <Badge variant="outline" className="ml-2 rounded-sm bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                      {publicationCount}
                    </Badge>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Data Files</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-foreground">No data files available.</p>
              <Button variant="outline" className="w-full mt-4" disabled>
                <Database className="h-4 w-4 mr-2" /> Add Data File
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}