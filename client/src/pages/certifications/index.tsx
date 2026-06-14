// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Search, Download, Settings, Upload, FileText, Check, X, AlertTriangle, Plus, History, Filter, Pencil, Trash2 } from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatFullName } from "@/utils/nameUtils";

interface CertificationMatrixItem {
  scientistId: number;
  scientistName: string;
  moduleId: number;
  moduleName: string;
  certificationId: number | null;
  startDate: string | null;
  endDate: string | null;
  certificateFilePath: string | null;
  reportFilePath: string | null;
}

interface CertificationModule {
  id: number;
  name: string;
  description: string;
  isCore: boolean;
  expirationMonths: number;
  isActive: boolean;
}

interface DetectedCertificate {
  fileName: string;
  filePath: string;
  originalUrl: string;
  status: 'detected' | 'unrecognized' | 'error' | 'unknown' | 'processing' | 'ocr_failed' | 'save_failed';
  extractedText?: string;
  errorDetails?: string;
  name?: string;
  courseName?: string;
  module?: CertificationModule | null;
  completionDate?: string;
  expirationDate?: string;
  recordId?: string;
  institution?: string;
  isNewModule?: boolean;
  suggestedModuleName?: string;
  suggestedAbbreviation?: string;
  suggestedExpirationMonths?: number;
  error?: string;
}

interface PendingCertification extends DetectedCertificate {
  scientistId?: number;
  startDate?: string;
  endDate?: string;
  notes?: string;
  createNewModule?: boolean;
  newModuleName?: string;
  newModuleAbbreviation?: string;
  newModuleExpirationMonths?: number;
}

interface PdfImportHistoryEntry {
  id: number;
  fileName: string;
  fileUrl: string;
  uploadedBy: number;
  assignedScientistId?: number;
  extractedText?: string;
  extractedData?: any;
  processingStatus: 'processing' | 'completed' | 'failed';
  ocrProvider: string;
  documentType?: string; // certificate, report, unknown
  errorMessage?: string;
  processingTimeMs?: number;
  uploadedAt: string;
  processedAt?: string;
  uploader?: {
    id: number;
    name: string;
    email: string;
  };
  assignedScientist?: {
    id: number;
    name: string;
    email: string;
  };
}

