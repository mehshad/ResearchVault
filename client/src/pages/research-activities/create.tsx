import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertResearchActivitySchema } from "@shared/schema";
import { Scientist, Project } from "@shared/schema";
import { CalendarIcon, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatFullName } from "@/utils/nameUtils";

// Extend the insert schema with additional validations
const createResearchActivitySchema = insertResearchActivitySchema.extend({
  sdrNumber: z.string().min(3, "SDR number must be at least 3 characters"),
  title: z.string().min(5, "Title must be at least 5 characters"),
  shortTitle: z.string().optional(),
  description: z.string().optional(),
  projectId: z.number({
    required_error: "Please select a project",
  }),
  budgetHolderId: z.number().optional(),
  additionalNotificationEmail: z.string().email().optional().or(z.literal("")),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  status: z.enum(["planning", "active", "completed", "on_hold", "pending", "suspended"], {
    required_error: "Please select a status",
  }),
  sidraBranch: z.string().optional(),
  budgetSource: z.array(z.string()).optional(),
  grantCodes: z.array(z.string()).optional(),
  objectives: z.string().optional(),
});

type CreateResearchActivityFormValues = z.infer<typeof createResearchActivitySchema>;

export default function CreateResearchActivity() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Get all projects
  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
  });

  // Get all scientists
  const { data: scientists, isLoading: scientistsLoading } = useQuery<Scientist[]>({
    queryKey: ['/api/scientists'],
  });

  // Default form values
  const defaultValues: Partial<CreateResearchActivityFormValues> = {
    status: "planning",
    sidraBranch: "Research",
  };

  const form = useForm<CreateResearchActivityFormValues>({
    resolver: zodResolver(createResearchActivitySchema),
    defaultValues,
  });

  const createResearchActivityMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/research-activities", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/research-activities'] });
      toast({
        title: "Research Activity created",
        description: "The research activity has been successfully created.",
      });
      navigate("/research-activities");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "There was an error creating the research activity.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateResearchActivityFormValues) => {
    // Convert Date objects to ISO strings for API submission
    const apiData = {
      ...data,
      startDate: data.startDate ? data.startDate.toISOString() : undefined,
      endDate: data.endDate ? data.endDate.toISOString() : undefined,
    };
    createResearchActivityMutation.mutate(apiData);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/research-activities")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h1 className="text-2xl font-semibold text-foreground">Create New Research Activity</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Research Activity Information</CardTitle>
          <CardDescription>Enter the details for the new research activity</CardDescription>
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
                        <Input placeholder="e.g. SDR-2023-001" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} />
                      </FormControl>
                      <FormDescription>
                        Unique identifier for this research activity
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="projectId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        defaultValue={field.value?.toString() || undefined}
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
                      <FormDescription>
                        Project this research activity belongs to
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
                      <FormLabel>Research Activity Title</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. CRISPR-Cas9 Gene Editing for Cancer Treatment" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} />
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
                      <FormLabel>Short Title</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. CRISPR Cancer Treatment" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} />
                      </FormControl>
                      <FormDescription>
                        Brief name for easier reference
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Brief description of the research activity" 
                          className="resize-none" 
                          rows={3}
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                


                <FormField
                  control={form.control}
                  name="budgetHolderId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Principal Investigator/Budget Holder</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        defaultValue={field.value?.toString() || undefined}
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


                
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="planning">Planning</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="on_hold">On Hold</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="additionalNotificationEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional Notification Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="e.g. notifications@example.com" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} />
                      </FormControl>
                      <FormDescription>
                        Secondary email for project notifications
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
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
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
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
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
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
                  name="sidraBranch"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Sidra Branch</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="flex flex-col space-y-1"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Research" id="research" />
                            <label htmlFor="research">Research</label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Clinical" id="clinical" />
                            <label htmlFor="clinical">Clinical</label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="External" id="external" />
                            <label htmlFor="external">External</label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <FormDescription>
                        Branch or department within Sidra
                      </FormDescription>
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
                  name="objectives"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
                      <FormLabel>Objectives</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Key objectives and goals of the research activity" 
                          className="resize-none" 
                          rows={3}
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        List specific aims and expected outcomes
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <CardFooter className="flex justify-end space-x-2 px-0">
                <Button 
                  variant="outline" 
                  onClick={() => navigate("/research-activities")}
                  type="button"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={createResearchActivityMutation.isPending}
                >
                  {createResearchActivityMutation.isPending ? 'Creating...' : 'Create Research Activity'}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
