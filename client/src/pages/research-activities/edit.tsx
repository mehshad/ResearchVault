import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save, Calendar, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { insertResearchActivitySchema, type InsertResearchActivity, type ResearchActivity, type Project, type Scientist } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatFullName } from "@/utils/nameUtils";

export default function EditResearchActivity() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const id = parseInt(params.id);

  // Fetch the existing research activity
  const { data: activity, isLoading: activityLoading } = useQuery<ResearchActivity>({
    queryKey: ['/api/research-activities', id],
    queryFn: async () => {
      const response = await fetch(`/api/research-activities/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch research activity');
      }
      return response.json();
    },
  });

  // Fetch projects for the dropdown
  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
  });

  // Get all scientists
  const { data: scientists, isLoading: scientistsLoading } = useQuery<Scientist[]>({
    queryKey: ['/api/scientists'],
  });



  const form = useForm<InsertResearchActivity>({
    resolver: zodResolver(insertResearchActivitySchema),
    defaultValues: {
      sdrNumber: "",
      title: "",
      shortTitle: "",
      description: "",
      objectives: "",
      status: "planning",
      projectId: undefined,
      budgetHolderId: undefined,
      startDate: undefined,
      endDate: undefined,
      sidraBranch: "",
      budgetSource: [],
      grantCodes: [],
    }
  });

  // Update form when activity data loads
  React.useEffect(() => {
    if (activity) {
      form.reset({
        sdrNumber: activity.sdrNumber || "",
        title: activity.title || "",
        shortTitle: activity.shortTitle || "",
        description: activity.description || "",
        objectives: activity.objectives || "",
        status: activity.status || "planning",
        projectId: activity.projectId || undefined,
        budgetHolderId: activity.budgetHolderId || undefined,
        startDate: activity.startDate ? new Date(activity.startDate) : undefined,
        endDate: activity.endDate ? new Date(activity.endDate) : undefined,
        sidraBranch: activity.sidraBranch || "",
        budgetSource: Array.isArray(activity.budgetSource) ? activity.budgetSource : activity.budgetSource ? [activity.budgetSource] : [],
        grantCodes: Array.isArray(activity.grantCodes) ? activity.grantCodes : activity.grantCodes ? [activity.grantCodes] : [],
        additionalNotificationEmail: activity.additionalNotificationEmail || "",
      });
    }
  }, [activity, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PUT", `/api/research-activities/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/research-activities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/research-activities', id] });
      toast({
        title: "Research activity updated",
        description: "The research activity has been successfully updated.",
      });
      navigate(`/research-activities/${id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update research activity. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertResearchActivity) => {
    // Convert Date objects to ISO strings for API, handle null values properly  
    const formattedData = {
      ...data,
      startDate: data.startDate ? data.startDate.toISOString() : null,
      endDate: data.endDate ? data.endDate.toISOString() : null,
      description: data.description || null,
      objectives: data.objectives || null,
      budgetSource: data.budgetSource || null,
      additionalNotificationEmail: data.additionalNotificationEmail || null,
    };
    updateMutation.mutate(formattedData);
  };

  if (activityLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/research-activities/${id}`)}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Skeleton className="h-8 w-64" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/research-activities")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">Research Activity Not Found</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <p className="text-lg text-foreground">The research activity you're trying to edit could not be found.</p>
              <Button className="mt-4" onClick={() => navigate("/research-activities")}>
                Return to Research Activities List
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/research-activities/${id}`)}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">Edit Research Activity</h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Research Activity Information</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="sdrNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SDR Number</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., SDR-001" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} />
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
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="planning">Planning</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="on-hold">On Hold</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter the full project title" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="shortTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Short Title (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter a short title for easier reference" 
                        {...field} 
                        value={field.value || ""} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="projectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Associated Project</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      value={field.value?.toString() || ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a project" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {projectsLoading ? (
                          <SelectItem value="loading" disabled>Loading projects...</SelectItem>
                        ) : (
                          projects?.map((project) => (
                            <SelectItem key={project.id} value={project.id.toString()}>
                              {project.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="budgetHolderId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Principal Investigator/Budget Holder</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        value={field.value?.toString() || ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select principal investigator/budget holder" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {scientistsLoading ? (
                            <SelectItem value="loading" disabled>Loading scientists...</SelectItem>
                          ) : (
                            scientists?.filter(scientist => 
                              scientist.jobTitle === 'Investigator' || 
                              scientist.jobTitle === 'Staff Scientist' || 
                              scientist.jobTitle === 'Physician'
                            ).map((scientist) => (
                              <SelectItem key={scientist.id} value={scientist.id.toString()}>
                                {formatFullName(scientist)} ({scientist.jobTitle})
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Must be an Investigator, Staff Scientist, or Physician
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />


              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Start Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) =>
                              date > new Date() || date < new Date("1900-01-01")
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>End Date (Optional)</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date < new Date("1900-01-01")}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="additionalNotificationEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Additional Notification Email (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter additional email for notifications" 
                        type="email"
                        {...field} 
                        value={field.value || ""} 
                      />
                    </FormControl>
                    <FormDescription>
                      Optional email address to receive notifications about this research activity
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="sidraBranch"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Sidra Branch</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value || ""}
                          className="flex flex-col space-y-1"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Research" id="edit-research" />
                            <label htmlFor="edit-research">Research</label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Clinical" id="edit-clinical" />
                            <label htmlFor="edit-clinical">Clinical</label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="External" id="edit-external" />
                            <label htmlFor="edit-external">External</label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="budgetSource"
                  render={() => (
                    <FormItem>
                      <FormLabel>Budget Source</FormLabel>
                      <div className="space-y-2">
                        {["IRF", "PI Fund", "QNRF", "External Grant", "Institutional", "Other"].map((source) => (
                          <FormField
                            key={source}
                            control={form.control}
                            name="budgetSource"
                            render={({ field }) => {
                              return (
                                <FormItem
                                  key={source}
                                  className="flex flex-row items-start space-x-3 space-y-0"
                                >
                                  <FormControl>
                                    <Checkbox
                                      checked={(field.value || []).includes(source)}
                                      onCheckedChange={(checked) => {
                                        const currentValues = field.value || [];
                                        if (checked) {
                                          field.onChange([...currentValues, source]);
                                        } else {
                                          field.onChange(currentValues.filter((value: string) => value !== source));
                                        }
                                      }}
                                    />
                                  </FormControl>
                                  <FormLabel className="font-normal">
                                    {source}
                                  </FormLabel>
                                </FormItem>
                              );
                            }}
                          />
                        ))}
                      </div>
                      <FormDescription>
                        Select all applicable funding sources
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Grant Codes - Show input fields for selected budget sources */}
              {(() => {
                const selectedBudgetSources = form.watch("budgetSource") || [];
                
                if (selectedBudgetSources.length === 0) {
                  return null;
                }

                return (
                  <FormField
                    control={form.control}
                    name="grantCodes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Grant Codes</FormLabel>
                        <div className="space-y-3">
                          {selectedBudgetSources.map((source, index) => (
                            <div key={source} className="flex items-center space-x-3">
                              <div className="w-24 text-sm font-medium text-gray-600 dark:text-gray-300">
                                {source}:
                              </div>
                              <Input
                                placeholder={`Enter ${source} grant code`}
                                value={(field.value || [])[index] || ""}
                                onChange={(e) => {
                                  const newCodes = [...(field.value || [])];
                                  newCodes[index] = e.target.value;
                                  field.onChange(newCodes);
                                }}
                                className="flex-1"
                              />
                            </div>
                          ))}
                        </div>
                        <FormDescription>
                          Enter grant codes for each selected funding source
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                );
              })()}

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe the research activity, methodology, and expected outcomes"
                        className="min-h-[100px]"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="objectives"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Objectives</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="List the main objectives and goals of this research activity"
                        className="min-h-[100px]"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-4">
                <Button
                  type="submit"
                  className="bg-sidra-teal hover:bg-sidra-teal-dark text-white"
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update Research Activity
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(`/research-activities/${id}`)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}