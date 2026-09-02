// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, DollarSign, Plus, FileText, Trash2, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GrantCollaborations } from "@/components/GrantCollaborations";
import { GrantCoInvestigators } from "@/components/GrantCoInvestigators";
import type { GrantCollaborationTree, GrantCoInvestigatorList } from "@shared/schema";
import { isHomeInstitution } from "@shared/grantSubmission";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { formatFullName } from "@/utils/nameUtils";
import {
  GRANT_STATUS_OPTIONS,
  grantStatusAllowsProgressTracking,
  grantStatusImpliesAward,
  grantStatusRequiresStartDate,
  canGrantSetSchedule,
  canGrantLinkSdrs,
} from "@shared/grantLifecycle";
import { GRANT_CURRENCY_VALUES } from "@shared/schema";
import {
  getGrantSdrCandidates,
  isGrantSdrEligible,
} from "@shared/grantSdrEligibility";
import {
  evaluateGrantIssues,
  type GrantIssueCode,
} from "@shared/grantIssues";

const GRANT_ISSUE_TARGETS: Record<GrantIssueCode, string> = {
  missing_project_number: "grant-field-project-number",
  missing_title: "grant-field-title",
  missing_lpi: "grant-field-lpi",
  missing_funding_agency: "grant-field-funding-agency",
  missing_requested_budget: "grant-field-requested-budget",
  missing_awarded_budget: "grant-field-awarded-budget",
  missing_currency: "grant-field-currency",
  missing_awarded_year: "grant-field-awarded-year",
  missing_start_date: "grant-field-start-date",
  missing_end_date: "grant-field-end-date",
  missing_sdr: "grant-field-sdrs",
};

