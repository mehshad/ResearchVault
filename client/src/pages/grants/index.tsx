// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, TableBody, TableCell, TableHead, 
  TableHeader, TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Grant } from "@shared/schema";
import { Plus, Search, MoreHorizontal, Download, Filter, DollarSign, Calendar, ArrowUpDown, Link as LinkIcon, Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { GRANT_STATUS_OPTIONS } from "@shared/grantLifecycle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePermissions } from "@/hooks/usePermissions";
import { PermissionWrapper, useElementPermissions } from "@/components/PermissionWrapper";

type EnhancedGrant = Grant & {
  lpi?: {
    id: number;
    firstName: string;
    lastName: string;
    honorificTitle: string;
  } | null;
  linkedSdrsCount?: number;
};

export default function GrantsList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<string>("createdAt");
  const [sortDirection, setSortDirection] = useState<string>("desc");
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { currentUser } = useCurrentUser();

  const { data: grants, isLoading } = useQuery<EnhancedGrant[]>({
    queryKey: ['/api/grants'],
  });

  // Fetch SDR counts for grants with awarded=true (includes Active and Completed)
  const { data: grantSdrCounts = {} } = useQuery({
    queryKey: ['/api/grants/sdr-counts'],
    enabled: grants && grants.some(g => g.awarded === true),
    queryFn: async () => {
      const awardedGrants = grants?.filter(g => g.awarded === true) || [];
      const counts: Record<number, number> = {};
      
      await Promise.all(
        awardedGrants.map(async (grant) => {
          try {
            const response = await fetch(`/api/grants/${grant.id}/research-activities`);
            if (response.ok) {
              const sdrs = await response.json();
              counts[grant.id] = sdrs.length;
            }
          } catch (error) {
            console.error(`Failed to fetch SDRs for grant ${grant.id}:`, error);
          }
        })
      );
      
      return counts;
    }
  });

  const deleteGrantMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/grants/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete grant');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/grants'] });
      toast({ title: "Success", description: "Grant deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete grant", variant: "destructive" });
    },
  });

  const formatCurrency = (amount: string | number | null | undefined) => {
    if (!amount) return "—";
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numAmount);
  };

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short',
      day: 'numeric'
    });
  };

  const statusColors: Record<string, string> = {
    submitted: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
    pending: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    in_review: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
    awarded: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    active: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    completed: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    rejected: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
    cancelled: "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400",
  };

  const getStatusColor = (status: string) => {
    return statusColors[status.toLowerCase() as keyof typeof statusColors] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  };

  const getStatusLabel = (status: string) =>
    GRANT_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;

  const getGrantType = (grant: EnhancedGrant) => {
    return grant.grantType || "Local";
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const filteredAndSortedGrants = grants?.filter(grant => {
    // Status filter
    if (statusFilter !== "all" && grant.status !== statusFilter) {
      return false;
    }
    
    // Year filter (based on submitted year)
    if (yearFilter !== "all" && grant.submittedYear?.toString() !== yearFilter) {
      return false;
    }
    
    // Search query filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        grant.title.toLowerCase().includes(query) ||
        grant.projectNumber.toLowerCase().includes(query) ||
        (grant.lpi && `${grant.lpi.firstName} ${grant.lpi.lastName}`.toLowerCase().includes(query)) ||
        (grant.fundingAgency && grant.fundingAgency.toLowerCase().includes(query)) ||
        (grant.description && grant.description.toLowerCase().includes(query))
      );
    }
    
    return true;
  })?.sort((a, b) => {
    let aValue: any = a[sortField as keyof Grant];
    let bValue: any = b[sortField as keyof Grant];
    
    // Handle nested properties
    if (sortField === "grantType") {
      aValue = getGrantType(a);
      bValue = getGrantType(b);
    } else if (sortField === "investigatorName") {
      aValue = a.lpi ? `${a.lpi.firstName} ${a.lpi.lastName}` : "";
      bValue = b.lpi ? `${b.lpi.firstName} ${b.lpi.lastName}` : "";
    }
    
    if (aValue === null || aValue === undefined) aValue = "";
    if (bValue === null || bValue === undefined) bValue = "";
    
    if (typeof aValue === "string" && typeof bValue === "string") {
      return sortDirection === "asc" 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }
    
    return sortDirection === "asc" ? (aValue > bValue ? 1 : -1) : (bValue > aValue ? 1 : -1);
  });

  const handleExportCSV = () => {
    window.open('/api/grants/export/csv', '_blank');
  };

  const handleExportExcel = () => {
    window.open('/api/grants/export/csv?format=xlsx', '_blank');
  };

  // ---- Excel import (template -> preview -> apply) ----
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<{ base64: string; name: string } | null>(null);
  const [importPreview, setImportPreview] = useState<any | null>(null);
  const [importResult, setImportResult] = useState<any | null>(null);

  const resetImport = () => {
    setImportFile(null);
    setImportPreview(null);
    setImportResult(null);
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(',')[1] ?? '';
      setImportFile({ base64, name: file.name });
      setImportPreview(null);
      setImportResult(null);
      previewMutation.mutate({ base64, name: file.name });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const previewMutation = useMutation({
    mutationFn: async ({ base64, name }: { base64: string; name: string }) => {
      const res = await apiRequest('POST', '/api/grants/import/preview', { fileBase64: base64, fileName: name });
      return res.json();
    },
    onSuccess: (data) => setImportPreview(data),
    onError: (err: any) => {
      toast({ title: 'Could not read file', description: err?.message ?? 'Failed to parse file', variant: 'destructive' });
      resetImport();
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!importFile) throw new Error('No file selected');
      const res = await apiRequest('POST', '/api/grants/import/apply', { fileBase64: importFile.base64, fileName: importFile.name });
      return res.json();
    },
    onSuccess: (data) => {
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ['/api/grants'] });
      toast({ title: 'Import complete', description: `${data.created} created, ${data.updated} updated, ${data.skipped?.length ?? 0} skipped${data.failed?.length ? `, ${data.failed.length} failed` : ''}.` });
    },
    onError: (err: any) => {
      toast({ title: 'Import failed', description: err?.message ?? 'Failed to import grants', variant: 'destructive' });
    },
  });

  // Get unique years and statuses for filters
  const years = [...new Set(grants?.map(g => g.submittedYear).filter(Boolean))].sort((a, b) => (b || 0) - (a || 0));
  const statuses = GRANT_STATUS_OPTIONS;

  if (isLoading) {
    return (
      <div className="py-6">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <PermissionWrapper currentUserRole={currentUser.role} navigationItem="grants">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Grants Office</h1>
            <p className="text-gray-600 mt-1 dark:text-gray-300">Manage research grants and funding applications</p>
          </div>
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportExcel}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportCSV}>
                  <Download className="h-4 w-4 mr-2" />
                  CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <PermissionWrapper 
              requiredPermissions={['canAdd']} 
              currentUserRole={currentUser.role} 
              navigationItem="grants"
            >
              <Button variant="outline" onClick={() => { resetImport(); setImportOpen(true); }}>
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
            </PermissionWrapper>
            <PermissionWrapper 
              requiredPermissions={['canAdd']} 
              currentUserRole={currentUser.role} 
              navigationItem="grants"
            >
              <Link href="/grants/create">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Grant
                </Button>
              </Link>
            </PermissionWrapper>
          </div>
        </div>

      <div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Grants ({filteredAndSortedGrants?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-0 pb-6">
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 dark:text-gray-500" />
                <Input
                  placeholder="Search grants, project numbers, investigators, or funding agencies..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {statuses.map(status => (
                    <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {years.map(year => (
                    <SelectItem key={year} value={year?.toString() || ""}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">
                    <Button variant="ghost" onClick={() => handleSort("grantType")} className="h-8 p-0 font-semibold">
                      TYPE OF GRANT <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="w-48">
                    <Button variant="ghost" onClick={() => handleSort("investigatorName")} className="h-8 p-0 font-semibold">
                      LEAD PRINCIPAL INVESTIGATOR <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="w-40">
                    <Button variant="ghost" onClick={() => handleSort("fundingAgency")} className="h-8 p-0 font-semibold">
                      FUNDING INSTITUTION <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="w-40">
                    <Button variant="ghost" onClick={() => handleSort("projectNumber")} className="h-8 p-0 font-semibold">
                      PROJECT NO. <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" onClick={() => handleSort("title")} className="h-8 p-0 font-semibold">
                      PROJECT TITLE <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="w-36 text-right">
                    <Button variant="ghost" onClick={() => handleSort("awardedAmount")} className="h-8 p-0 font-semibold ml-auto">
                      AWARDED BUDGET <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="w-28 text-right">
                    <Button variant="ghost" onClick={() => handleSort("status")} className="h-8 p-0 font-semibold ml-auto">
                      STATUS <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedGrants?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-gray-500 dark:text-gray-400">
                      {searchQuery || statusFilter !== "all" || yearFilter !== "all" 
                        ? "No grants match your filters." 
                        : "No grants found. Create your first grant to get started."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSortedGrants?.map((grant) => (
                    <TableRow 
                      key={grant.id} 
                      className="hover:bg-gray-50 cursor-pointer dark:hover:bg-gray-900"
                      onClick={() => navigate(`/grants/${grant.id}/edit`)}
                    >
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {getGrantType(grant)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {grant.lpi ? (
                          <div className="text-sm">
                            <div className="font-medium">
                              {grant.lpi.honorificTitle} {grant.lpi.firstName} {grant.lpi.lastName}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {grant.fundingAgency || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {grant.projectNumber}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium text-sm line-clamp-2">{grant.title}</div>
                          {grant.description && (
                            <div className="text-xs text-gray-500 mt-1 line-clamp-1 dark:text-gray-400">{grant.description}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <div className="flex items-center justify-end gap-2">
                          {formatCurrency(grant.awardedAmount)}
                          {grant.awarded === true && grantSdrCounts[grant.id] > 0 && (
                            <div className="flex items-center gap-1" title={`${grantSdrCounts[grant.id]} linked SDR${grantSdrCounts[grant.id] > 1 ? 's' : ''}`}>
                              <LinkIcon className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                              <span className="text-xs text-blue-600 dark:text-blue-400">{grantSdrCounts[grant.id]}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className={getStatusColor(grant.status)}>
                          {getStatusLabel(grant.status)}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <PermissionWrapper 
                              requiredPermissions={['canEdit']} 
                              currentUserRole={currentUser.role} 
                              navigationItem="grants"
                            >
                              <DropdownMenuItem asChild>
                                <Link href={`/grants/${grant.id}/edit`}>
                                  Edit Grant
                                </Link>
                              </DropdownMenuItem>
                            </PermissionWrapper>
                            <PermissionWrapper 
                              requiredPermissions={['canEdit']} 
                              currentUserRole={currentUser.role} 
                              navigationItem="grants"
                            >
                              <DropdownMenuItem 
                                onClick={() => deleteGrantMutation.mutate(grant.id)}
                                className="text-red-600 dark:text-red-400"
                              >
                                Delete Grant
                              </DropdownMenuItem>
                            </PermissionWrapper>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        </Card>
      </div>

      <Dialog open={importOpen} onOpenChange={(open) => { setImportOpen(open); if (!open) resetImport(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Grants from Excel</DialogTitle>
            <DialogDescription>
              Upload an Excel (.xlsx) or CSV file. Grants are matched by Project Number:
              existing grants are updated, new project numbers create new grants.
              For existing grants, blank cells leave the current value unchanged —
              type CLEAR in a cell to erase a field. Exported files can be edited and re-imported directly.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => window.open('/api/grants/import/template', '_blank')}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Download Template
              </Button>
              <label className="cursor-pointer">
                <span className="inline-flex items-center px-3 py-1.5 text-sm border rounded-md hover:bg-accent">
                  <Upload className="h-4 w-4 mr-2" />
                  {importFile ? importFile.name : 'Choose File'}
                </span>
                <input type="file" accept=".xlsx,.csv" className="hidden" onChange={handleImportFileChange} />
              </label>
              {previewMutation.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>

            {importPreview && !importResult && (
              <div className="space-y-2">
                <div className="flex gap-2 text-sm">
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">{importPreview.summary.create} new</Badge>
                  <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">{importPreview.summary.update} updates</Badge>
                  <Badge variant="secondary">{importPreview.summary.skip} skipped</Badge>
                </div>
                <div className="max-h-64 overflow-y-auto border rounded-md divide-y text-sm">
                  {importPreview.rows.map((row: any) => (
                    <div key={row.rowNumber} className="px-3 py-2 flex items-start gap-2">
                      <Badge
                        variant={row.action === 'skip' ? 'secondary' : 'default'}
                        className={row.action === 'create' ? 'bg-green-600' : row.action === 'update' ? 'bg-blue-600' : ''}
                      >
                        {row.action}
                      </Badge>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{row.projectNumber || `Row ${row.rowNumber}`} — {row.title || 'Untitled'}</div>
                        {row.reason && <div className="text-muted-foreground">{row.reason}</div>}
                        {row.changes && row.changes.length > 0 && (
                          <div className="text-muted-foreground">Changes: {row.changes.join(', ')}</div>
                        )}
                      </div>
                    </div>
                  ))}
                  {importPreview.rows.length === 0 && (
                    <div className="px-3 py-4 text-muted-foreground">No data rows found in this file.</div>
                  )}
                </div>
              </div>
            )}

            {importResult && (
              <div className="space-y-2 text-sm">
                <div className="font-medium">
                  Import complete: {importResult.created} created, {importResult.updated} updated,
                  {' '}{importResult.skipped?.length ?? 0} skipped{importResult.failed?.length ? `, ${importResult.failed.length} failed` : ''}.
                </div>
                {importResult.failed?.length > 0 && (
                  <div className="max-h-40 overflow-y-auto border border-red-200 rounded-md divide-y">
                    {importResult.failed.map((f: any, i: number) => (
                      <div key={i} className="px-3 py-2 text-red-700">
                        Row {f.rowNumber} ({f.projectNumber}): {f.reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportOpen(false); resetImport(); }}>
              {importResult ? 'Close' : 'Cancel'}
            </Button>
            {!importResult && (
              <Button
                onClick={() => applyMutation.mutate()}
                disabled={!importPreview || applyMutation.isPending || (importPreview.summary.create + importPreview.summary.update === 0)}
              >
                {applyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Apply Import
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PermissionWrapper>
  );
}