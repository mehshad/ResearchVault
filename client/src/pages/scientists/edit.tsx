import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatFullName } from "@/utils/nameUtils";
import { normalizeOptionalScientistFields } from "@/utils/scientistForm";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { queryClient, apiRequest, invalidateScientistLists } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertScientistSchema, type Scientist } from "@shared/schema";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import React, { useEffect, useState } from "react";

// Extend the insert schema with additional validations
const editScientistSchema = insertScientistSchema.extend({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Please enter a valid email address"),
  honorificTitle: z.string().min(1, "Honorific title is required"),
  staffType: z.enum(["scientific", "administrative"]).default("scientific"),
});

type EditScientistFormValues = z.infer<typeof editScientistSchema>;

export default function EditScientist() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch the scientist data
  const { data: scientist, isLoading } = useQuery<Scientist>({
    queryKey: ['/api/scientists', id],
    queryFn: () => fetch(`/api/scientists/${id}`).then(res => res.json()),
    enabled: !!id,
  });

  // Fetch all scientists for line manager selection
  const { data: allScientists = [] } = useQuery<Scientist[]>({
    queryKey: ['/api/scientists'],
    queryFn: () => fetch('/api/scientists').then(res => res.json()),
  });

  const form = useForm<EditScientistFormValues>({
    resolver: zodResolver(editScientistSchema),
    defaultValues: {
      honorificTitle: "",
      firstName: "",
      lastName: "",
      jobTitle: "",
      email: "",
      staffId: "",
      department: "",
      bio: "",
      profileImageInitials: "",
      supervisorId: null,
      staffType: "scientific",
      orcidId: "",
      linkedInUrl: "",
      googleScholarUrl: "",
      webOfScienceId: "",
    },
  });

  // Update form when scientist data loads
  useEffect(() => {
    if (scientist) {
      form.reset({
        honorificTitle: scientist.honorificTitle || "",
        firstName: scientist.firstName || "",
        lastName: scientist.lastName || "",
        jobTitle: scientist.jobTitle || "",
        email: scientist.email || "",
        staffId: scientist.staffId || "",
        department: scientist.department || "",
        bio: scientist.bio || "",
        profileImageInitials: scientist.profileImageInitials || "",
        supervisorId: scientist.supervisorId || null,
        staffType: (scientist.staffType as "scientific" | "administrative") || "scientific",
        orcidId: scientist.orcidId || "",
        linkedInUrl: scientist.linkedInUrl || "",
        googleScholarUrl: scientist.googleScholarUrl || "",
        webOfScienceId: scientist.webOfScienceId || "",
      });
    }
  }, [scientist, form]);

  const [deleteOpen, setDeleteOpen] = useState(false);

  const deleteScientistMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/scientists/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (response.status === 204) return { ok: true } as const;
      // Parse 409 (referenced elsewhere) / 404 / 500 etc. — the server
      // returns { message, blockedBy: { table: count, ... }, details? }
      // on 409 and { message } otherwise.
      let body: any = {};
      try { body = await response.json(); } catch {}
      const err: any = new Error(body.message || "Failed to delete staff member");
      err.status = response.status;
      err.blockedBy = body.blockedBy;
      throw err;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/scientists'] });
      toast({
        title: "Staff member deleted",
        description: "The staff record has been removed.",
      });
      navigate("/scientists");
    },
    onError: (error: any) => {
      if (error?.status === 409 && error.blockedBy) {
        const lines = Object.entries(error.blockedBy as Record<string, number>)
          .map(([table, count]) => `• ${table}: ${count}`)
          .join("\n");
        toast({
          title: "Cannot delete this staff member",
          description: `Still referenced by:\n${lines}\n\nReassign or remove these references first.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error?.message || "There was an error deleting the staff member.",
          variant: "destructive",
        });
      }
    },
  });

  const updateScientistMutation = useMutation({
    mutationFn: async (data: EditScientistFormValues) => {
      const response = await apiRequest("PATCH", `/api/scientists/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      // Invalidate every scientist/staff list view in one place — keeps the
      // sidebar staff dropdown, investigators, and scientific-staff pickers
      // in sync after an edit. Individual scientist detail is invalidated
      // separately.
      invalidateScientistLists();
      queryClient.invalidateQueries({ queryKey: ['/api/scientists', id] });
      toast({
        title: "Staff member updated",
        description: "The staff member has been successfully updated.",
      });
      navigate("/scientists");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "There was an error updating the staff member.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EditScientistFormValues) => {
    // Generate initials from firstName and lastName if not provided
    if (!data.profileImageInitials && data.firstName && data.lastName) {
      data.profileImageInitials = `${data.firstName[0]}${data.lastName[0]}`;
    }
    
    updateScientistMutation.mutate(normalizeOptionalScientistFields(data));
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/scientists")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Skeleton className="h-8 w-64" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!scientist) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/scientists")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">Staff Member Not Found</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p>The staff member you're looking for could not be found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/scientists")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h1 className="text-2xl font-semibold text-foreground">Edit Staff Member</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Staff Information</CardTitle>
          <CardDescription>Update the details for this staff member</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                      'PMO Officer', 'IRB Officer', 'IBC Officer', 'Outcome Officer', 'Grant Officer',
                    ];
                    return (
                      <FormItem>
                        <FormLabel>Job Title</FormLabel>
                        <FormControl>
                          <SearchableSelect
                            options={jobTitles.map((t) => ({ value: t, label: t }))}
                            value={field.value || ""}
                            onChange={field.onChange}
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
                        Categorize as scientific or administrative staff
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department</FormLabel>
                      <FormControl>
                        <Input placeholder="Molecular Biology" autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="profileImageInitials"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Initials</FormLabel>
                      <FormControl>
                        <Input placeholder="SJ" maxLength={2} autoComplete="off" data-1p-ignore="true" data-lpignore="true" {...field} value={field.value || ""} />
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
                          options={allScientists
                            .filter((s) => s.id !== parseInt(id || "0"))
                            .map((s) => {
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

              {/* External Profile Links Section */}
              <div className="border-t pt-6 mt-6">
                <h3 className="text-lg font-medium mb-4">External Profile Links</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="orcidId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ORCID ID</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="0000-0002-1234-5678" 
                            autoComplete="off" 
                            data-1p-ignore="true" 
                            data-lpignore="true" 
                            {...field} 
                            value={field.value || ""} 
                          />
                        </FormControl>
                        <FormDescription>
                          Your ORCID identifier (e.g., 0000-0002-1234-5678)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="linkedInUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>LinkedIn Profile URL</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="https://linkedin.com/in/username" 
                            autoComplete="off" 
                            data-1p-ignore="true" 
                            data-lpignore="true" 
                            {...field} 
                            value={field.value || ""} 
                          />
                        </FormControl>
                        <FormDescription>
                          Full URL to your LinkedIn profile
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="googleScholarUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Google Scholar Profile URL</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="https://scholar.google.com/citations?user=..." 
                            autoComplete="off" 
                            data-1p-ignore="true" 
                            data-lpignore="true" 
                            {...field} 
                            value={field.value || ""} 
                          />
                        </FormControl>
                        <FormDescription>
                          Full URL to your Google Scholar profile
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="webOfScienceId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Web of Science Researcher ID</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="AAA-0000-0000" 
                            autoComplete="off" 
                            data-1p-ignore="true" 
                            data-lpignore="true" 
                            {...field} 
                            value={field.value || ""} 
                          />
                        </FormControl>
                        <FormDescription>
                          Your Web of Science Researcher ID
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <CardFooter className="flex justify-between items-center px-0">
                <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={deleteScientistMutation.isPending}
                      data-testid="button-delete-scientist"
                    >
                      {deleteScientistMutation.isPending ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</>
                      ) : (
                        <><Trash2 className="mr-2 h-4 w-4" />Delete</>
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this staff member?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently removes the record. If the person is
                        still referenced anywhere (as a PI, line manager,
                        project member, author, etc.) the delete will be
                        blocked and we'll show you what to reassign first.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        data-testid="button-delete-confirm"
                        onClick={(e) => {
                          e.preventDefault();
                          deleteScientistMutation.mutate(undefined, {
                            onSettled: () => setDeleteOpen(false),
                          });
                        }}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => navigate("/scientists")}
                    type="button"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateScientistMutation.isPending}
                  >
                    {updateScientistMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Update Scientist'
                    )}
                  </Button>
                </div>
              </CardFooter>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}