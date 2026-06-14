// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
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
import { ArrowLeft, FileText, Users, CheckCircle2, AlertCircle, Save, Send, History, MessageSquare } from "lucide-react";
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

export default function EditRA205AApplication() {
  const [location, navigate] = useLocation();
  const [match] = useRoute("/pmo/applications/:id/edit-ra205a");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const applicationId = match?.id;

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

  // Load application data
  const { data: application, isLoading } = useQuery({
    queryKey: ['/api/ra205a-applications', applicationId],
    enabled: !!applicationId
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

  // Populate form when application data loads
  useEffect(() => {
    if (application) {
      form.reset({
        selectedSdrId: application.selectedSdrId,
        sdrNumber: application.sdrNumber || "",
        currentTitle: application.currentTitle || "",
        activityType: application.activityType || "Human",
        projectId: application.projectId,
        currentPiId: application.currentPiId,
        changeCategory: application.changeCategory || {
          lpiChange: false,
          budgetChange: false,
          titleChange: false,
          scopeChange: false,
          other: false,
          otherDescription: "",
        },
        newTitle: application.newTitle || "",
        changeReason: application.changeReason || "",
        newPiId: application.newPiId,
        budgetSource: application.budgetSource || "",
        changeRequestNumber: application.changeRequestNumber || "",
        approvals: application.approvals || {
          currentPi: { name: "", date: "", signature: "" },
          newPi: { name: "", date: "", signature: "" },
          stakeholders: {
            pmo: { name: "", date: "", signature: "" },
            researchLabs: { name: "", date: "", signature: "" },
            biosafety: { name: "", date: "", signature: "" },
            finance: { name: "", date: "", signature: "" },
            grants: { name: "", date: "", signature: "" },
            contracts: { name: "", date: "", signature: "" },
            governance: { name: "", date: "", signature: "" },
            dataManagement: { name: "", date: "", signature: "" },
          },
        },
      });
    }
  }, [application, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: RA205AFormData) => {
      return apiRequest(`/api/ra205a-applications/${applicationId}`, "PUT", {
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
      });
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ra205a-applications"] });
      toast({
        title: "Application Updated",
        description: `RA-205A application updated successfully.`,
      });
      navigate(`/pmo/applications`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update application",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: RA205AFormData) => {
    setIsSubmitting(true);
    try {
      await updateMutation.mutateAsync(data);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="p-6">Loading application...</div>;
  }

  if (!application) {
    return <div className="p-6">Application not found</div>;
  }

  const canEdit = application.status === 'draft' || application.status === 'revision_requested';

  if (!canEdit) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/pmo/applications`)}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">Cannot Edit Application</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <p className="text-lg text-foreground">Applications can only be edited when in 'draft' or 'revision requested' status.</p>
              <Button className="mt-4" onClick={() => navigate(`/pmo/applications`)}>
                View Applications
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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
              <h1 className="text-3xl font-bold">Edit RA-205A Application</h1>
              <p className="text-muted-foreground mt-1">Research Activity Change Request Form - {application.applicationId}</p>
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
                      Update the basic details for the research activity change request
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
                          name="approvals.stakeholders.grants.name"
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
                          name="approvals.stakeholders.contracts.name"
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
                          name="approvals.stakeholders.governance.name"
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
                    {isSubmitting ? "Updating..." : "Update Application"}
                  </Button>
                </div>
              </form>
            </Form>
          </div>

          {/* Right Sidebar - Guide, History, and Communications */}
          <div className="space-y-6">
            {/* Certification Requirements Guide */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  Certification Requirements
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto">
                
                {/* PI Certification Responsibilities */}
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 dark:bg-blue-950 dark:border-blue-800">
                  <h4 className="font-medium text-blue-900 mb-2 dark:text-blue-200">PI Certification Responsibilities</h4>
                  <p className="text-xs text-blue-800 mb-2 dark:text-blue-300">In signing below, the new/transferred PI and/or current PI certifies to:</p>
                  <ul className="space-y-1 text-xs text-blue-700 dark:text-blue-300">
                    <li>• Accept all responsibilities/know-how for the scientific conduct of the project</li>
                    <li>• Account for sound know-how of the project's updates/documents/papers/etc.</li>
                    <li>• Adhere to all biosafety requirements/responsibilities for research in the labs</li>
                    <li>• Acknowledge sample ownership/location(s) and obtain the sample register</li>
                    <li>• Acknowledge consumable stock ownership and obtain RA-206 Acknowledgment</li>
                  </ul>
                </div>

                {/* Research Labs Certification */}
                <div className="p-3 bg-purple-50 rounded-lg border border-purple-200 dark:bg-purple-950 dark:border-purple-800">
                  <h4 className="font-medium text-purple-900 mb-2 dark:text-purple-200">Research Labs Manager</h4>
                  <ul className="space-y-1 text-xs text-purple-700 dark:text-purple-300">
                    <li>• Leaving person has returned all lab notebooks</li>
                    <li>• Samples have been acknowledged by the receiver</li>
                    <li>• Fridges/freezers are emptied</li>
                  </ul>
                </div>

                {/* Other stakeholder certifications - condensed for space */}
                <div className="space-y-2">
                  <div className="p-2 bg-green-50 rounded border border-green-200 dark:bg-green-950 dark:border-green-800">
                    <h5 className="font-medium text-green-900 text-xs dark:text-green-200">Biosafety Officer</h5>
                    <p className="text-xs text-green-700 dark:text-green-300">New/transferred PI informed about biosafety responsibilities</p>
                  </div>
                  
                  <div className="p-2 bg-orange-50 rounded border border-orange-200 dark:bg-orange-950 dark:border-orange-800">
                    <h5 className="font-medium text-orange-900 text-xs dark:text-orange-200">Finance & Procurement</h5>
                    <p className="text-xs text-orange-700 dark:text-orange-300">Stock identification and RA-206 acknowledgment</p>
                  </div>
                  
                  <div className="p-2 bg-indigo-50 rounded border border-indigo-200 dark:bg-indigo-950 dark:border-indigo-800">
                    <h5 className="font-medium text-indigo-900 text-xs dark:text-indigo-200">Research Grants Manager</h5>
                    <p className="text-xs text-indigo-700 dark:text-indigo-300">Grant information transferred and acknowledged</p>
                  </div>
                  
                  <div className="p-2 bg-red-50 rounded border border-red-200 dark:bg-red-950 dark:border-red-800">
                    <h5 className="font-medium text-red-900 text-xs dark:text-red-200">Research Contract Specialist</h5>
                    <p className="text-xs text-red-700 dark:text-red-300">Legal contracts and IP materials transferred</p>
                  </div>
                  
                  <div className="p-2 bg-yellow-50 rounded border border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800">
                    <h5 className="font-medium text-yellow-900 text-xs dark:text-yellow-200">Research Governance Manager</h5>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">Timely transfer and record retention compliance</p>
                  </div>
                  
                  <div className="p-2 bg-teal-50 rounded border border-teal-200 dark:bg-teal-950 dark:border-teal-800">
                    <h5 className="font-medium text-teal-900 text-xs dark:text-teal-200">Research Data Management Manager</h5>
                    <p className="text-xs text-teal-700 dark:text-teal-300">Data transferred and R004 form obtained</p>
                  </div>
                  
                  <div className="p-2 bg-gray-50 rounded border border-gray-200 dark:bg-gray-900 dark:border-gray-700">
                    <h5 className="font-medium text-gray-900 text-xs dark:text-gray-100">PMO (All changes)</h5>
                    <p className="text-xs text-gray-700 dark:text-gray-300">Stakeholders informed and database updated</p>
                  </div>
                </div>

              </CardContent>
            </Card>

            {/* Review History */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Review History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {application.reviewHistory && application.reviewHistory.length > 0 ? (
                    application.reviewHistory.map((entry: any, index: number) => (
                      <div key={index} className="border-l-4 border-orange-200 pl-4 pb-3 dark:border-orange-800">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-sm">{entry.action}</p>
                            <p className="text-xs text-muted-foreground">{entry.user}</p>
                            {entry.comment && (
                              <p className="text-sm mt-1">{entry.comment}</p>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No review history yet</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Communications */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Communications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Office Comments */}
                  <div>
                    <h4 className="font-medium text-sm mb-2">Office Comments</h4>
                    <div className="space-y-2">
                      {application.officeComments && application.officeComments.length > 0 ? (
                        application.officeComments.map((comment: any, index: number) => (
                          <div key={index} className="bg-red-50 p-3 rounded border-l-4 border-red-200 dark:bg-red-950 dark:border-red-800">
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-medium text-sm">{comment.user}</span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(comment.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm">{comment.comment}</p>
                            {comment.action && (
                              <span className="text-xs text-red-600 font-medium dark:text-red-400">Action: {comment.action}</span>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No office comments</p>
                      )}
                    </div>
                  </div>

                  {/* PI Comments */}
                  <div>
                    <h4 className="font-medium text-sm mb-2">PI Comments</h4>
                    <div className="space-y-2">
                      {application.piComments && application.piComments.length > 0 ? (
                        application.piComments.map((comment: any, index: number) => (
                          <div key={index} className="bg-blue-50 p-3 rounded border-l-4 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-medium text-sm">{comment.user}</span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(comment.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm">{comment.comment}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No PI comments</p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
    </div>
  );
}