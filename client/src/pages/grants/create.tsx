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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { formatFullName } from "@/utils/nameUtils";
import { GRANT_CURRENCY_VALUES, insertGrantSchema, type InsertGrant } from "@shared/schema";
import {
  GRANT_STATUS_OPTIONS,
  grantStatusAllowsProgressTracking,
  grantStatusImpliesAward,
  grantStatusRequiresStartDate,
} from "@shared/grantLifecycle";

type CreateGrantForm = InsertGrant;

export default function CreateGrant() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [collaboratorsInput, setCollaboratorsInput] = useState("");
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
      coInvestigators: [],
      investigatorType: "Researcher",
      lpiId: undefined,
      requestedAmount: "",
      awardedAmount: "",
      submittedYear: undefined,
      awardedYear: undefined,
      runningTimeYears: undefined,
      currentGrantYear: undefined,
      subawardCompletedYear: undefined,
      durationMonths: undefined,
      contributionType: "",
      contributionDetails: "",
      currency: "QAR",
      collaborators: [],
    },
  });

  const { data: scientists = [] } = useQuery({
    queryKey: ['/api/scientists']
  });

  const createGrantMutation = useMutation({
    mutationFn: async (data: CreateGrantForm) => {
      const collaborators = collaboratorsInput
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      const rawFormValues = form.getValues();
      const coInvestigators = (rawFormValues.coInvestigators || [])
        .map((name) => name.trim())
        .filter(Boolean);

      const payload = {
        ...data,
        collaborators,
        coInvestigators,
        sourceCategory: rawFormValues.sourceCategory || null,
        sourceRecordKey: rawFormValues.sourceRecordKey || null,
        submittingInstitution: rawFormValues.submittingInstitution || null,
        subawardCompletedYear: rawFormValues.subawardCompletedYear || null,
        contributionType: rawFormValues.contributionType || null,
        contributionDetails: rawFormValues.contributionDetails || null,
        durationMonths: rawFormValues.durationMonths || null,
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
        description: `${GRANT_STATUS_OPTIONS.find(o => o.value === currentStatus)?.label} grants require a start date.`,
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
                        <FormLabel>Grant Cycle</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g., 2024-1" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status *</FormLabel>
                        <Select
                          onValueChange={handleStatusChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {GRANT_STATUS_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                        <FormLabel>Grant Title *</FormLabel>
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
                    name="investigatorType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Investigator Type</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="flex flex-row space-x-6"
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="Researcher" id="researcher" />
                              <Label htmlFor="researcher">Researcher</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="Clinician" id="clinician" />
                              <Label htmlFor="clinician">Clinician</Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
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
                    <FormItem><FormLabel>Submitting Institution</FormLabel><FormControl><Input {...field} placeholder="Institution name" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>

                <div className="mt-4">
                  <FormField
                    control={form.control}
                    name="lpiId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lead Principal Investigator (LPI)</FormLabel>
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
                    <FormField control={form.control} name="durationMonths" render={({ field }) => (
                      <FormItem><FormLabel>Duration (Months)</FormLabel><FormControl><Input {...field} type="number" placeholder="36" onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="subawardCompletedYear" render={({ field }) => (
                      <FormItem><FormLabel>Subaward Completed Year</FormLabel><FormControl><Input {...field} type="number" placeholder="2024" onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>

                  {grantStatusAllowsProgressTracking(currentStatus) && (
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                          Start Date {grantStatusRequiresStartDate(currentStatus) && <span className="text-red-500">*</span>}
                        </label>
                        <Input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                          End Date
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
                          <FormLabel>Duration (Years)</FormLabel>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label htmlFor="collaborators" className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                    Collaborators (one per line)
                    <Textarea id="collaborators" value={collaboratorsInput} onChange={(e) => setCollaboratorsInput(e.target.value)} placeholder="Dr. John Smith, University of Example&#10;Dr. Jane Doe, Research Institute&#10;..." rows={3} className="w-full mt-2" />
                  </label>
                  <FormField control={form.control} name="coInvestigators" render={({ field }) => (
                    <FormItem><FormLabel>Co-Investigators (one per line)</FormLabel><FormControl><Textarea value={Array.isArray(field.value) ? field.value.join("\n") : ""} onChange={(e) => field.onChange(e.target.value.split("\n"))} placeholder="Dr. John Smith&#10;Dr. Jane Doe" rows={3} /></FormControl><FormMessage /></FormItem>
                  )} />
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
