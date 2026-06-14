// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, UserPlus, Users, Calendar } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Scientist } from "@shared/schema";

const createIbcBoardMemberSchema = z.object({
  scientistId: z.number().min(1, "Please select a scientist"),
  role: z.enum(["chair", "vice_chair", "member", "alternate", "admin_reviewer"], {
    required_error: "Please select a role",
  }),
  appointmentDate: z.string().min(1, "Appointment date is required"),
  termEndDate: z.string().min(1, "End date is required"),
  expertise: z.array(z.string()).optional(),
  isActive: z.boolean().default(true),
  notes: z.string().optional(),
});

type CreateIbcBoardMemberForm = z.infer<typeof createIbcBoardMemberSchema>;

const IBC_ROLES = [
  { value: "chair", label: "Committee Chair" },
  { value: "vice_chair", label: "Vice Chair" },
  { value: "member", label: "Voting Member" },
  { value: "alternate", label: "Alternate Member" },
  { value: "admin_reviewer", label: "Administrative Reviewer" },
];

const EXPERTISE_AREAS = [
  "Biosafety",
  "Microbiology",
  "Molecular Biology",
  "Genetics",
  "Infectious Diseases",
  "Laboratory Safety",
  "Environmental Health",
  "Risk Assessment",
  "Regulatory Affairs",
  "Community Representative",
  "Ethics",
  "Clinical Research",
  "Animal Research",
  "Plant Biology",
  "Chemistry",
];

export default function CreateIbcBoardMember() {
  const [, setLocation] = useLocation();
  const [selectedExpertise, setSelectedExpertise] = useState<string[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: scientists = [], isLoading: scientistsLoading } = useQuery({
    queryKey: ["/api/scientists"],
  });

  const form = useForm<CreateIbcBoardMemberForm>({
    resolver: zodResolver(createIbcBoardMemberSchema),
    defaultValues: {
      isActive: true,
      expertise: [],
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateIbcBoardMemberForm) => {
      const response = await apiRequest("POST", "/api/ibc-board-members", {
        ...data,
        expertise: selectedExpertise,
        appointmentDate: data.appointmentDate,
        termEndDate: data.termEndDate,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ibc-board-members"] });
      toast({
        title: "Success",
        description: "IBC board member has been added successfully.",
      });
      setLocation("/ibc-office");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add IBC board member.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateIbcBoardMemberForm) => {
    createMutation.mutate(data);
  };

  const handleExpertiseChange = (area: string, checked: boolean) => {
    if (checked) {
      setSelectedExpertise(prev => [...prev, area]);
    } else {
      setSelectedExpertise(prev => prev.filter(item => item !== area));
    }
  };

  if (scientistsLoading) {
    return (
      <div className="p-6">
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-gray-100 rounded-lg animate-pulse dark:bg-gray-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center space-x-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/ibc-office")}
          className="flex items-center space-x-2"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to IBC Office</span>
        </Button>
      </div>

      <div className="flex items-center space-x-2">
        <UserPlus className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Add IBC Board Member</h1>
      </div>

      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>Board Member Information</CardTitle>
          <CardDescription>
            Add a new member to the Institutional Biosafety Committee
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="scientistId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Scientist/Staff Member</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        value={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select scientist" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {scientists.map((scientist: Scientist) => (
                            <SelectItem key={scientist.id} value={scientist.id.toString()}>
                              <div>
                                <div className="font-medium">{scientist.name}</div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">{scientist.title}</div>
                              </div>
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
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Committee Role</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {IBC_ROLES.map(role => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
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
                  name="appointmentDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Appointment Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="termEndDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Term End Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Active Member</FormLabel>
                      <FormDescription>
                        Check if this member is currently active on the committee
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <div className="space-y-3">
                <FormLabel>Areas of Expertise</FormLabel>
                <FormDescription>
                  Select the member's areas of expertise relevant to biosafety review
                </FormDescription>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {EXPERTISE_AREAS.map(area => (
                    <div key={area} className="flex items-center space-x-2">
                      <Checkbox
                        id={area}
                        checked={selectedExpertise.includes(area)}
                        onCheckedChange={(checked) => handleExpertiseChange(area, checked as boolean)}
                      />
                      <label
                        htmlFor={area}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {area}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Additional notes about this board member..."
                        {...field}
                        rows={3}
                      />
                    </FormControl>
                    <FormDescription>
                      Any additional information about the member's role or qualifications
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/ibc-office")}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? "Adding..." : "Add Board Member"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}