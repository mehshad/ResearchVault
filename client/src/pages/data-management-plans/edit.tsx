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
import { insertDataManagementPlanSchema, type InsertDataManagementPlan, type DataManagementPlan, type ResearchActivity } from "@shared/schema";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useEffect } from "react";
import { fetchRecord } from "@/lib/fetchList";

export default function DataManagementPlanEdit() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: plan, isLoading } = useQuery<DataManagementPlan>({
    queryKey: ['/api/data-management-plans', id],
    queryFn: () => fetchRecord(`/api/data-management-plans/${id}`),
    enabled: !!id,
  });

  const { data: researchActivities } = useQuery<ResearchActivity[]>({
    queryKey: ['/api/research-activities'],
  });

  const form = useForm<InsertDataManagementPlan>({
    resolver: zodResolver(insertDataManagementPlanSchema),
    defaultValues: {
      researchActivityId: plan?.researchActivityId || 0,
      dmpNumber: plan?.dmpNumber || "",
      title: plan?.title || "",
      description: plan?.description || "",
      dataCollectionMethods: plan?.dataCollectionMethods || "",
      dataStoragePlan: plan?.dataStoragePlan || "",
      dataSharingPlan: plan?.dataSharingPlan || "",
      retentionPeriod: plan?.retentionPeriod || "",
    },
  });

  // Update form when plan data loads
  useEffect(() => {
    if (plan) {
      form.reset({
        researchActivityId: plan.researchActivityId,
        dmpNumber: plan.dmpNumber,
        title: plan.title,
        description: plan.description || "",
        dataCollectionMethods: plan.dataCollectionMethods || "",
        dataStoragePlan: plan.dataStoragePlan || "",
        dataSharingPlan: plan.dataSharingPlan || "",
        retentionPeriod: plan.retentionPeriod || "",
      });
    }
  }, [plan, form]);

  const updateMutation = useMutation({
    mutationFn: (data: InsertDataManagementPlan) => 
      apiRequest("PATCH", `/api/data-management-plans/${id}`, data),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Data management plan updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/data-management-plans'] });
      queryClient.invalidateQueries({ queryKey: ['/api/data-management-plans', id] });
      navigate(`/data-management-plans/${id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update data management plan",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertDataManagementPlan) => {
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/data-management")}>
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

  if (!plan) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/data-management")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">Data Management Plan Not Found</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <p className="text-lg text-foreground">The data management plan you're trying to edit could not be found.</p>
              <Button className="mt-4" onClick={() => navigate("/data-management")}>
                Return to Data Management Plans List
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
        <Button variant="ghost" size="sm" onClick={() => navigate(`/data-management-plans/${id}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h1 className="text-2xl font-semibold text-foreground">Edit Data Management Plan</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data Management Plan Details</CardTitle>
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
                      <Input placeholder="Data management plan title" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dmpNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>DMP Number</FormLabel>
                    <FormControl>
                      <Input placeholder="DMP-001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Overview of the data management plan..."
                        className="min-h-[100px]"
                        {...field}
                        value={field.value ?? ""}
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
                  <FormItem>
                    <FormLabel>Data Collection Methods</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Methods and procedures for data collection..."
                        className="min-h-[100px]"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
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
                        placeholder="Storage infrastructure, security measures, and backup procedures..."
                        className="min-h-[100px]"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
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
                        placeholder="Plans for data sharing, access permissions, and collaboration..."
                        className="min-h-[100px]"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="retentionPeriod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Retention Period</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Regulatory compliance, institutional policies, and legal requirements..."
                        className="min-h-[100px]"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
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
                  Update Data Management Plan
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => navigate(`/data-management-plans/${id}`)}
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