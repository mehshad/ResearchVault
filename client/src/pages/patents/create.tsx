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
import { insertPatentSchema } from "@shared/schema";
import { EnhancedProject } from "@/lib/types";
import { CalendarIcon, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Extend the insert schema with additional validations
const createPatentSchema = insertPatentSchema.extend({
  title: z.string().min(5, "Title must be at least 5 characters"),
  inventors: z.string().min(3, "Inventors field is required"),
  filingDate: z.date().optional(),
  grantDate: z.date().optional(),
  patentNumber: z.string().optional(),
  status: z.string({
    required_error: "Please select a status",
  }),
  description: z.string().optional(),
  projectId: z.number().nullable().optional(),
});

type CreatePatentFormValues = z.infer<typeof createPatentSchema>;

export default function CreatePatent() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  // Get all projects for project selection
  const { data: projects, isLoading: projectsLoading } = useQuery<EnhancedProject[]>({
    queryKey: ['/api/projects'],
  });

  // Default form values
  const defaultValues: Partial<CreatePatentFormValues> = {
    status: "In Preparation",
    projectId: null,
  };

  const form = useForm<CreatePatentFormValues>({
    resolver: zodResolver(createPatentSchema),
    defaultValues,
  });

  const createPatentMutation = useMutation({
    mutationFn: async (data: CreatePatentFormValues) => {
      const response = await apiRequest("POST", "/api/patents", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patents'] });
      toast({
        title: "Patent added",
        description: "The patent has been successfully added to the system.",
      });
      navigate("/patents");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "There was an error adding the patent.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreatePatentFormValues) => {
    createPatentMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/patents")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h1 className="text-2xl font-semibold text-foreground">Add Patent</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Patent Information</CardTitle>
          <CardDescription>Enter the details of the patent</CardDescription>
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
                      <FormLabel>Patent Title</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Method for Targeted Gene Delivery Using Modified CRISPR System" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="inventors"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
                      <FormLabel>Inventors</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Rodriguez M, Doe J" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} />
                      </FormControl>
                      <FormDescription>
                        List inventors in the format: Last name, First initial, separated by commas
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
                          placeholder="Brief description of the patented invention" 
                          className="resize-none" 
                          rows={4}
                          autoComplete="off" data-1p-ignore="true" data-lpignore="true"
                          {...field} 
                        />
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
                          <SelectItem value="In Preparation">In Preparation</SelectItem>
                          <SelectItem value="Filed">Filed</SelectItem>
                          <SelectItem value="Pending">Pending</SelectItem>
                          <SelectItem value="Granted">Granted</SelectItem>
                          <SelectItem value="Rejected">Rejected</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="patentNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Patent Number</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. US2023/0123456" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} />
                      </FormControl>
                      <FormDescription>
                        Leave blank if not yet assigned
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="filingDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Filing Date</FormLabel>
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
                  name="grantDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Grant Date</FormLabel>
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
                      <FormDescription>
                        Leave blank if not yet granted
                      </FormDescription>
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
                        onValueChange={(value) => field.onChange(value === "none" ? null : parseInt(value))}
                        defaultValue={field.value?.toString() || "none"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select associated project (optional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
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
                        Link this patent to a research project (optional)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <CardFooter className="flex justify-end space-x-2 px-0">
                <Button 
                  variant="outline" 
                  onClick={() => navigate("/patents")}
                  type="button"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={createPatentMutation.isPending}
                >
                  {createPatentMutation.isPending ? 'Saving...' : 'Save Patent'}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
