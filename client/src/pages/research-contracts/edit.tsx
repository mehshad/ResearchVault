import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertResearchContractSchema, insertResearchContractScopeItemSchema, insertResearchContractExtensionSchema, CONTRACT_TYPES, CONTRACT_STATUS_VALUES, contractTypeSchema, contractStatusSchema, type InsertResearchContract, type ResearchContract, type ResearchActivity, type ResearchContractScopeItem, type ResearchContractExtension } from "@shared/schema";
import { ArrowLeft, Loader2, Plus, Minus, CalendarIcon, FileText, DollarSign, ListChecks, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as DatePickerCalendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { z } from "zod";
import React from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";

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

const scopeItemSchema = insertResearchContractScopeItemSchema.extend({
  party: z.enum(["sidra", "counterparty"], {
    required_error: "Please select the responsible party",
  }),
  description: z.string().min(10, "Description must be at least 10 characters"),
  dueDate: z.date().optional(),
  acceptanceCriteria: z.string().optional(),
  position: z.number().default(0),
}).omit({
  contractId: true,
});

const extensionSchema = insertResearchContractExtensionSchema.extend({
  newEndDate: z.date({
    required_error: "New end date is required",
  }),
  notes: z.string().optional(),
  sequenceNumber: z.number().default(1),
}).omit({
  contractId: true,
  requestedAt: true,
  approvedAt: true,
});

const contractEditSchema = insertResearchContractSchema.extend({
  contractType: contractTypeSchema.optional(),
  status: contractStatusSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  contractValue: z.number().optional(),
  currency: z.string().optional(),
  scopeItems: z.array(scopeItemSchema).optional(),
  extensions: z.array(extensionSchema).optional(),
});

type ContractEditFormValues = z.infer<typeof contractEditSchema>;

export default function ResearchContractEdit() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentUser } = useCurrentUser();

  const { data: contract, isLoading } = useQuery<ResearchContract>({
    queryKey: ['/api/research-contracts', id],
    queryFn: () => fetch(`/api/research-contracts/${id}`).then(res => res.json()),
    enabled: !!id,
  });

  const { data: researchActivities } = useQuery<ResearchActivity[]>({
    queryKey: ['/api/research-activities'],
  });

  const { data: scopeItems, isLoading: scopeItemsLoading } = useQuery<ResearchContractScopeItem[]>({
    queryKey: ['/api/research-contracts', id, 'scope-items'],
    queryFn: async () => {
      const res = await fetch(`/api/research-contracts/${id}/scope-items`);
      if (!res.ok) {
        return [];
      }
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!id,
  });

  const { data: extensions, isLoading: extensionsLoading } = useQuery<ResearchContractExtension[]>({
    queryKey: ['/api/research-contracts', id, 'extensions'],
    queryFn: async () => {
      const res = await fetch(`/api/research-contracts/${id}/extensions`);
      if (!res.ok) {
        return [];
      }
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!id,
  });

  const form = useForm<ContractEditFormValues>({
    resolver: zodResolver(contractEditSchema),
    defaultValues: {
      researchActivityId: 0,
      contractNumber: "",
      title: "",
      contractorName: "",
      counterpartyContact: "",
      counterpartyCountry: "",
      startDate: "",
      endDate: "",
      internalCostSidra: 0,
      internalCostCounterparty: 0,
      moneyOut: 0,
      remarks: "",
      status: "submitted",
      contractType: "Service",
      contractValue: undefined,
      currency: "QAR",
      scopeItems: [{
        party: "sidra",
        description: "",
        dueDate: undefined,
        acceptanceCriteria: "",
        position: 0,
      }],
      extensions: [],
    },
  });

  React.useEffect(() => {
    if (contract && scopeItems !== undefined && extensions !== undefined) {
      const safeScopeItems = Array.isArray(scopeItems) ? scopeItems : [];
      const safeExtensions = Array.isArray(extensions) ? extensions : [];
      
      const formattedScopeItems = safeScopeItems.map(item => ({
        party: item.party as "sidra" | "counterparty",
        description: item.description,
        dueDate: item.dueDate ? new Date(item.dueDate) : undefined,
        acceptanceCriteria: item.acceptanceCriteria || "",
        position: item.position,
      }));

      const formattedExtensions = safeExtensions.map(extension => ({
        newEndDate: new Date(extension.newEndDate),
        notes: extension.notes || "",
        sequenceNumber: extension.sequenceNumber,
      }));
      
      form.reset({
        researchActivityId: contract.researchActivityId || 0,
        contractNumber: contract.contractNumber || "",
        title: contract.title || "",
        contractorName: contract.contractorName || "",
        counterpartyContact: contract.counterpartyContact || "",
        counterpartyCountry: contract.counterpartyCountry || "",
        startDate: contract.startDate ? new Date(contract.startDate).toISOString().split('T')[0] : "",
        endDate: contract.endDate ? new Date(contract.endDate).toISOString().split('T')[0] : "",
        internalCostSidra: contract.internalCostSidra || 0,
        internalCostCounterparty: contract.internalCostCounterparty || 0,
        moneyOut: contract.moneyOut || 0,
        remarks: contract.remarks || "",
        status: contract.status || "submitted",
        contractType: (CONTRACT_TYPES.includes(contract.contractType as any) ? contract.contractType : "Service") as typeof CONTRACT_TYPES[number],
        contractValue: contract.contractValue ? parseFloat(contract.contractValue) : undefined,
        currency: contract.currency || "QAR",
        scopeItems: formattedScopeItems.length > 0 ? formattedScopeItems : [{
          party: "sidra",
          description: "",
          dueDate: undefined,
          acceptanceCriteria: "",
          position: 0,
        }],
        extensions: formattedExtensions,
      });
    }
  }, [contract, scopeItems, extensions, form]);

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

  const { fields: extensionFields, append: appendExtension, remove: removeExtension } = useFieldArray({
    control: form.control,
    name: "extensions",
  });

  const addExtension = () => {
    appendExtension({
      newEndDate: new Date(),
      notes: "",
      sequenceNumber: extensionFields.length + 1,
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

  const updateMutation = useMutation({
    mutationFn: async (data: ContractEditFormValues) => {
      const { scopeItems, extensions, ...contractData } = data;
      
      const formattedContractData: any = {
        ...contractData,
        contractValue: contractData.contractValue?.toString(),
        startDate: contractData.startDate || null,
        endDate: contractData.endDate || null,
      };
      
      const contractResponse = await apiRequest("PATCH", `/api/research-contracts/${id}`, formattedContractData);
      
      if (scopeItems && scopeItems.length > 0) {
        const currentScopeItems = scopeItems || [];
        
        if (scopeItems.length > 0) {
          try {
            const existingResponse = await fetch(`/api/research-contracts/${id}/scope-items`);
            if (existingResponse.ok) {
              const existingItems = await existingResponse.json();
              
              for (const item of existingItems) {
                await apiRequest("DELETE", `/api/research-contracts/scope-items/${item.id}`);
              }
            }
          } catch (error) {
            console.warn("Error deleting existing scope items:", error);
          }
        }
        
        for (let i = 0; i < currentScopeItems.length; i++) {
          const item = currentScopeItems[i];
          await apiRequest("POST", `/api/research-contracts/${id}/scope-items`, {
            party: item.party,
            description: item.description,
            dueDate: item.dueDate ? (item.dueDate instanceof Date ? item.dueDate.toISOString().split('T')[0] : item.dueDate) : null,
            acceptanceCriteria: item.acceptanceCriteria || null,
            position: i,
          });
        }
      }

      try {
        const existingExtensionsResponse = await fetch(`/api/research-contracts/${id}/extensions`);
        if (existingExtensionsResponse.ok) {
          const existingExtensions = await existingExtensionsResponse.json();
          
          for (const extension of existingExtensions) {
            await apiRequest("DELETE", `/api/research-contracts/extensions/${extension.id}`);
          }
        }
      } catch (error) {
        console.warn("Error deleting existing extensions:", error);
      }

      if (extensions && extensions.length > 0) {
        for (let i = 0; i < extensions.length; i++) {
          const extension = extensions[i];
          await apiRequest("POST", `/api/research-contracts/${id}/extensions`, {
            newEndDate: extension.newEndDate.toISOString().split('T')[0],
            notes: extension.notes || null,
            sequenceNumber: i + 1,
          });
        }
      }
      
      return contractResponse.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Research contract, scope items, and extensions updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/research-contracts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/research-contracts', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/research-contracts', id, 'scope-items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/research-contracts', id, 'extensions'] });
      navigate(`/research-contracts/${id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update research contract",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ContractEditFormValues) => {
    updateMutation.mutate(data);
  };

  if (isLoading || scopeItemsLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/research-contracts")}>
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

  if (!contract) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/research-contracts")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">Research Contract Not Found</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <p className="text-lg text-foreground">The research contract you're trying to edit could not be found.</p>
              <Button className="mt-4" onClick={() => navigate("/research-contracts")}>
                Return to Research Contracts List
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
        <Button variant="ghost" size="sm" onClick={() => navigate(`/research-contracts/${id}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h1 className="text-2xl font-semibold text-foreground">Edit Research Contract</h1>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Research Activity (SDR) Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Research Activity (SDR)
              </CardTitle>
              <CardDescription>
                Select the research activity this contract is associated with
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="researchActivityId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Research Activity</FormLabel>
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
            </CardContent>
          </Card>

          {/* Contract Information Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Contract Information
              </CardTitle>
              <CardDescription>
                Basic details about the contract
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="contractNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contract Number</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., CONTRACT-001" {...field} />
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
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger>
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
              </div>

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Contract title" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Counterparty Information Card */}
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
                          value={field.value || ""}
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
                      <Select onValueChange={field.onChange} value={field.value || ""}>
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
                        value={field.value || ""}
                        data-testid="textarea-contact-info"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Financial Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Financial Details
              </CardTitle>
              <CardDescription>
                Contract value and budget information
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
                          step="0.01"
                          placeholder="0.00" 
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                          data-testid="input-contract-value"
                        />
                      </FormControl>
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
                      <Select onValueChange={field.onChange} value={field.value || "QAR"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-currency">
                            <SelectValue placeholder="Select currency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="QAR">QAR - Qatari Riyal</SelectItem>
                          <SelectItem value="USD">USD - US Dollar</SelectItem>
                          <SelectItem value="EUR">EUR - Euro</SelectItem>
                          <SelectItem value="GBP">GBP - British Pound</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="internalCostSidra"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Internal Cost Sidra (QAR)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="0" 
                          {...field}
                          value={field.value || 0}
                          onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="internalCostCounterparty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Internal Cost Counterparty (QAR)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="0" 
                          {...field}
                          value={field.value || 0}
                          onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="moneyOut"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Money Out (QAR)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="0" 
                          {...field}
                          value={field.value || 0}
                          onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Scope of Work Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="h-5 w-5" />
                Scope of Work
              </CardTitle>
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
                              type="button"
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

          {/* Contract Extensions Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                Contract Extensions
              </CardTitle>
              <CardDescription>
                Manage contract extensions and their details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {extensionFields.length > 0 ? (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Extension #</TableHead>
                          <TableHead className="w-[180px]">New End Date</TableHead>
                          <TableHead className="w-[300px]">Notes</TableHead>
                          <TableHead className="w-[80px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {extensionFields.map((field, index) => (
                          <TableRow key={field.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center">
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm dark:bg-blue-950 dark:text-blue-300">
                                  #{index + 1}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name={`extensions.${index}.newEndDate`}
                                render={({ field }) => (
                                  <FormItem className="flex flex-col">
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <FormControl>
                                          <Button
                                            variant={"outline"}
                                            className={cn(
                                              "w-full pl-3 text-left font-normal",
                                              !field.value && "text-muted-foreground"
                                            )}
                                            data-testid={`button-extension-date-${index}`}
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
                                        <DatePickerCalendar
                                          mode="single"
                                          selected={field.value}
                                          onSelect={field.onChange}
                                          disabled={(date) =>
                                            date < new Date("1900-01-01")
                                          }
                                          initialFocus
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
                                name={`extensions.${index}.notes`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Textarea
                                        placeholder="Extension notes or reason..."
                                        className="resize-none"
                                        rows={2}
                                        data-testid={`textarea-extension-notes-${index}`}
                                        {...field}
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
                                onClick={() => removeExtension(index)}
                                data-testid={`button-remove-extension-${index}`}
                                type="button"
                              >
                                <Minus className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 border rounded-md bg-neutral-50">
                    <p className="text-foreground">No extensions added yet.</p>
                    <p className="text-sm text-muted-foreground mt-1">Click "Add Extension" to create the first extension.</p>
                  </div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  onClick={addExtension}
                  className="w-full"
                  data-testid="button-add-extension"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Extension
                </Button>

                {form.formState.errors.extensions?.root && (
                  <p className="text-sm font-medium text-destructive">
                    {form.formState.errors.extensions.root.message}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Status & Actions Card */}
          <Card>
            <CardHeader>
              <CardTitle>Status & Actions</CardTitle>
              <CardDescription>
                Update contract status and add remarks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || "submitted"}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="submitted">Submitted</SelectItem>
                        <SelectItem value="under_review">Under Review</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="terminated">Terminated</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="remarks"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Remarks</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Additional notes, deliverables, or description..."
                        className="min-h-[150px]"
                        {...field}
                        value={field.value || ""}
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
                  data-testid="button-submit"
                >
                  {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => navigate(`/research-contracts/${id}`)}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  );
}