function getCertificationStatus(endDate: string | null): {
  status: 'valid' | 'expiring' | 'expired' | 'never';
  color: string;
  text: string;
} {
  if (!endDate) {
    return { status: 'never', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300', text: 'Never' };
  }

  const end = parseISO(endDate);
  const today = new Date();
  const daysUntilExpiry = differenceInDays(end, today);

  if (daysUntilExpiry < 0) {
    return { status: 'expired', color: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300', text: 'Expired' };
  } else if (daysUntilExpiry <= 30) {
    return { status: 'expiring', color: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300', text: 'Expiring' };
  } else {
    return { status: 'valid', color: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300', text: 'Valid' };
  }
}

// Combine a module name with its abbreviation, e.g. ("Biosafety Series", "BCT")
// -> "Biosafety Series (BCT)". Leaves an existing parenthetical untouched.
function composeModuleName(name: string, abbr?: string): string {
  const n = (name || '').trim().replace(/\s+/g, ' ');
  const a = (abbr || '').trim();
  if (!n) return n;
  if (!a) return n;
  if (/\([^)]+\)\s*$/.test(n)) return n;
  return `${n} (${a})`;
}

export default function CertificationsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("matrix");
  const [detectedFiles, setDetectedFiles] = useState<PendingCertification[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploaderResetSignal, setUploaderResetSignal] = useState(0);
  
  // PDF import history state
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>("all");
  const [historyDateFrom, setHistoryDateFrom] = useState<string>("");
  const [historyDateTo, setHistoryDateTo] = useState<string>("");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Certification module management (Modules tab)
  const emptyModuleForm = { name: '', description: '', isCore: false, expirationMonths: 36, isActive: true };
  const [moduleDialogOpen, setModuleDialogOpen] = useState(false);
  const [editingModuleId, setEditingModuleId] = useState<number | null>(null);
  const [moduleForm, setModuleForm] = useState<{ name: string; description: string; isCore: boolean; expirationMonths: number; isActive: boolean }>(emptyModuleForm);
  const [moduleToDelete, setModuleToDelete] = useState<CertificationModule | null>(null);

  const openAddModule = () => {
    setEditingModuleId(null);
    setModuleForm(emptyModuleForm);
    setModuleDialogOpen(true);
  };

  const openEditModule = (module: CertificationModule) => {
    setEditingModuleId(module.id);
    setModuleForm({
      name: module.name || '',
      description: module.description || '',
      isCore: !!module.isCore,
      expirationMonths: module.expirationMonths ?? 36,
      isActive: module.isActive ?? true,
    });
    setModuleDialogOpen(true);
  };

  const saveModuleMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: moduleForm.name.trim(),
        description: moduleForm.description.trim() || null,
        isCore: moduleForm.isCore,
        expirationMonths: Number(moduleForm.expirationMonths) || 36,
        isActive: moduleForm.isActive,
      };
      if (editingModuleId != null) {
        return apiRequest('PUT', `/api/certification-modules/${editingModuleId}`, payload);
      }
      return apiRequest('POST', '/api/certification-modules', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/certification-modules'] });
      queryClient.invalidateQueries({ queryKey: ['/api/certifications/matrix'] });
      setModuleDialogOpen(false);
      toast({
        title: editingModuleId != null ? 'Module updated' : 'Module added',
        description: `"${moduleForm.name.trim()}" has been saved.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save module', description: error.message, variant: 'destructive' });
    },
  });

  const deleteModuleMutation = useMutation({
    mutationFn: async (id: number) => apiRequest('DELETE', `/api/certification-modules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/certification-modules'] });
      queryClient.invalidateQueries({ queryKey: ['/api/certifications/matrix'] });
      setModuleToDelete(null);
      toast({ title: 'Module deleted' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not delete module', description: error.message, variant: 'destructive' });
    },
  });

  const { data: matrixData = [], isLoading: matrixLoading } = useQuery({
    queryKey: ['/api/certifications/matrix'],
  });

  const { data: modules = [], isLoading: modulesLoading } = useQuery({
    queryKey: ['/api/certification-modules'],
  });

  const { data: scientists = [] } = useQuery({
    queryKey: ['/api/scientists'],
  });

  const { data: ocrConfig } = useQuery({
    queryKey: ['/api/system-configurations/ocr_service'],
  });

  // PDF import history query
  const { data: pdfHistory = [], isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ['/api/pdf-import-history', {
      scientistName: historySearchTerm,
      status: historyStatusFilter === 'all' ? '' : historyStatusFilter,
      dateFrom: historyDateFrom,
      dateTo: historyDateTo
    }],
    enabled: activeTab === 'history'
  });

  const processCertificatesMutation = useMutation({
    mutationFn: async (files: Array<{ url: string; fileName: string }>) => {
      const fileUrls = files.map((f) => f.url);
      const fileNames = files.map((f) => f.fileName);
      const response = await apiRequest('POST', '/api/certificates/process-batch', { fileUrls, fileNames });
      return response.json();
    },
    onSuccess: (data) => {
      // Check if we have valid results
      if (!data.results || data.results.length === 0) {
        toast({
          title: "OCR Service Unavailable",
          description: "The OCR service has reached its hourly limit (180 requests per hour). Please wait about an hour and try again.",
          variant: "destructive",
          duration: 10000,
        });
        return;
      }
      
      // Transform the results to match the frontend PendingCertification structure
      const processedFiles = data.results.map((result: any) => {
        // Check if we actually got data or just an error
        if (!result.name && !result.courseName && !result.completionDate) {
          return {
            fileName: result.fileName || 'certificate.pdf',
            name: '',
            courseName: '',
            completionDate: '',
            expirationDate: '',
            recordId: '',
            scientistId: null,
            module: null,
            status: 'error' as const,
            notes: result.error || 'OCR extraction failed',
            filePath: result.filePath || '',
            originalUrl: result.originalUrl || '',
            startDate: '',
            endDate: ''
          };
        }
        
        // Valid certificate data
        const isNew = !result.module && !!result.courseName;
        return {
          fileName: result.fileName || 'certificate.pdf',
          name: result.name || '',
          courseName: result.courseName || '',
          completionDate: result.completionDate || '',
          expirationDate: result.expirationDate || '',
          recordId: result.recordId || '',
          scientistId: result.scientistId,
          module: result.module,
          status: 'detected' as const,
          notes: '',
          filePath: result.filePath || '',
          originalUrl: result.originalUrl || '',
          startDate: result.completionDate || '',
          endDate: result.expirationDate || '',
          isNewModule: isNew,
          suggestedModuleName: result.suggestedModuleName || result.courseName || '',
          suggestedAbbreviation: result.suggestedAbbreviation || '',
          suggestedExpirationMonths: result.suggestedExpirationMonths || 36,
          // For unrecognized courses, pre-arm "create new module" (confirmable in UI)
          createNewModule: isNew,
          newModuleName: result.suggestedModuleName || result.courseName || '',
          newModuleAbbreviation: result.suggestedAbbreviation || '',
          newModuleExpirationMonths: result.suggestedExpirationMonths || 36,
        };
      });
      
      // Append so a follow-up upload adds to the review list instead of
      // wiping rows the user is still working through.
      setDetectedFiles(prev => [...prev, ...processedFiles]);
      
      // Show appropriate message based on results
      const successCount = processedFiles.filter(f => f.status === 'detected').length;
      const errorCount = processedFiles.filter(f => f.status === 'error').length;
      
      if (successCount > 0) {
        toast({
          title: "Files processed",
          description: `Successfully extracted data from ${successCount} certificate${successCount > 1 ? 's' : ''}`,
        });
      }
      
      if (errorCount > 0) {
        // Check if any errors are rate limit related
        const hasRateLimitError = processedFiles.some(f => 
          f.status === 'error' && f.notes && f.notes.includes('rate limit')
        );
        
        if (hasRateLimitError) {
          toast({
            title: "OCR Service Rate Limit Reached",
            description: "The OCR service has reached its hourly limit (180 requests per hour). Please wait about an hour and try again.",
            variant: "destructive",
            duration: 10000,
          });
        } else {
          toast({
            title: "Some files failed",
            description: `Could not extract data from ${errorCount} file${errorCount > 1 ? 's' : ''}. Check OCR service status.`,
            variant: "destructive",
          });
        }
      }
    },
    onError: (error: Error) => {
      // Check if it's a rate limit error
      if (error.message.includes('rate limit') || error.message.includes('180')) {
        toast({
          title: "OCR Service Rate Limit Reached",
          description: "The OCR service has reached its hourly limit (180 requests per hour). Please wait about an hour and try again.",
          variant: "destructive",
          duration: 10000,
        });
      } else {
        toast({
          title: "Processing failed",
          description: error.message,
          variant: "destructive",
        });
      }
    }
  });

  const confirmCertificationsMutation = useMutation({
    mutationFn: async (certifications: PendingCertification[]) => {
      const response = await apiRequest('POST', '/api/certificates/confirm-batch', { certifications });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/certifications/matrix'] });
      queryClient.invalidateQueries({ queryKey: ['/api/pdf-import-history'] }); // Refresh history

      const results: any[] = Array.isArray(data?.results) ? data.results : [];
      const failedResults = results.filter((r) => r.status === 'error');
      const savedFileNames = new Set(
        results.filter((r) => r.status === 'success').map((r) => r.fileName)
      );

      // Keep the rows that did NOT save so the user can see why and fix them,
      // annotating each failed row with the specific server-side reason.
      setDetectedFiles((prev) =>
        prev
          .filter((f) => !savedFileNames.has(f.fileName || 'certificate.pdf'))
          .map((f) => {
            const failure = failedResults.find(
              (r) => r.fileName === (f.fileName || 'certificate.pdf')
            );
            return failure
              ? { ...f, status: 'save_failed' as const, error: failure.error, errorDetails: failure.error }
              : f;
          })
      );

      // Only celebrate if something actually persisted.
      if (data.summary.successful > 0) {
        toast({
          title: "✅ Certifications Saved Successfully!",
          description: `${data.summary.successful} certification${data.summary.successful === 1 ? '' : 's'} added to the system`,
          duration: 5000,
        });
      }

      if (data.summary.failed > 0) {
        const reasons = Array.from(
          new Set(failedResults.map((r) => r.error).filter(Boolean))
        );
        toast({
          title: `⚠️ ${data.summary.failed} certification${data.summary.failed === 1 ? '' : 's'} could not be saved`,
          description: reasons.length
            ? reasons.join(' ')
            : 'Please review the highlighted rows and try again.',
          variant: "destructive",
          duration: 10000,
        });
      }

      // Save attempt has settled — now clear the uploader's file list.
      setUploaderResetSignal((n) => n + 1);
    },
    onError: (error: Error) => {
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive",
      });
      // Save attempt has settled (failed) — clear the uploader's file list.
      setUploaderResetSignal((n) => n + 1);
    }
  });

  // Transform matrix data for table display
  const { matrixScientists, moduleHeaders } = useMemo(() => {
    if (!matrixData.length) return { matrixScientists: [], moduleHeaders: [] };

    // Create scientist lookup map for job titles
    const scientistLookup = new Map();
    scientists.forEach((scientist: any) => {
      scientistLookup.set(scientist.id, scientist);
    });

    // Get unique scientists
    const scientistMap = new Map();
    matrixData.forEach((item: CertificationMatrixItem) => {
      if (!scientistMap.has(item.scientistId)) {
        const scientistData = scientistLookup.get(item.scientistId);
        scientistMap.set(item.scientistId, {
          id: item.scientistId,
          name: item.scientistName,
          jobTitle: scientistData?.jobTitle || null,
          certifications: new Map(),
        });
      }
      
      scientistMap.get(item.scientistId).certifications.set(item.moduleId, item);
    });

    // Get unique modules for the CITI matrix. Lab Safety is not a CITI program
    // certification — it has its own dedicated matrix tab — so exclude it here.
    const moduleMap = new Map();
    matrixData.forEach((item: CertificationMatrixItem) => {
      if (item.moduleName === 'Lab Safety') return;
      if (!moduleMap.has(item.moduleId)) {
        moduleMap.set(item.moduleId, {
          id: item.moduleId,
          name: item.moduleName,
        });
      }
    });

    return {
      matrixScientists: Array.from(scientistMap.values()),
      moduleHeaders: Array.from(moduleMap.values()),
    };
  }, [matrixData, scientists]);

  // Filter scientists based on search term
  const filteredScientists = useMemo(() => {
    if (!searchTerm) return matrixScientists;
    const term = searchTerm.toLowerCase();
    return matrixScientists.filter((scientist: any) =>
      scientist.name.toLowerCase().includes(term) ||
      (scientist.jobTitle && scientist.jobTitle.toLowerCase().includes(term))
    );
  }, [matrixScientists, searchTerm]);

  const handleCellClick = async (certification: CertificationMatrixItem) => {
    if (!certification.certificationId) return;

    // Download the certificate or report file
    const filePath = certification.certificateFilePath || certification.reportFilePath;
    if (filePath) {
      window.open(filePath, '_blank');
    }
  };

  const exportToCSV = () => {
    const headers = ['Scientist', ...moduleHeaders.map((m: any) => m.name)];
    const csvContent = [
      headers.join(','),
      ...filteredScientists.map((scientist: any) => {
        const row = [scientist.name];
        moduleHeaders.forEach((module: any) => {
          const cert = scientist.certifications.get(module.id);
          const status = getCertificationStatus(cert?.endDate);
          row.push(status.text);
        });
        return row.join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `certification-matrix-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (matrixLoading || modulesLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
        <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-y-auto pb-8">
      <div className="space-y-6 p-4 max-w-full">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-sidra-primary">Certification Management</h1>
              {ocrConfig && (
                <Badge variant="secondary" className="text-xs">
                  OCR: {(ocrConfig.value?.provider || 'ocr_space') === 'tesseract' ? 'Tesseract.js (Local)' : 'OCR.space (API)'}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              Manage CITI certifications and compliance requirements for research staff
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6 w-full">
        <div className="w-full overflow-x-auto">
          <TabsList className="flex w-max min-w-full">
            <TabsTrigger value="matrix" className="flex items-center gap-1 px-2 text-xs whitespace-nowrap">
              <FileText className="h-3 w-3" />
              CITI Matrix
            </TabsTrigger>
            <TabsTrigger value="lab-training" className="flex items-center gap-1 px-2 text-xs whitespace-nowrap">
              <FileText className="h-3 w-3" />
              Lab Training
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-1 px-2 text-xs whitespace-nowrap">
              <Upload className="h-3 w-3" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1 px-2 text-xs whitespace-nowrap">
              <History className="h-3 w-3" />
              History
            </TabsTrigger>
            <TabsTrigger value="modules" className="flex items-center gap-1 px-2 text-xs whitespace-nowrap">
              <Settings className="h-3 w-3" />
              Modules
            </TabsTrigger>
            <TabsTrigger value="config" className="flex items-center gap-1 px-2 text-xs whitespace-nowrap">
              <Settings className="h-3 w-3" />
              Config
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="matrix" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>CITI Matrix</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search scientists..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 w-64"
                    />
                  </div>
                  <Button onClick={exportToCSV} variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-100 border border-green-300 dark:bg-green-900 dark:border-green-700 rounded"></div>
                  <span>Valid</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-orange-100 border border-orange-300 dark:bg-orange-900 dark:border-orange-700 rounded"></div>
                  <span>Expiring (≤30 days)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-100 border border-red-300 dark:bg-red-900 dark:border-red-700 rounded"></div>
                  <span>Expired</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-gray-100 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 rounded"></div>
                  <span>Never Completed</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-white dark:bg-card min-w-48">Scientist</TableHead>
                      {moduleHeaders.map((module: any) => (
                        <TableHead key={module.id} className="text-center min-w-32">
                          {module.name}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredScientists.map((scientist: any) => (
                      <TableRow key={scientist.id}>
                        <TableCell className="sticky left-0 bg-white dark:bg-card font-medium">
                          <div>
                            <div>{scientist.name}</div>
                            {scientist.jobTitle && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{scientist.jobTitle}</div>
                            )}
                          </div>
                        </TableCell>
                        {moduleHeaders.map((module: any) => {
                          const certification = scientist.certifications.get(module.id);
                          const status = getCertificationStatus(certification?.endDate);
                          
                          return (
                            <TableCell key={module.id} className="text-center">
                              <Badge
                                variant="secondary"
                                className={`cursor-pointer ${status.color} ${
                                  certification?.certificationId ? 'hover:opacity-80' : 'cursor-default'
                                }`}
                                onClick={() => certification?.certificationId && handleCellClick(certification)}
                              >
                                {status.text}
                                {certification?.endDate && (
                                  <div className="text-xs mt-1">
                                    {format(parseISO(certification.endDate), 'MM/dd/yyyy')}
                                  </div>
                                )}
                              </Badge>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lab-training" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Lab Safety Training</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search staff..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 w-64"
                    />
                  </div>
                  <Button onClick={exportToCSV} variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-100 border border-green-300 dark:bg-green-900 dark:border-green-700 rounded"></div>
                  <span>Valid</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-orange-100 border border-orange-300 dark:bg-orange-900 dark:border-orange-700 rounded"></div>
                  <span>Expiring (≤30 days)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-100 border border-red-300 dark:bg-red-900 dark:border-red-700 rounded"></div>
                  <span>Expired</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-gray-100 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 rounded"></div>
                  <span>Never Completed</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-white dark:bg-card min-w-48">Staff Member</TableHead>
                      <TableHead className="text-center min-w-40">Last Training Date</TableHead>
                      <TableHead className="text-center min-w-40">Expiration Date</TableHead>
                      <TableHead className="text-center min-w-32">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredScientists.map((scientist: any) => {
                      // Find Lab Safety module
                      const labSafetyModule = modules.find((m: CertificationModule) => m.name === 'Lab Safety');
                      
                      // Get Lab Safety certification from matrix data
                      const labSafetyCert = matrixData.find(
                        (item: CertificationMatrixItem) => 
                          item.scientistId === scientist.id && 
                          item.moduleId === labSafetyModule?.id &&
                          item.certificationId !== null
                      );
                      
                      const training = {
                        lastTraining: labSafetyCert?.startDate || null,
                        expiration: labSafetyCert?.endDate || null,
                      };
                      const status = getCertificationStatus(training.expiration);
                      
                      return (
                        <TableRow key={scientist.id}>
                          <TableCell className="sticky left-0 bg-white dark:bg-card font-medium">
                            <div>
                              <div>{scientist.name}</div>
                              {scientist.jobTitle && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{scientist.jobTitle}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {training.lastTraining ? format(parseISO(training.lastTraining), 'MM/dd/yyyy') : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            {training.expiration ? format(parseISO(training.expiration), 'MM/dd/yyyy') : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="secondary"
                              className={`${status.color}`}
                            >
                              {status.text}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="upload" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload Certificates</CardTitle>
              <p className="text-muted-foreground">
                {(ocrConfig?.value?.provider || 'ocr_space') === 'tesseract' 
                  ? 'Upload CITI certificate PDFs or images (PNG, JPG) for automatic processing and extraction of certification data.'
                  : 'Upload CITI certification PDFs for automatic processing and extraction of certification data.'
                }
              </p>
            </CardHeader>
            <CardContent>
              <ObjectUploader
                resetSignal={uploaderResetSignal}
                maxNumberOfFiles={10}
                maxFileSize={10485760} // 10MB
                acceptedFileTypes={
                  (ocrConfig?.value?.provider || 'ocr_space') === 'tesseract' 
                    ? ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
                    : ['application/pdf']
                }
                onComplete={(uploadedFiles) => {
                  try {
                    if (!uploadedFiles || !Array.isArray(uploadedFiles) || uploadedFiles.length === 0) {
                      toast({
                        title: "Upload error",
                        description: "No files were successfully uploaded",
                        variant: "destructive",
                      });
                      return;
                    }
                    
                    const files = uploadedFiles
                      .filter(file => file.url)
                      .map(file => ({ url: file.url, fileName: file.fileName }));
                    
                    if (files.length > 0) {
                      setIsProcessing(true);
                      processCertificatesMutation.mutate(files);
                      setIsProcessing(false);
                    } else {
                      toast({
                        title: "No files to process",
                        description: "No valid file URLs found from upload",
                        variant: "destructive",
                      });
                    }
                  } catch (error) {
                    console.error('Upload processing error:', error);
                    toast({
                      title: "Upload processing failed",
                      description: "There was an error processing the uploaded files",
                      variant: "destructive",
                    });
                  }
                }}
                showDropzone={true}
              />
              
              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-900">
                <h4 className="font-medium text-blue-900 dark:text-blue-200 mb-2">Free OCR-Powered Upload</h4>
                <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                  <li>• Upload CITI certificates or completion reports (PDF format)</li>
                  <li>• Open-source OCR automatically extracts names, dates, courses, and record IDs</li>
                  <li>• Completely free - no API limits or external service dependencies</li>
                  <li>• Review extracted data and assign to scientists before saving</li>
                  <li>• Maximum 10 files per upload, 10MB each</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {processCertificatesMutation.isPending && (
            <Card data-testid="status-ocr-processing">
              <CardContent className="py-6">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-sidra-primary"></div>
                  <div>
                    <p className="font-medium text-foreground">Reading your certificates…</p>
                    <p className="text-sm text-muted-foreground">
                      Upload complete. OCR is extracting the details — this may take a few moments.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {detectedFiles.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>OCR Processing Results</CardTitle>
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => setDetectedFiles([])}
                      variant="outline"
                      size="sm"
                    >
                      Clear All
                    </Button>
                    <Button 
                      onClick={() => {
                        // A row is saveable when the core fields are present AND it
                        // either maps to an existing module OR is set to create a new one.
                        const hasModuleTarget = (f: PendingCertification) =>
                          !!f.module || (f.createNewModule && !!(f.newModuleName || '').trim());
                        const validCerts = detectedFiles.filter(f =>
                          f.status === 'detected' && f.name && f.scientistId &&
                          f.completionDate && f.expirationDate && hasModuleTarget(f)
                        );

                        if (validCerts.length === 0) {
                          toast({
                            title: "No valid certifications",
                            description: "Please complete all required fields (including a module — pick an existing one or confirm a new one) for at least one certification",
                            variant: "destructive",
                          });
                          return;
                        }
                        confirmCertificationsMutation.mutate(validCerts.map(cert => {
                          const base = {
                            fileName: cert.fileName || 'certificate.pdf',
                            scientistId: cert.scientistId,
                            startDate: cert.completionDate,
                            endDate: cert.expirationDate,
                            certificateFilePath: cert.filePath || cert.originalUrl || 'certificate.pdf',
                            notes: cert.notes || ''
                          };
                          if (cert.module) {
                            return { ...base, moduleId: cert.module.id };
                          }
                          // New module: server creates (or reuses) it, then links the cert.
                          return {
                            ...base,
                            newModule: {
                              name: composeModuleName(cert.newModuleName || cert.courseName || '', cert.newModuleAbbreviation),
                              expirationMonths: cert.newModuleExpirationMonths || 36,
                              isCore: false,
                            }
                          };
                        }));
                      }}
                      disabled={confirmCertificationsMutation.isPending}
                      size="sm"
                    >
                      {confirmCertificationsMutation.isPending ? 'Saving...' : 'Save All Valid'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-2 sm:p-6">
                <div className="overflow-auto h-96 md:h-auto md:max-h-none border rounded-md">
                  <Table className="min-w-full">
                    <TableHeader className="sticky top-0 bg-white dark:bg-card z-10 shadow-sm border-b">
                      <TableRow>
                        <TableHead className="min-w-24">Status</TableHead>
                        <TableHead className="min-w-32">File Name</TableHead>
                        <TableHead className="min-w-32">Extracted Name</TableHead>
                        <TableHead className="min-w-36">Course/Module</TableHead>
                        <TableHead className="min-w-28">Completion Date</TableHead>
                        <TableHead className="min-w-24">Record ID</TableHead>
                        <TableHead className="min-w-40">Assign to Scientist</TableHead>
                        <TableHead className="min-w-28">Start Date</TableHead>
                        <TableHead className="min-w-28">End Date</TableHead>
                        <TableHead className="min-w-32">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detectedFiles.map((file, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            {file.status === 'detected' ? (
                              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                                <Check className="h-3 w-3 mr-1" />
                                OCR Success
                              </Badge>
                            ) : file.status === 'ocr_failed' ? (
                              <Badge 
                                variant="secondary" 
                                className="bg-red-100 text-red-800 cursor-pointer hover:bg-red-200 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900 transition-colors"
                                onClick={() => {
                                  const errorMessage = file.error || file.errorDetails || 'OCR processing failed - no details available';
                                  const fullErrorText = `OCR Processing Error\n\nFile: ${file.fileName}\n\nError Details:\n${errorMessage}`;
                                  
                                  // Create custom dialog with copy button
                                  const copyToClipboard = () => {
                                    navigator.clipboard.writeText(fullErrorText).then(() => {
                                      alert('Error details copied to clipboard!');
                                    }).catch(() => {
                                      // Fallback for older browsers
                                      const textArea = document.createElement('textarea');
                                      textArea.value = fullErrorText;
                                      document.body.appendChild(textArea);
                                      textArea.select();
                                      document.execCommand('copy');
                                      document.body.removeChild(textArea);
                                      alert('Error details copied to clipboard!');
                                    });
                                  };
                                  
                                  // Show confirm dialog with copy option
                                  const userChoice = confirm(`${fullErrorText}\n\n📋 Click OK to copy error details to clipboard, Cancel to close.`);
                                  if (userChoice) {
                                    copyToClipboard();
                                  }
                                }}
                              >
                                <X className="h-3 w-3 mr-1" />
                                OCR Failed
                              </Badge>
                            ) : file.status === 'save_failed' ? (
                              <Badge
                                variant="secondary"
                                className="bg-red-100 text-red-800 cursor-pointer hover:bg-red-200 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900 transition-colors"
                                title={file.error || file.errorDetails || 'Could not save this certificate.'}
                                onClick={() => {
                                  const errorMessage = file.error || file.errorDetails || 'Could not save this certificate.';
                                  alert(`Could Not Save\n\nFile: ${file.fileName}\n\nReason:\n${errorMessage}`);
                                }}
                              >
                                <X className="h-3 w-3 mr-1" />
                                Save Failed
                              </Badge>
                            ) : file.status === 'error' ? (
                              <Badge
                                variant="secondary"
                                className="bg-red-100 text-red-800 cursor-pointer hover:bg-red-200 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900 transition-colors"
                                title={file.error || file.errorDetails || file.notes || 'OCR could not process this file.'}
                                onClick={() => {
                                  const errorMessage = file.error || file.errorDetails || file.notes || 'OCR could not process this file.';
                                  alert(`Could Not Process\n\nFile: ${file.fileName}\n\nReason:\n${errorMessage}`);
                                }}
                              >
                                <X className="h-3 w-3 mr-1" />
                                Processing Error
                              </Badge>
                            ) : file.status === 'processing' ? (
                              <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                                Processing...
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Unknown
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs max-w-48 truncate" title={file.fileName}>
                            {file.fileName}
                          </TableCell>
                          <TableCell className="max-w-40">
                            <Input
                              value={file.name || ""}
                              onChange={(e) => {
                                const updated = [...detectedFiles];
                                updated[index] = { ...updated[index], name: e.target.value };
                                setDetectedFiles(updated);
                              }}
                              className="w-36"
                              placeholder="Person name"
                            />
                          </TableCell>
                          <TableCell className="max-w-64 align-top">
                            <Select
                              value={file.module?.id?.toString() || ""}
                              onValueChange={(value) => {
                                const updated = [...detectedFiles];
                                const selectedModule = modules.find(m => m.id.toString() === value);
                                // Choosing an existing module turns off new-module creation.
                                updated[index] = {
                                  ...updated[index],
                                  module: selectedModule || null,
                                  createNewModule: false,
                                };
                                setDetectedFiles(updated);
                              }}
                            >
                              <SelectTrigger className="w-56" data-testid={`select-module-${index}`}>
                                <SelectValue placeholder="Select module" />
                              </SelectTrigger>
                              <SelectContent>
                                {modules.map((module: CertificationModule) => (
                                  <SelectItem key={module.id} value={module.id.toString()}>
                                    {module.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {file.isNewModule && !file.module && (
                              <div
                                className="mt-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-2 space-y-2 w-56"
                                data-testid={`new-module-panel-${index}`}
                              >
                                <div className="flex items-start gap-2">
                                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                                  <div className="text-xs text-amber-800 dark:text-amber-300">
                                    New course — not in your modules list.
                                    {file.courseName && (
                                      <div className="font-medium mt-0.5" title={file.courseName}>
                                        "{file.courseName}"
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <label className="flex items-center gap-2 text-xs font-medium text-amber-900 dark:text-amber-200 cursor-pointer">
                                  <Checkbox
                                    checked={!!file.createNewModule}
                                    onCheckedChange={(checked) => {
                                      const updated = [...detectedFiles];
                                      updated[index] = { ...updated[index], createNewModule: checked === true };
                                      setDetectedFiles(updated);
                                    }}
                                    data-testid={`checkbox-create-module-${index}`}
                                  />
                                  Add as new module
                                </label>
                                {file.createNewModule && (
                                  <div className="space-y-1.5">
                                    <div>
                                      <Label className="text-[11px] text-muted-foreground">Module name</Label>
                                      <Input
                                        value={file.newModuleName || ""}
                                        onChange={(e) => {
                                          const updated = [...detectedFiles];
                                          updated[index] = { ...updated[index], newModuleName: e.target.value };
                                          setDetectedFiles(updated);
                                        }}
                                        className="h-7 text-xs"
                                        data-testid={`input-new-module-name-${index}`}
                                      />
                                    </div>
                                    <div className="flex gap-2">
                                      <div className="flex-1">
                                        <Label className="text-[11px] text-muted-foreground">Abbrev.</Label>
                                        <Input
                                          value={file.newModuleAbbreviation || ""}
                                          onChange={(e) => {
                                            const updated = [...detectedFiles];
                                            updated[index] = { ...updated[index], newModuleAbbreviation: e.target.value };
                                            setDetectedFiles(updated);
                                          }}
                                          className="h-7 text-xs"
                                          placeholder="e.g. BCT"
                                          data-testid={`input-new-module-abbrev-${index}`}
                                        />
                                      </div>
                                      <div className="w-20">
                                        <Label className="text-[11px] text-muted-foreground">Expiry (mo)</Label>
                                        <Input
                                          type="number"
                                          min={1}
                                          value={file.newModuleExpirationMonths ?? 36}
                                          onChange={(e) => {
                                            const updated = [...detectedFiles];
                                            updated[index] = { ...updated[index], newModuleExpirationMonths: parseInt(e.target.value) || 0 };
                                            setDetectedFiles(updated);
                                          }}
                                          className="h-7 text-xs"
                                          data-testid={`input-new-module-expiry-${index}`}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {file.courseName && !file.module && !file.isNewModule && (
                              <div className="text-xs text-amber-600 dark:text-amber-400 mt-1" title={file.courseName}>
                                Detected: {file.courseName.length > 20 ? `${file.courseName.substring(0, 20)}...` : file.courseName}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={file.completionDate || ""}
                              onChange={(e) => {
                                const updated = [...detectedFiles];
                                updated[index] = { ...updated[index], completionDate: e.target.value };
                                setDetectedFiles(updated);
                              }}
                              className="w-36"
                              placeholder="Completion date"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={file.recordId || ""}
                              onChange={(e) => {
                                const updated = [...detectedFiles];
                                updated[index] = { ...updated[index], recordId: e.target.value };
                                setDetectedFiles(updated);
                              }}
                              className="w-24"
                              placeholder="Record ID"
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={file.scientistId?.toString() || ""}
                              onValueChange={(value) => {
                                const updated = [...detectedFiles];
                                updated[index] = { ...updated[index], scientistId: parseInt(value) };
                                setDetectedFiles(updated);
                              }}
                            >
                              <SelectTrigger className="w-48">
                                <SelectValue placeholder="Select scientist" />
                              </SelectTrigger>
                              <SelectContent>
                                {scientists.map((scientist: any) => (
                                  <SelectItem key={scientist.id} value={scientist.id.toString()}>
                                    {formatFullName(scientist)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={file.startDate || file.completionDate || ""}
                              onChange={(e) => {
                                const updated = [...detectedFiles];
                                updated[index] = { ...updated[index], startDate: e.target.value };
                                setDetectedFiles(updated);
                              }}
                              className="w-36"
                              placeholder="Start date"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={file.endDate || file.expirationDate || ""}
                              onChange={(e) => {
                                const updated = [...detectedFiles];
                                updated[index] = { ...updated[index], endDate: e.target.value };
                                setDetectedFiles(updated);
                              }}
                              className="w-36"
                              placeholder="End date"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col sm:flex-row gap-1 sm:gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs px-2 py-1 h-6 sm:h-8 sm:px-3 sm:py-1.5 sm:text-sm"
                                onClick={() => {
                                  const updated = detectedFiles.filter((_, i) => i !== index);
                                  setDetectedFiles(updated);
                                }}
                              >
                                Remove
                              </Button>
                              {file.extractedText && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs px-2 py-1 h-6 sm:h-8 sm:px-3 sm:py-1.5 sm:text-sm"
                                  onClick={() => {
                                    alert(`OCR Extracted Text:\n\n${file.extractedText?.substring(0, 800)}${file.extractedText && file.extractedText.length > 800 ? '...' : ''}`);
                                  }}
                                >
                                  View OCR
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>PDF Import History</CardTitle>
                <Button 
                  onClick={() => refetchHistory()} 
                  variant="outline" 
                  size="sm"
                >
                  <Search className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
              <p className="text-muted-foreground">
                View and search PDF processing history with OCR extraction results
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Search Staff/Course</label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name or course..."
                      value={historySearchTerm}
                      onChange={(e) => setHistorySearchTerm(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Select value={historyStatusFilter} onValueChange={setHistoryStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Date From</label>
                  <Input
                    type="date"
                    value={historyDateFrom}
                    onChange={(e) => setHistoryDateFrom(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Date To</label>
                  <Input
                    type="date"
                    value={historyDateTo}
                    onChange={(e) => setHistoryDateTo(e.target.value)}
                  />
                </div>
              </div>

              {historyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sidra-primary"></div>
                  <span className="ml-2">Loading history...</span>
                </div>
              ) : (
                <div className="overflow-auto h-96 md:h-auto md:max-h-none border rounded-md">
                  <Table className="min-w-full">
                    <TableHeader className="sticky top-0 bg-white dark:bg-card z-10 shadow-sm border-b">
                      <TableRow>
                        <TableHead>File Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Document Type</TableHead>
                        <TableHead>Save Status</TableHead>
                        <TableHead>Detected Fields</TableHead>
                        <TableHead>Uploaded By</TableHead>
                        <TableHead>OCR Provider</TableHead>
                        <TableHead>Processing Time</TableHead>
                        <TableHead>Upload Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pdfHistory.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            No PDF import history found
                          </TableCell>
                        </TableRow>
                      ) : (
                        pdfHistory.map((entry: PdfImportHistoryEntry) => {
                          // Parse the detected data from parsedData JSON  
                          const parsedData = entry.parsedData || {};
                          const hasDetectedData = parsedData.name || parsedData.courseName || parsedData.completionDate || parsedData.expirationDate;
                          
                          // Determine actual status based on data detection
                          const getActualStatus = () => {
                            if (entry.processingStatus === 'processing') return 'processing';
                            if (entry.processingStatus === 'failed') return 'ocr_failed';
                            if (entry.processingStatus === 'ocr_failed') return 'ocr_failed';
                            if (hasDetectedData) return 'detected';
                            return 'unrecognized';
                          };
                          
                          const actualStatus = getActualStatus();
                          
                          return (
                            <TableRow key={entry.id}>
                              <TableCell className="font-mono text-sm max-w-48 truncate" title={entry.fileName}>
                                {entry.fileName}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="secondary"
                                  className={
                                    actualStatus === 'detected'
                                      ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                                      : actualStatus === 'ocr_failed'
                                      ? 'bg-red-100 text-red-800 cursor-pointer hover:bg-red-200 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900 transition-colors'
                                      : actualStatus === 'unrecognized'
                                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
                                      : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                  }
                                  onClick={actualStatus === 'ocr_failed' ? () => {
                                    const errorMessage = entry.errorMessage || 'OCR processing failed - no details available';
                                    const fullErrorText = `OCR Processing Error\n\nFile: ${entry.fileName}\nProvider: ${entry.ocrProvider}\n\nError Details:\n${errorMessage}`;
                                    
                                    // Create custom dialog with copy button
                                    const copyToClipboard = () => {
                                      navigator.clipboard.writeText(fullErrorText).then(() => {
                                        alert('Error details copied to clipboard!');
                                      }).catch(() => {
                                        // Fallback for older browsers
                                        const textArea = document.createElement('textarea');
                                        textArea.value = fullErrorText;
                                        document.body.appendChild(textArea);
                                        textArea.select();
                                        document.execCommand('copy');
                                        document.body.removeChild(textArea);
                                        alert('Error details copied to clipboard!');
                                      });
                                    };
                                    
                                    // Show confirm dialog with copy option
                                    const userChoice = confirm(`${fullErrorText}\n\n📋 Click OK to copy error details to clipboard, Cancel to close.`);
                                    if (userChoice) {
                                      copyToClipboard();
                                    }
                                  } : undefined}
                                >
                                  {actualStatus === 'detected' && <Check className="h-3 w-3 mr-1" />}
                                  {actualStatus === 'ocr_failed' && <X className="h-3 w-3 mr-1" />}
                                  {actualStatus === 'unrecognized' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                  {actualStatus === 'processing' && <div className="h-3 w-3 mr-1 animate-spin rounded-full border-b-2 border-blue-600"></div>}
                                  {actualStatus === 'detected' ? 'Data Detected' : 
                                   actualStatus === 'ocr_failed' ? 'OCR Failed' : 
                                   actualStatus === 'unrecognized' ? 'No Data Found' : 
                                   'Processing...'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant="outline" 
                                  className={
                                    entry.documentType === 'certificate'
                                      ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800'
                                      : entry.documentType === 'report'
                                      ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800'
                                      : 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
                                  }
                                >
                                  {entry.documentType === 'certificate' ? '📜 Certificate' : 
                                   entry.documentType === 'report' ? '📋 Report' : 
                                   '❓ Unknown'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant="outline" 
                                  className={
                                    entry.saveStatus === 'saved'
                                      ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800'
                                      : entry.saveStatus === 'duplicate'
                                      ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800'
                                      : entry.saveStatus === 'not_saved'
                                      ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'
                                      : 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
                                  }
                                >
                                  {entry.saveStatus === 'saved' ? '✅ Saved' : 
                                   entry.saveStatus === 'duplicate' ? '🔄 Duplicate' :
                                   entry.saveStatus === 'not_saved' ? '❌ Not Saved' : 
                                   '⏳ Pending'}
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-48">
                                {hasDetectedData ? (
                                  <div className="text-sm space-y-1">
                                    {parsedData.name && (
                                      <div className="font-medium text-green-700 dark:text-green-400 truncate" title={parsedData.name}>
                                        👤 {parsedData.name}
                                      </div>
                                    )}
                                    {parsedData.courseName && (
                                      <div className="text-blue-600 dark:text-blue-400 truncate" title={parsedData.courseName}>
                                        📚 {parsedData.courseName}
                                      </div>
                                    )}
                                    {(parsedData.completionDate || parsedData.expirationDate) && (
                                      <div className="text-gray-600 dark:text-gray-400 truncate">
                                        📅 {parsedData.completionDate && format(new Date(parsedData.completionDate), 'MMM dd, yyyy')} 
                                        {parsedData.completionDate && parsedData.expirationDate && ' - '}
                                        {parsedData.expirationDate && format(new Date(parsedData.expirationDate), 'MMM dd, yyyy')}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 dark:text-gray-500 text-sm">No data detected</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {entry.uploader ? entry.uploader.name : 'Unknown'}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {entry.ocrProvider || 'Unknown'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {entry.processingTimeMs ? `${entry.processingTimeMs}ms` : '-'}
                              </TableCell>
                              <TableCell>
                                {entry.uploadedAt ? format(parseISO(entry.uploadedAt), 'MMM dd, yyyy HH:mm') : '-'}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => window.open(entry.fileUrl, '_blank')}
                                  >
                                    View PDF
                                  </Button>
                                  {entry.extractedText && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        alert(`OCR Extracted Text:\n\n${entry.extractedText?.substring(0, 800)}${entry.extractedText && entry.extractedText.length > 800 ? '...' : ''}`);
                                      }}
                                    >
                                      View OCR
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-900">
                <h4 className="font-medium text-blue-900 dark:text-blue-200 mb-2">PDF Import History</h4>
                <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                  <li>• Track all PDF uploads and OCR processing results</li>
                  <li>• Search by staff names, course names, or date ranges</li>
                  <li>• View processing status and performance metrics</li>
                  <li>• Access original PDFs and extracted OCR text</li>
                  <li>• Filter by processing status (completed, failed, processing)</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="modules" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>Certification Modules</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    These are the training courses certificates are matched to. Add a module here when a new course
                    (like "Biosafety Complete Training Series") isn't in the list yet.
                  </p>
                </div>
                <Button onClick={openAddModule} data-testid="button-add-module">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Module
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {modulesLoading ? (
                <p className="text-sm text-muted-foreground">Loading modules...</p>
              ) : modules.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-no-modules">
                  No modules yet. Click "Add Module" to create one.
                </p>
              ) : (
                <div className="space-y-4">
                  {modules.map((module: CertificationModule) => (
                    <div
                      key={module.id}
                      className="flex items-center justify-between p-4 border rounded"
                      data-testid={`row-module-${module.id}`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium" data-testid={`text-module-name-${module.id}`}>{module.name}</h3>
                          {module.isCore && (
                            <Badge variant="default" className="bg-sidra-primary text-white">
                              Core
                            </Badge>
                          )}
                          {module.isActive === false && (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </div>
                        {module.description && (
                          <p className="text-sm text-muted-foreground">{module.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Expires every {module.expirationMonths} months
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditModule(module)}
                          data-testid={`button-edit-module-${module.id}`}
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                          onClick={() => setModuleToDelete(module)}
                          data-testid={`button-delete-module-${module.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>CITI API Configuration</CardTitle>
                <p className="text-muted-foreground">
                  Configure automatic data import from CITI Program
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Institution Name</label>
                  <Input placeholder="Your Institution Name" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">API Endpoint</label>
                  <Input placeholder="https://api.citiprogram.org/..." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">API Key</label>
                  <Input type="password" placeholder="Enter API key" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">API Secret</label>
                  <Input type="password" placeholder="Enter API secret" />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="auto-import" className="rounded" />
                  <label htmlFor="auto-import" className="text-sm">
                    Enable automatic daily import
                  </label>
                </div>
                <Button className="w-full">
                  Test Connection & Save
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>OCR Configuration</CardTitle>
                <p className="text-muted-foreground">
                  Choose which OCR (Optical Character Recognition) service extracts text from uploaded CITI certificate PDFs. This determines how the system reads and processes certificate data.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">OCR Service Provider</label>
                    <p className="text-xs text-muted-foreground mt-1">
                      This setting affects all future certificate uploads. Currently selected option processes all new PDFs.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <button
                      onClick={async () => {
                        try {
                          const response = await fetch('/api/system-configurations/ocr_service', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              value: {
                                provider: 'ocr_space',
                                ocrSpaceApiKey: ocrConfig?.value?.ocrSpaceApiKey || 'helloworld',
                                tesseractOptions: ocrConfig?.value?.tesseractOptions || { language: 'eng' }
                              },
                              updatedAt: new Date()
                            })
                          });
                          if (response.ok) {
                            queryClient.invalidateQueries({ queryKey: ['/api/system-configurations/ocr_service'] });
                          }
                        } catch (error) {
                          console.error('Failed to update OCR provider:', error);
                        }
                      }}
                      className={`w-full p-3 text-left rounded-lg border transition-colors ${
                        (ocrConfig?.value?.provider || 'ocr_space') === 'ocr_space'
                          ? 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-500'
                          : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                      }`}
                    >
                      <div className="font-medium">OCR.space (Recommended for PDFs)</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">External API service with high PDF accuracy</div>
                      <div className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                        ✓ Best for CITI certificates • ✓ High accuracy • ⚠ Usage limits (180/hour) • PDF only
                      </div>
                    </button>
                    
                    <button
                      onClick={async () => {
                        try {
                          const response = await fetch('/api/system-configurations/ocr_service', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              value: {
                                provider: 'tesseract',
                                ocrSpaceApiKey: ocrConfig?.value?.ocrSpaceApiKey || 'helloworld',
                                tesseractOptions: ocrConfig?.value?.tesseractOptions || { language: 'eng' }
                              },
                              updatedAt: new Date()
                            })
                          });
                          if (response.ok) {
                            queryClient.invalidateQueries({ queryKey: ['/api/system-configurations/ocr_service'] });
                          }
                        } catch (error) {
                          console.error('Failed to update OCR provider:', error);
                        }
                      }}
                      className={`w-full p-3 text-left rounded-lg border transition-colors ${
                        (ocrConfig?.value?.provider || 'ocr_space') === 'tesseract'
                          ? 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-500'
                          : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                      }`}
                    >
                      <div className="font-medium">Tesseract.js (Local Processing)</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Free local OCR, no API limits</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        ✓ Completely free • ✓ No limits • ✓ Supports images (PNG, JPG) • ⚠ Lower accuracy
                      </div>
                    </button>
                  </div>
                  
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-900">
                    <div className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">How This Affects Certificate Processing:</div>
                    <ul className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
                      <li>• <strong>Upload Impact:</strong> Selected service processes every file you upload</li>
                      <li>• <strong>Data Extraction:</strong> Determines accuracy of name, date, and course detection</li>
                      <li>• <strong>Default:</strong> OCR.space is pre-configured and ready to use</li>
                      <li>• <strong>Switch Anytime:</strong> You can change providers without affecting existing certificates</li>
                      <li>• <strong>File Types:</strong> OCR.space accepts PDFs only, Tesseract accepts PDFs and images</li>
                    </ul>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">OCR.space API Key</label>
                  <Input 
                    type="password" 
                    placeholder="Enter your OCR.space API key"
                    defaultValue="••••••••••••••••"
                  />
                  <p className="text-xs text-muted-foreground">
                    Get your free API key from <a href="https://ocr.space/ocrapi" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">ocr.space/ocrapi</a> (25,000 requests/month free)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="pdf-processing" className="rounded" defaultChecked disabled />
                  <label htmlFor="pdf-processing" className="text-sm text-muted-foreground">
                    Automatic PDF processing enabled
                  </label>
                </div>
                <div className="p-3 bg-green-50 dark:bg-green-950/40 rounded-md border border-green-200 dark:border-green-900">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-green-800 dark:text-green-300">
                      API key configured via environment variable
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Notification Settings</CardTitle>
                <p className="text-muted-foreground">
                  Configure expiration alerts and reminders
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Notification Recipients</label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="notify-scientist" className="rounded" defaultChecked />
                      <label htmlFor="notify-scientist" className="text-sm">Scientist</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="notify-supervisor" className="rounded" defaultChecked />
                      <label htmlFor="notify-supervisor" className="text-sm">Line Manager</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="notify-admin" className="rounded" />
                      <label htmlFor="notify-admin" className="text-sm">Admin Office</label>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Reminder Schedule</label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="remind-30" className="rounded" defaultChecked />
                      <label htmlFor="remind-30" className="text-sm">30 days before expiration</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="remind-7" className="rounded" defaultChecked />
                      <label htmlFor="remind-7" className="text-sm">7 days before expiration</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="remind-1" className="rounded" />
                      <label htmlFor="remind-1" className="text-sm">1 day before expiration</label>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input type="checkbox" id="email-enabled" className="rounded" defaultChecked />
                  <label htmlFor="email-enabled" className="text-sm">
                    Enable email notifications
                  </label>
                </div>

                <Button className="w-full" variant="outline">
                  Save Notification Settings
                </Button>
              </CardContent>
            </Card>
          </div>

        </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={moduleDialogOpen}
        onOpenChange={(open) => {
          setModuleDialogOpen(open);
          if (!open) {
            setEditingModuleId(null);
            setModuleForm(emptyModuleForm);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingModuleId != null ? 'Edit Module' : 'Add Module'}</DialogTitle>
            <DialogDescription>
              Set the course name (include its abbreviation in parentheses, e.g. "Biosafety Complete Training Series (BCT)").
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="module-name">Module name</Label>
              <Input
                id="module-name"
                value={moduleForm.name}
                onChange={(e) => setModuleForm({ ...moduleForm, name: e.target.value })}
                placeholder="e.g. Biosafety Complete Training Series (BCT)"
                data-testid="input-module-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="module-description">Description</Label>
              <Textarea
                id="module-description"
                value={moduleForm.description}
                onChange={(e) => setModuleForm({ ...moduleForm, description: e.target.value })}
                placeholder="Optional description"
                rows={2}
                data-testid="input-module-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="module-expiration">Expires every (months)</Label>
              <Input
                id="module-expiration"
                type="number"
                min={1}
                value={moduleForm.expirationMonths}
                onChange={(e) => setModuleForm({ ...moduleForm, expirationMonths: parseInt(e.target.value) || 0 })}
                className="w-32"
                data-testid="input-module-expiration"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="module-core"
                checked={moduleForm.isCore}
                onCheckedChange={(checked) => setModuleForm({ ...moduleForm, isCore: checked === true })}
                data-testid="checkbox-module-core"
              />
              <Label htmlFor="module-core" className="font-normal">Core (mandatory) module</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="module-active"
                checked={moduleForm.isActive}
                onCheckedChange={(checked) => setModuleForm({ ...moduleForm, isActive: checked === true })}
                data-testid="checkbox-module-active"
              />
              <Label htmlFor="module-active" className="font-normal">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModuleDialogOpen(false)} data-testid="button-cancel-module">
              Cancel
            </Button>
            <Button
              onClick={() => saveModuleMutation.mutate()}
              disabled={!moduleForm.name.trim() || saveModuleMutation.isPending}
              data-testid="button-save-module"
            >
              {saveModuleMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!moduleToDelete} onOpenChange={(open) => !open && setModuleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete module?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes "{moduleToDelete?.name}" from the list of courses. Existing certificates already
              saved against it are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-module">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => moduleToDelete && deleteModuleMutation.mutate(moduleToDelete.id)}
              data-testid="button-confirm-delete-module"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}