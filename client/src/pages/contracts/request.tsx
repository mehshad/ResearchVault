import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertResearchContractSchema, insertResearchContractScopeItemSchema, CONTRACT_TYPES, CONTRACT_STATUS_VALUES, contractTypeSchema, contractStatusSchema } from "@shared/schema";
import { Scientist, ResearchActivity } from "@shared/schema";
import { CalendarIcon, ArrowLeft, Plus, Minus, FileText, Users, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { Calendar as DatePickerCalendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { PermissionWrapper } from "@/components/PermissionWrapper";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// Using shared contract type definitions from schema

// Extended schema for contract request with scope items
const scopeItemSchema = insertResearchContractScopeItemSchema.extend({
  party: z.enum(["sidra", "counterparty"], {
    required_error: "Please select the responsible party",
  }),
  description: z.string().min(10, "Description must be at least 10 characters"),
  dueDate: z.date().optional(),
  acceptanceCriteria: z.string().optional(),
  position: z.number().default(0),
}).omit({
  contractId: true, // Will be set after contract creation
});

const contractRequestSchema = insertResearchContractSchema.extend({
  title: z.string().min(10, "Title must be at least 10 characters"),
  contractorName: z.string().min(2, "Contractor name is required"),
  researchActivityId: z.number({
    required_error: "Please select a research activity",
  }),
  leadPIId: z.number({
    required_error: "Lead PI is required",
  }),
  contractType: contractTypeSchema,
  contractValue: z.number().min(0, "Contract value must be positive").optional(),
  currency: z.string().default("QAR"),
  startDate: z.date({
    required_error: "Start date is required",
  }),
  endDate: z.date({
    required_error: "End date is required",
  }),
  initiationRequestedAt: z.date().optional(),
  reminderEmail: z.string().email("Valid email required").optional(),
  description: z.string().min(20, "Description must be at least 20 characters"),
  counterpartyContact: z.string().min(5, "Contact information is required"),
  counterpartyCountry: z.string().min(2, "Country is required"),
  expectedSignatureDate: z.date().optional(),
  budgetDetails: z.string().optional(),
  scopeItems: z.array(scopeItemSchema).min(1, "At least one scope item is required"),
}).omit({
  contractNumber: true, // Auto-generated
  status: true, // Will be set to 'submitted'
  requestedByUserId: true, // Will be set to current user
});

type ContractRequestFormValues = z.infer<typeof contractRequestSchema>;

const countries = [
  "Afghanistan", "Albania", "Algeria", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan",
  "Bahrain", "Bangladesh", "Belarus", "Belgium", "Bolivia", "Brazil", "Bulgaria", "Cambodia", "Canada",
  "Chile", "China", "Colombia", "Croatia", "Czech Republic", "Denmark", "Ecuador", "Egypt", "Estonia",
  "Finland", "France", "Georgia", "Germany", "Greece", "Hungary", "Iceland", "India", "Indonesia",
  "Iran", "Iraq", "Ireland", "Israel", "Italy", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kuwait",
  "Latvia", "Lebanon", "Lithuania", "Luxembourg", "Malaysia", "Mexico", "Morocco", "Netherlands",
  "New Zealand", "Norway", "Oman", "Pakistan", "Palestine", "Philippines", "Poland", "Portugal",
  "Qatar", "Romania", "Russia", "Saudi Arabia", "Singapore", "Slovakia", "Slovenia", "South Africa",
  "South Korea", "Spain", "Sri Lanka", "Sweden", "Switzerland", "Syria", "Taiwan", "Thailand",
  "Tunisia", "Turkey", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Yemen"
];

const currencies = [
  { value: "QAR", label: "QAR - Qatari Riyal" },
  { value: "USD", label: "USD - US Dollar" },
  { value: "EUR", label: "EUR - Euro" },
  { value: "GBP", label: "GBP - British Pound" },
  { value: "SAR", label: "SAR - Saudi Riyal" },
  { value: "AED", label: "AED - UAE Dirham" },
  { value: "KWD", label: "KWD - Kuwaiti Dinar" },
  { value: "BHD", label: "BHD - Bahraini Dinar" },
];

export default function ContractRequest() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { currentUser } = useCurrentUser();

  // Get research activities user has access to
  const { data: researchActivities, isLoading: activitiesLoading } = useQuery<ResearchActivity[]>({
    queryKey: ['/api/research-activities'],
  });

  // Get scientists data for Lead PI field
  const { data: scientists, isLoading: scientistsLoading } = useQuery<Scientist[]>({
    queryKey: ['/api/scientists'],
  });

  // Default form values
  const defaultValues: Partial<ContractRequestFormValues> = {
    contractType: "Collaboration",
    currency: "QAR",
    startDate: new Date(),
    endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
    scopeItems: [
      {
        party: "sidra",
        description: "",
        dueDate: undefined,
        acceptanceCriteria: "",
        position: 0,
      }
    ],
  };

  const form = useForm<ContractRequestFormValues>({
    resolver: zodResolver(contractRequestSchema),
    defaultValues,
  });

  // Watch for changes in research activity selection
  const selectedResearchActivityId = form.watch("researchActivityId");

  // Auto-populate Lead PI when research activity is selected
  useEffect(() => {
    if (selectedResearchActivityId && researchActivities) {
      const selectedActivity = researchActivities.find(activity => activity.id === selectedResearchActivityId);
      if (selectedActivity?.budgetHolderId) {
        form.setValue("leadPIId", selectedActivity.budgetHolderId);
        // Show toast to inform user that Lead PI was auto-populated
        toast({
          title: "Lead PI Auto-Selected",
          description: "Lead PI has been automatically selected from the research activity.",
        });
      }
    }
  }, [selectedResearchActivityId, researchActivities, form, toast]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "scopeItems",
  });

  const addScopeItem = () => {
    append({
      party: "sidra",
      description: "",
      dueDate: undefined,
      acceptanceCriteria: "",
      position: fields.length,
    });
  };

  const removeScopeItem = (index: number) => {
    if (fields.length > 1) {
      remove(index);
    } else {
      toast({
        title: "Cannot remove",
        description: "At least one scope item is required.",
        variant: "destructive",
      });
    }
  };

  const submitContractRequestMutation = useMutation({
    mutationFn: async (data: ContractRequestFormValues) => {
      // Remove scope items from contract data and handle separately
      // NOTE: Server will set requestedByUserId, status, and contractNumber securely
      const { scopeItems, ...contractPayload } = data;

      // Convert types to match backend expectations
      const formattedPayload: any = {
        ...contractPayload,
        // Convert number to string for numeric database field
        contractValue: contractPayload.contractValue?.toString(),
        // Format date fields as YYYY-MM-DD for PostgreSQL date columns
        startDate: contractPayload.startDate.toISOString().split('T')[0],
        endDate: contractPayload.endDate.toISOString().split('T')[0],
      };

      // Only include optional date fields if they have values
      if (contractPayload.expectedSignatureDate) {
        formattedPayload.expectedSignatureDate = contractPayload.expectedSignatureDate.toISOString().split('T')[0];
      }
      if (contractPayload.initiationRequestedAt) {
        formattedPayload.initiationRequestedAt = contractPayload.initiationRequestedAt.toISOString();
      }

      // Step 1: Create the contract
      const contractResponse = await apiRequest("POST", "/api/research-contracts", formattedPayload);
      const contract = await contractResponse.json();

      // Step 2: Save scope items for the contract
      if (scopeItems && scopeItems.length > 0) {
        for (const item of scopeItems) {
          const scopePayload = {
            ...item,
            contractId: contract.id,
            dueDate: item.dueDate ? item.dueDate.toISOString().split('T')[0] : undefined,
          };
          await apiRequest("POST", `/api/research-contracts/${contract.id}/scope-items`, scopePayload);
        }
      }

      return contract;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/research-contracts'] });
      toast({
        title: "Contract request submitted",
        description: "Your contract request has been successfully submitted for review.",
      });
      navigate(`/research-contracts/${data.id}`);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "There was an error submitting your contract request.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ContractRequestFormValues) => {
    submitContractRequestMutation.mutate(data);
  };

  return (
    <PermissionWrapper 
      currentUserRole={currentUser.role} 
      navigationItem="contracts"
      showReadOnlyBanner={false}
    >
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/contracts")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">Request New Contract</h1>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* SDR Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Research Activity (SDR)
                </CardTitle>
                <CardDescription>
                  Select the research activity this contract will be associated with
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="researchActivityId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Research Activity</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(parseInt(value))}
                          defaultValue={field.value?.toString() || undefined}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-research-activity">
                              <SelectValue placeholder="Select a research activity" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {activitiesLoading ? (
                              <SelectItem value="loading" disabled>Loading research activities...</SelectItem>
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
                    name="leadPIId"
                    render={({ field }) => {
                      const selectedScientist = scientists?.find(scientist => scientist.id === field.value);
                      return (
                        <FormItem>
                          <FormLabel>Lead Principal Investigator</FormLabel>
                          <Select
                            onValueChange={(value) => field.onChange(parseInt(value))}
                            value={field.value?.toString() || undefined}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-lead-pi">
                                <SelectValue placeholder="Auto-selected from SDR" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {scientistsLoading ? (
                                <SelectItem value="loading" disabled>Loading scientists...</SelectItem>
                              ) : (
                                scientists?.map((scientist) => (
                                  <SelectItem key={scientist.id} value={scientist.id.toString()}>
                                    {scientist.honorificTitle} {scientist.firstName} {scientist.lastName}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            {selectedScientist ? (
                              <span className="text-green-600 dark:text-green-400">
                                ✓ Auto-selected from research activity: {selectedScientist.honorificTitle} {selectedScientist.firstName} {selectedScientist.lastName}
                              </span>
                            ) : (
                              "Lead PI will be auto-selected when you choose a research activity"
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Contract Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Contract Information
                </CardTitle>
                <CardDescription>
                  Basic information about the contract
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contract Title</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g. Pharmaceutical Development Partnership with Novagen Therapeutics" 
                          {...field} 
                          data-testid="input-contract-title"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contractType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contract Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-contract-type">
                            <SelectValue placeholder="Select contract type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CONTRACT_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
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
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Provide a detailed description of the contract, including objectives, scope, and expected outcomes..." 
                          className="resize-none" 
                          rows={4}
                          {...field}
                          data-testid="textarea-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Counterparty Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Counterparty Information
                </CardTitle>
                <CardDescription>
                  Details about the external organization or partner
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="contractorName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organization Name</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g. Novagen Therapeutics Ltd." 
                            {...field}
                            data-testid="input-contractor-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="counterpartyCountry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-country">
                              <SelectValue placeholder="Select country" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {countries.map((country) => (
                              <SelectItem key={country} value={country}>
                                {country}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="counterpartyContact"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Information</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Primary contact person, email, phone, address, etc."
                          className="resize-none" 
                          rows={3}
                          {...field}
                          data-testid="textarea-contact-info"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Financial Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Financial Information
                </CardTitle>
                <CardDescription>
                  Contract value and budget details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="contractValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contract Value</FormLabel>
                        <FormControl>
                          <Input 
                            type="number"
                            placeholder="0"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            data-testid="input-contract-value"
                          />
                        </FormControl>
                        <FormDescription>
                          Total financial value of the contract
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-currency">
                              <SelectValue placeholder="Select currency" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {currencies.map((currency) => (
                              <SelectItem key={currency.value} value={currency.value}>
                                {currency.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="budgetDetails"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Budget Details</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Breakdown of costs, funding sources, payment schedule, etc."
                          className="resize-none" 
                          rows={3}
                          {...field}
                          data-testid="textarea-budget-details"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  Timeline
                </CardTitle>
                <CardDescription>
                  Important dates for the contract
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col space-y-2">
                        <FormLabel>Start Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full justify-start text-left font-normal h-10",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-start-date"
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick start date</span>
                                )}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 z-50" align="start" side="bottom" sideOffset={4}>
                            <DatePickerCalendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              initialFocus
                              className="rounded-md border"
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
                      <FormItem className="flex flex-col space-y-2">
                        <FormLabel>End Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full justify-start text-left font-normal h-10",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-end-date"
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick end date</span>
                                )}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 z-50" align="start" side="bottom" sideOffset={4}>
                            <DatePickerCalendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              initialFocus
                              className="rounded-md border"
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="expectedSignatureDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col space-y-2">
                        <FormLabel>Expected Signature Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full justify-start text-left font-normal h-10",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-signature-date"
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick expected date</span>
                                )}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 z-50" align="start" side="bottom" sideOffset={4}>
                            <DatePickerCalendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              initialFocus
                              className="rounded-md border"
                            />
                          </PopoverContent>
                        </Popover>
                        <FormDescription>
                          When do you expect the contract to be signed?
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="reminderEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reminder Email (Optional)</FormLabel>
                      <FormControl>
                        <Input 
                          type="email"
                          placeholder="email@example.com"
                          {...field}
                          data-testid="input-reminder-email"
                        />
                      </FormControl>
                      <FormDescription>
                        Email address to receive reminders about contract milestones
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Scope of Work Table */}
            <Card>
              <CardHeader>
                <CardTitle>Scope of Work</CardTitle>
                <CardDescription>
                  Define deliverables and responsibilities for both parties
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[120px]">Responsible Party</TableHead>
                          <TableHead className="w-[300px]">Deliverable Description</TableHead>
                          <TableHead className="w-[140px]">Due Date</TableHead>
                          <TableHead className="w-[200px]">Acceptance Criteria</TableHead>
                          <TableHead className="w-[80px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fields.map((field, index) => (
                          <TableRow key={field.id}>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name={`scopeItems.${index}.party`}
                                render={({ field }) => (
                                  <FormItem>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                      <FormControl>
                                        <SelectTrigger data-testid={`select-party-${index}`}>
                                          <SelectValue />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="sidra">Sidra</SelectItem>
                                        <SelectItem value="counterparty">Counterparty</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name={`scopeItems.${index}.description`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Textarea
                                        placeholder="Describe the deliverable..."
                                        className="resize-none"
                                        rows={2}
                                        {...field}
                                        data-testid={`textarea-description-${index}`}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name={`scopeItems.${index}.dueDate`}
                                render={({ field }) => (
                                  <FormItem>
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <FormControl>
                                          <Button
                                            variant={"outline"}
                                            className={cn(
                                              "w-full justify-start text-left font-normal h-9",
                                              !field.value && "text-muted-foreground"
                                            )}
                                            data-testid={`button-due-date-${index}`}
                                          >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {field.value ? (
                                              format(field.value, "PP")
                                            ) : (
                                              <span>Pick date</span>
                                            )}
                                          </Button>
                                        </FormControl>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-auto p-0 z-50" align="start" side="bottom" sideOffset={4}>
                                        <DatePickerCalendar
                                          mode="single"
                                          selected={field.value}
                                          onSelect={field.onChange}
                                          initialFocus
                                          className="rounded-md border"
                                        />
                                      </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name={`scopeItems.${index}.acceptanceCriteria`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Textarea
                                        placeholder="How will completion be measured?"
                                        className="resize-none"
                                        rows={2}
                                        {...field}
                                        data-testid={`textarea-criteria-${index}`}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => removeScopeItem(index)}
                                disabled={fields.length === 1}
                                data-testid={`button-remove-scope-${index}`}
                              >
                                <Minus className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={addScopeItem}
                    className="w-full"
                    data-testid="button-add-scope-item"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Scope Item
                  </Button>

                  {form.formState.errors.scopeItems?.root && (
                    <p className="text-sm font-medium text-destructive">
                      {form.formState.errors.scopeItems.root.message}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Separator />

            {/* Submit Actions */}
            <div className="flex items-center justify-end space-x-4">
              <Button 
                variant="outline" 
                type="button"
                onClick={() => navigate("/contracts")}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={submitContractRequestMutation.isPending}
                data-testid="button-submit-request"
              >
                {submitContractRequestMutation.isPending ? 'Submitting...' : 'Submit Contract Request'}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </PermissionWrapper>
  );
}