import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Branch, Department, Section, SECTION_TYPES } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  ArrowLeft, Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  Network, Building2, FlaskConical, Briefcase, Boxes, Loader2, Stethoscope,
} from "lucide-react";

type Level = "branch" | "department" | "section";

interface EditorState {
  open: boolean;
  level: Level;
  /** null = creating */
  record: Branch | Department | Section | null;
  /** parent id when creating a department (branchId) or section (departmentId) */
  parentId?: number;
}

interface DeleteState {
  open: boolean;
  level: Level;
  record: Branch | Department | Section | null;
}

const LEVEL_LABEL: Record<Level, string> = {
  branch: "Branch",
  department: "Department",
  section: "Section",
};

const LEVEL_API: Record<Level, string> = {
  branch: "/api/branches",
  department: "/api/departments",
  section: "/api/sections",
};

function sectionTypeIcon(type: string) {
  if (type === "Laboratory") return <FlaskConical className="h-3.5 w-3.5" />;
  if (type === "Core") return <Boxes className="h-3.5 w-3.5" />;
  if (type === "Clinic") return <Stethoscope className="h-3.5 w-3.5" />;
  return <Briefcase className="h-3.5 w-3.5" />;
}

export default function OrganizationStructure() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { currentUser } = useCurrentUser();

  const canManage =
    currentUser.role === "Management" ||
    currentUser.role === "admin" ||
    currentUser.role === "superadmin";

  const { data: branches, isLoading: branchesLoading } = useQuery<Branch[]>({
    queryKey: ["/api/branches"],
    queryFn: () => fetch("/api/branches").then((r) => r.json()),
  });
  const { data: departments, isLoading: departmentsLoading } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
    queryFn: () => fetch("/api/departments").then((r) => r.json()),
  });
  const { data: sections, isLoading: sectionsLoading } = useQuery<Section[]>({
    queryKey: ["/api/sections"],
    queryFn: () => fetch("/api/sections").then((r) => r.json()),
  });

  const [collapsedBranches, setCollapsedBranches] = useState<Set<number>>(new Set());
  const [collapsedDepartments, setCollapsedDepartments] = useState<Set<number>>(new Set());

  const [editor, setEditor] = useState<EditorState>({ open: false, level: "branch", record: null });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sectionType, setSectionType] = useState<string>("Laboratory");

  const [deleter, setDeleter] = useState<DeleteState>({ open: false, level: "branch", record: null });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/branches"] });
    queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sections"] });
  };

  const openCreate = (level: Level, parentId?: number) => {
    setName("");
    setDescription("");
    setSectionType("Laboratory");
    setEditor({ open: true, level, record: null, parentId });
  };

  const openEdit = (level: Level, record: Branch | Department | Section) => {
    setName(record.name);
    setDescription(record.description || "");
    if (level === "section") setSectionType((record as Section).type);
    setEditor({ open: true, level, record });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { level, record, parentId } = editor;
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
      };
      if (level === "department") body.branchId = record ? (record as Department).branchId : parentId;
      if (level === "section") {
        body.departmentId = record ? (record as Section).departmentId : parentId;
        body.type = sectionType;
      }
      const res = record
        ? await apiRequest("PATCH", `${LEVEL_API[level]}/${record.id}`, body)
        : await apiRequest("POST", LEVEL_API[level], body);
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast({
        title: `${LEVEL_LABEL[editor.level]} ${editor.record ? "updated" : "created"}`,
      });
      setEditor((e) => ({ ...e, open: false }));
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { level, record } = deleter;
      if (!record) return;
      const res = await fetch(`${LEVEL_API[level]}/${record.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        let body: any = {};
        try { body = await res.json(); } catch {}
        throw new Error(body.message || "Failed to delete");
      }
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: `${LEVEL_LABEL[deleter.level]} deleted` });
      setDeleter((d) => ({ ...d, open: false }));
    },
    onError: (error: any) => {
      setDeleter((d) => ({ ...d, open: false }));
      toast({
        title: "Cannot delete",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggle = (set: Set<number>, id: number, apply: (s: Set<number>) => void) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    apply(next);
  };

  const isLoading = branchesLoading || departmentsLoading || sectionsLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/facilities")} data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Network className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Organization Structure</h1>
            <p className="text-sm text-muted-foreground">
              Branches, departments, and their sections (labs, offices, cores)
            </p>
          </div>
        </div>
        {canManage && (
          <Button onClick={() => openCreate("branch")} data-testid="button-add-branch">
            <Plus className="h-4 w-4 mr-2" />
            Add Branch
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
              <CardContent><Skeleton className="h-4 w-full" /></CardContent>
            </Card>
          ))}
        </div>
      ) : !branches?.length ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <Building2 className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No branches defined yet.</p>
            {canManage ? (
              <p className="text-sm text-muted-foreground">
                Start by adding a branch, then add departments and sections beneath it.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Managers and administrators can define the organization structure.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {branches.map((branch) => {
            const branchDepts = (departments || []).filter((d) => d.branchId === branch.id);
            const branchOpen = !collapsedBranches.has(branch.id);
            return (
              <Card key={branch.id} className="border-l-4 border-l-primary" data-testid={`card-branch-${branch.id}`}>
                <CardHeader
                  className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggle(collapsedBranches, branch.id, setCollapsedBranches)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {branchOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <Building2 className="h-5 w-5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <CardTitle className="text-lg truncate">{branch.name}</CardTitle>
                        {branch.description && (
                          <CardDescription className="truncate">{branch.description}</CardDescription>
                        )}
                      </div>
                      <Badge variant="secondary" className="ml-2 shrink-0">
                        {branchDepts.length} department{branchDepts.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button variant="outline" size="sm" onClick={() => openCreate("department", branch.id)} data-testid={`button-add-department-${branch.id}`}>
                          <Plus className="h-4 w-4 mr-1" /> Department
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit("branch", branch)} data-testid={`button-edit-branch-${branch.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleter({ open: true, level: "branch", record: branch })} data-testid={`button-delete-branch-${branch.id}`}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                {branchOpen && (
                  <CardContent className="space-y-3 pt-0">
                    {!branchDepts.length && (
                      <p className="text-sm text-muted-foreground pl-6">No departments in this branch.</p>
                    )}
                    {branchDepts.map((dept) => {
                      const deptSections = (sections || []).filter((s) => s.departmentId === dept.id);
                      const deptOpen = !collapsedDepartments.has(dept.id);
                      return (
                        <div key={dept.id} className="ml-6 border rounded-md" data-testid={`card-department-${dept.id}`}>
                          <div
                            className="flex items-center justify-between gap-2 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => toggle(collapsedDepartments, dept.id, setCollapsedDepartments)}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {deptOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                              <div className="min-w-0">
                                <div className="font-medium truncate">{dept.name}</div>
                                {dept.description && (
                                  <div className="text-sm text-muted-foreground truncate">{dept.description}</div>
                                )}
                              </div>
                              <Badge variant="outline" className="ml-2 shrink-0">
                                {deptSections.length} section{deptSections.length === 1 ? "" : "s"}
                              </Badge>
                            </div>
                            {canManage && (
                              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <Button variant="outline" size="sm" onClick={() => openCreate("section", dept.id)} data-testid={`button-add-section-${dept.id}`}>
                                  <Plus className="h-4 w-4 mr-1" /> Section
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => openEdit("department", dept)} data-testid={`button-edit-department-${dept.id}`}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => setDeleter({ open: true, level: "department", record: dept })} data-testid={`button-delete-department-${dept.id}`}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            )}
                          </div>
                          {deptOpen && (
                            <div className="px-3 pb-3 space-y-2">
                              {!deptSections.length && (
                                <p className="text-sm text-muted-foreground pl-6">No sections in this department.</p>
                              )}
                              {deptSections.map((section) => (
                                <div
                                  key={section.id}
                                  className="ml-6 flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2"
                                  data-testid={`row-section-${section.id}`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Badge variant="secondary" className="flex items-center gap-1 shrink-0">
                                      {sectionTypeIcon(section.type)}
                                      {section.type}
                                    </Badge>
                                    <div className="min-w-0">
                                      <span className="font-medium truncate">{section.name}</span>
                                      {section.description && (
                                        <span className="text-sm text-muted-foreground ml-2 truncate">
                                          {section.description}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {canManage && (
                                    <div className="flex items-center gap-1 shrink-0">
                                      <Button variant="ghost" size="icon" onClick={() => openEdit("section", section)} data-testid={`button-edit-section-${section.id}`}>
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button variant="ghost" size="icon" onClick={() => setDeleter({ open: true, level: "section", record: section })} data-testid={`button-delete-section-${section.id}`}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={editor.open} onOpenChange={(open) => setEditor((e) => ({ ...e, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editor.record ? `Edit ${LEVEL_LABEL[editor.level]}` : `Add ${LEVEL_LABEL[editor.level]}`}
            </DialogTitle>
            <DialogDescription>
              {editor.level === "branch" && "Top-level organizational branch."}
              {editor.level === "department" && "Department within a branch."}
              {editor.level === "section" && "Lab, office, or core within a department."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Name</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`${LEVEL_LABEL[editor.level]} name`}
                data-testid="input-org-name"
              />
            </div>
            {editor.level === "section" && (
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={sectionType} onValueChange={setSectionType}>
                  <SelectTrigger data-testid="select-section-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="org-description">Description (optional)</Label>
              <Textarea
                id="org-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                data-testid="input-org-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor((e) => ({ ...e, open: false }))}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!name.trim() || saveMutation.isPending}
              data-testid="button-save-org"
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editor.record ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleter.open} onOpenChange={(open) => setDeleter((d) => ({ ...d, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {LEVEL_LABEL[deleter.level].toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete “{deleter.record?.name}”. Deletion is blocked if it still
              has {deleter.level === "branch" ? "departments" : deleter.level === "department" ? "sections or assigned staff" : "assigned staff"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
