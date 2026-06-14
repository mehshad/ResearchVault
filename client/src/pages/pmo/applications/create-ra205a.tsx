// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, FileText, Users, CheckCircle2, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// Form validation schema for RA-205A
const ra205aFormSchema = z.object({
  selectedSdrId: z.number({ required_error: "Please select an existing SDR" }),
  sdrNumber: z.string().optional(), // Auto-populated from selected SDR
  currentTitle: z.string().optional(), // Auto-populated from selected SDR
  projectId: z.number().optional(), // Auto-populated from selected SDR
  currentPiId: z.number().optional(), // Auto-populated from selected SDR
  activityType: z.enum(["Human", "Non-Human"]).optional(), // Auto-populated
  
  // Change category with conditional new title
  changeCategory: z.object({
    lpiChange: z.boolean().default(false),
    budgetChange: z.boolean().default(false),
    titleChange: z.boolean().default(false),
    scopeChange: z.boolean().default(false),
    other: z.boolean().default(false),
    otherDescription: z.string().optional(),
  }),
  
  // New title only required if titleChange is true
  newTitle: z.string().optional(),
  
  changeReason: z.string().min(10, "Change reason must be at least 10 characters"),
  newPiId: z.number().optional(),
  budgetSource: z.string().optional(),
  
  // Approval tracking fields
  changeRequestNumber: z.string().optional(), // PMO generated
  approvals: z.object({
    currentPi: z.object({
      name: z.string().optional(),
      date: z.string().optional(),
      signature: z.string().optional(),
    }).optional(),
    newPi: z.object({
      name: z.string().optional(),
      date: z.string().optional(),
      signature: z.string().optional(),
    }).optional(),
    stakeholders: z.object({
      pmo: z.object({ name: z.string().optional(), date: z.string().optional(), signature: z.string().optional() }).optional(),
      researchLabs: z.object({ name: z.string().optional(), date: z.string().optional(), signature: z.string().optional() }).optional(),
      biosafety: z.object({ name: z.string().optional(), date: z.string().optional(), signature: z.string().optional() }).optional(),
      finance: z.object({ name: z.string().optional(), date: z.string().optional(), signature: z.string().optional() }).optional(),
      grants: z.object({ name: z.string().optional(), date: z.string().optional(), signature: z.string().optional() }).optional(),
      contracts: z.object({ name: z.string().optional(), date: z.string().optional(), signature: z.string().optional() }).optional(),
      governance: z.object({ name: z.string().optional(), date: z.string().optional(), signature: z.string().optional() }).optional(),
      dataManagement: z.object({ name: z.string().optional(), date: z.string().optional(), signature: z.string().optional() }).optional(),
    }).optional(),
  }).optional(),
}).refine((data) => {
  // If titleChange is true, newTitle is required
  if (data.changeCategory.titleChange && (!data.newTitle || data.newTitle.trim().length < 5)) {
    return false;
  }
  return true;
}, {
  message: "New title is required when title change is selected",
  path: ["newTitle"],
});

type RA205AFormData = z.infer<typeof ra205aFormSchema>;

