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
import { insertPublicationSchema, type ResearchActivity } from "@shared/schema";
import { ArrowLeft } from "lucide-react";

// Extend the insert schema with additional validations
const createPublicationSchema = insertPublicationSchema.extend({
  title: z.string().min(5, "Title must be at least 5 characters"),
  abstract: z.string().optional(),
  authors: z.string().optional(),
  journal: z.string().optional(),
  volume: z.string().optional(),
  issue: z.string().optional(),
  pages: z.string().optional(),
  doi: z.string().optional(),
  pmid: z.string().optional(),
  publicationDate: z.string().optional(),
  publicationType: z.string().optional(),
  researchActivityId: z.number().min(1, "Research Activity (SDR) is required"),
  status: z.string().optional(),
});

type CreatePublicationFormValues = z.infer<typeof createPublicationSchema>;

export default function CreatePublication() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  // Get all research activities for selection
  const { data: researchActivities, isLoading: activitiesLoading } = useQuery<ResearchActivity[]>({
    queryKey: ['/api/research-activities'],
  });

  // Default form values — every controlled <input> needs a defined initial
  // value or React will warn that the field is switching between
  // uncontrolled/controlled the first time the user types.
  const defaultValues: Partial<CreatePublicationFormValues> = {
    status: "Concept",
    publicationType: "Journal Article",
    title: "",
    abstract: "",
    authors: "",
    journal: "",
    volume: "",
    issue: "",
    pages: "",
    doi: "",
    pmid: "",
    publicationDate: "",
  };

  const form = useForm<CreatePublicationFormValues>({
    resolver: zodResolver(createPublicationSchema),
    defaultValues,
  });

  const createPublicationMutation = useMutation({
    mutationFn: async (data: CreatePublicationFormValues) => {
      const response = await apiRequest("POST", "/api/publications", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/publications'] });
      toast({
        title: "Publication added",
        description: "The publication has been successfully added to the system.",
      });
      navigate("/publications");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "There was an error adding the publication.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreatePublicationFormValues) => {
    // Convert date to string format for API
    const submitData = {
      ...data,
      publicationDate: data.publicationDate ? data.publicationDate : undefined,
      researchActivityId: data.researchActivityId,
    };
    createPublicationMutation.mutate(submitData);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/publications")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h1 className="text-2xl font-semibold text-foreground">Add Publication</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form - Left 2/3 */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Publication Information</CardTitle>
              <CardDescription>Enter the details of the research publication</CardDescription>
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
                      <FormLabel>Publication Title *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. CRISPR-Cas9 Efficiency in Human Cell Lines" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="researchActivityId"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
                      <FormLabel>Research Activity (SDR) *</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        value={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select research activity" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {activitiesLoading ? (
                            <SelectItem value="loading" disabled>Loading...</SelectItem>
                          ) : (
                            researchActivities?.map((activity) => (
                              <SelectItem key={activity.id} value={activity.id.toString()}>
                                {activity.sdrNumber} - {activity.title}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="authors"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
                      <FormLabel>Authors <span className="text-gray-500 dark:text-gray-400">(Optional - required for Complete Draft status)</span></FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="List of authors (e.g., Smith J, Doe A, Johnson B) - leave empty for Concept stage"
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
                  name="abstract"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
                      <FormLabel>Abstract</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Publication abstract or summary" 
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
                  name="journal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Journal</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Nature Biotechnology" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="publicationType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Publication Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Journal Article">Journal Article</SelectItem>
                          <SelectItem value="Review">Review</SelectItem>
                          <SelectItem value="Conference Paper">Conference Paper</SelectItem>
                          <SelectItem value="Book Chapter">Book Chapter</SelectItem>
                          <SelectItem value="Editorial">Editorial</SelectItem>
                          <SelectItem value="Letter">Letter</SelectItem>
                          <SelectItem value="Case Report">Case Report</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="publicationDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Publication Date</FormLabel>
                      <FormControl>
                        <Input type="date" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="volume"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Volume</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 42" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="issue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Issue</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 3" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="pages"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pages</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 123-135" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="doi"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>DOI</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 10.1038/nbt.4321" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="pmid"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PMID</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 36293564" autoComplete="off" data-testid="input-pmid" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
              </div>

              <CardFooter className="flex justify-end space-x-2 px-0">
                <Button 
                  variant="outline" 
                  onClick={() => navigate("/publications")}
                  type="button"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={createPublicationMutation.isPending}
                >
                  {createPublicationMutation.isPending ? 'Saving...' : 'Save Publication'}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </CardContent>
          </Card>
        </div>
        
        {/* Workflow Guide - Right 1/3 */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Publication Workflow</CardTitle>
              <CardDescription>Status progression and requirements</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="p-3 border rounded-lg bg-gray-50 dark:bg-gray-900">
                  <h4 className="font-medium text-sm text-blue-800 dark:text-blue-300">1. Concept</h4>
                  <p className="text-xs text-gray-600 mt-1 dark:text-gray-300">Initial stage - basic title and SDR required</p>
                  <p className="text-xs text-blue-600 mt-1 dark:text-blue-400">Required: Title, SDR</p>
                </div>
                
                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium text-sm">2. Complete Draft</h4>
                  <p className="text-xs text-gray-600 mt-1 dark:text-gray-300">Full manuscript ready</p>
                  <p className="text-xs text-orange-600 mt-1 dark:text-orange-400">Required: Authors</p>
                </div>
                
                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium text-sm">3. Vetted for submission</h4>
                  <p className="text-xs text-gray-600 mt-1 dark:text-gray-300">IP office approval obtained</p>
                  <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">Ready for submission decision</p>
                </div>
                
                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium text-sm">4. Submitted for review</h4>
                  <p className="text-xs text-gray-600 mt-1 dark:text-gray-300">With/without pre-publication</p>
                  <p className="text-xs text-purple-600 mt-1 dark:text-purple-400">May require: Pre-pub URL & Site</p>
                </div>
                
                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium text-sm">5. Under review</h4>
                  <p className="text-xs text-gray-600 mt-1 dark:text-gray-300">Journal review process</p>
                  <p className="text-xs text-green-600 mt-1 dark:text-green-400">Required: Journal name</p>
                </div>
                
                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium text-sm">6. Accepted/In Press</h4>
                  <p className="text-xs text-gray-600 mt-1 dark:text-gray-300">Accepted, awaiting publication</p>
                  <p className="text-xs text-green-600 mt-1 dark:text-green-400">Required: Journal name</p>
                </div>
                
                <div className="p-3 border rounded-lg bg-green-50 dark:bg-green-950">
                  <h4 className="font-medium text-sm text-green-800 dark:text-green-300">7. Published</h4>
                  <p className="text-xs text-gray-600 mt-1 dark:text-gray-300">Final published version</p>
                  <p className="text-xs text-green-600 mt-1 dark:text-green-400">Required: Publication date, DOI</p>
                </div>
                
                <div className="p-3 border rounded-lg bg-green-100 dark:bg-green-950">
                  <h4 className="font-medium text-sm text-green-900 flex items-center gap-1 dark:text-green-200">
                    <span className="text-yellow-500">★</span>
                    8. Published
                  </h4>
                  <p className="text-xs text-gray-600 mt-1 dark:text-gray-300">Publication Office vetted and approved</p>
                  <p className="text-xs text-green-700 mt-1 dark:text-green-300">Final status - workflow complete</p>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-blue-50 rounded-lg dark:bg-blue-950">
                <h5 className="font-medium text-sm text-blue-800 mb-2 dark:text-blue-300">Automatic Processing</h5>
                <ul className="text-xs text-blue-700 space-y-1 dark:text-blue-300">
                  <li>• Titles are auto-capitalized</li>
                  <li>• Author names are standardized</li>
                  <li>• Fields marked with * are required</li>
                  <li>• Status updates validate required fields</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
