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
import { Table as TableIcon, FilePlus, Search, MoreHorizontal, Users } from "lucide-react";
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
  profileImageInitials?: string;
}

interface Project {
  id: number;
  projectId: string;
  programId: number;
  name: string;
  description: string | null;
  principalInvestigatorId: number | null;
  createdAt: string;
  updatedAt: string;
  
  // Related entities
  program?: Program;
  principalInvestigator?: Scientist;
}

export default function ProjectsList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [, setLocation] = useLocation();
  const { currentUser } = useCurrentUser();

  const { data: projects, isLoading: isLoadingProjects } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
  });

  const { data: programs } = useQuery<Program[]>({
    queryKey: ['/api/programs'],
  });

  const { data: scientists } = useQuery<Scientist[]>({
    queryKey: ['/api/scientists'],
  });

  // Enhance projects with related data
  const enhancedProjects = projects?.map(project => {
    const program = programs?.find(p => p.id === project.programId);
    const principalInvestigator = project.principalInvestigatorId ? 
      scientists?.find(s => s.id === project.principalInvestigatorId) : undefined;
    return {
      ...project,
      program,
      principalInvestigator
    };
  });

  const filteredProjects = enhancedProjects?.filter(project => {
    const matchesSearch = 
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.description?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      project.projectId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.program?.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    if (activeTab === "all") return matchesSearch;
    
    // Filter by program
    if (activeTab === "cancer-genomics") return matchesSearch && project.program?.name === "Cancer Genomics Program";
    if (activeTab === "neurological-disorders") return matchesSearch && project.program?.name === "Neurological Disorders Program";
    if (activeTab === "immune-dysregulations") return matchesSearch && project.program?.name === "Immune Dysregulations Program";
    
    return matchesSearch;
  });

  return (
    <PermissionWrapper currentUserRole={currentUser.role} navigationItem="projects">
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-semibold text-foreground">Projects (PRJ)</h1>
        <PermissionWrapper
          currentUserRole={currentUser.role}
          navigationItem="projects"
          requiredPermissions={['canAdd']}
          fallback={null}
        >
          <Link href="/projects/create">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="button-new-project">
              New Project
            </Button>
          </Link>
        </PermissionWrapper>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle>All Projects</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
              <Input
                type="search"
                placeholder="Search projects..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-projects"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" onValueChange={setActiveTab}>
            <TabsList className="mb-4 flex flex-wrap gap-1">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="cancer-genomics">Cancer Genomics</TabsTrigger>
              <TabsTrigger value="neurological-disorders">Neurological Disorders</TabsTrigger>
              <TabsTrigger value="immune-dysregulations">Immune Dysregulations</TabsTrigger>
            </TabsList>
            
            <TabsContent value={activeTab}>
          {isLoadingProjects ? (
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
                  <TableHead>PRJ ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Project Lead Investigator</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects?.map((project) => (
                  <TableRow 
                    key={project.id}
                    className="cursor-pointer hover:bg-neutral-50/50 transition-colors"
                    onClick={() => setLocation(`/projects/${project.id}`)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center space-x-2">
                        <TableIcon className="h-4 w-4 text-primary-500" />
                        <span>{project.projectId}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{project.name}</div>
                      {project.description && (
                        <div className="text-sm text-gray-600 mt-1 line-clamp-1 dark:text-gray-300">
                          {project.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {project.program ? (
                        <span 
                          className="text-sm hover:text-primary-500 transition-colors cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/programs/${project.program!.id}`);
                          }}
                        >
                          {project.program.name}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-600 dark:text-gray-300">Not assigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {project.principalInvestigator ? (
                        <div className="flex items-center">
                          <span className="text-xs font-medium text-gray-700 mr-2 dark:text-gray-300">
                            {project.principalInvestigator.profileImageInitials || getInitials(project.principalInvestigator)}
                          </span>
                          <span>{formatFullName(project.principalInvestigator)}</span>
                        </div>
                      ) : (
                        <span className="text-gray-600 dark:text-gray-300">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/projects/${project.id}`}>
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          <PermissionWrapper
                            currentUserRole={currentUser.role}
                            navigationItem="projects"
                            requiredPermissions={['canEdit']}
                            fallback={null}
                          >
                            <DropdownMenuItem asChild>
                              <Link href={`/projects/${project.id}/edit`}>
                                Edit Project
                              </Link>
                            </DropdownMenuItem>
                          </PermissionWrapper>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoadingProjects && (!filteredProjects || filteredProjects.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-gray-600 dark:text-gray-300">
                      {projects && projects.length > 0 
                        ? "No projects matching your search criteria."
                        : "No projects yet. Create your first project!"}
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