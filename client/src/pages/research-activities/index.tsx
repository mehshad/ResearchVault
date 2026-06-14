import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, TableBody, TableCell, TableHead, 
  TableHeader, TableRow 
} from "@/components/ui/table";
import { 
  Select, SelectContent, SelectItem, 
  SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table as TableIcon, FilePlus, Search, MoreHorizontal, Users, Link as LinkIcon } from "lucide-react";
import { formatFullName, getInitials } from "@/utils/nameUtils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { PermissionWrapper } from "@/components/PermissionWrapper";

interface Program {
  id: number;
  programId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Scientist {
  id: number;
  firstName: string;
  lastName: string;
  jobTitle?: string;
  profileImageInitials?: string;
}

interface Project {
  id: number;
  projectId: string;
  programId: number;
  name: string;
  description: string | null;
  leadScientistId: number | null;
  createdAt: string;
  updatedAt: string;
  
  // Related entities
  program?: Program;
  leadScientist?: Scientist;
}

interface ProjectMember {
  id: number;
  researchActivityId: number;
  scientistId: number;
  role: string;
  scientist?: Scientist;
}

interface ResearchActivity {
  id: number;
  sdrNumber: string;
  projectId: number | null;
  title: string;
  shortTitle: string | null;
  description: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  budgetHolderId: number | null;
  budgetSource: string[];
  grantCodes: string[];
  createdAt: string;
  updatedAt: string;
  
  // Related entities
  project?: Project;
  budgetHolder?: Scientist;
  leadScientist?: Scientist;
}

export default function ResearchActivitiesList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [selectedProjectTab, setSelectedProjectTab] = useState<string>("all");
  const [, navigate] = useLocation();
  const { currentUser } = useCurrentUser();

  const { data: researchActivities, isLoading: isLoadingActivities } = useQuery<ResearchActivity[]>({
    queryKey: ['/api/research-activities'],
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
  });
  
  const { data: programs } = useQuery<Program[]>({
    queryKey: ['/api/programs'],
  });

  const { data: scientists } = useQuery<Scientist[]>({
    queryKey: ['/api/scientists'],
  });

  const { data: projectMembers } = useQuery<ProjectMember[]>({
    queryKey: ['/api/project-members'],
  });

  // Fetch linked grants for research activities
  const { data: activityGrantCounts = {} } = useQuery({
    queryKey: ['/api/research-activities/grant-counts'],
    enabled: researchActivities && researchActivities.length > 0,
    queryFn: async () => {
      const counts: Record<number, any[]> = {};
      
      await Promise.all(
        researchActivities!.map(async (activity) => {
          try {
            const response = await fetch(`/api/research-activities/${activity.id}/grants`);
            if (response.ok) {
              const grants = await response.json();
              counts[activity.id] = grants;
            }
          } catch (error) {
            console.error(`Failed to fetch grants for activity ${activity.id}:`, error);
          }
        })
      );
      
      return counts;
    }
  });

  // Enhance research activities with related data
  const enhancedActivities = researchActivities?.map(activity => {
    const project = projects?.find(p => p.id === activity.projectId);
    const budgetHolder = activity.budgetHolderId ? 
      scientists?.find(s => s.id === activity.budgetHolderId) : undefined;
    
    // Find lead scientist from project members
    const leadScientistMember = projectMembers?.find(pm => 
      pm.researchActivityId === activity.id && pm.role === 'Lead Scientist'
    );
    const leadScientist = leadScientistMember ? 
      scientists?.find(s => s.id === leadScientistMember.scientistId) : undefined;
    
    return {
      ...activity,
      project: project ? {
        ...project,
        program: programs?.find(prog => prog.id === project.programId)
      } : undefined,
      budgetHolder,
      leadScientist
    };
  });

  // Get projects for the selected program
  const projectsForSelectedProgram = projects?.filter(project => {
    if (activeTab === "all") return true;
    if (activeTab === "cancer-genomics") return project.programId === 1;
    if (activeTab === "neurological-disorders") return project.programId === 2;
    if (activeTab === "immune-dysregulations") return project.programId === 3;
    return false;
  });

