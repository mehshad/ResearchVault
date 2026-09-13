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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertDataManagementPlanSchema } from "@shared/schema";
import { Project } from "@shared/schema";
import { ArrowLeft } from "lucide-react";

// Extend the insert schema with additional validations
const createDataManagementPlanSchema = insertDataManagementPlanSchema.extend({
  title: z.string().min(5, "Title must be at least 5 characters"),
  projectId: z.number({
    required_error: "Please select a project",
  }),
  description: z.string().optional(),
  dataCollectionMethods: z.string().optional(),
  dataStoragePlan: z.string().optional(),
  dataSharingPlan: z.string().optional(),
  retentionPeriod: z.string().optional(),
});

type CreateDataManagementPlanFormValues = z.infer<typeof createDataManagementPlanSchema>;

export default function CreateDataManagement() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  // Get all projects for selection
  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
  });

  // Default form values
  const defaultValues: Partial<CreateDataManagementPlanFormValues> = {
    retentionPeriod: "10 years",
  };

  const form = useForm<CreateDataManagementPlanFormValues>({
    resolver: zodResolver(createDataManagementPlanSchema),
    defaultValues,
  });

  // Check if a project already has a data management plan
  const { data: existingPlans } = useQuery<any[]>({
    queryKey: ['/api/data-management-plans'],
  });

  const projectsWithPlans = new Set(
    existingPlans?.map(plan => plan.projectId) || []
  );

  const createDataManagementPlanMutation = useMutation({
    mutationFn: async (data: CreateDataManagementPlanFormValues) => {
      const response = await apiRequest("POST", "/api/data-management-plans", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/data-management-plans'] });
      toast({
        title: "Data Management Plan created",
        description: "The data management plan has been successfully created.",
      });
      navigate("/data-management");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "There was an error creating the data management plan. A plan may already exist for this project.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateDataManagementPlanFormValues) => {
    // Check if a plan already exists for this project
    if (projectsWithPlans.has(data.projectId)) {
      toast({
        title: "Error",
        description: "A data management plan already exists for this project.",
        variant: "destructive",
      });
      return;
    }
    createDataManagementPlanMutation.mutate(data);
  };

  const availableProjects = projects?.filter(project => !projectsWithPlans.has(project.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/data-management")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h1 className="text-2xl font-semibold text-foreground">Create Data Management Plan</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data Management Plan Information</CardTitle>
          <CardDescription>Detail how research data will be collected, stored, and shared</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
                      <FormLabel>Plan Title</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Data Management Plan for CRISPR-Cas9 Project" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="projectId"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
                      <FormLabel>Associated Project</FormLabel>
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
                          ) : availableProjects && availableProjects.length > 0 ? (
                            availableProjects.map((project) => (
                              <SelectItem key={project.id} value={project.id.toString()}>
                                {project.name}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="none" disabled>No available projects</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Only projects without an existing data management plan are shown
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
                      <FormLabel>Plan Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Comprehensive overview of data management for this research project" 
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
                  name="dataCollectionMethods"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
                      <FormLabel>Data Collection Methods</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="e.g. Next-generation sequencing, Western blot, qPCR" 
                          className="resize-none" 
                          rows={2}
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        Describe the methods and tools used to collect research data
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="dataStoragePlan"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data Storage Plan</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="e.g. Data will be stored on institutional secure servers with daily backups" 
                          className="resize-none" 
                          rows={3}
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        Detail how and where research data will be stored
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="dataSharingPlan"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data Sharing Plan</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="e.g. De-identified data will be shared via public repositories after publication" 
                          className="resize-none" 
                          rows={3}
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        Describe how data will be shared with other researchers
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="retentionPeriod"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
                      <FormLabel>Retention Period</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 10 years" {...field} />
                      </FormControl>
                      <FormDescription>
                        How long the data will be retained after project completion
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <CardFooter className="flex justify-end space-x-2 px-0">
                <Button 
                  variant="outline" 
                  onClick={() => navigate("/data-management")}
                  type="button"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={createDataManagementPlanMutation.isPending}
                >
                  {createDataManagementPlanMutation.isPending ? 'Creating...' : 'Create Plan'}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
