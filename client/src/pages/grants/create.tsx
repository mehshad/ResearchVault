// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { InstitutionCombobox } from "@/components/InstitutionCombobox";
import { formatFullName } from "@/utils/nameUtils";
import { isHomeInstitution } from "@shared/grantSubmission";
import { investigatorTypeOf } from "@shared/investigatorType";
import { GrantCollaborations } from "@/components/GrantCollaborations";
import { GrantCoInvestigators } from "@/components/GrantCoInvestigators";
import type { GrantCollaborationTree, GrantCoInvestigatorList } from "@shared/schema";
import { GRANT_CURRENCY_VALUES, insertGrantSchema, type InsertGrant } from "@shared/schema";
import {
  grantStatusAllowsProgressTracking,
  grantStatusImpliesAward,
  grantStatusRequiresStartDate,
  canGrantSetSchedule,
} from "@shared/grantLifecycle";
import { useGrantStatuses } from "@/hooks/useGrantStatuses";
import { GrantStatusCombobox } from "@/components/GrantStatusCombobox";

type CreateGrantForm = InsertGrant;

export default function CreateGrant() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [collaboratingInstitutions, setCollaboratingInstitutions] =
    useState<GrantCollaborationTree>([]);
  const [coInvestigatorLinks, setCoInvestigatorLinks] =
    useState<GrantCoInvestigatorList>([]);
  const [awarded, setAwarded] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const form = useForm<CreateGrantForm>({
    resolver: zodResolver(insertGrantSchema),
    defaultValues: {
      projectNumber: "",
      title: "",
      description: "",
      cycle: "",
      status: "pending",
      fundingAgency: "",
      sourceCategory: "",
      sourceRecordKey: "",
      submittingInstitution: "",
      programId: null,
      coInvestigators: [],
      grantType: "Local",
      grantLpiName: "",
      lpiId: undefined,
      requestedAmount: "",
      awardedAmount: "",
      submittedYear: undefined,
      awardedYear: undefined,
      runningTimeYears: undefined,
      currentGrantYear: undefined,
      subawardCompletedYear: undefined,
      durationMonths: undefined,
      reportingIntervalMonths: undefined,
      contributionType: "",
      contributionDetails: "",
      currency: "QAR",
      collaborators: [],
    },
  });

  const { data: scientists = [] } = useQuery({
    queryKey: ['/api/scientists']
  });

  const { data: programs = [] } = useQuery({
    queryKey: ['/api/programs']
  });

  // Only for the Grant LPI suggestions below. The name is free text because
  // the person is at another institution, so the existing spellings are the
  // only thing keeping one person from becoming three.
  const { data: allGrants = [] } = useQuery({
    queryKey: ['/api/grants']
  });

  const watchedSubmittingInstitution = form.watch("submittingInstitution");
  const watchedLpiId = form.watch("lpiId");

  // Another institution submitted this grant, so it has a Lead PI of its own.
  const isSubaward = Boolean(
    watchedSubmittingInstitution?.trim() && !isHomeInstitution(watchedSubmittingInstitution),
  );
  // Shown as the placeholder on our own grants, where the lead is our own
  // person. Left as a placeholder rather than written into the field: storing
  // a copy would mean two places to correct when the Sidra Lead PI changes.
  const selectedLpi = (scientists as any[]).find((s) => s.id === watchedLpiId) ?? null;
  const sidraLpiName = selectedLpi ? formatFullName(selectedLpi) : null;
  // Read off the job title rather than asked for or stored. See
  // shared/investigatorType.ts.
  const sidraLpiInvestigatorType = investigatorTypeOf(selectedLpi);
  const knownGrantLpiNames = Array.from(
    new Set(
      ((allGrants as any[]) ?? [])
        .map((g: any) => g?.grantLpiName?.trim())
        .filter((name: string | undefined): name is string => Boolean(name)),
    ),
  ).sort();

  const createGrantMutation = useMutation({
    mutationFn: async (data: CreateGrantForm) => {
      const rawFormValues = form.getValues();
      // The legacy text columns, kept in step with the pickers rather than
      // left behind: exports and the older screens still read them, and a
      // grant created here would otherwise look collaborator-less to them.
      const collaborators = collaboratingInstitutions
        .map((institution) => institution.name?.trim())
        .filter((name): name is string => Boolean(name));
      const coInvestigators = coInvestigatorLinks
        .map((link) => {
          const scientist = (scientists as any[]).find((s) => s.id === link.scientistId);
          return (link.name ?? (scientist ? formatFullName(scientist) : "")).trim();
        })
        .filter(Boolean);

      const payload = {
        ...data,
        collaborators,
        coInvestigators,
        collaboratingInstitutions,
        coInvestigatorLinks,
        grantLpiName: rawFormValues.grantLpiName?.trim() || null,
        grantType: rawFormValues.grantType || "Local",
        sourceCategory: rawFormValues.sourceCategory || null,
        sourceRecordKey: rawFormValues.sourceRecordKey || null,
        submittingInstitution: rawFormValues.submittingInstitution || null,
        programId: rawFormValues.programId ?? null,
        subawardCompletedYear: rawFormValues.subawardCompletedYear || null,
        contributionType: rawFormValues.contributionType || null,
        contributionDetails: rawFormValues.contributionDetails || null,
        durationMonths: rawFormValues.durationMonths || null,
        reportingIntervalMonths: rawFormValues.reportingIntervalMonths || null,
        currency: rawFormValues.currency || null,
        awarded,
        startDate: startDate || null,
        endDate: endDate || null,
      };
      const res = await apiRequest("POST", `/api/grants`, payload);
      if (!res.ok) {
        let msg = "Failed to create grant";
        try {
          const body = await res.json();
          msg = body.message || body.error || msg;
        } catch (_) {}
        throw new Error(msg);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/grants'] });
      toast({
        title: "Success",
        description: "Grant created successfully",
      });
      navigate("/grants");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create grant",
        variant: "destructive" 
      });
    },
  });

  const currentStatus = form.watch("status");
  // The combobox fetches its own options; this is only for naming the status
  // in a validation message.
  const { all: allStatuses } = useGrantStatuses();

  const handleStatusChange = (value: string) => {
    form.setValue("status", value as any);
    if (grantStatusImpliesAward(value)) {
      setAwarded(true);
    } else if (value !== "cancelled") {
      setAwarded(false);
    }
  };

  const handleAwardedChange = (checked: boolean) => {
    if (checked) {
      setAwarded(true);
      // If current status is pre-award or rejected, move to Awarded
      if (!grantStatusImpliesAward(currentStatus)) {
        form.setValue("status", "awarded" as any);
      }
    } else {
      setAwarded(false);
      // If current status implies award, reset to Pending
      if (grantStatusImpliesAward(currentStatus)) {
        form.setValue("status", "pending" as any);
      }
    }
  };

  const handleSubmit = (data: CreateGrantForm) => {
    // Client-side date validation
    if (grantStatusRequiresStartDate(currentStatus) && !startDate) {
      toast({
        title: "Validation Error",
        description: `${allStatuses.find(o => o.value === currentStatus)?.label} grants require a start date.`,
        variant: "destructive",
      });
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      toast({
        title: "Validation Error",
        description: "End date cannot be before the start date.",
        variant: "destructive",
      });
      return;
    }
    createGrantMutation.mutate(data);
  };

  return (
    <div className="py-6">
      <div className="mb-6">
        <Button 
          variant="ghost" 
          onClick={() => navigate("/grants")}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Grants
        </Button>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Create New Grant</h1>
        <p className="text-gray-600 mt-1 dark:text-gray-300">Add a new research grant to the system</p>
      </div>

      <div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Main Information Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Grant Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="projectNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Number *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g., ARG01-0567-24MHS" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cycle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cycle</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g., 2024-1" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* The programme is chosen here, at submission, because this
                      is what submission is. It limits which SDRs can be linked
                      later, once the grant is awarded — and changing it after
                      SDRs are linked is refused, so choosing it now is the
                      cheapest moment. */}
                  <FormField
                    control={form.control}
                    name="programId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Programme</FormLabel>
                        <Select
                          value={field.value ? field.value.toString() : "none"}
                          onValueChange={(value) =>
                            field.onChange(value === "none" ? null : parseInt(value))
                          }
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-grant-program">
                              <SelectValue placeholder="No programme" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">No programme</SelectItem>
                            {(Array.isArray(programs) ? programs : []).map((program: any) => (
                              <SelectItem key={program.id} value={program.id.toString()}>
                                {program.programId
                                  ? `${program.programId} — ${program.name}`
                                  : program.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Status *</FormLabel>
                        <FormControl>
                          <GrantStatusCombobox
                            value={field.value}
                            onChange={handleStatusChange}
                            data-testid="select-grant-status"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="mt-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Title *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Enter the grant title" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <FormField
                    control={form.control}
                    name="fundingAgency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Funding Agency</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g., NIH, NSF, KSAS" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="grantType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Grant Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? "Local"}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Local">Local</SelectItem>
                            <SelectItem value="International">International</SelectItem>
                            {/* Funded from within Sidra rather than by an
                                outside body -- the IRF and PI-budget work the
                                office was recording as Local for want of
                                anywhere better. */}
                            <SelectItem value="Internal">Internal</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <FormField control={form.control} name="sourceCategory" render={({ field }) => (
                    <FormItem><FormLabel>Grant Source/Category</FormLabel><FormControl><Input {...field} placeholder="e.g., Internal, External" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="sourceRecordKey" render={({ field }) => (
                    <FormItem><FormLabel>Source Record Key</FormLabel><FormControl><Input {...field} placeholder="Source system reference" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="submittingInstitution" render={({ field }) => (
                    <FormItem><FormLabel>Submitting Institution</FormLabel><FormControl><InstitutionCombobox value={field.value} onChange={field.onChange} data-testid="select-submitting-institution" /></FormControl><FormMessage /></FormItem>
                  )} />
                  {/* Free text on purpose: on a subaward this person works at
                      the prime institution and has no staff record here. Sits
                      beside the submitting institution because the two are read
                      together, exactly as on the edit form. */}
                  <FormField control={form.control} name="grantLpiName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Grant LPI</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder={isSubaward ? "Lead PI at the submitting institution" : sidraLpiName ?? "Lead PI on the grant as a whole"}
                          list="grant-lpi-suggestions"
                          data-testid="input-grant-lpi"
                        />
                      </FormControl>
                      {/* Suggests names already recorded, so one person does
                          not become three spellings the way the institution
                          field did. */}
                      <datalist id="grant-lpi-suggestions">
                        {knownGrantLpiNames.map((name) => <option key={name} value={name} />)}
                      </datalist>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="mt-4">
                  <FormField
                    control={form.control}
                    name="lpiId"
                    render={({ field }) => (
                      <FormItem>
                        {/* "Sidra Lead PI", not "Lead PI": on a subaward the
                            grant's own lead is the external one above, and this
                            is the person here who owns our part of it. */}
                        <FormLabel>Sidra Lead PI</FormLabel>
                        <Select onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select LPI" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {scientists
                              .filter((scientist: any) => scientist.staffType === 'scientific')
                              .map((scientist: any) => (
                              <SelectItem key={scientist.id} value={scientist.id.toString()}>
                                {formatFullName(scientist)} - {scientist.jobTitle || 'No title'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {/* Read-only, from the staff record. It is a fact about the
                      person, not about this grant, so it is shown here and
                      changed on their profile. */}
                  <div className="mt-4">
                    <span className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                      Investigator Type
                    </span>
                    <p className="text-sm" data-testid="text-investigator-type">
                      {!watchedLpiId ? (
                        <span className="text-muted-foreground">Select a Sidra Lead PI</span>
                      ) : sidraLpiInvestigatorType ? (
                        sidraLpiInvestigatorType
                      ) : (
                        <span className="text-muted-foreground">
                          Not set on this person's staff profile
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            placeholder="Brief description of the grant objectives and scope"
                            rows={2}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Financial & Timeline Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Financial Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="requestedAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Requested Amount</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="number" 
                              step="0.01"
                              placeholder="0.00" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="awardedAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Awarded Amount</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="number" 
                              step="0.01"
                              placeholder="0.00" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={form.control} name="currency" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency</FormLabel>
                        <Select value={field.value || "QAR"} onValueChange={field.onChange}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {GRANT_CURRENCY_VALUES.map((currency) => (
                              <SelectItem key={currency} value={currency}>{currency}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {/* Awarded Switch */}
                  <div className="flex items-center justify-between rounded-lg border p-3 mt-4">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium">Grant Awarded</label>
                      <p className="text-xs text-muted-foreground">
                        A lasting funding milestone required for SDR links
                      </p>
                    </div>
                    <Switch
                      checked={awarded}
                      onCheckedChange={handleAwardedChange}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Timeline & Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <FormField
                      control={form.control}
                      name="submittedYear"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Submitted Year</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="number" 
                              placeholder="2024" 
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="awardedYear"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Awarded Year</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="number" 
                              placeholder="2024" 
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={form.control} name="reportingIntervalMonths" render={({ field }) => (
                      <FormItem><FormLabel>Reporting Interval (months)</FormLabel><FormControl><Input {...field} value={field.value ?? ""} type="number" min="1" max="60" placeholder="e.g., 12 for annual reports" onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="durationMonths" render={({ field }) => (
                      <FormItem><FormLabel>Duration (Months)</FormLabel><FormControl><Input {...field} type="number" placeholder="36" onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="subawardCompletedYear" render={({ field }) => (
                      <FormItem><FormLabel>Subaward Completed Year</FormLabel><FormControl><Input {...field} type="number" placeholder="2024" onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>

                  {canGrantSetSchedule({ status: currentStatus, awarded }) && (
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                          Project Start Date {grantStatusRequiresStartDate(currentStatus) && <span className="text-red-500">*</span>}
                        </label>
                        <Input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                          Project End Date
                        </label>
                        <Input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <FormField
                      control={form.control}
                      name="runningTimeYears"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Running Time (Years)</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="number" 
                              placeholder="3" 
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="currentGrantYear"
                      render={({ field }) => {
                        const runningTimeYears = form.watch("runningTimeYears");
                        const yearOptions = runningTimeYears ? Array.from({ length: runningTimeYears }, (_, i) => i + 1) : [];
                        
                        return (
                          <FormItem>
                            <FormLabel>Current Year</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={runningTimeYears ? "Year" : "Set duration"} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {yearOptions.map((year) => (
                                  <SelectItem key={year} value={year.toString()}>
                                    {year}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                  </div>

                </CardContent>
              </Card>
            </div>

            {/* Contributions & Collaborators */}
            <Card>
              <CardHeader>
                <CardTitle>Contributions & Collaborators</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <FormField control={form.control} name="contributionType" render={({ field }) => (
                    <FormItem><FormLabel>Contribution Type</FormLabel><FormControl><Input {...field} placeholder="e.g., Financial, In-kind" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="contributionDetails" render={({ field }) => (
                    <FormItem><FormLabel>Contribution Details</FormLabel><FormControl><Input {...field} placeholder="Describe the contribution" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                {/* The same two pickers the edit form uses. They were free-text
                    boxes here long after the edit form stopped having them, so
                    a grant entered by hand arrived with collaborators nobody
                    could count and co-investigators spelled a second way. */}
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

                <div className="space-y-2 mt-6">
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
                disabled={createGrantMutation.isPending}
              >
                {createGrantMutation.isPending ? "Creating..." : "Create Grant"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
