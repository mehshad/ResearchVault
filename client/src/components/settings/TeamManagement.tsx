import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Users, Shield, Code, FlaskConical, GripVertical, Upload, X } from "lucide-react";
import type { TeamMember, InsertTeamMember } from "@shared/schema";

const categoryOptions = [
  { value: "lead", label: "Element Lead", icon: Shield },
  { value: "tester", label: "Faculty Tester", icon: FlaskConical },
  { value: "developer", label: "Developer", icon: Code }
];

const elementTypeOptions = [
  { value: "project_management", label: "Project Management" },
  { value: "irb", label: "IRB (Ethics Review)" },
  { value: "ibc", label: "IBC (Biosafety)" },
  { value: "grants", label: "Grants" },
  { value: "publications", label: "Publications" },
  { value: "contracts", label: "Contracts" },
  { value: "facilities", label: "Facilities" },
  { value: "data_management", label: "Data Management" }
];

function getInitials(firstName: string, lastName: string): string {
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
}

interface TeamMemberFormProps {
  member?: TeamMember;
  onSubmit: (data: Partial<InsertTeamMember>) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function TeamMemberForm({ member, onSubmit, onCancel, isSubmitting }: TeamMemberFormProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: member?.firstName || "",
    lastName: member?.lastName || "",
    title: member?.title || "",
    bio: member?.bio || "",
    photoUrl: member?.photoUrl || "",
    categories: member?.categories || ["lead"],
    elementType: member?.elementType || "",
    institution: member?.institution || "",
    email: member?.email || "",
    linkedInUrl: member?.linkedInUrl || "",
    displayOrder: member?.displayOrder ?? 0,
    isActive: member?.isActive ?? true
  });
  
  const toggleCategory = (cat: string) => {
    setFormData(prev => {
      const current = prev.categories || [];
      if (current.includes(cat)) {
        return { ...prev, categories: current.filter(c => c !== cat) };
      } else {
        return { ...prev, categories: [...current, cat] };
      }
    });
  };
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please select an image under 5MB", variant: "destructive" });
      return;
    }
    
    if (!file.type.startsWith('image/')) {
      toast({ title: "Invalid file type", description: "Please select an image file", variant: "destructive" });
      return;
    }
    
    setIsUploading(true);
    try {
      const response = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });
      
      if (!response.ok) throw new Error("Failed to get upload URL");
      
      const { uploadURL, objectPath, finalizeToken } = await response.json();
      
      const uploadResponse = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      
      if (!uploadResponse.ok) throw new Error("Failed to upload file");

      // Finalize upload — set private ACL so deny-by-default ACL enforcement works.
      if (objectPath) {
        await fetch("/api/uploads/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ objectPath, finalizeToken }),
        }).catch(() => { /* best-effort */ });
      }
      
      setFormData(prev => ({ ...prev, photoUrl: objectPath }));
      toast({ title: "Photo uploaded successfully" });
    } catch (error) {
      console.error("Upload error:", error);
      toast({ title: "Upload failed", description: "Please try again or use a URL", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="firstName">First Name *</Label>
          <Input
            id="firstName"
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            required
            data-testid="input-team-firstname"
          />
        </div>
        <div>
          <Label htmlFor="lastName">Last Name *</Label>
          <Input
            id="lastName"
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            required
            data-testid="input-team-lastname"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="title">Title / Position</Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="e.g., Assistant Professor, Lead Developer"
          data-testid="input-team-title"
        />
      </div>

      <div className="space-y-3">
        <Label>Team Categories * (select all that apply)</Label>
        <div className="flex flex-wrap gap-4">
          {categoryOptions.map((opt) => (
            <div key={opt.value} className="flex items-center gap-2">
              <Checkbox
                id={`cat-${opt.value}`}
                checked={formData.categories.includes(opt.value)}
                onCheckedChange={() => toggleCategory(opt.value)}
                data-testid={`checkbox-team-${opt.value}`}
              />
              <label 
                htmlFor={`cat-${opt.value}`}
                className="flex items-center gap-1.5 text-sm cursor-pointer"
              >
                <opt.icon className="h-4 w-4" />
                {opt.label}
              </label>
            </div>
          ))}
        </div>
        {formData.categories.length === 0 && (
          <p className="text-sm text-destructive">Please select at least one category</p>
        )}
      </div>

      <div>
        <Label htmlFor="elementType">Element Focus</Label>
        <Select value={formData.elementType} onValueChange={(val) => setFormData({ ...formData, elementType: val })}>
          <SelectTrigger data-testid="select-team-element">
            <SelectValue placeholder="Select element (optional)" />
          </SelectTrigger>
          <SelectContent>
            {elementTypeOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="institution">Institution</Label>
        <Input
          id="institution"
          value={formData.institution}
          onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
          placeholder="e.g., Sidra Medicine, HBKU, WCM-Q"
          data-testid="input-team-institution"
        />
      </div>

      <div>
        <Label htmlFor="bio">Biography</Label>
        <Textarea
          id="bio"
          value={formData.bio}
          onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
          placeholder="Brief professional biography..."
          rows={3}
          data-testid="input-team-bio"
        />
      </div>

      <div>
        <Label>Photo</Label>
        <div className="flex items-start gap-4 mt-2">
          <Avatar className="h-20 w-20 ring-2 ring-muted">
            {formData.photoUrl ? (
              <AvatarImage src={formData.photoUrl} alt="Preview" />
            ) : null}
            <AvatarFallback className="text-lg">{getInitials(formData.firstName, formData.lastName)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                data-testid="button-upload-photo"
              >
                <Upload className="h-4 w-4 mr-2" />
                {isUploading ? "Uploading..." : "Upload Photo"}
              </Button>
              {formData.photoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFormData({ ...formData, photoUrl: "" })}
                  data-testid="button-remove-photo"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
            <p className="text-xs text-muted-foreground">
              Upload a profile photo (max 5MB, JPG/PNG)
            </p>
            <Input
              id="photoUrl"
              value={formData.photoUrl}
              onChange={(e) => setFormData({ ...formData, photoUrl: e.target.value })}
              placeholder="Or paste image URL"
              className="text-xs"
              data-testid="input-team-photo"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="email@institution.qa"
            data-testid="input-team-email"
          />
        </div>
        <div>
          <Label htmlFor="linkedInUrl">LinkedIn URL</Label>
          <Input
            id="linkedInUrl"
            value={formData.linkedInUrl}
            onChange={(e) => setFormData({ ...formData, linkedInUrl: e.target.value })}
            placeholder="https://linkedin.com/in/..."
            data-testid="input-team-linkedin"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="displayOrder">Display Order</Label>
          <Input
            id="displayOrder"
            type="number"
            value={formData.displayOrder}
            onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 0 })}
            data-testid="input-team-order"
          />
        </div>
        <div className="flex items-center gap-3 pt-6">
          <Switch
            id="isActive"
            checked={formData.isActive}
            onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
          />
          <Label htmlFor="isActive">Active (show on team page)</Label>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} data-testid="button-team-cancel">
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} data-testid="button-team-save">
          {isSubmitting ? "Saving..." : member ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}

