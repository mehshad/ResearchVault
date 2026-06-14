import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { formatFullName } from "@/utils/nameUtils";
import {
  ArrowLeft,
  Plus,
  UserPlus,
  UserMinus,
  ClipboardList,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { type ResearchActivity, type Scientist, type ProjectMember } from "@shared/schema";

interface TeamDetailProps {
  researchActivityId?: number;
}

export default function TeamDetail(props: TeamDetailProps) {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  
  // Use the provided id or the one from URL params
  const id = props.researchActivityId || parseInt(params.id);
  
  const [open, setOpen] = useState(false);
  const [selectedScientistId, setSelectedScientistId] = useState<number | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>("");
  
  // Fetch research activity details
  const { data: activity, isLoading: activityLoading } = useQuery<ResearchActivity>({
    queryKey: ["/api/research-activities", id],
    queryFn: () => fetch(`/api/research-activities/${id}`).then(res => res.json()),
    enabled: !!id,
  });
  
  // Fetch team members for research activity
  const { data: teamMembers, isLoading: teamMembersLoading } = useQuery({
    queryKey: ["/api/research-activities", id, "members"],
    queryFn: () => fetch(`/api/research-activities/${id}/members`).then(res => res.json()),
    enabled: !!id,
  });
  
  // Fetch all scientists for the team member selection
  const { data: scientists, isLoading: scientistsLoading } = useQuery<Scientist[]>({
    queryKey: ["/api/scientists"],
  });
  
  // Filter out scientists who are already team members and sort by last name
  const availableScientists = scientists && teamMembers
    ? scientists
        .filter(
          (scientist: Scientist) =>
            !teamMembers.some(
              (member: any) => member.scientistId === scientist.id
            )
        )
        .sort((a, b) => {
          // Extract last name from full name
          const getLastName = (name: string) => {
            const parts = name.trim().split(' ');
            return parts[parts.length - 1].toLowerCase();
          };
          return getLastName(formatFullName(a)).localeCompare(getLastName(formatFullName(b)));
        })
    : scientists?.sort((a, b) => {
        const getLastName = (name: string) => {
          const parts = name.trim().split(' ');
          return parts[parts.length - 1].toLowerCase();
        };
        return getLastName(formatFullName(a)).localeCompare(getLastName(formatFullName(b)));
      }) || [];
  
  // Add team member mutation
  const addTeamMember = useMutation({
    mutationFn: async (data: { scientistId: number; role: string }) => {
      const response = await fetch(`/api/research-activities/${id}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scientistId: data.scientistId,
          role: data.role,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to add team member");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/research-activities", id, "members"] });
      setSelectedScientistId(null);
      setSelectedRole("");
      setOpen(false);
      toast({
        title: "Team member added",
        description: "The team member has been added successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to add team member: " + error.message,
        variant: "destructive",
      });
    },
  });
  
  // Remove team member mutation
  const removeTeamMember = useMutation({
    mutationFn: async (scientistId: number) => {
      const response = await fetch(`/api/research-activities/${id}/members/${scientistId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to remove team member");
      }
      return response.status === 204 ? null : response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/research-activities", id, "members"] });
      toast({
        title: "Team member removed",
        description: "The team member has been removed successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to remove team member: " + error.message,
        variant: "destructive",
      });
    },
  });
  
  // Check role constraints
  const getRoleConstraints = () => {
    const currentRoles = teamMembers?.map((member: any) => member.role) || [];
    const hasPrincipalInvestigator = currentRoles.includes('Principal Investigator');
    const hasLeadScientist = currentRoles.includes('Lead Scientist');
    
    return {
      hasPrincipalInvestigator,
      hasLeadScientist,
      canAddPrincipalInvestigator: !hasPrincipalInvestigator,
      canAddLeadScientist: !hasLeadScientist,
    };
  };

  const handleAddTeamMember = () => {
    if (!selectedScientistId || !selectedRole) {
      toast({
        title: "Error",
        description: "Please select a scientist and a role.",
        variant: "destructive",
      });
      return;
    }
    
    const constraints = getRoleConstraints();
    
    // Validate role constraints
    if (selectedRole === 'Principal Investigator' && !constraints.canAddPrincipalInvestigator) {
      toast({
        title: "Role Constraint Violation",
        description: "Each research activity can only have one Principal Investigator.",
        variant: "destructive",
      });
      return;
    }
    
    if (selectedRole === 'Lead Scientist' && !constraints.canAddLeadScientist) {
      toast({
        title: "Role Constraint Violation", 
        description: "Each research activity can only have one Lead Scientist.",
        variant: "destructive",
      });
      return;
    }
    
    addTeamMember.mutate({
      scientistId: selectedScientistId,
      role: selectedRole,
    });
  };
  
  const handleRemoveTeamMember = (scientistId: number) => {
    if (window.confirm("Are you sure you want to remove this team member?")) {
      removeTeamMember.mutate(scientistId);
    }
  };
  
  // If the page is loaded directly (not through a research activity)
  if (activityLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/research-activities")}>
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

  if (!activity) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/research-activities")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">Team Not Found</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <p className="text-lg text-foreground">
                The research team you're looking for could not be found.
              </p>
              <Button
                className="mt-4"
                onClick={() => navigate("/research-activities")}
              >
                Return to Research Activities
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/research-activities/${activity?.id || id}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Research Activity
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">Research Team</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Team Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Team Member</DialogTitle>
              <DialogDescription>
                Add a scientist or staff member to the research team.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="scientist">Scientist</Label>
                <Select
                  value={selectedScientistId?.toString() || ""}
                  onValueChange={(value) => {
                    setSelectedScientistId(parseInt(value));
                    // Clear role selection when scientist changes to prevent invalid combinations
                    setSelectedRole("");
                  }}
                >
                  <SelectTrigger id="scientist">
                    <SelectValue placeholder="Select scientist" />
                  </SelectTrigger>
                  <SelectContent>
                    {scientistsLoading ? (
                      <SelectItem value="loading" disabled>
                        Loading scientists...
                      </SelectItem>
                    ) : availableScientists.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No available scientists
                      </SelectItem>
                    ) : (
                      availableScientists.map((scientist: Scientist) => (
                        <SelectItem
                          key={scientist.id}
                          value={scientist.id.toString()}
                        >
                          <div className="flex items-center justify-between w-full">
                            <div className="flex flex-col">
                              <span className="font-medium">{formatFullName(scientist)}</span>
                              <span className="text-xs text-muted-foreground">{scientist.jobTitle}</span>
                            </div>
                            {scientist.staffId && 
                              <Badge variant="outline" className="text-xs font-mono bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                                {scientist.staffId}
                              </Badge>
                            }
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="role">Team Role Assignment</Label>
                <Select
                  value={selectedRole}
                  onValueChange={setSelectedRole}
                >
                  <SelectTrigger id="role">
                    <SelectValue placeholder="Select team role" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Only SDR Team Roles - Principal Investigator only for Investigators */}
                    {(() => {
                      const selectedScientist = selectedScientistId 
                        ? scientists?.find(s => s.id === selectedScientistId)
                        : null;
                      const canBePrincipalInvestigator = selectedScientist?.jobTitle === "Investigator";
                      const constraints = getRoleConstraints();
                      
                      return (
                        <>
                          {canBePrincipalInvestigator && (
                            <SelectItem 
                              value="Principal Investigator"
                              disabled={!constraints.canAddPrincipalInvestigator}
                            >
                              Principal Investigator {!constraints.canAddPrincipalInvestigator && "(Already assigned)"}
                            </SelectItem>
                          )}
                          <SelectItem 
                            value="Lead Scientist"
                            disabled={!constraints.canAddLeadScientist}
                          >
                            Lead Scientist {!constraints.canAddLeadScientist && "(Already assigned)"}
                          </SelectItem>
                          <SelectItem value="Team Member">Team Member</SelectItem>
                        </>
                      );
                    })()}
                  </SelectContent>
                </Select>
                {selectedScientistId && (() => {
                  const selectedScientist = scientists?.find(s => s.id === selectedScientistId);
                  return selectedScientist?.jobTitle !== "Investigator" && (
                    <p className="text-sm text-amber-600 mt-1 dark:text-amber-400">
                      <span className="font-medium">Note:</span> Only scientists with job title "Investigator" can be assigned as Principal Investigator. 
                      {selectedScientist ? formatFullName(selectedScientist) : 'This scientist'} has the job title "{selectedScientist?.jobTitle}".
                    </p>
                  );
                })()}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAddTeamMember}
                disabled={!selectedScientistId || !selectedRole || addTeamMember.isPending}
              >
                {addTeamMember.isPending ? "Adding..." : "Add Member"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Team for {activity?.title || "Research Activity"}
            <Badge variant="outline" className="ml-2 font-mono bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
              {activity?.sdrNumber || "SDR-???"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Manage the research team members and assign team roles (Principal Investigator, Lead Scientist, Team Member).
            Note: Job titles (like Staff Scientist) are set in the staff member profile and are separate from team roles.
            To change a member's role, remove them and add them back with the desired role.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {teamMembersLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-12 w-full" />
                </div>
              ))}
            </div>
          ) : !teamMembers || teamMembers.length === 0 ? (
            <div className="text-center py-6">
              <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No Team Members</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Add team members to this research activity to get started.
              </p>
              <Button
                className="mt-4"
                onClick={() => setOpen(true)}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add Team Member
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Team Status Indicator */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 dark:bg-blue-950 dark:border-blue-800">
                <h4 className="font-medium text-blue-900 mb-2 dark:text-blue-200">Team Composition Requirements</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  {(() => {
                    const constraints = getRoleConstraints();
                    return (
                      <>
                        <div className="flex items-center justify-between">
                          <span>Principal Investigator:</span>
                          <Badge variant={constraints.hasPrincipalInvestigator ? "default" : "outline"}>
                            {constraints.hasPrincipalInvestigator ? "✓ Assigned" : "Required"}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Lead Scientist:</span>
                          <Badge variant={constraints.hasLeadScientist ? "default" : "outline"}>
                            {constraints.hasLeadScientist ? "✓ Assigned" : "Required"}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Team Members:</span>
                          <Badge variant="outline">
                            {teamMembers?.filter((m: any) => m.role === 'Team Member').length || 0} assigned
                          </Badge>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <p className="text-xs text-blue-700 mt-2 dark:text-blue-300">
                  Each research activity must have exactly 1 Principal Investigator and 1 Lead Scientist, plus any number of team members.
                </p>
              </div>
              
              <div className="rounded-md border">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Team Role</TableHead>
                    <TableHead>Job Title</TableHead>
                    <TableHead>Staff ID</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamMembers.map((member: ProjectMember) => {
                    // Find the scientist details from the scientists list
                    const scientist = scientists?.find(s => s.id === member.scientistId) || null;
                    return (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="font-medium">{scientist ? formatFullName(scientist) : 'Unknown'}</div>
                          <div className="text-sm text-muted-foreground">
                            {scientist?.email || 'No email available'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            member.role === 'Investigator' ? 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800' :
                            member.role === 'Lead Scientist' ? 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800' :
                            'bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800'
                          }>
                            {member.role}
                          </Badge>
                        </TableCell>
                        <TableCell>{scientist?.jobTitle || 'N/A'}</TableCell>
                        <TableCell>
                          {scientist?.staffId ? (
                            <Badge variant="outline" className="font-mono bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                              {scientist.staffId}
                            </Badge>
                          ) : (
                            'N/A'
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveTeamMember(member.scientistId)}
                            disabled={removeTeamMember.isPending}
                          >
                            <UserMinus className="h-4 w-4 text-destructive" />
                            <span className="sr-only">Remove</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}