export default function EditGrant() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/grants/:id/edit");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const grantId = params?.id ? parseInt(params.id) : null;

  // Simple form state
  // Held apart from formData: these are their own tables, not columns on the
  // grant, and they are sent alongside the grant rather than inside it.
  const [collaboratingInstitutions, setCollaboratingInstitutions] =
    useState<GrantCollaborationTree>([]);
  const [coInvestigatorLinks, setCoInvestigatorLinks] =
    useState<GrantCoInvestigatorList>([]);

  const [formData, setFormData] = useState({
    projectNumber: "",
    title: "",
    description: "",
    cycle: "",
    status: "submitted",
    grantType: "Local",
    fundingAgency: "",
    sourceCategory: "",
    sourceRecordKey: "",
    submittingInstitution: "",
    grantLpiName: "",
    coInvestigators: "",
    investigatorType: "Researcher",
    lpiId: "",
    requestedAmount: "",
    awardedAmount: "",
    submittedYear: "",
    awardedYear: "",
    awarded: false,
    runningTimeYears: "",
    currentGrantYear: "",
    startDate: "",
    endDate: "",
    reportingIntervalMonths: "",
    collaborators: "",
    subawardCompletedYear: "",
    contributionType: "",
    contributionDetails: "",
    durationMonths: "",
    currency: "QAR",
  });

  const [linkedSdrs, setLinkedSdrs] = useState<number[]>([]);
  const [showAddReport, setShowAddReport] = useState(false);
  const [reportFormData, setReportFormData] = useState({
    reportTitle: "",
    reportPeriod: "",
    submissionDate: "",
    acceptanceDate: "",
    notes: "",
  });
  
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { data: grant, isLoading: isLoadingGrant } = useQuery({
    queryKey: [`/api/grants/${grantId}`],
    enabled: !!grantId,
  });
  const canManageProgressReports = grantStatusAllowsProgressTracking(grant?.status);

  // Only for the Grant LPI suggestions: names already recorded elsewhere.
  const { data: allGrants = [] } = useQuery<any[]>({ queryKey: ["/api/grants"] });

  const { data: scientists = [] } = useQuery({
    queryKey: ['/api/scientists']
  });

  const { data: researchActivities = [] } = useQuery({
    queryKey: ['/api/research-activities']
  });

  const { data: grantSdrs = [] } = useQuery({
    queryKey: [`/api/grants/${grantId}/research-activities`],
    enabled: !!grantId,
  });

  const { data: progressReports = [] } = useQuery({
    queryKey: [`/api/grants/${grantId}/progress-reports`],
    enabled: !!grantId && canManageProgressReports,
  });

  // Load linked SDRs once when server data arrives
  useEffect(() => {
    if (grantSdrs && Array.isArray(grantSdrs)) {
      const ids = grantSdrs.map((sdr: any) => sdr.id);
      setLinkedSdrs(ids);
    }
  }, [grantSdrs?.length]);

  // Update form data when grant data loads
  useEffect(() => {
    if (grant) {
      setFormData({
        projectNumber: grant.projectNumber || "",
        title: grant.title || "",
        description: grant.description || "",
        cycle: grant.cycle || "",
        status: grant.status || "submitted",
        grantType: grant.grantType || "Local",
        fundingAgency: grant.fundingAgency || "",
        sourceCategory: grant.sourceCategory || "",
        sourceRecordKey: grant.sourceRecordKey || "",
        submittingInstitution: grant.submittingInstitution || "",
        grantLpiName: grant.grantLpiName || "",
        coInvestigators: Array.isArray(grant.coInvestigators) ? grant.coInvestigators.join('\n') : "",
        investigatorType: grant.investigatorType || "Researcher",
        lpiId: grant.lpiId?.toString() || "",
        requestedAmount: grant.requestedAmount?.toString() || "",
        awardedAmount: grant.awardedAmount?.toString() || "",
        submittedYear: grant.submittedYear?.toString() || "",
        awardedYear: grant.awardedYear?.toString() || "",
        awarded: grant.awarded || false,
        runningTimeYears: grant.runningTimeYears?.toString() || "",
        currentGrantYear: grant.currentGrantYear || "",
        startDate: grant.startDate ? grant.startDate.split('T')[0] : "",
        endDate: grant.endDate ? grant.endDate.split('T')[0] : "",
        reportingIntervalMonths: grant.reportingIntervalMonths?.toString() || "",
        collaborators: Array.isArray(grant.collaborators) ? grant.collaborators.join('\n') : "",
        subawardCompletedYear: grant.subawardCompletedYear?.toString() || "",
        contributionType: grant.contributionType || "",
        contributionDetails: grant.contributionDetails || "",
        durationMonths: grant.durationMonths?.toString() || "",
        currency: grant.currency || "QAR",
      });
    }
  }, [grant]);

  useEffect(() => {
    if (grant?.collaboratingInstitutions) {
      setCollaboratingInstitutions(grant.collaboratingInstitutions);
    }
    if (grant?.coInvestigatorLinks) {
      setCoInvestigatorLinks(grant.coInvestigatorLinks);
    }
  }, [grant]);

  const handleStatusChange = (value: string) => {
    if (
      formData.awarded &&
      !grantStatusImpliesAward(value) &&
      value !== "cancelled"
    ) {
      toast({
        title: "Clear the award designation first",
        description:
          value === "rejected"
            ? "An awarded grant cannot be Rejected. Use Cancelled if the awarded project will not proceed."
            : "Unlink any SDRs, then turn off Grant Awarded before returning to a pre-award status.",
        variant: "destructive",
      });
      return;
    }

    setFormData((prev) => {
      let awarded = prev.awarded;
      // Moving to an award-implying status always sets awarded = true
      if (grantStatusImpliesAward(value)) {
        awarded = true;
      }
      return { ...prev, status: value, awarded };
    });
  };

  const handleAwardedChange = (checked: boolean) => {
    if (!checked) {
      // Block turning off awarded while SDRs are linked
      if (linkedSdrs.length > 0) {
        toast({
          title: "Cannot remove award designation",
          description: `This grant has ${linkedSdrs.length} linked SDR${linkedSdrs.length > 1 ? "s" : ""}. Unlink all SDRs before removing the award designation.`,
          variant: "destructive",
        });
        return;
      }
      // If current status implies award, reset to Pending
      setFormData((prev) => ({
        ...prev,
        awarded: false,
        status: grantStatusImpliesAward(prev.status) ? "pending" : prev.status,
      }));
    } else {
      // Turning on: if current status is pre-award/rejected, move to Awarded
      setFormData((prev) => ({
        ...prev,
        awarded: true,
        status: grantStatusImpliesAward(prev.status) ? prev.status : "awarded",
      }));
    }
  };

  const updateGrantMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch(`/api/grants/${grantId}`, {
        method: "PUT",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          researchActivityIds: linkedSdrs,
        }),
      });
      if (!response.ok) {
        let msg = "Failed to update grant";
        try {
          const body = await response.json();
          msg = body.message || body.error || msg;
        } catch (_) {}
        throw new Error(msg);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/grants'] });
      queryClient.invalidateQueries({ queryKey: [`/api/grants/${grantId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/grants/${grantId}/research-activities`] });
      toast({
        title: "Success",
        description: "Grant updated successfully",
      });
      navigate("/grants");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update grant",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side date validation
    if (grantStatusRequiresStartDate(formData.status) && !formData.startDate) {
      toast({
        title: "Validation Error",
        description: `${GRANT_STATUS_OPTIONS.find(o => o.value === formData.status)?.label} grants require a start date.`,
        variant: "destructive",
      });
      return;
    }
    if (formData.startDate && formData.endDate && formData.endDate < formData.startDate) {
      toast({
        title: "Validation Error",
        description: "End date cannot be before the start date.",
        variant: "destructive",
      });
      return;
    }

    const collaborators = formData.collaborators
      ? formData.collaborators.split('\n').map((line) => line.trim()).filter(Boolean)
      : [];
    const coInvestigators = formData.coInvestigators
      ? formData.coInvestigators.split('\n').map((line) => line.trim()).filter(Boolean)
      : [];

    const toIntOrNull = (v: string) => (v && String(v).trim() ? parseInt(String(v)) : null);

    const payload = {
      projectNumber: formData.projectNumber,
      title: formData.title,
      description: formData.description || null,
      cycle: formData.cycle || null,
      status: formData.status,
      grantType: formData.grantType || null,
      fundingAgency: formData.fundingAgency || null,
      sourceCategory: formData.sourceCategory || null,
      sourceRecordKey: formData.sourceRecordKey || null,
      submittingInstitution: formData.submittingInstitution || null,
      grantLpiName: formData.grantLpiName?.trim() || null,
      coInvestigators,
      investigatorType: formData.investigatorType || null,
      lpiId: formData.lpiId && formData.lpiId.trim() ? parseInt(formData.lpiId) : null,
      requestedAmount: formData.requestedAmount || null,
      awardedAmount: formData.awardedAmount || null,
      submittedYear: toIntOrNull(formData.submittedYear),
      awardedYear: toIntOrNull(formData.awardedYear),
      awarded: formData.awarded,
      runningTimeYears: toIntOrNull(formData.runningTimeYears),
      currentGrantYear: formData.currentGrantYear || null,
      startDate: formData.startDate || null,
      endDate: formData.endDate || null,
      reportingIntervalMonths: toIntOrNull(String(formData.reportingIntervalMonths ?? "")),
      subawardCompletedYear: toIntOrNull(formData.subawardCompletedYear),
      contributionType: formData.contributionType || null,
      contributionDetails: formData.contributionDetails || null,
      durationMonths: toIntOrNull(formData.durationMonths),
      currency: formData.currency || null,
      collaborators,
      // Sent alongside the grant, replaced wholesale by the server. The editor
      // holds the entire tree, so what is not here is meant to be gone.
      collaboratingInstitutions,
      coInvestigatorLinks,
    };

    updateGrantMutation.mutate(payload);
  };

  const handleSdrToggle = (sdrId: number, checked: boolean) => {
    if (checked) {
      setLinkedSdrs([...linkedSdrs, sdrId]);
    } else {
      setLinkedSdrs(linkedSdrs.filter(id => id !== sdrId));
    }
  };

  // Progress Report Mutations
  const createProgressReportMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch(`/api/grants/${grantId}/progress-reports`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error('Failed to create progress report');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/grants/${grantId}/progress-reports`] });
      toast({
        title: "Success",
        description: "Progress report added successfully",
      });
      setShowAddReport(false);
      setReportFormData({
        reportTitle: "",
        reportPeriod: "",
        submissionDate: "",
        acceptanceDate: "",
        notes: "",
      });
      setUploadedFile(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create progress report",
        variant: "destructive",
      });
    },
  });

  const deleteProgressReportMutation = useMutation({
    mutationFn: async (reportId: number) => {
      const response = await fetch(`/api/grants/${grantId}/progress-reports/${reportId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error('Failed to delete progress report');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/grants/${grantId}/progress-reports`] });
      toast({
        title: "Success",
        description: "Progress report deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete progress report",
        variant: "destructive",
      });
    },
  });

  const handleDeleteReport = (reportId: number) => {
    if (confirm("Are you sure you want to delete this progress report?")) {
      deleteProgressReportMutation.mutate(reportId);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast({
          title: "Error",
          description: "Only PDF files are allowed",
          variant: "destructive",
        });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "Error",
          description: "File size must be less than 10MB",
          variant: "destructive",
        });
        return;
      }
      setUploadedFile(file);
    }
  };

  const uploadFileToStorage = async (file: File): Promise<{filePath: string, fileName: string, fileSize: number}> => {
    setIsUploading(true);
    try {
      const uploadResponse = await fetch('/api/objects/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!uploadResponse.ok) {
        throw new Error('Failed to get upload URL');
      }
      const { uploadURL } = await uploadResponse.json();
      const fileUploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!fileUploadResponse.ok) {
        throw new Error('Failed to upload file');
      }
      const url = new URL(uploadURL);
      const objectPath = url.pathname;
      return {
        filePath: objectPath,
        fileName: file.name,
        fileSize: file.size,
      };
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportFormData.reportTitle.trim()) {
      toast({
        title: "Error",
        description: "Report title is required",
        variant: "destructive",
      });
      return;
    }

    let fileInfo = null;
    if (uploadedFile) {
      try {
        fileInfo = await uploadFileToStorage(uploadedFile);
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to upload PDF file",
          variant: "destructive",
        });
        return;
      }
    }

    const reportPayload = {
      reportTitle: reportFormData.reportTitle,
      reportPeriod: reportFormData.reportPeriod || null,
      submissionDate: reportFormData.submissionDate || null,
      acceptanceDate: reportFormData.acceptanceDate || null,
      notes: reportFormData.notes || null,
      uploadedBy: 1, // TODO: Get from current user
      filePath: fileInfo?.filePath || null,
      fileName: fileInfo?.fileName || null,
      fileSize: fileInfo?.fileSize || null,
    };

    createProgressReportMutation.mutate(reportPayload);
  };

  if (isLoadingGrant) {
    return <div className="p-6">Loading...</div>;
  }

  if (!grant) {
    return <div className="p-6">Grant not found</div>;
  }

  // SDR section is visible when awarded is true (includes Active and Completed)
  const canLinkSdrs = canGrantLinkSdrs({ awarded: formData.awarded });
  const selectedLpiId = formData.lpiId ? Number(formData.lpiId) : null;
  // Another institution submitted this grant, so it has a Lead PI of its own.
  const isSubaward = Boolean(
    formData.submittingInstitution?.trim() && !isHomeInstitution(formData.submittingInstitution),
  );
  // Shown as the placeholder on our own grants, where the lead is our own
  // person. Left as a placeholder rather than written into the field: storing
  // a copy would mean two places to correct when the Sidra Lead PI changes.
  const sidraLpiName = (() => {
    const lpi = (scientists as any[]).find((s) => s.id === selectedLpiId);
    return lpi ? formatFullName(lpi) : null;
  })();
  const knownGrantLpiNames = Array.from(
    new Set(
      (allGrants ?? [])
        .map((g: any) => g?.grantLpiName?.trim())
        .filter((name: string | undefined): name is string => Boolean(name)),
    ),
  ).sort();
  const lpiResearchActivities = getGrantSdrCandidates(
    researchActivities,
    selectedLpiId,
    linkedSdrs,
  );
  const currentIssues = evaluateGrantIssues({
    ...grant,
    ...formData,
    lpiId: selectedLpiId,
    awardedYear: formData.awardedYear ? Number(formData.awardedYear) : null,
  }, linkedSdrs.length);
  const currentIssueCodes = new Set(currentIssues.map((issue) => issue.code));
  const issueFieldClass = (code: GrantIssueCode) =>
    `scroll-mt-28 rounded-lg ${
      currentIssueCodes.has(code)
        ? "border border-amber-400 bg-amber-50/80 p-3 ring-2 ring-amber-300/60 dark:border-amber-700 dark:bg-amber-950/30 dark:ring-amber-800/60"
        : ""
    }`;
  const navigateToIssue = (code: GrantIssueCode) => {
    const target = document.getElementById(GRANT_ISSUE_TARGETS[code]);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      target?.querySelector<HTMLElement>("input, button, [tabindex]")?.focus();
    }, 350);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => navigate("/grants")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Grants
        </Button>
        <h1 className="text-3xl font-bold">Edit Grant</h1>
        <p className="text-muted-foreground">Update grant information and details</p>
        {/*
          * Provenance. The office both imports grants and enters them by hand,
          * and until these columns existed the only way to tell which was to
          * look for rows sharing a created_at -- a bulk apply runs in one
          * transaction, so every row it writes carries the same timestamp.
          * Grants that predate the columns, or came from an archive taken
          * before them, say so rather than naming somebody who did not do it.
          */}
        {grant && (
          <p className="mt-1 text-xs text-muted-foreground" data-testid="text-grant-provenance">
            {`Added${grant.createdAt ? ` on ${new Date(grant.createdAt).toLocaleDateString()}` : ""}`}
            {grant.createdByName
              ? ` by ${grant.createdByName}`
              : " · added before this was recorded, so by whom is unknown"}
            {grant.updatedByName && grant.updatedByName !== grant.createdByName
              ? ` · last changed by ${grant.updatedByName}`
              : ""}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {currentIssues.length > 0 && (
          <Card className="border-amber-400 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/25">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg text-amber-950 dark:text-amber-100">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                {currentIssues.length} grant issue{currentIssues.length === 1 ? "" : "s"} to resolve
              </CardTitle>
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Select an issue to jump directly to the highlighted field.
              </p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {currentIssues.map((issue) => (
                <Button
                  key={issue.code}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => navigateToIssue(issue.code)}
                  className="border-amber-400 bg-background text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-100 dark:hover:bg-amber-950"
                  title={issue.detail}
                >
                  <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                  {issue.label}
                </Button>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Basic Information - Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {/* First Row: Project Number, Status, Grant Type, Funding Agency */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div id="grant-field-project-number" className={issueFieldClass("missing_project_number")}>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                  Project Number
                </label>
                <Input
                  value={formData.projectNumber}
                  onChange={(e) => setFormData({...formData, projectNumber: e.target.value})}
                  placeholder="e.g., NIH-R01-123456"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                  Project Status
                </label>
                <Select
                  value={formData.status}
                  onValueChange={handleStatusChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRANT_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                  Grant Type
                </label>
                <Select
                  value={formData.grantType}
                  onValueChange={(value) => setFormData({...formData, grantType: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Local">Local</SelectItem>
                    <SelectItem value="International">International</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div id="grant-field-funding-agency" className={issueFieldClass("missing_funding_agency")}>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                  Funding Agency
                </label>
                <Input
                  value={formData.fundingAgency}
                  onChange={(e) => setFormData({...formData, fundingAgency: e.target.value})}
                  placeholder="e.g., NIH, NSF, DOE"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">Grant Source/Category</label>
                <Input value={formData.sourceCategory} onChange={(e) => setFormData({...formData, sourceCategory: e.target.value})} placeholder="e.g., Internal, External" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">Source Record Key</label>
                <Input value={formData.sourceRecordKey} onChange={(e) => setFormData({...formData, sourceRecordKey: e.target.value})} placeholder="Source system reference" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">Submitting Institution</label>
                <Input value={formData.submittingInstitution} onChange={(e) => setFormData({...formData, submittingInstitution: e.target.value})} placeholder="Institution name" />
              </div>
              {/* Free text on purpose: on a subaward this person works at the
                  prime institution and has no staff record here. Sits beside
                  the submitting institution because the two are read together. */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">Grant LPI</label>
                <Input
                  value={formData.grantLpiName}
                  onChange={(e) => setFormData({...formData, grantLpiName: e.target.value})}
                  placeholder={isSubaward ? "Lead PI at the submitting institution" : sidraLpiName ?? "Lead PI on the grant as a whole"}
                  list="grant-lpi-suggestions"
                  data-testid="input-grant-lpi"
                />
                {/* Suggests names already recorded, so one person does not
                    become three spellings the way the institution field did. */}
                <datalist id="grant-lpi-suggestions">
                  {knownGrantLpiNames.map((name) => <option key={name} value={name} />)}
                </datalist>
              </div>
            </div>

            {/* Project Title - Full Width */}
            <div id="grant-field-title" className={`mt-4 ${issueFieldClass("missing_title")}`}>
              <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                Project Title
              </label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                placeholder="Grant title"
                required
              />
            </div>

            {/* Third Row: Lead Investigator, Investigator Type, Running Time, Current Year */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
              <div id="grant-field-lpi" className={issueFieldClass("missing_lpi")}>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                  Sidra Lead PI
                  {isSubaward && (
                    <span className="ml-1 font-normal text-xs text-muted-foreground">
                      (who owns our part)
                    </span>
                  )}
                </label>
                <Select
                  value={formData.lpiId}
                  onValueChange={(value) => setFormData({...formData, lpiId: value})}
                >
                  <SelectTrigger>
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
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                  Investigator Type
                </label>
                <Select
                  value={formData.investigatorType}
                  onValueChange={(value) => setFormData({...formData, investigatorType: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Researcher">Researcher</SelectItem>
                    <SelectItem value="Clinician">Clinician</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                  Running Time (Years)
                </label>
                <Input
                  type="number"
                  value={formData.runningTimeYears}
                  onChange={(e) => setFormData({...formData, runningTimeYears: e.target.value})}
                  placeholder="3"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                  Current Year
                </label>
                <Input
                  value={formData.currentGrantYear}
                  onChange={(e) => setFormData({...formData, currentGrantYear: e.target.value})}
                  placeholder="Year 3 of 4"
                />
              </div>
            </div>

            {/* Fourth Row: Awarded Amount, Start Date, End Date, Cycle */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
              <div id="grant-field-awarded-budget" className={issueFieldClass("missing_awarded_budget")}>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                  Awarded Amount
                </label>
                <Input
                  value={formData.awardedAmount}
                  onChange={(e) => setFormData({...formData, awardedAmount: e.target.value})}
                  placeholder="$626,565.00"
                />
              </div>

              {canGrantSetSchedule({
                status: formData.status,
                awarded: formData.awarded,
              }) && (
                <>
                  <div id="grant-field-start-date" className={issueFieldClass("missing_start_date")}>
                    <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                      Start Date {grantStatusRequiresStartDate(formData.status) && <span className="text-red-500">*</span>}
                    </label>
                    <Input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                    />
                  </div>

                  <div id="grant-field-end-date" className={issueFieldClass("missing_end_date")}>
                    <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                      End Date
                    </label>
                    <Input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                    />
                  </div>
                </>
              )}

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                  Cycle
                </label>
                <Input
                  value={formData.cycle}
                  onChange={(e) => setFormData({...formData, cycle: e.target.value})}
                  placeholder="e.g., 2024-1"
                  required
                />
              </div>
            </div>

            {/* Description */}
            <div className="mt-4">
              <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                Description
              </label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Brief description of the grant"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Grant Details */}
        <Card>
          <CardHeader>
            <CardTitle>Grant Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div id="grant-field-requested-budget" className={issueFieldClass("missing_requested_budget")}>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                  Requested Amount
                </label>
                <Input
                  value={formData.requestedAmount}
                  onChange={(e) => setFormData({...formData, requestedAmount: e.target.value})}
                  placeholder="$0.00"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                  Submitted Year
                </label>
                <Input
                  type="number"
                  value={formData.submittedYear}
                  onChange={(e) => setFormData({...formData, submittedYear: e.target.value})}
                  placeholder="2024"
                />
              </div>

              <div id="grant-field-awarded-year" className={issueFieldClass("missing_awarded_year")}>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                  Awarded Year
                </label>
                <Input
                  type="number"
                  value={formData.awardedYear}
                  onChange={(e) => setFormData({...formData, awardedYear: e.target.value})}
                  placeholder="2024"
                />
              </div>
              <div id="grant-field-currency" className={issueFieldClass("missing_currency")}>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">Currency</label>
                <Select
                  value={formData.currency || undefined}
                  onValueChange={(value) => setFormData({...formData, currency: value})}
                >
                  <SelectTrigger><SelectValue placeholder="Select currency" /></SelectTrigger>
                  <SelectContent>
                    {GRANT_CURRENCY_VALUES.map((currency) => (
                      <SelectItem key={currency} value={currency}>{currency}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">Contribution Type</label>
                <Input value={formData.contributionType} onChange={(e) => setFormData({...formData, contributionType: e.target.value})} placeholder="e.g., Financial, In-kind" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">Contribution Details</label>
                <Input value={formData.contributionDetails} onChange={(e) => setFormData({...formData, contributionDetails: e.target.value})} placeholder="Describe the contribution" />
              </div>
            </div>

            {/* Award Switch */}
            <div className="flex items-center justify-between rounded-lg border p-3 mt-4">
              <div className="space-y-0.5">
                <label className="text-sm font-medium">Grant Awarded</label>
                <p className="text-xs text-muted-foreground">
                  {linkedSdrs.length > 0
                    ? `${linkedSdrs.length} linked SDR${linkedSdrs.length > 1 ? "s" : ""} — unlink all to remove award designation`
                    : "A lasting funding milestone required for SDR links"}
                </p>
              </div>
              <Switch
                checked={formData.awarded}
                onCheckedChange={handleAwardedChange}
              />
            </div>

            {/* SDR Linking Section — visible whenever awarded = true (includes Active & Completed) */}
            {canLinkSdrs && (
              <div
                id="grant-field-sdrs"
                className={`mt-6 border-t pt-4 ${issueFieldClass("missing_sdr")}`}
              >
                <h3 className="text-lg font-medium mb-4">Linked Research Activities (SDRs)</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {lpiResearchActivities.length > 0 ? (
                    lpiResearchActivities.map((sdr: any) => {
                      const isLinked = linkedSdrs.includes(sdr.id);
                      const belongsToLpi = isGrantSdrEligible(
                        selectedLpiId,
                        sdr.budgetHolderId,
                      );
                      return (
                        <div key={sdr.id} className="flex items-center space-x-3 p-2 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900">
                          <input
                            type="checkbox"
                            checked={isLinked}
                            onChange={(e) => handleSdrToggle(sdr.id, e.target.checked)}
                            disabled={!belongsToLpi && !isLinked}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded dark:text-blue-400 dark:border-gray-600"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-sm">{sdr.sdrNumber}</div>
                            <div className="text-sm text-gray-500 truncate dark:text-gray-400">{sdr.title}</div>
                            <div className="text-xs text-gray-400 dark:text-gray-500">{sdr.status}</div>
                            {!belongsToLpi && isLinked && (
                              <div className="text-xs text-amber-600 dark:text-amber-400">
                                Different PI — unlink this SDR before saving
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-gray-500 text-sm dark:text-gray-400">
                      No SDRs for this grant&apos;s Lead PI are available to link.
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Collaborators & Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>Collaborators & Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                  Reporting Interval (months)
                </label>
                <Input
                  type="number"
                  min="1"
                  max="60"
                  value={formData.reportingIntervalMonths}
                  onChange={(e) => setFormData({...formData, reportingIntervalMonths: e.target.value})}
                  placeholder="e.g., 12 for annual reports"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                  Duration (Months)
                </label>
                <Input
                  type="number"
                  min="1"
                  value={formData.durationMonths}
                  onChange={(e) => setFormData({...formData, durationMonths: e.target.value})}
                  placeholder="e.g., 36"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                  Subaward Completed Year
                </label>
                <Input
                  type="number"
                  value={formData.subawardCompletedYear}
                  onChange={(e) => setFormData({...formData, subawardCompletedYear: e.target.value})}
                  placeholder="2024"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 block dark:text-gray-300">
                Collaborating institutions
              </label>
              <p className="text-xs text-muted-foreground">
                The organisations this grant is run with, and the people at each of them.
              </p>
              <GrantCollaborations
                value={collaboratingInstitutions}
                onChange={setCollaboratingInstitutions}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 block dark:text-gray-300">
                Sidra Medicine co-investigators
              </label>
              <p className="text-xs text-muted-foreground">
                Our own staff on this grant, chosen from the directory. People at other
                institutions belong to the institution above.
              </p>
              <GrantCoInvestigators
                value={coInvestigatorLinks}
                onChange={setCoInvestigatorLinks}
              />
            </div>
          </CardContent>
        </Card>

        {/* Progress reports are available after the grant has been saved as Active. */}
        {canManageProgressReports && <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Progress Reports
              <Button
                type="button"
                size="sm"
                onClick={() => setShowAddReport(true)}
                className="ml-4"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Report
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {progressReports && progressReports.length > 0 ? (
              <div className="space-y-4">
                {progressReports.map((report: any) => (
                  <div key={report.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-2">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100">{report.reportTitle}</h4>
                        <span className="text-sm text-gray-500 dark:text-gray-400">{report.reportPeriod}</span>
                      </div>
                      <div className="flex gap-6 text-sm text-gray-600 dark:text-gray-300">
                        <div>
                          <span className="font-medium">Submitted: </span>
                          {report.submissionDate ? new Date(report.submissionDate).toLocaleDateString() : 'N/A'}
                        </div>
                        <div>
                          <span className="font-medium">Accepted: </span>
                          {report.acceptanceDate ? new Date(report.acceptanceDate).toLocaleDateString() : 'Pending'}
                        </div>
                      </div>
                      {report.notes && (
                        <div className="text-sm text-gray-500 mt-1 dark:text-gray-400">{report.notes}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {report.filePath && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => window.open(`/objects${report.filePath}`, '_blank')}
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          View PDF
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteReport(report.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8 dark:text-gray-400">
                No progress reports uploaded yet. Add your first report to get started.
              </p>
            )}
          </CardContent>
        </Card>}

        <div className="flex justify-end gap-4">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => navigate("/grants")}
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={updateGrantMutation.isPending}
          >
            {updateGrantMutation.isPending ? "Updating..." : "Update Grant"}
          </Button>
        </div>
      </form>

      {/* Progress Report Modal */}
      {canManageProgressReports && <Dialog open={showAddReport} onOpenChange={setShowAddReport}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Progress Report</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitReport} className="space-y-4">
            <div>
              <Label htmlFor="reportTitle">Report Title *</Label>
              <Input
                id="reportTitle"
                value={reportFormData.reportTitle}
                onChange={(e) => setReportFormData({...reportFormData, reportTitle: e.target.value})}
                placeholder="e.g., Q1 2024 Progress Report"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="reportPeriod">Report Period</Label>
              <Input
                id="reportPeriod"
                value={reportFormData.reportPeriod}
                onChange={(e) => setReportFormData({...reportFormData, reportPeriod: e.target.value})}
                placeholder="e.g., Q1 2024, Year 1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="submissionDate">Submission Date</Label>
                <Input
                  id="submissionDate"
                  type="date"
                  value={reportFormData.submissionDate}
                  onChange={(e) => setReportFormData({...reportFormData, submissionDate: e.target.value})}
                />
              </div>
              
              <div>
                <Label htmlFor="acceptanceDate">Acceptance Date</Label>
                <Input
                  id="acceptanceDate"
                  type="date"
                  value={reportFormData.acceptanceDate}
                  onChange={(e) => setReportFormData({...reportFormData, acceptanceDate: e.target.value})}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="pdfFile">PDF Report File</Label>
              <div className="space-y-2">
                <Input
                  id="pdfFile"
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="cursor-pointer"
                />
                {uploadedFile && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <FileText className="h-4 w-4" />
                    <span>{uploadedFile.name}</span>
                    <span>({(uploadedFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                    <button
                      type="button"
                      onClick={() => setUploadedFile(null)}
                      className="text-red-500 hover:text-red-700 dark:hover:text-red-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400">Only PDF files up to 10MB are allowed</p>
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={reportFormData.notes}
                onChange={(e) => setReportFormData({...reportFormData, notes: e.target.value})}
                placeholder="Additional notes about this report..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button 
                type="button" 
                variant="outline"
                onClick={() => setShowAddReport(false)}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={createProgressReportMutation.isPending || isUploading}
              >
                {isUploading ? "Uploading..." : createProgressReportMutation.isPending ? "Adding..." : "Add Report"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>}
    </div>
  );
}
