import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Scientist } from "@shared/schema";
import { Plus, Search, MoreHorizontal, Mail, Phone, ChevronDown, ChevronUp, ArrowUpDown, Download, Upload, AlertCircle, Loader2 } from "lucide-react";
import { UploadingModal } from "@/components/ui/upload-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { PermissionWrapper } from "@/components/PermissionWrapper";
import { formatFullName, formatNameWithJobTitle } from "@/utils/nameUtils";
import { ScientistAvatar } from "@/components/ScientistAvatar";
import { queryClient, apiRequest, invalidateScientistLists } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ReferencingRecord {
  table: string;
  column: string;
  count: number;
  sampleIds: number[];
}
interface ImportPreview {
  toInsert: any[];
  toUpdate: Array<{ existingId: number; row: any }>;
  toDelete: Array<{ id: number; email: string; name: string; referencedBy?: ReferencingRecord[] }>;
  errors: Array<{ rowNumber: number; identifier: string; errors: string[] }>;
  unchanged: number;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function StaffImportExportButtons() {
  const { toast } = useToast();
  const [importOpen, setImportOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const handleExport = async (format: "xlsx" | "csv") => {
    try {
      const res = await fetch(`/api/scientists/export?format=${format}`);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `staff-export-${stamp}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    }
  };

  const previewMutation = useMutation({
    mutationFn: async (input: { fileBase64: string; fileName: string }) => {
      const res = await apiRequest("POST", "/api/scientists/import/preview", input);
      return res.json() as Promise<ImportPreview>;
    },
    onSuccess: (data) => setPreview(data),
    onError: (err: any) => {
      toast({ title: "Could not read file", description: err.message, variant: "destructive" });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (input: { fileBase64: string; fileName: string }) => {
      const res = await apiRequest("POST", "/api/scientists/import/apply", input);
      return res.json();
    },
    onSuccess: (data: any) => {
      invalidateScientistLists();
      toast({
        title: "Import applied",
        description: `Inserted ${data.inserted}, updated ${data.updated}, deleted ${data.deleted}, unchanged ${data.unchanged}.`,
      });
      resetDialog();
    },
    onError: (err: any) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const resetDialog = () => {
    setImportOpen(false);
    setConfirmOpen(false);
    setFile(null);
    setFileBase64("");
    setPreview(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setPreview(null);
    if (!f) {
      setFile(null);
      setFileBase64("");
      return;
    }
    setFile(f);
    const b64 = await fileToBase64(f);
    setFileBase64(b64);
    previewMutation.mutate({ fileBase64: b64, fileName: f.name });
  };

  const totalChanges = preview
    ? preview.toInsert.length + preview.toUpdate.length + preview.toDelete.length
    : 0;
  const canApply = !!preview && preview.errors.length === 0 && totalChanges > 0;

  return (
    <>
      <UploadingModal
        open={applyMutation.isPending}
        label="Importing staff…"
        sublabel={file?.name}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" data-testid="button-staff-export">
            <Download className="h-4 w-4 mr-2" />
            Export
            <ChevronDown className="h-4 w-4 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleExport("xlsx")} data-testid="menu-export-xlsx">
            Excel (.xlsx)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport("csv")} data-testid="menu-export-csv">
            CSV (.csv)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="outline" onClick={() => setImportOpen(true)} data-testid="button-staff-import">
        <Upload className="h-4 w-4 mr-2" />
        Import
      </Button>

      <Dialog open={importOpen} onOpenChange={(o) => (o ? setImportOpen(true) : resetDialog())}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import staff from file</DialogTitle>
            <DialogDescription>
              Upload an .xlsx or .csv file (typically one previously exported and edited). Staff are matched by{" "}
              <strong>Staff ID</strong> first, then <strong>Email</strong> as a fallback. Rows in the file replace
              the current staff list: matched rows update, new rows insert, and rows missing from the file are
              deleted (if not referenced elsewhere).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              type="file"
              accept=".xlsx,.csv"
              onChange={handleFileChange}
              data-testid="input-import-file"
            />

            {previewMutation.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Parsing file…
              </div>
            )}

            {preview && (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-2 text-sm">
                  <div className="rounded border bg-green-50 border-green-200 p-2 dark:bg-green-950 dark:border-green-800" data-testid="preview-insert-count">
                    <div className="font-semibold text-green-700 dark:text-green-300">Insert</div>
                    <div className="text-2xl">{preview.toInsert.length}</div>
                  </div>
                  <div className="rounded border bg-blue-50 border-blue-200 p-2 dark:bg-blue-950 dark:border-blue-800" data-testid="preview-update-count">
                    <div className="font-semibold text-blue-700 dark:text-blue-300">Update</div>
                    <div className="text-2xl">{preview.toUpdate.length}</div>
                  </div>
                  <div className="rounded border bg-red-50 border-red-200 p-2 dark:bg-red-950 dark:border-red-800" data-testid="preview-delete-count">
                    <div className="font-semibold text-red-700 dark:text-red-300">Delete</div>
                    <div className="text-2xl">{preview.toDelete.length}</div>
                  </div>
                  <div className="rounded border bg-muted p-2" data-testid="preview-unchanged-count">
                    <div className="font-semibold">Unchanged</div>
                    <div className="text-2xl">{preview.unchanged}</div>
                  </div>
                </div>

                {preview.errors.length > 0 && (
                  <div className="rounded border border-red-300 bg-red-50 p-3 dark:border-red-700 dark:bg-red-950">
                    <div className="flex items-center gap-2 font-semibold text-red-700 mb-2 dark:text-red-300">
                      <AlertCircle className="h-4 w-4" />
                      {preview.errors.length} row(s) have validation errors — fix the file and re-upload
                    </div>
                    <ul className="space-y-1 text-sm max-h-40 overflow-y-auto" data-testid="preview-errors">
                      {preview.errors.map((e, i) => (
                        <li key={i} className="text-red-800 dark:text-red-300">
                          <span className="font-mono">Row {e.rowNumber}</span> ({e.identifier}): {e.errors.join("; ")}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {preview.toInsert.length > 0 && (
                  <details className="rounded border border-green-300 bg-green-50 p-3 text-sm dark:border-green-700 dark:bg-green-950">
                    <summary className="font-semibold text-green-800 cursor-pointer dark:text-green-300">
                      {preview.toInsert.length} new staff member(s) to insert
                    </summary>
                    <ul className="mt-2 max-h-40 overflow-y-auto space-y-1 text-green-900 dark:text-green-200" data-testid="preview-insert-list">
                      {preview.toInsert.map((r, i) => (
                        <li key={i}>
                          <span className="font-medium">{r.firstName} {r.lastName}</span>{" "}
                          <span className="text-xs">&lt;{r.email}&gt;</span>
                          {r.staffId && <span className="text-xs ml-1">[ID: {r.staffId}]</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {preview.toUpdate.length > 0 && (
                  <details className="rounded border border-blue-300 bg-blue-50 p-3 text-sm dark:border-blue-700 dark:bg-blue-950">
                    <summary className="font-semibold text-blue-800 cursor-pointer dark:text-blue-300">
                      {preview.toUpdate.length} existing staff member(s) to update
                    </summary>
                    <ul className="mt-2 max-h-40 overflow-y-auto space-y-1 text-blue-900 dark:text-blue-200" data-testid="preview-update-list">
                      {preview.toUpdate.map((u, i) => (
                        <li key={i}>
                          <span className="font-medium">{u.row.firstName} {u.row.lastName}</span>{" "}
                          <span className="text-xs">&lt;{u.row.email}&gt;</span>
                          {u.row.staffId && <span className="text-xs ml-1">[ID: {u.row.staffId}]</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {preview.toDelete.length > 0 && (
                  <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950">
                    <div className="font-semibold text-amber-800 mb-1 dark:text-amber-300">Staff missing from file (will be deleted):</div>
                    <ul className="text-amber-900 max-h-40 overflow-y-auto space-y-1 dark:text-amber-200" data-testid="preview-delete-list">
                      {preview.toDelete.map(d => (
                        <li key={d.id}>
                          <span className="font-medium">{d.name || d.email}</span>
                          {d.referencedBy && d.referencedBy.length > 0 && (
                            <span className="text-red-700 ml-1 dark:text-red-300">
                              — blocked: referenced by{" "}
                              {d.referencedBy
                                .map(r => `${r.table}.${r.column} (${r.count} row${r.count === 1 ? "" : "s"}, ids: ${r.sampleIds.join(", ")}${r.count > r.sampleIds.length ? "…" : ""})`)
                                .join("; ")}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetDialog} data-testid="button-import-cancel">
              Cancel
            </Button>
            <Button
              disabled={!canApply || applyMutation.isPending}
              onClick={() => setConfirmOpen(true)}
              data-testid="button-import-apply"
            >
              {applyMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Applying…
                </>
              ) : (
                `Apply import (${totalChanges} change${totalChanges === 1 ? "" : "s"})`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply staff import?</AlertDialogTitle>
            <AlertDialogDescription>
              This will insert {preview?.toInsert.length ?? 0}, update {preview?.toUpdate.length ?? 0}, and{" "}
              <span className="font-semibold text-red-700 dark:text-red-300">delete {preview?.toDelete.length ?? 0}</span> staff record(s).
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-confirm-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (!file) return;
                setConfirmOpen(false);
                applyMutation.mutate({ fileBase64, fileName: file.name });
              }}
              data-testid="button-confirm-apply"
            >
              Yes, apply import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function StaffList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [sortField, setSortField] = useState<"name" | "department" | "jobTitle" | "activeResearchActivities">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [, navigate] = useLocation();
  const { currentUser } = useCurrentUser();

  const { data: staff, isLoading } = useQuery<(Scientist & { activeResearchActivities?: number })[]>({
    queryKey: ['/api/scientists', { includeActivityCount: true }],
    queryFn: () => fetch('/api/scientists?includeActivityCount=true').then(res => res.json()),
  });

  // Fetch IRB board members
  const { data: irbMembers } = useQuery({
    queryKey: ['/api/irb-board-members'],
    queryFn: () => fetch('/api/irb-board-members').then(res => res.json()),
  });

  // Fetch IBC board members
  const { data: ibcMembers } = useQuery({
    queryKey: ['/api/ibc-board-members'],
    queryFn: () => fetch('/api/ibc-board-members').then(res => res.json()),
  });

  const filteredStaff = staff?.filter(person => {
    const fullName = formatFullName(person).toLowerCase();
    const matchesSearch = fullName.includes(searchQuery.toLowerCase()) ||
                         (person.email?.toLowerCase().includes(searchQuery.toLowerCase())) ||
                         (person.department?.toLowerCase().includes(searchQuery.toLowerCase())) ||
                         (person.staffId?.toLowerCase().includes(searchQuery.toLowerCase()));
    
    if (activeTab === "all") return matchesSearch;
    
    // Filter by staff type
    if (activeTab === "scientific") return matchesSearch && person.staffType === "scientific";
    if (activeTab === "administrative") return matchesSearch && person.staffType === "administrative";
    
    // Filter by job title (legacy support)
    if (activeTab === "management") return matchesSearch && person.jobTitle === "Management";
    if (activeTab === "physician") return matchesSearch && person.jobTitle === "Physician";
    if (activeTab === "investigator") return matchesSearch && person.jobTitle === "Investigator";
    if (activeTab === "staff-scientist") return matchesSearch && person.jobTitle === "Staff Scientist";
    if (activeTab === "research-specialist") return matchesSearch && person.jobTitle === "Research Specialist";
    if (activeTab === "research-assistant") return matchesSearch && person.jobTitle === "Research Assistant";
    if (activeTab === "phd-student") return matchesSearch && person.jobTitle === "PhD Student";
    if (activeTab === "post-doc") return matchesSearch && person.jobTitle === "Post-doctoral Fellow";
    if (activeTab === "lab-manager") return matchesSearch && person.jobTitle === "Lab Manager";
    if (activeTab === "research-associate") return matchesSearch && person.jobTitle === "Research Associate";
    if (activeTab === "officers") return matchesSearch && (person.jobTitle === "IRB Officer" || person.jobTitle === "IBC Officer" || person.jobTitle === "PMO Officer" || person.jobTitle === "Outcome Officer" || person.jobTitle === "Grant Officer");
    
    return matchesSearch;
  });
  
  // Sort staff based on selected sort field and direction
  const sortedStaff = filteredStaff?.sort((a, b) => {
    let fieldA: any, fieldB: any;
    
    if (sortField === 'activeResearchActivities') {
      fieldA = a.activeResearchActivities || 0;
      fieldB = b.activeResearchActivities || 0;
      return sortDirection === 'asc' ? fieldA - fieldB : fieldB - fieldA;
    } else if (sortField === 'name') {
      // Sort by last name, ignoring titles
      const getLastName = (person: any) => {
        return person.lastName ? person.lastName.toLowerCase() : '';
      };
      
      const lastNameA = getLastName(a);
      const lastNameB = getLastName(b);
      const comparison = lastNameA.localeCompare(lastNameB);
      return sortDirection === 'asc' ? comparison : -comparison;
    } else {
      fieldA = a[sortField] || '';
      fieldB = b[sortField] || '';
      
      const comparison = typeof fieldA === 'string' && typeof fieldB === 'string'
        ? fieldA.localeCompare(fieldB)
        : String(fieldA).localeCompare(String(fieldB));
        
      return sortDirection === 'asc' ? comparison : -comparison;
    }
  });

  return (
    <PermissionWrapper currentUserRole={currentUser.role} navigationItem="scientists">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-semibold text-foreground">Staff Directory</h1>
          <div className="flex items-center gap-3">
            <PermissionWrapper
              currentUserRole={currentUser.role}
              navigationItem="scientists"
              requiredPermissions={['canEdit']}
              fallback={null}
            >
              <StaffImportExportButtons />
            </PermissionWrapper>
            <PermissionWrapper
              currentUserRole={currentUser.role}
              navigationItem="scientists"
              requiredPermissions={['canAdd']}
              fallback={null}
            >
              <Link href="/scientists/create">
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="button-add-staff">
                  Add Staff Member
                </Button>
              </Link>
            </PermissionWrapper>
          </div>
        </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle>Staff Directory</CardTitle>
            <div className="flex items-center gap-2">
              {/* Sort Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="flex items-center gap-1" data-testid="button-sort-dropdown">
                    <ArrowUpDown className="h-4 w-4" />
                    Sort by: {sortField === 'name' ? 'Name' : sortField === 'department' ? 'Department' : sortField === 'jobTitle' ? 'Job Title' : 'Active SDRs'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSortField('name')}>
                    Name
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortField('department')}>
                    Department
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortField('jobTitle')}>
                    Job Title
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortField('activeResearchActivities')}>
                    Active SDRs
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Direction Toggle */}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                data-testid="button-sort-direction"
              >
                {sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            
              {/* Search Box */}
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
                <Input
                  type="search"
                  placeholder="Search staff members..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-staff"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" onValueChange={setActiveTab}>
            <div className="mb-4 overflow-x-auto">
              <TabsList className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground overflow-x-auto">
                <TabsTrigger value="all" className="flex-shrink-0">All</TabsTrigger>
                <TabsTrigger value="scientific" className="flex-shrink-0">Scientific Staff</TabsTrigger>
                <TabsTrigger value="administrative" className="flex-shrink-0">Administrative Staff</TabsTrigger>
                <TabsTrigger value="management" className="flex-shrink-0">Management</TabsTrigger>
                <TabsTrigger value="investigator" className="flex-shrink-0">Investigator</TabsTrigger>
                <TabsTrigger value="physician" className="flex-shrink-0">Physician</TabsTrigger>
                <TabsTrigger value="staff-scientist" className="flex-shrink-0">Staff Scientist</TabsTrigger>
                <TabsTrigger value="research-specialist" className="flex-shrink-0">Research Specialist</TabsTrigger>
                <TabsTrigger value="research-associate" className="flex-shrink-0">Research Associate</TabsTrigger>
                <TabsTrigger value="research-assistant" className="flex-shrink-0">Research Assistant</TabsTrigger>
                <TabsTrigger value="phd-student" className="flex-shrink-0">PhD Student</TabsTrigger>
                <TabsTrigger value="post-doc" className="flex-shrink-0">Post-doctoral Fellow</TabsTrigger>
                <TabsTrigger value="lab-manager" className="flex-shrink-0">Lab Manager</TabsTrigger>
                <TabsTrigger value="officers" className="flex-shrink-0">Officers</TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value={activeTab}>
              {isLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 py-2">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <Button 
                          variant="ghost" 
                          className="p-0 h-auto font-bold hover:bg-transparent flex items-center"
                          onClick={() => {
                            if (sortField === 'name') {
                              setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('name');
                              setSortDirection('asc');
                            }
                          }}
                        >
                          Name
                          {sortField === 'name' && (
                            <span className="ml-1">
                              {sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </span>
                          )}
                          {sortField !== 'name' && <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />}
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button 
                          variant="ghost" 
                          className="p-0 h-auto font-bold hover:bg-transparent flex items-center"
                          onClick={() => {
                            if (sortField === 'department') {
                              setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('department');
                              setSortDirection('asc');
                            }
                          }}
                        >
                          Department
                          {sortField === 'department' && (
                            <span className="ml-1">
                              {sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </span>
                          )}
                          {sortField !== 'department' && <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />}
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button 
                          variant="ghost" 
                          className="p-0 h-auto font-bold hover:bg-transparent flex items-center"
                          onClick={() => {
                            if (sortField === 'jobTitle') {
                              setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('jobTitle');
                              setSortDirection('asc');
                            }
                          }}
                        >
                          Job Title
                          {sortField === 'jobTitle' && (
                            <span className="ml-1">
                              {sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </span>
                          )}
                          {sortField !== 'jobTitle' && <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />}
                        </Button>
                      </TableHead>
                      <TableHead>Staff Type</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead className="text-center">Active SDRs</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedStaff?.map((person) => (
                      <TableRow 
                        key={person.id}
                        className="cursor-pointer hover:bg-neutral-50/50 transition-colors"
                        onClick={() => navigate(`/scientists/${person.id}`)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center space-x-3">
                            <ScientistAvatar scientist={person} className="h-8 w-8 text-xs" />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{formatFullName(person)}</span>
                                {person.staffId && (
                                  <Badge variant="outline" className="rounded-sm bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                                    ID: {person.staffId}
                                  </Badge>
                                )}
                                {irbMembers?.find((member: any) => member.scientistId === person.id && member.isActive) && (
                                  <Badge variant="outline" className="rounded-sm bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                                    IRB {irbMembers.find((member: any) => member.scientistId === person.id)?.role === 'chair' ? 'Chair' : 
                                         irbMembers.find((member: any) => member.scientistId === person.id)?.role === 'deputy_chair' ? 'Deputy' : 'Member'}
                                  </Badge>
                                )}
                                {ibcMembers?.find((member: any) => member.scientistId === person.id && member.isActive) && (
                                  <Badge variant="outline" className="rounded-sm bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800">
                                    IBC {ibcMembers.find((member: any) => member.scientistId === person.id)?.role === 'chair' ? 'Chair' : 'Member'}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{person.department || "—"}</TableCell>
                        <TableCell>{person.jobTitle || "No title"}</TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={person.staffType === 'scientific' 
                              ? "rounded-sm bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800" 
                              : "rounded-sm bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
                            }
                          >
                            {person.staffType === 'scientific' ? 'Scientific' : 'Administrative'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2 text-muted-foreground">
                            {person.email && (
                              <a 
                                href={`mailto:${person.email}`} 
                                className="hover:text-primary-500"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Mail className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                            {person.activeResearchActivities || 0}
                          </Badge>
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
                                <Link href={`/scientists/${person.id}`}>
                                  View Details
                                </Link>
                              </DropdownMenuItem>
                              <PermissionWrapper
                                currentUserRole={currentUser.role}
                                navigationItem="scientists"
                                requiredPermissions={['canEdit']}
                                fallback={null}
                              >
                                <DropdownMenuItem asChild>
                                  <Link href={`/scientists/${person.id}/edit`} className="edit-button">
                                    Edit Staff Member
                                  </Link>
                                </DropdownMenuItem>
                              </PermissionWrapper>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                    {sortedStaff?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No staff members found matching your search.
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
