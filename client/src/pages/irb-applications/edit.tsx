import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertIrbApplicationSchema, type InsertIrbApplication, type IrbApplication, type ResearchActivity } from "@shared/schema";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import React from "react";

export default function IrbApplicationEdit() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: irbApplication, isLoading } = useQuery<IrbApplication>({
    queryKey: ['/api/irb-applications', id],
    queryFn: () => fetch(`/api/irb-applications/${id}`).then(res => res.json()),
    enabled: !!id,
  });

  const { data: researchActivities } = useQuery<ResearchActivity[]>({
    queryKey: ['/api/research-activities'],
  });

  const form = useForm<InsertIrbApplication>({
    resolver: zodResolver(insertIrbApplicationSchema),
    defaultValues: {
      researchActivityId: irbApplication?.researchActivityId || 0,
      irbNumber: irbApplication?.irbNumber || "",
      title: irbApplication?.title || "",
      principalInvestigatorId: irbApplication?.principalInvestigatorId ?? 0,
      workflowStatus: irbApplication?.workflowStatus || "draft",
    },
  });

  // Update form when IRB application data loads
  React.useEffect(() => {
    if (irbApplication) {
      form.reset({
        researchActivityId: irbApplication.researchActivityId || 0,
        irbNumber: irbApplication.irbNumber,
        title: irbApplication.title,
        principalInvestigatorId: irbApplication.principalInvestigatorId,
        status: irbApplication.status,
        workflowStatus: irbApplication.workflowStatus,
      });
    }
  }, [irbApplication, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: InsertIrbApplication) => {
      const response = await fetch(`/api/irb-applications/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update IRB application');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "IRB application updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/irb-applications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/irb-applications', id] });
      navigate(`/irb-applications/${id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update IRB application",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertIrbApplication) => {
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/irb-applications")}>
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

  if (!irbApplication) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/irb-applications")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">IRB Application Not Found</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <p className="text-lg text-foreground">The IRB application you're trying to edit could not be found.</p>
              <Button className="mt-4" onClick={() => navigate("/irb-applications")}>
                Return to IRB Applications List
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
        <Button variant="ghost" size="sm" onClick={() => navigate(`/irb-applications/${id}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h1 className="text-2xl font-semibold text-foreground">Edit IRB Application</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>IRB Application Details</CardTitle>
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
                name="irbNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>IRB Application Number</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., IRB-001" 
                        {...field} 
                        disabled 
                        className="bg-gray-50 dark:bg-gray-900" 
                      />
                    </FormControl>
                    <FormDescription>
                      IRB numbers are automatically assigned and cannot be edited
                    </FormDescription>
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
                      <Input placeholder="IRB application title" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="principalInvestigatorId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Principal Investigator</FormLabel>
                    <Select onValueChange={(value) => field.onChange(Number(value))} value={field.value?.toString()}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select principal investigator" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {/* Note: We'd need scientists data here, but keeping simple for now */}
                        <SelectItem value="1">Dr. Emily Chen</SelectItem>
                        <SelectItem value="2">Dr. Michael Johnson</SelectItem>
                        <SelectItem value="3">Dr. Sarah Williams</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />





              <div className="flex gap-4">
                <Button 
                  type="submit" 
                  disabled={updateMutation.isPending}
                  className="bg-sidra-teal hover:bg-sidra-teal-dark text-white"
                >
                  {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update IRB Application
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => navigate(`/irb-applications/${id}`)}
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