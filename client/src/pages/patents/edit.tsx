import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertPatentSchema, type Patent, type ResearchActivity } from "@shared/schema";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import React from "react";
import { fetchRecord } from "@/lib/fetchList";

// The date inputs hold "yyyy-mm-dd" strings; the mutation turns them into
// Dates before sending, so the form validates them as strings.
const editPatentSchema = insertPatentSchema.extend({
  filingDate: z.string().optional(),
  grantDate: z.string().optional(),
});
type EditPatentFormValues = z.infer<typeof editPatentSchema>;

export default function PatentEdit() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: patent, isLoading } = useQuery<Patent>({
    queryKey: ['/api/patents', id],
    queryFn: () => fetchRecord(`/api/patents/${id}`),
    enabled: !!id,
  });

  const { data: researchActivities } = useQuery<ResearchActivity[]>({
    queryKey: ['/api/research-activities'],
  });

  const form = useForm<EditPatentFormValues>({
    resolver: zodResolver(editPatentSchema),
    defaultValues: {
      researchActivityId: patent?.researchActivityId || 0,
      title: patent?.title || "",
      inventors: patent?.inventors || "",
      patentNumber: patent?.patentNumber || "",
      filingDate: patent?.filingDate ? new Date(patent.filingDate).toISOString().split('T')[0] : "",
      grantDate: patent?.grantDate ? new Date(patent.grantDate).toISOString().split('T')[0] : "",
      status: patent?.status || "Filed",
    },
  });

  // Update form when patent data loads
  React.useEffect(() => {
    if (patent) {
      form.reset({
        researchActivityId: patent.researchActivityId,
        title: patent.title,
        inventors: patent.inventors || "",
        patentNumber: patent.patentNumber || "",
        filingDate: patent.filingDate ? new Date(patent.filingDate).toISOString().split('T')[0] : "",
        grantDate: patent.grantDate ? new Date(patent.grantDate).toISOString().split('T')[0] : "",
        status: patent.status || "Filed",
      });
    }
  }, [patent, form]);

  const updateMutation = useMutation({
    mutationFn: (data: EditPatentFormValues) => 
      apiRequest("PATCH", `/api/patents/${id}`, {
        ...data,
        filingDate: data.filingDate ? new Date(data.filingDate) : null,
        grantDate: data.grantDate ? new Date(data.grantDate) : null,
      }),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Patent updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/patents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/patents', id] });
      navigate(`/patents/${id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update patent",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EditPatentFormValues) => {
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/patents")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Skeleton className="h-8 w-64" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!patent) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/patents")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">Patent Not Found</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <p className="text-lg text-foreground">The patent you're trying to edit could not be found.</p>
              <Button className="mt-4" onClick={() => navigate("/patents")}>
                Return to Patents List
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/patents/${id}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h1 className="text-2xl font-semibold text-foreground">Edit Patent</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Patent Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="researchActivityId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Research Activity (SDR)</FormLabel>
                    <Select onValueChange={(value) => field.onChange(Number(value))} value={field.value?.toString()}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a research activity" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {researchActivities?.map((activity) => (
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

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Patent title" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="inventors"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Inventors</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="List of inventors (e.g., Smith J, Doe A, Johnson B)"
                        autoComplete="off" data-1p-ignore="true" data-lpignore="true"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="patentNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Patent Number</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., US10123456B2" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField
                  control={form.control}
                  name="filingDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Filing Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="grantDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Grant Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Filed">Filed</SelectItem>
                          <SelectItem value="Published">Published</SelectItem>
                          <SelectItem value="Granted">Granted</SelectItem>
                          <SelectItem value="Rejected">Rejected</SelectItem>
                          <SelectItem value="Abandoned">Abandoned</SelectItem>
                          <SelectItem value="Pending">Pending</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              </div>

              <div className="flex gap-4">
                <Button 
                  type="submit" 
                  disabled={updateMutation.isPending}
                  className="bg-sidra-teal hover:bg-sidra-teal-dark text-white"
                >
                  {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update Patent
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => navigate(`/patents/${id}`)}
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