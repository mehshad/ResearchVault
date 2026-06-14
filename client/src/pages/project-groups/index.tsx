import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Table as TableIcon, FilePlus, Search, MoreHorizontal, Users } from "lucide-react";

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
  name: string;
  profileImageInitials?: string;
}

interface ProjectGroup {
  id: number;
  projectGroupId: string;
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

export default function ProjectGroupsList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [programFilter, setProgramFilter] = useState<string>("all");

  const { data: projectGroups, isLoading: isLoadingProjectGroups } = useQuery<ProjectGroup[]>({
    queryKey: ['/api/project-groups'],
  });

  const { data: programs } = useQuery<Program[]>({
    queryKey: ['/api/programs'],
  });

  const { data: scientists } = useQuery<Scientist[]>({
    queryKey: ['/api/scientists'],
  });

  // Enhance project groups with related data
  const enhancedProjectGroups = projectGroups?.map(group => {
    const program = programs?.find(p => p.id === group.programId);
    const leadScientist = group.leadScientistId ? 
      scientists?.find(s => s.id === group.leadScientistId) : undefined;
    return {
      ...group,
      program,
      leadScientist
    };
  });

  const filteredProjectGroups = enhancedProjectGroups?.filter(group => {
    const matchesSearch = 
      group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (group.description?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      group.projectGroupId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (group.program?.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesProgram = programFilter === "all" || group.programId === parseInt(programFilter);
    
    return matchesSearch && matchesProgram;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Projects (PRJ)</h1>
        <Link href="/projects/create">
          <Button className="bg-primary-500 text-white">
            <FilePlus className="h-4 w-4 mr-1" /> New Project
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle>All Projects</CardTitle>
            <div className="flex items-center space-x-2">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
                <Input
                  type="search"
                  placeholder="Search projects..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              <Select 
                value={programFilter}
                onValueChange={setProgramFilter}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by Program" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Programs</SelectItem>
                  {programs?.map(program => (
                    <SelectItem key={program.id} value={program.id.toString()}>
                      {program.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingProjectGroups ? (
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
                  <TableHead>Lead Scientist</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjectGroups?.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center space-x-2">
                        <TableIcon className="h-4 w-4 text-primary-500" />
                        <span>{group.projectGroupId}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link href={`/project-groups/${group.id}`}>
                        <a className="hover:text-primary-500 transition-colors">{group.name}</a>
                      </Link>
                      {group.description && (
                        <div className="text-sm text-muted-foreground mt-1 line-clamp-1">
                          {group.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {group.program ? (
                        <Link href={`/programs/${group.program.id}`}>
                          <a className="text-sm hover:text-primary-500 transition-colors">
                            {group.program.name}
                          </a>
                        </Link>
                      ) : (
                        <span className="text-sm text-muted-foreground">Not assigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {group.leadScientist ? (
                        <div className="flex items-center">
                          <div className="h-7 w-7 rounded-full bg-primary-200 flex items-center justify-center text-xs text-primary-700 font-medium mr-2">
                            {group.leadScientist.profileImageInitials || group.leadScientist.name.substring(0, 2)}
                          </div>
                          <span>{group.leadScientist.name}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoadingProjectGroups && (!filteredProjectGroups || filteredProjectGroups.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {projectGroups && projectGroups.length > 0 
                        ? "No projects matching your search criteria."
                        : "No projects yet. Create your first project!"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}