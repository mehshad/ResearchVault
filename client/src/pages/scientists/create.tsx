import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatFullName } from "@/utils/nameUtils";
import { normalizeOptionalScientistFields } from "@/utils/scientistForm";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, invalidateScientistLists } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertScientistSchema } from "@shared/schema";
import { Scientist, Department, Section } from "@shared/schema";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { INVESTIGATOR_ELIGIBLE_JOB_TITLES } from "@shared/investigatorEligibility";

// Extend the insert schema with additional validations
const createScientistSchema = insertScientistSchema.extend({
  email: z.string().email("Invalid email address"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  honorificTitle: z.string().min(1, "Honorific title is required"),
  supervisorId: z.number().nullable().optional(),
  departmentId: z.number().nullable().optional(),
  sectionId: z.number().nullable().optional(),
  staffType: z.enum(["scientific", "administrative"]).default("scientific"),
});

type CreateScientistFormValues = z.infer<typeof createScientistSchema>;

export default function CreateScientist() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, authConfig } = useAuth();
  const { currentUser } = useCurrentUser();
  const effectiveRole =
    authConfig.mode === "demo" ? currentUser.role : (user?.role ?? "user");
  const canManage = ["Management", "admin", "superadmin"].includes(effectiveRole);
  
  // Fetch all scientists for line manager selection
  const { data: allScientists = [] } = useQuery<Scientist[]>({
    queryKey: ['/api/scientists'],
    queryFn: () => fetch('/api/scientists').then(res => res.json()),
  });

  // Structured org data for Department + Section dropdowns
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['/api/departments'],
    queryFn: () => fetch('/api/departments').then(res => res.json()),
  });
  const { data: sections = [] } = useQuery<Section[]>({
    queryKey: ['/api/sections'],
    queryFn: () => fetch('/api/sections').then(res => res.json()),
  });

  // Default form values  
  const defaultValues: Partial<CreateScientistFormValues> = {
    honorificTitle: "",
    firstName: "",
    lastName: "",
    jobTitle: "",
    email: "",
    staffId: "",
    department: "",
    departmentId: null,
    sectionId: null,
    bio: "",
    profileImageInitials: "",
    supervisorId: null,
    staffType: "scientific",
    isInvestigator: false,
  };

  const form = useForm<CreateScientistFormValues>({
    resolver: zodResolver(createScientistSchema),
    defaultValues,
  });

  const createScientistMutation = useMutation({
    mutationFn: async (data: CreateScientistFormValues) => {
      const response = await apiRequest("POST", "/api/scientists", data);
      return response.json();
    },
    onSuccess: () => {
      invalidateScientistLists();
      toast({
        title: "Scientist created",
        description: "The scientist has been successfully added to the system.",
      });
      navigate("/scientists");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "There was an error creating the scientist.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateScientistFormValues) => {
    // Generate initials from firstName and lastName if not provided
    if (!data.profileImageInitials && data.firstName && data.lastName) {
      data.profileImageInitials = `${data.firstName[0]}${data.lastName[0]}`;
    }

    // supervisorId can be null if no line manager is selected

    const payload = normalizeOptionalScientistFields(data);
    if (!canManage) {
      delete payload.isInvestigator;
    }
    createScientistMutation.mutate(payload);
  };

  // When validation fails, the errored field may be off-screen — scroll to it
  // and tell the user something needs fixing so the click never feels dead.
  const onInvalid = (errors: Record<string, any>) => {
    const firstField = Object.keys(errors)[0];
    const el =
      document.querySelector(`[name="${firstField}"]`) ||
      document.querySelector('[aria-invalid="true"]');
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      (el as HTMLElement).focus?.();
    }
    toast({
      title: "Please fix the highlighted fields",
      description: "Some required fields are missing or invalid.",
      variant: "destructive",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/scientists")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h1 className="text-2xl font-semibold text-foreground">Add Staff Member</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Staff Information</CardTitle>
          <CardDescription>Enter the details of the new staff member</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="honorificTitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select title" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="Dr.">Dr.</SelectItem>
                          <SelectItem value="Prof.">Prof.</SelectItem>
                          <SelectItem value="Mr.">Mr.</SelectItem>
                          <SelectItem value="Ms.">Ms.</SelectItem>
                          <SelectItem value="Mrs.">Mrs.</SelectItem>
                          <SelectItem value="Mx.">Mx.</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Honorific title (Dr., Prof., Mr., Ms., etc.)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="md:col-span-1"></div>
                
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Sarah" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Johnson" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="sarah.johnson@example.com" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="staffId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Staff ID</FormLabel>
                      <FormControl>
                        <Input placeholder="12345" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormDescription>
                        5-digit staff ID for badge access
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="jobTitle"
                  render={({ field }) => {
                    const jobTitles = [
                      'Management', 'Investigator', 'Physician', 'Staff Scientist',
                      'Research Specialist', 'Research Associate', 'Research Assistant',
                      'PhD Student', 'Post-doctoral Fellow', 'Lab Manager',
                      'PMO Officer', 'IRB Officer', 'IBC Officer', 'Outcome Officer', 'Research Officer', 'IT Officer',
                    ];
                    const administrativeRoles = ['Management', 'PMO Officer', 'IRB Officer', 'IBC Officer', 'Lab Manager', 'Outcome Officer', 'Research Officer', 'IT Officer'];
                    return (
                      <FormItem>
                        <FormLabel>Job Title</FormLabel>
                        <FormControl>
                          <SearchableSelect
                            options={jobTitles
                              .filter(
                                (title) =>
                                  canManage ||
                                  !INVESTIGATOR_ELIGIBLE_JOB_TITLES.includes(
                                    title as (typeof INVESTIGATOR_ELIGIBLE_JOB_TITLES)[number]
                                  )
                              )
                              .map((t) => ({ value: t, label: t }))}
                            value={field.value || ""}
                            onChange={(value) => {
                              field.onChange(value);
                              form.setValue('staffType', administrativeRoles.includes(value) ? 'administrative' : 'scientific');
                            }}
                            placeholder="Select job title"
                            searchPlaceholder="Search job titles..."
                            data-testid="select-job-title"
                          />
                        </FormControl>
                        <FormDescription>
                          Select the job title for this staff member
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                {canManage && (
                  <FormField
                    control={form.control}
                    name="isInvestigator"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>Additional Investigator designation</FormLabel>
                          <FormDescription>
                            Allows this staff member to lead projects and fill
                            investigator-only roles without changing their job title.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            aria-label="Additional Investigator designation"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}
                
                <FormField
                  control={form.control}
                  name="staffType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Staff Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || "scientific"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select staff type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="scientific">Scientific Staff</SelectItem>
                          <SelectItem value="administrative">Administrative Staff</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        This is automatically set based on job title, but can be adjusted if needed
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="departmentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department</FormLabel>
                      <FormControl>
                        <SearchableSelect
                          options={departments.map((d) => ({
                            value: d.id.toString(),
                            label: d.name,
                            searchText: d.name,
                          }))}
                          value={field.value?.toString() || ""}
                          onChange={(value) => {
                            field.onChange(value ? parseInt(value) : null);
                            // Section belongs to a department — clear it on change
                            form.setValue("sectionId", null);
                          }}
                          placeholder="Select department (optional)"
                          searchPlaceholder="Search departments..."
                          emptyMessage="No departments found. Managers can add them under Facilities → Organization."
                          data-testid="select-department"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sectionId"
                  render={({ field }) => {
                    const deptId = form.watch("departmentId");
                    const available = sections.filter((s) => !deptId || s.departmentId === deptId);
                    return (
                      <FormItem>
                        <FormLabel>Section</FormLabel>
                        <FormControl>
                          <SearchableSelect
                            options={available.map((s) => ({
                              value: s.id.toString(),
                              label: `${s.name} — ${s.type}`,
                              searchText: `${s.name} ${s.type}`,
                            }))}
                            value={field.value?.toString() || ""}
                            onChange={(value) => {
                              field.onChange(value ? parseInt(value) : null);
                              // Selecting a section also sets its department
                              if (value) {
                                const sec = sections.find((s) => s.id === parseInt(value));
                                if (sec) form.setValue("departmentId", sec.departmentId);
                              }
                            }}
                            placeholder="Select section (optional)"
                            searchPlaceholder="Search sections..."
                            emptyMessage="No sections found for this department."
                            data-testid="select-section"
                          />
                        </FormControl>
                        <FormDescription>
                          Lab, office, or core within the department
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                

                <FormField
                  control={form.control}
                  name="profileImageInitials"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Initials</FormLabel>
                      <FormControl>
                        <Input placeholder="JD" maxLength={2} autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormDescription>
                        Initials shown in profile avatar (max 2 characters)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="supervisorId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Line Manager</FormLabel>
                      <FormControl>
                        <SearchableSelect
                          options={allScientists.map((s) => {
                            const name = formatFullName(s);
                            const title = s.jobTitle || 'No title';
                            return {
                              value: s.id.toString(),
                              label: `${name} — ${title}`,
                              searchText: `${name} ${title} ${s.email ?? ''} ${s.department ?? ''}`,
                            };
                          })}
                          value={field.value?.toString() || ""}
                          onChange={(value) => field.onChange(value ? parseInt(value) : null)}
                          placeholder="Select line manager (optional)"
                          searchPlaceholder="Search by name, title, or department..."
                          emptyMessage="No staff members found."
                          data-testid="select-line-manager"
                        />
                      </FormControl>
                      <FormDescription>
                        Select the line manager this person reports to (optional)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
                      <FormLabel>Bio</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Brief biography or research interests" 
                          className="resize-none" 
                          rows={4}
                          {...field}
                          value={field.value || ""} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <CardFooter className="flex justify-end space-x-2 px-0">
                <Button 
                  variant="outline" 
                  onClick={() => navigate("/scientists")}
                  type="button"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={createScientistMutation.isPending}
                >
                  {createScientistMutation.isPending ? 'Saving...' : 'Save Scientist'}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