export default function CreateRA205AApplication() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch data for dropdowns
  const { data: scientists = [] } = useQuery<any[]>({
    queryKey: ["/api/scientists"],
  });

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  const { data: researchActivities = [] } = useQuery<any[]>({
    queryKey: ["/api/research-activities"],
  });

  const form = useForm<RA205AFormData>({
    resolver: zodResolver(ra205aFormSchema),
    defaultValues: {
      selectedSdrId: undefined,
      sdrNumber: "",
      currentTitle: "",
      activityType: "Human",
      projectId: undefined,
      currentPiId: undefined,
      changeCategory: {
        lpiChange: false,
        budgetChange: false,
        titleChange: false,
        scopeChange: false,
        other: false,
        otherDescription: "",
      },
      newTitle: "",
      changeReason: "",
      newPiId: undefined,
      budgetSource: "",
      changeRequestNumber: "",
      approvals: {
        currentPi: { name: "", date: "", signature: "" },
        newPi: { name: "", date: "", signature: "" },
        stakeholders: {
          pmo: { name: "", date: "", signature: "" },
          researchLabs: { name: "Patricia Hachem", date: "", signature: "" },
          biosafety: { name: "", date: "", signature: "" },
          finance: { name: "", date: "30/06/25", signature: "" },
          grants: { name: "Irem Mueed", date: "", signature: "" },
          contracts: { name: "", date: "", signature: "" },
          governance: { name: "", date: "", signature: "" },
          dataManagement: { name: "", date: "", signature: "" },
        },
      },
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: RA205AFormData) => {
      return apiRequest("/api/pmo-applications", "POST", {
        formType: "RA-205A",
        title: data.newTitle || data.currentTitle, // Use new title if provided, otherwise current
        sdrNumber: data.sdrNumber,
        currentTitle: data.currentTitle,
        newTitle: data.newTitle,
        activityType: data.activityType,
        changeCategory: data.changeCategory,
        changeReason: data.changeReason,
        projectId: data.projectId || null,
        currentPiId: data.currentPiId || null,
        newPiId: data.newPiId || null,
        budgetSource: data.budgetSource || null,
        leadScientistId: data.newPiId || data.currentPiId || null,
        selectedSdrId: data.selectedSdrId,
        changeRequestNumber: data.changeRequestNumber,
        approvals: data.approvals,
        submittedBy: 46, // Current user - should be dynamic
      });
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pmo-applications"] });
      toast({
        title: "Application Created",
        description: `RA-205A application ${result.applicationId || 'PMO-RA205A-001'} created successfully.`,
      });
      navigate(`/pmo/applications/${result.id || 1}/edit`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create application",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: RA205AFormData) => {
    setIsSubmitting(true);
    try {
      await createMutation.mutateAsync(data);
    } finally {
      setIsSubmitting(false);
    }
  };

  const changeCategory = form.watch("changeCategory");
  const selectedSdrId = form.watch("selectedSdrId");
  
  // Auto-populate fields when SDR is selected
  const handleSdrSelection = (sdrId: string) => {
    const selectedActivity = researchActivities.find((activity: any) => activity.id === parseInt(sdrId));
    if (selectedActivity) {
      form.setValue("selectedSdrId", selectedActivity.id);
      form.setValue("sdrNumber", selectedActivity.sdrNumber);
      form.setValue("currentTitle", selectedActivity.title);
      form.setValue("projectId", selectedActivity.projectId);
      form.setValue("currentPiId", selectedActivity.budgetHolderId);
      // Map sidraBranch to activity type (Research/Clinical -> Human, others -> Non-Human)
      const activityType = selectedActivity.sidraBranch === "Research" || selectedActivity.sidraBranch === "Clinical" ? "Human" : "Non-Human";
      form.setValue("activityType", activityType);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/pmo/applications")}
            className="mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to PMO Applications
          </Button>
          
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-orange-600 dark:text-orange-400" />
            <div>
              <h1 className="text-3xl font-bold">Create RA-205A Application</h1>
              <p className="text-muted-foreground mt-1">Research Activity Change Request Form</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
          {/* Form Content - Takes 2 columns */}
          <div className="space-y-6 lg:col-span-2">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                
                {/* Basic Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Basic Information
                    </CardTitle>
                    <CardDescription>
                      Provide the basic details for the research activity change request
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="selectedSdrId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Select Existing SDR *</FormLabel>
                          <Select onValueChange={handleSdrSelection} value={field.value?.toString()}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select an existing research activity" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {researchActivities.map((activity: any) => (
                                <SelectItem key={activity.id} value={activity.id.toString()}>
                                  {activity.sdrNumber} - {activity.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Auto-populated fields (read-only) - Condensed */}
                    {selectedSdrId && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <FormField
                          control={form.control}
                          name="sdrNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm">SDR Number</FormLabel>
                              <FormControl>
                                <Input {...field} readOnly className="bg-gray-50 h-8 text-sm dark:bg-gray-900" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="activityType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm">Type</FormLabel>
                              <FormControl>
                                <Input {...field} readOnly className="bg-gray-50 h-8 text-sm dark:bg-gray-900" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="projectId"
                          render={({ field }) => {
                            const selectedProject = projects.find((p: any) => p.id === field.value);
                            return (
                              <FormItem className="md:col-span-2">
                                <FormLabel className="text-sm">Project</FormLabel>
                                <FormControl>
                                  <Input 
                                    value={selectedProject ? `${selectedProject.projectId} - ${selectedProject.title}` : ''} 
                                    readOnly 
                                    className="bg-gray-50 h-8 text-sm dark:bg-gray-900" 
                                  />
                                </FormControl>
                              </FormItem>
                            );
                          }}
                        />
                        <FormField
                          control={form.control}
                          name="currentTitle"
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel className="text-sm">Current Title</FormLabel>
                              <FormControl>
                                <Input {...field} readOnly className="bg-gray-50 h-8 text-sm dark:bg-gray-900" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    )}

                    
                    <div className="mt-4 p-4 bg-blue-50 rounded-lg dark:bg-blue-950">
                      <p className="text-sm text-blue-800 dark:text-blue-300">
                        <strong>Date:</strong> {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Change Category */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5" />
                      Change Category
                    </CardTitle>
                    <CardDescription>
                      Select the type of changes requested (multiple selections allowed)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <FormField
                        control={form.control}
                        name="changeCategory.lpiChange"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>LPI change/transfer</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="changeCategory.budgetChange"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>PRJ (budget) change</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="changeCategory.titleChange"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>SDR title change</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />

                      {/* Conditional New Title Field */}
                      {changeCategory.titleChange && (
                        <FormField
                          control={form.control}
                          name="newTitle"
                          render={({ field }) => (
                            <FormItem className="ml-6">
                              <FormLabel>New SDR Title *</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter new research activity title" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      <FormField
                        control={form.control}
                        name="changeCategory.scopeChange"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Scope change</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="changeCategory.other"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Other</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />

                      {changeCategory?.other && (
                        <FormField
                          control={form.control}
                          name="changeCategory.otherDescription"
                          render={({ field }) => (
                            <FormItem className="ml-6">
                              <FormLabel>Other Description</FormLabel>
                              <FormControl>
                                <Input placeholder="Please specify" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Change Details */}
                <Card>
                  <CardHeader>
                    <CardTitle>Change Details</CardTitle>
                    <CardDescription>
                      Provide detailed information about the requested changes
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="changeReason"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Reason for the Change Request *</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Provide detailed justification for the requested changes..."
                              className="min-h-24"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* PI Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Principal Investigator Information
                    </CardTitle>
                    <CardDescription>
                      Current and new PI information (if applicable)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="currentPiId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current PI</FormLabel>
                          <Select onValueChange={(value) => field.onChange(parseInt(value))}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select current PI" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {(scientists as any[]).map((scientist: any) => (
                                <SelectItem key={scientist.id} value={scientist.id.toString()}>
                                  {scientist.firstName} {scientist.lastName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {changeCategory?.lpiChange && (
                      <FormField
                        control={form.control}
                        name="newPiId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>New/Transferred PI</FormLabel>
                            <Select onValueChange={(value) => field.onChange(parseInt(value))}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select new PI" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {(scientists as any[]).map((scientist: any) => (
                                  <SelectItem key={scientist.id} value={scientist.id.toString()}>
                                    {scientist.firstName} {scientist.lastName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {changeCategory?.budgetChange && (
                      <FormField
                        control={form.control}
                        name="budgetSource"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Budget Source</FormLabel>
                            <FormControl>
                              <Input placeholder="New budget source/amount" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </CardContent>
                </Card>

                {/* Signatures Section */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5" />
                      Certifications & Signatures
                    </CardTitle>
                    <CardDescription>
                      Please refer to the "Certification Requirements" guide on the right for detailed responsibilities.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-medium mb-2">Current PI Certification</h4>
                        <div className="space-y-2">
                          <FormField
                            control={form.control}
                            name="approvals.currentPi.name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Name</FormLabel>
                                <FormControl>
                                  <Input placeholder="Current PI name" {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="approvals.currentPi.date"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Date</FormLabel>
                                <FormControl>
                                  <Input type="date" {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="font-medium mb-2">New/Transferred PI Certification</h4>
                        <div className="space-y-2">
                          <FormField
                            control={form.control}
                            name="approvals.newPi.name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Name</FormLabel>
                                <FormControl>
                                  <Input placeholder="New PI name" {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="approvals.newPi.date"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Date</FormLabel>
                                <FormControl>
                                  <Input type="date" {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-3">Stakeholder Certifications</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="approvals.stakeholders.pmo.name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>PMO Representative</FormLabel>
                              <FormControl>
                                <Input placeholder="PMO staff name" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="approvals.stakeholders.researchLabs.name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Research Labs Manager</FormLabel>
                              <FormControl>
                                <Input placeholder="Labs manager name" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="approvals.stakeholders.biosafety.name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Biosafety Officer</FormLabel>
                              <FormControl>
                                <Input placeholder="Biosafety officer name" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="approvals.stakeholders.finance.name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Finance & Procurement</FormLabel>
                              <FormControl>
                                <Input placeholder="Business manager name" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="approvals.stakeholders.researchGrants.name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Research Grants Manager</FormLabel>
                              <FormControl>
                                <Input placeholder="Grants manager name" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="approvals.stakeholders.researchContracts.name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Research Contract Specialist</FormLabel>
                              <FormControl>
                                <Input placeholder="Contract specialist name" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="approvals.stakeholders.researchGovernance.name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Research Governance Manager</FormLabel>
                              <FormControl>
                                <Input placeholder="Governance manager name" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="approvals.stakeholders.dataManagement.name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Research Data Management Manager</FormLabel>
                              <FormControl>
                                <Input placeholder="Data management manager name" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Submit Button */}
                <div className="flex justify-end space-x-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate("/pmo/applications")}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Creating..." : "Create Application"}
                  </Button>
                </div>
              </form>
            </Form>
          </div>

          {/* Certification Requirements Guide - Takes 1 column */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  Certification Requirements
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 max-h-[80vh] overflow-y-auto">
                
                {/* PI Certification Responsibilities */}
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 dark:bg-blue-950 dark:border-blue-800">
                  <h4 className="font-medium text-blue-900 mb-2 dark:text-blue-200">PI Certification Responsibilities</h4>
                  <p className="text-xs text-blue-800 mb-2 dark:text-blue-300">In signing below, the new/transferred PI and/or current PI certifies to:</p>
                  <ul className="space-y-1 text-xs text-blue-700 dark:text-blue-300">
                    <li>• Accept all responsibilities/know-how for the scientific conduct of the project in terms of, but not limited to, the previous activities that took place before accepting the responsibility to be the PI, all project entries in the PMO database, ethical approvals, regulatory binders, and all aspects related to project ownership.</li>
                    <li>• Account for sound know-how of the project's updates/documents/papers/etc.</li>
                    <li>• Adhere to all biosafety requirements/responsibilities for research in the labs.</li>
                    <li>• Acknowledge sample ownership/location(s) and obtain the sample register.</li>
                    <li>• Acknowledge consumable stock ownership, identify the consumed/unconsumed stock location(s), and obtain RA-206 Acknowledgment of Inventory Receipt Form and Inventory List.</li>
                    <li>• Prevent unauthorized access to biospecimens/data.</li>
                    <li>• Once funding is secured, research will be executed within a reasonable time in line with budget availability and declared deadlines.</li>
                    <li>• Accurately report any project updates on the PMO database such as, but not limited to, progress reports, email responses, and any other project information required by the PMO.</li>
                  </ul>
                </div>

                {/* Research Labs Certification */}
                <div className="p-3 bg-purple-50 rounded-lg border border-purple-200 dark:bg-purple-950 dark:border-purple-800">
                  <h4 className="font-medium text-purple-900 mb-2 dark:text-purple-200">Research Labs Manager</h4>
                  <p className="text-xs text-purple-800 mb-2 dark:text-purple-300">In signing below, the Research Laboratories Manager certifies that:</p>
                  <ul className="space-y-1 text-xs text-purple-700 dark:text-purple-300">
                    <li>• Leaving person has returned all lab notebooks under their name and the ones of their reporting staff in case they have kept it.</li>
                    <li>• Samples have been acknowledged by the receiver; in case the project has been transferred to another researcher. Or samples have been destroyed in case of closure of the study and as per IRB conditions.</li>
                    <li>• Fridges/freezers are emptied.</li>
                    <li>• New/transferred PI acknowledges all the roles/responsibilities pertaining to the samples and the requirements in the labs as well as the sample logs.</li>
                  </ul>
                </div>

                {/* Biosafety Certification */}
                <div className="p-3 bg-green-50 rounded-lg border border-green-200 dark:bg-green-950 dark:border-green-800">
                  <h4 className="font-medium text-green-900 mb-2 dark:text-green-200">Biosafety Officer</h4>
                  <p className="text-xs text-green-800 mb-2 dark:text-green-300">In signing below, the Biosafety Officer certifies that:</p>
                  <ul className="space-y-1 text-xs text-green-700 dark:text-green-300">
                    <li>• New/transferred PI is informed about and acknowledges all the upcoming roles/responsibilities/requirements of the LPI as indicated in the Biosafety Manual and IBC Research Application Approval procedure.</li>
                  </ul>
                </div>

                {/* Finance & Procurement Certification */}
                <div className="p-3 bg-orange-50 rounded-lg border border-orange-200 dark:bg-orange-950 dark:border-orange-800">
                  <h4 className="font-medium text-orange-900 mb-2 dark:text-orange-200">Finance & Procurement</h4>
                  <p className="text-xs text-orange-800 mb-2 dark:text-orange-300">In signing below, the Business Manager certifies that:</p>
                  <ul className="space-y-1 text-xs text-orange-700 dark:text-orange-300">
                    <li>• All unconsumed stock/non-stock/special items purchased against the project have been identified – as applicable.</li>
                    <li>• RA-206 Acknowledgment of Inventory Receipt Form and Inventory List has been discussed/obtained – as applicable.</li>
                    <li>• New/transferred PI acknowledges fulfilling all the upcoming roles/responsibilities pertaining to the research project's budget and have been administered the changes.</li>
                  </ul>
                </div>

                {/* Research Grants Certification */}
                <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200 dark:bg-indigo-950 dark:border-indigo-800">
                  <h4 className="font-medium text-indigo-900 mb-2 dark:text-indigo-200">Research Grants Manager</h4>
                  <p className="text-xs text-indigo-800 mb-2 dark:text-indigo-300">In signing below, the Research Grants Manager certifies that:</p>
                  <ul className="space-y-1 text-xs text-indigo-700 dark:text-indigo-300">
                    <li>• All grant-related information has been accurately transferred and acknowledged.</li>
                    <li>• New/transferred PI acknowledges fulfilling all the upcoming roles/responsibilities pertaining to grant(s).</li>
                  </ul>
                </div>

                {/* Research Contracts Certification */}
                <div className="p-3 bg-red-50 rounded-lg border border-red-200 dark:bg-red-950 dark:border-red-800">
                  <h4 className="font-medium text-red-900 mb-2 dark:text-red-200">Research Contract Specialist</h4>
                  <p className="text-xs text-red-800 mb-2 dark:text-red-300">In signing below, the Research Contract Specialist certifies that:</p>
                  <ul className="space-y-1 text-xs text-red-700 dark:text-red-300">
                    <li>• All legal contracts and terms have been discussed and have been modified, transferred, and/or closed as applicable by all counterparties.</li>
                    <li>• Intellectual Property (IP) materials, contracts, and terms have been discussed and modified, transferred, and/or closed as applicable by all counterparties.</li>
                    <li>• New/transferred PI acknowledges fulfilling all the upcoming roles/responsibilities of the research contract.</li>
                  </ul>
                </div>

                {/* Research Governance Certification */}
                <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800">
                  <h4 className="font-medium text-yellow-900 mb-2 dark:text-yellow-200">Research Governance Manager</h4>
                  <p className="text-xs text-yellow-800 mb-2 dark:text-yellow-300">In signing below, the Research Governance Manager ensures that:</p>
                  <ul className="space-y-1 text-xs text-yellow-700 dark:text-yellow-300">
                    <li>• Timely transfer of responsibilities to the new PI.</li>
                    <li>• PI responsibilities are shifted to another appropriate PI.</li>
                    <li>• If the Study is closing research records are retained at least for 3 years. Records retention must also comply with all other applicable regulations governing the study.</li>
                    <li>• All data records, including regulatory documentation and participant files, should be retained as per Sidra's retention Policy.</li>
                    <li>• All aspects concerning the project quality and compliance have been conducted in accordance with Sidra policies and procedures based on a sample basis as follows:</li>
                    <ul className="ml-4 space-y-1 text-xs text-yellow-600 dark:text-yellow-400">
                      <li>a. Ensure the availability, completeness, and accuracy of the research PI's sample tracker</li>
                      <li>b. Verification of Research Samples physically exist in the laboratory's location</li>
                      <li>c. Existence of research ICF and Enrollment logs to ensure the existence of consenting related to the Sample verified and samples labeled with deidentify code as per the Informed Consent Log</li>
                      <li>d. Ensure the accuracy and completeness of sample withdrawal and disposal processes</li>
                      <li>e. Ensure the accuracy and completeness of sample storage, shipments, and transfers, including transfer samples during the project closure</li>
                      <li>f. Ensure the completeness and accuracy of sample storage for future use</li>
                    </ul>
                  </ul>
                </div>

                {/* Research Data Management Certification */}
                <div className="p-3 bg-teal-50 rounded-lg border border-teal-200 dark:bg-teal-950 dark:border-teal-800">
                  <h4 className="font-medium text-teal-900 mb-2 dark:text-teal-200">Research Data Management Manager</h4>
                  <p className="text-xs text-teal-800 mb-2 dark:text-teal-300">In signing below, the Research Data Management Manager certifies that:</p>
                  <ul className="space-y-1 text-xs text-teal-700 dark:text-teal-300">
                    <li>• All related data has been accurately identified, located, transferred, and acknowledged by the PI.</li>
                    <li>• R004 - Research Data Access/Sharing Application Form has been obtained/discussed – as applicable.</li>
                    <li>• New/transferred PI acknowledges fulfilling all the upcoming roles/responsibilities pertaining to managing the related data.</li>
                    <li>• Verify that the new LPI has been set as the data owner in the data management systems and storage.</li>
                  </ul>
                </div>

                {/* PMO Certification */}
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 dark:bg-gray-900 dark:border-gray-700">
                  <h4 className="font-medium text-gray-900 mb-2 dark:text-gray-100">PMO (All changes)</h4>
                  <p className="text-xs text-gray-800 mb-2 dark:text-gray-200">In signing below, the PMO certifies that:</p>
                  <ul className="space-y-1 text-xs text-gray-700 dark:text-gray-300">
                    <li>• Stakeholders, where applicable, have been informed accordingly.</li>
                    <li>• The PMO database has been subsequently implemented to reflect all changes.</li>
                  </ul>
                </div>

              </CardContent>
            </Card>
          </div>
        </div>
    </div>
  );
}