export default function TeamManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  const { data: teamMembers = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ['/api/team-members'],
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<InsertTeamMember>) =>
      fetch('/api/team-members', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/team-members'] });
      setIsDialogOpen(false);
      toast({ title: "Team member added successfully!" });
    },
    onError: () => {
      toast({ title: "Failed to add team member", variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertTeamMember> }) =>
      fetch(`/api/team-members/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/team-members'] });
      setIsDialogOpen(false);
      setEditingMember(null);
      toast({ title: "Team member updated successfully!" });
    },
    onError: () => {
      toast({ title: "Failed to update team member", variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/team-members/${id}`, { method: 'DELETE' }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/team-members'] });
      toast({ title: "Team member removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove team member", variant: "destructive" });
    }
  });

  const handleSubmit = (data: Partial<InsertTeamMember>) => {
    if (editingMember) {
      updateMutation.mutate({ id: editingMember.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (member: TeamMember) => {
    setEditingMember(member);
    setIsDialogOpen(true);
  };

  const handleDelete = (member: TeamMember) => {
    if (confirm(`Remove ${member.firstName} ${member.lastName} from the team?`)) {
      deleteMutation.mutate(member.id);
    }
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingMember(null);
  };

  const leads = teamMembers.filter(m => m.categories?.includes('lead'));
  const testers = teamMembers.filter(m => m.categories?.includes('tester'));
  const developers = teamMembers.filter(m => m.categories?.includes('developer'));

  const renderMemberCard = (member: TeamMember) => (
    <Card key={member.id} className="relative" data-testid={`card-team-member-${member.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-12 w-12">
            {member.photoUrl && <AvatarImage src={member.photoUrl} alt={`${member.firstName} ${member.lastName}`} />}
            <AvatarFallback>{getInitials(member.firstName, member.lastName)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-sm truncate">
                {member.firstName} {member.lastName}
              </h4>
              {!member.isActive && (
                <Badge variant="outline" className="text-xs">Inactive</Badge>
              )}
            </div>
            {member.title && (
              <p className="text-xs text-muted-foreground truncate">{member.title}</p>
            )}
            {member.elementType && (
              <Badge variant="secondary" className="text-xs mt-1">
                {elementTypeOptions.find(e => e.value === member.elementType)?.label || member.elementType}
              </Badge>
            )}
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleEdit(member)}
              data-testid={`button-edit-member-${member.id}`}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDelete(member)}
              data-testid={`button-delete-member-${member.id}`}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Team Members</h3>
          <p className="text-sm text-muted-foreground">
            Manage the team displayed on the public Q-BRIDGE team page
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingMember(null)} data-testid="button-add-team-member">
              <Plus className="h-4 w-4 mr-2" />
              Add Team Member
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingMember ? "Edit Team Member" : "Add Team Member"}
              </DialogTitle>
            </DialogHeader>
            <TeamMemberForm
              member={editingMember || undefined}
              onSubmit={handleSubmit}
              onCancel={handleDialogClose}
              isSubmitting={createMutation.isPending || updateMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading team members...</div>
      ) : teamMembers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No team members yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add team members to display them on the public team page
            </p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add First Team Member
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {leads.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-5 w-5 text-teal-500" />
                <h4 className="font-medium">Element Leads ({leads.length})</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {leads.map(renderMemberCard)}
              </div>
            </div>
          )}

          {testers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FlaskConical className="h-5 w-5 text-blue-500" />
                <h4 className="font-medium">Faculty Testers ({testers.length})</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {testers.map(renderMemberCard)}
              </div>
            </div>
          )}

          {developers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Code className="h-5 w-5 text-purple-500" />
                <h4 className="font-medium">Developers ({developers.length})</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {developers.map(renderMemberCard)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
