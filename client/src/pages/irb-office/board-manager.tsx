import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, TableBody, TableCell, TableHead, 
  TableHeader, TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  ArrowLeft, Users, Crown, Shield, Plus, Edit, Trash2, 
  Search, UserCheck, UserX
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Scientist } from "@shared/schema";
import { formatFullName } from "@/utils/nameUtils";

interface IrbBoardMember {
  id: number;
  scientistId: number;
  scientist: Scientist;
  role: 'member' | 'chair' | 'deputy_chair';
  expertise: string[];
  appointmentDate: string;
  termEndDate: string;
  isActive: boolean;
}

export default function IrbBoardManager() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedScientist, setSelectedScientist] = useState("");
  const [selectedRole, setSelectedRole] = useState<'member' | 'chair' | 'deputy_chair'>('member');
  const [selectedExpertise, setSelectedExpertise] = useState<string[]>([]);
  // Set default term end date to 3 years from now
  const getDefaultTermEndDate = () => {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 3);
    return date.toISOString().split('T')[0];
  };

  const [termEndDate, setTermEndDate] = useState(getDefaultTermEndDate());
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: boardMembers = [], isLoading } = useQuery<IrbBoardMember[]>({
    queryKey: ['/api/irb-board-members'],
  });

  const { data: scientists = [] } = useQuery<Scientist[]>({
    queryKey: ['/api/scientists'],
  });

  const addBoardMemberMutation = useMutation({
    mutationFn: async (memberData: any) => {
      const response = await fetch('/api/irb-board-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memberData)
      });
      if (!response.ok) throw new Error('Failed to add board member');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/irb-board-members'] });
      toast({ title: "Success", description: "Board member added successfully" });
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add board member", variant: "destructive" });
    }
  });

  const updateBoardMemberMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const response = await fetch(`/api/irb-board-members/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update board member');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/irb-board-members'] });
      toast({ title: "Success", description: "Board member updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update board member", variant: "destructive" });
    }
  });

  const removeBoardMemberMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/irb-board-members/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to remove board member');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/irb-board-members'] });
      toast({ title: "Success", description: "Board member removed successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove board member", variant: "destructive" });
    }
  });

  const resetForm = () => {
    setSelectedScientist("");
    setSelectedRole('member');
    setSelectedExpertise([]);
    setTermEndDate(getDefaultTermEndDate());
  };

  const handleAddMember = () => {
    if (!selectedScientist) {
      toast({ title: "Error", description: "Please select a scientist", variant: "destructive" });
      return;
    }
    
    const memberData = {
      scientistId: parseInt(selectedScientist),
      role: selectedRole,
      expertise: selectedExpertise,
      appointmentDate: new Date().toISOString(),
      termEndDate: new Date(termEndDate).toISOString(),
      isActive: true
    };

    addBoardMemberMutation.mutate(memberData);
  };

  const handleRoleChange = (memberId: number, newRole: 'member' | 'chair' | 'deputy_chair') => {
    // Check if trying to assign chair or deputy chair when one already exists
    if (newRole === 'chair') {
      const currentChair = boardMembers.find(m => m.role === 'chair' && m.isActive && m.id !== memberId);
      if (currentChair) {
        toast({ 
          title: "Error", 
          description: "An active Chair already exists. Please change the current Chair to member first.", 
          variant: "destructive" 
        });
        return;
      }
    } else if (newRole === 'deputy_chair') {
      const currentDeputy = boardMembers.find(m => m.role === 'deputy_chair' && m.isActive && m.id !== memberId);
      if (currentDeputy) {
        toast({ 
          title: "Error", 
          description: "An active Deputy Chair already exists. Please change the current Deputy Chair to member first.", 
          variant: "destructive" 
        });
        return;
      }
    }
    
    updateBoardMemberMutation.mutate({ id: memberId, role: newRole });
  };

  const handleToggleActive = (memberId: number, isActive: boolean) => {
    updateBoardMemberMutation.mutate({ id: memberId, isActive: !isActive });
  };

  const filteredMembers = boardMembers.filter(member => 
    formatFullName(member.scientist).toLowerCase().includes(searchQuery.toLowerCase()) ||
    member.expertise.some(exp => exp.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const availableScientists = scientists.filter(scientist => 
    !boardMembers.some(member => member.scientistId === scientist.id)
  );

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'chair':
        return <Badge className="bg-gold-100 text-gold-800"><Crown className="h-3 w-3 mr-1" />Chair</Badge>;
      case 'deputy_chair':
        return <Badge className="bg-silver-100 text-silver-800"><Shield className="h-3 w-3 mr-1" />Deputy Chair</Badge>;
      default:
        return <Badge variant="outline">Member</Badge>;
    }
  };

  const expertiseOptions = [
    'Clinical Research', 'Biostatistics', 'Ethics', 'Law', 'Community Representative',
    'Pediatrics', 'Oncology', 'Genetics', 'Epidemiology', 'Psychology', 'Pharmacy',
    'Data Privacy', 'Regulatory Affairs'
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/irb-office">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to IRB Office
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-2">IRB Board Manager</h1>
          <p className="text-muted-foreground">
            Manage IRB board members, reviewers, chair, and deputy chair assignments
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Board Member
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add IRB Board Member</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Scientist</label>
                <Select value={selectedScientist} onValueChange={setSelectedScientist}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select scientist" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableScientists.map((scientist) => (
                      <SelectItem key={scientist.id} value={scientist.id.toString()}>
                        {formatFullName(scientist)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Role</label>
                <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as any)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="chair">Chair</SelectItem>
                    <SelectItem value="deputy_chair">Deputy Chair</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Term End Date</label>
                <Input
                  type="date"
                  value={termEndDate}
                  onChange={(e) => setTermEndDate(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                  Default: 3 years from appointment date
                </p>
              </div>

              <div>
                <label className="text-sm font-medium">Expertise Areas</label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {expertiseOptions.map((option) => (
                    <label key={option} className="flex items-center space-x-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedExpertise.includes(option)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedExpertise([...selectedExpertise, option]);
                          } else {
                            setSelectedExpertise(selectedExpertise.filter(exp => exp !== option));
                          }
                        }}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={handleAddMember} 
                  disabled={!selectedScientist || addBoardMemberMutation.isPending}
                >
                  {addBoardMemberMutation.isPending ? 'Adding...' : 'Add Member'}
                </Button>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Board Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center dark:bg-blue-950">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">{boardMembers.filter(m => m.isActive).length}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Active Members</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center dark:bg-yellow-950">
                <Crown className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div className="flex-1 min-w-0">
                {(() => {
                  const chair = boardMembers.find(m => m.role === 'chair' && m.isActive);
                  return chair ? (
                    <>
                      <div className="text-sm font-medium truncate">{formatFullName(chair.scientist)}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Chair</div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-medium text-gray-400 dark:text-gray-500">No Chair</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Vacant</div>
                    </>
                  );
                })()}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center dark:bg-purple-950">
                <Shield className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                {(() => {
                  const deputy = boardMembers.find(m => m.role === 'deputy_chair' && m.isActive);
                  return deputy ? (
                    <>
                      <div className="text-sm font-medium truncate">{formatFullName(deputy.scientist)}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Deputy Chair</div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-medium text-gray-400 dark:text-gray-500">No Deputy Chair</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Vacant</div>
                    </>
                  );
                })()}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center dark:bg-gray-800">
                <UserX className="h-5 w-5 text-gray-600 dark:text-gray-300" />
              </div>
              <div>
                <div className="text-2xl font-bold">{boardMembers.filter(m => !m.isActive).length}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Inactive</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Board Members Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>IRB Board Members</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
              <Input
                type="search"
                placeholder="Search members..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Expertise</TableHead>
                <TableHead>Term End</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMembers.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-medium dark:bg-blue-950">
                        {member.scientist.profileImageInitials}
                      </div>
                      <div>
                        <div className="font-medium">{formatFullName(member.scientist)}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{member.scientist.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={member.role}
                      onValueChange={(value) => handleRoleChange(member.id, value as any)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="chair">Chair</SelectItem>
                        <SelectItem value="deputy_chair">Deputy Chair</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {member.expertise.slice(0, 2).map((exp) => (
                        <Badge key={exp} variant="outline" className="text-xs">
                          {exp}
                        </Badge>
                      ))}
                      {member.expertise.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{member.expertise.length - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {new Date(member.termEndDate).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleActive(member.id, member.isActive)}
                    >
                      {member.isActive ? (
                        <UserCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
                      ) : (
                        <UserX className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeBoardMemberMutation.mutate(member.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}