  const filteredActivities = enhancedActivities?.filter(activity => {
    const matchesSearch = 
      activity.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (activity.description?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      activity.sdrNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (activity.project?.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    // If "All" is selected, show all activities
    if (activeTab === "all" && selectedProjectTab === "all") return matchesSearch;
    
    // Filter by program first
    let matchesProgram = true;
    if (activeTab === "cancer-genomics") matchesProgram = activity.project?.program?.name === "Cancer Genomics Program";
    if (activeTab === "neurological-disorders") matchesProgram = activity.project?.program?.name === "Neurological Disorders Program";
    if (activeTab === "immune-dysregulations") matchesProgram = activity.project?.program?.name === "Immune Dysregulations Program";
    
    // Then filter by specific project if a project tab is selected
    let matchesProject = true;
    if (selectedProjectTab !== "all") {
      matchesProject = !!(activity.projectId && activity.projectId === parseInt(selectedProjectTab));
    }
    
    return matchesSearch && matchesProgram && matchesProject;
  });

  return (
    <PermissionWrapper currentUserRole={currentUser.role} navigationItem="research-activities">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Research Activities (SDR)</h1>
        <PermissionWrapper
          currentUserRole={currentUser.role}
          navigationItem="research-activities"
          requiredPermissions={['canAdd']}
          fallback={null}
        >
          <Link href="/research-activities/create">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              New Research Activity
            </Button>
          </Link>
        </PermissionWrapper>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle>All Research Activities</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
              <Input
                type="search"
                placeholder="Search research activities..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" onValueChange={(value) => {
            setActiveTab(value);
            setSelectedProjectTab("all"); // Reset project filter when program changes
          }}>
            <TabsList className="mb-4 flex flex-wrap gap-1">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="cancer-genomics">Cancer Genomics</TabsTrigger>
              <TabsTrigger value="neurological-disorders">Neurological Disorders</TabsTrigger>
              <TabsTrigger value="immune-dysregulations">Immune Dysregulations</TabsTrigger>
            </TabsList>
            
            {/* Project-level tabs - only show when a specific program is selected */}
            {activeTab !== "all" && projectsForSelectedProgram && projectsForSelectedProgram.length > 0 && (
              <Tabs defaultValue="all" onValueChange={setSelectedProjectTab} className="mb-4">
                <TabsList className="flex flex-wrap gap-1">
                  <TabsTrigger value="all">All Projects</TabsTrigger>
                  {projectsForSelectedProgram.map(project => (
                    <TabsTrigger key={project.id} value={project.id.toString()}>
                      {project.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
            
            <TabsContent value={activeTab}>
          {isLoadingActivities ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-3">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-64" />
                    <div className="flex gap-4">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SDR Number</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Funding</TableHead>
                  <TableHead>Lead Scientist</TableHead>
                  <TableHead>PI/Budget Holder</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredActivities?.map((activity) => (
                  <TableRow 
                    key={activity.id}
                    className="cursor-pointer hover:bg-neutral-50/50 transition-colors"
                    onClick={() => navigate(`/research-activities/${activity.id}`)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center space-x-2">
                        <TableIcon className="h-4 w-4 text-primary-500" />
                        <span>{activity.sdrNumber}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{activity.title}</div>
                      <div className="text-sm text-gray-600 mt-1 dark:text-gray-300">
                        {activity.project ? (
                          <span>
                            PRJ: {activity.project.projectId} - {activity.project.name} • PRG: {activity.project.program?.name || 'No program'}
                          </span>
                        ) : (
                          <span>No project assigned</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {activity.budgetSource && activity.budgetSource.length > 0 ? (
                          <div>
                            <div className="font-medium">{activity.budgetSource.join(', ')}</div>
                            {activity.grantCodes && activity.grantCodes.length > 0 && (
                              <div className="text-xs text-gray-600 mt-1 dark:text-gray-300">
                                Grant: {activity.grantCodes.join(', ')}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-600 dark:text-gray-300">No funding source</span>
                        )}
                        
                        {/* Linked Grants */}
                        {activityGrantCounts[activity.id] && activityGrantCounts[activity.id].length > 0 && (
                          <div className="mt-2 pt-2 border-t">
                            <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                              <LinkIcon className="h-3 w-3" />
                              <span className="font-medium">Linked Grants:</span>
                            </div>
                            <div className="mt-1 space-y-1">
                              {activityGrantCounts[activity.id].map((grant: any) => (
                                <div key={grant.id} className="text-xs">
                                  <span className="font-mono text-blue-600 dark:text-blue-400">{grant.projectNumber}</span>
                                  <span className="text-gray-600 dark:text-gray-300"> - {grant.status}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {activity.leadScientist ? (
                        <div className="flex items-center">
                          <span className="text-xs font-medium text-gray-700 mr-2 dark:text-gray-300">
                            {activity.leadScientist.profileImageInitials || getInitials(activity.leadScientist)}
                          </span>
                          <div>
                            <div className="font-medium">{formatFullName(activity.leadScientist)}</div>
                            {activity.leadScientist.jobTitle && (
                              <div className="text-xs text-gray-600 dark:text-gray-300">{activity.leadScientist.jobTitle}</div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-600 dark:text-gray-300">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {activity.budgetHolder ? (
                        <div className="flex items-center">
                          <span className="text-xs font-medium text-gray-700 mr-2 dark:text-gray-300">
                            {activity.budgetHolder.profileImageInitials || getInitials(activity.budgetHolder)}
                          </span>
                          <div>
                            <div className="font-medium">{formatFullName(activity.budgetHolder)}</div>
                            {activity.budgetHolder.jobTitle && (
                              <div className="text-xs text-gray-600 dark:text-gray-300">{activity.budgetHolder.jobTitle}</div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-600 dark:text-gray-300">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
                        ${activity.status === 'active' ? 'bg-green-100 text-green-800' : 
                          activity.status === 'planning' ? 'bg-blue-100 text-blue-800' : 
                          activity.status === 'completed' ? 'bg-gray-100 text-gray-800' : 
                          'bg-yellow-100 text-yellow-800'}`
                      }>
                        {activity.status.charAt(0).toUpperCase() + activity.status.slice(1).replace('_', ' ')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/research-activities/${activity.id}`}>
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          <PermissionWrapper
                            currentUserRole={currentUser.role}
                            navigationItem="research-activities"
                            requiredPermissions={['canEdit']}
                            fallback={null}
                          >
                            <DropdownMenuItem asChild>
                              <Link href={`/research-activities/${activity.id}/edit`}>
                                Edit Activity
                              </Link>
                            </DropdownMenuItem>
                          </PermissionWrapper>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoadingActivities && (!filteredActivities || filteredActivities.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-gray-600 dark:text-gray-300">
                      {researchActivities && researchActivities.length > 0 
                        ? "No research activities matching your search criteria."
                        : "No research activities yet. Create your first research activity!"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
    </PermissionWrapper>
  );
}