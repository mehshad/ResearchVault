import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertIbcApplicationSchema } from "@shared/schema";
import { Scientist, Project, ResearchActivity } from "@shared/schema";
import { CalendarIcon, ArrowLeft, Users, Plus, X, Building2 } from "lucide-react";
import IbcFacilitiesTab from "@/components/IbcFacilitiesTab";
import { IbcInactivationDecontaminationTab } from "@/components/IbcInactivationDecontaminationTab";
import { IbcDisposalTab } from "@/components/IbcDisposalTab";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

// Create form schema excluding auto-generated fields and adding custom validations
const createIbcApplicationSchema = insertIbcApplicationSchema.omit({
  ibcNumber: true, // Auto-generated
  status: true, // Auto-generated
  workflowStatus: true, // Auto-generated
  riskLevel: true, // Auto-generated based on biosafetyLevel
}).extend({
  title: z.string().min(5, "Title must be at least 5 characters"),
  principalInvestigatorId: z.number({
    required_error: "Please select a principal investigator",
  }),
  biosafetyLevel: z.string({
    required_error: "Please select a biosafety level",
  }),
  researchActivityIds: z.array(z.number()).min(1, "Please select at least one research activity"),
  
  // Biosafety Options (all required)
  recombinantSyntheticNucleicAcid: z.boolean(),
  wholeAnimalsAnimalMaterial: z.boolean(),
  animalMaterialSubOptions: z.array(z.string()).optional(),
  humanNonHumanPrimateMaterial: z.boolean(),
  introducingPrimateMaterialIntoAnimals: z.boolean().optional(),
  microorganismsInfectiousMaterial: z.boolean(),
  introducingRecombinantDnaToMicroorganisms: z.boolean().optional(),
  biologicalToxins: z.boolean(),
  nanoparticles: z.boolean(),
  arthropods: z.boolean(),
  transgenicArthropodsOrExposure: z.boolean().optional(),
  plants: z.boolean(),
  transgenicPlantsOrExposure: z.boolean().optional(),
  
  // Additional fields
  riskGroupClassification: z.string().optional(),
  protocolSummary: z.string().optional(),
  
  // NIH Guidelines sections
  nihSectionABC: z.object({
    requiresNihDirectorApproval: z.boolean().default(false),
    drugResistanceTraits: z.boolean().default(false),
    toxinMolecules: z.boolean().default(false),
    humanGeneTransfer: z.boolean().default(false),
    approvalStatus: z.string().optional(),
    approvalDocuments: z.array(z.string()).default([]),
  }).optional(),
  
  nihSectionD: z.object({
    riskGroup2Plus: z.boolean().default(false),
    pathogenDnaRna: z.boolean().default(false),
    infectiousViral: z.boolean().default(false),
    wholeAnimalExperiments: z.boolean().default(false),
    wholePlants: z.boolean().default(false),
    largeScaleExperiments: z.boolean().default(false),
    influenzaViruses: z.boolean().default(false),
    geneDriveOrganisms: z.boolean().default(false),
    containmentLevel: z.string().optional(),
    ibcApprovalDate: z.string().optional(),
  }).optional(),
  
  nihSectionE: z.object({
    limitedViralGenome: z.boolean().default(false),
    plantExperiments: z.boolean().default(false),
    transgenicRodents: z.boolean().default(false),
    registrationDate: z.string().optional(),
  }).optional(),
  
  nihSectionF: z.object({
    f1TissueCulture: z.boolean().default(false),
    f2EcoliK12: z.boolean().default(false),
    f3Saccharomyces: z.boolean().default(false),
    f4Kluyveromyces: z.boolean().default(false),
    f5Bacillus: z.boolean().default(false),
    f6GramPositive: z.boolean().default(false),
    f7TransgenicRodents: z.boolean().default(false),
    f8TransgenicBreeding: z.boolean().default(false),
    exemptionJustification: z.string().optional(),
  }).optional(),
  
  nihAppendixC: z.object({
    cI: z.boolean().default(false),
    cII: z.boolean().default(false),
    cIII: z.boolean().default(false),
    cIV: z.boolean().default(false),
    cV: z.boolean().default(false),
    cVI: z.boolean().default(false),
    cVII: z.boolean().default(false),
    cVIII: z.boolean().default(false),
    cIX: z.boolean().default(false),
    additionalConsiderations: z.string().optional(),
  }).optional(),
  
  hazardousProcedures: z.array(z.object({
    procedure: z.string().optional(),
    backboneVector: z.string().optional(),
    engineeringControls: z.object({
      centrifugeCone: z.boolean().default(false),
      classIIBiosafetyCabinet: z.boolean().default(false),
      engineeredSharps: z.boolean().default(false),
      fumeHood: z.boolean().default(false),
      hepaFilteredCage: z.boolean().default(false),
      localExhaustSnorkel: z.boolean().default(false),
      na: z.boolean().default(false),
      sealedRotor: z.boolean().default(false),
      sealedVialstubes: z.boolean().default(false),
      sharpsContainer: z.boolean().default(false),
    }).optional(),
    ppe: z.object({
      faceShield: z.boolean().default(false),
      gloves: z.boolean().default(false),
      goggles: z.boolean().default(false),
      headCoverBonnet: z.boolean().default(false),
      labCoatDisposable: z.boolean().default(false),
      labCoatReusable: z.boolean().default(false),
      na: z.boolean().default(false),
      n95: z.boolean().default(false),
      padr: z.boolean().default(false),
      safetyGlasses: z.boolean().default(false),
      shoeCovers: z.boolean().default(false),
      surgicalMask: z.boolean().default(false),
      tyvekSuit: z.boolean().default(false),
    }).optional(),
    hazardousProcedureDescription: z.string().optional(),
  })).default([]),
  
  syntheticExperiments: z.array(z.object({
    backboneSource: z.string().optional(),
    vectorInsertName: z.string().optional(),
    vectorInsert: z.string().optional(),
    insertedDnaSource: z.string().optional(),
    dnaSequenceNature: z.object({
      anonymousMarker: z.boolean().default(false),
      genomicDNA: z.boolean().default(false),
      toxinGene: z.boolean().default(false),
      cDNA: z.boolean().default(false),
      snRNAsiRNA: z.boolean().default(false),
      other: z.boolean().default(false),
    }).optional(),
    anticipatedEffect: z.object({
      antiApoptotic: z.boolean().default(false),
      cytokineInducer: z.boolean().default(false),
      cytokineInhibitor: z.boolean().default(false),
      growthFactor: z.boolean().default(false),
      oncogene: z.boolean().default(false),
      toxic: z.boolean().default(false),
      tumorInducer: z.boolean().default(false),
      tumorInhibitor: z.boolean().default(false),
      otherSpecify: z.string().optional(),
    }).optional(),
    viralGenomeFraction: z.string().optional(),
    replicationCompetent: z.string().optional(),
    packagingCellLines: z.string().optional(),
    tropism: z.string().optional(),
    exposedTo: z.object({
      arthropods: z.boolean().default(false),
      cellCulture: z.boolean().default(false),
      humans: z.boolean().default(false),
      invertebrateAnimals: z.boolean().default(false),
      microOrganism: z.boolean().default(false),
      none: z.boolean().default(false),
      plantsTransgenicPlants: z.boolean().default(false),
      vertebrateAnimals: z.boolean().default(false),
    }).optional(),
    vectorSource: z.object({
      researchCollaborator: z.boolean().default(false),
      commercialVendor: z.boolean().default(false),
      institutionLab: z.boolean().default(false),
      otherSource: z.boolean().default(false),
    }).optional(),
    organismName: z.string().optional(),
    organismSource: z.object({
      library: z.boolean().default(false),
      pcr: z.boolean().default(false),
      syntheticOligo: z.boolean().default(false),
      other: z.boolean().default(false),
    }).optional(),
  })).default([]),
  
  // Methods and Procedures
  materialAndMethods: z.string().optional(),
  proceduresInvolvingInfectiousAgents: z.string().optional(),
  cellCultureProcedures: z.string().optional(),
  nucleicAcidExtractionMethods: z.string().optional(),
  animalProcedures: z.string().optional(),
  
  // Safety and Containment
  containmentProcedures: z.string().optional(),
  emergencyProcedures: z.string().optional(),
  wasteDisposalPlan: z.string().optional(),
  
  // Legacy biosafety checkboxes (for compatibility)
  recombinantDNA: z.boolean().optional(),
  animalWork: z.boolean().optional(),
  fieldWork: z.boolean().optional(),
  
  // Human/NHP Section
  humanOrigin: z.boolean().optional(),
  humanMaterials: z.array(z.string()).optional(),
  humanMaterialsTissuesOther: z.string().optional(),
  humanMaterialsOtherMaterial: z.string().optional(),
  nonHumanPrimateOrigin: z.boolean().optional(),
  stemCells: z.array(z.string()).optional(),
  exposureControlPlanCompliance: z.boolean().optional(),
  handWashingDevice: z.boolean().optional(),
  laundryMethod: z.array(z.string()).optional(),
  laundryMethodOther: z.string().optional(),
  materialsContainKnownPathogens: z.boolean().optional(),
  materialPathogenDetails: z.string().optional(),
  materialTreatmentDetails: z.string().optional(),
  infectionSymptoms: z.string().optional(),
  
  // Team members array with roles
  teamMembers: z.array(z.union([
    z.object({
      scientistId: z.number(),
      role: z.enum(["team_member", "team_leader", "safety_representative"]),
    }),
    z.object({
      name: z.string(),
      email: z.string().optional(),
      role: z.string(),
    })
  ])).default([]),
});

type CreateIbcApplicationFormValues = z.infer<typeof createIbcApplicationSchema>;

export default function CreateIbc() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  // State for team member selection
  const [selectedMember, setSelectedMember] = useState<string>("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  
  // Default form values
  const defaultValues: Partial<CreateIbcApplicationFormValues> = {
    biosafetyLevel: "BSL-2",
    researchActivityIds: [],
    teamMembers: [],
    // Default biosafety options to false
    recombinantSyntheticNucleicAcid: false,
    wholeAnimalsAnimalMaterial: false,
    animalMaterialSubOptions: [],
    humanNonHumanPrimateMaterial: false,
    introducingPrimateMaterialIntoAnimals: false,
    microorganismsInfectiousMaterial: false,
    introducingRecombinantDnaToMicroorganisms: false,
    biologicalToxins: false,
    nanoparticles: false,
    arthropods: false,
    transgenicArthropodsOrExposure: false,
    plants: false,
    transgenicPlantsOrExposure: false,
    riskGroupClassification: "",
    protocolSummary: "",
    
    // NIH Guidelines defaults
    nihSectionABC: {
      requiresNihDirectorApproval: false,
      drugResistanceTraits: false,
      toxinMolecules: false,
      humanGeneTransfer: false,
      approvalStatus: "",
      approvalDocuments: [],
    },
    nihSectionD: {
      riskGroup2Plus: false,
      pathogenDnaRna: false,
      infectiousViral: false,
      wholeAnimalExperiments: false,
      wholePlants: false,
      largeScaleExperiments: false,
      influenzaViruses: false,
      geneDriveOrganisms: false,
      containmentLevel: "",
      ibcApprovalDate: "",
    },
    nihSectionE: {
      limitedViralGenome: false,
      plantExperiments: false,
      transgenicRodents: false,
      registrationDate: "",
    },
    nihSectionF: {
      f1TissueCulture: false,
      f2EcoliK12: false,
      f3Saccharomyces: false,
      f4Kluyveromyces: false,
      f5Bacillus: false,
      f6GramPositive: false,
      f7TransgenicRodents: false,
      f8TransgenicBreeding: false,
      exemptionJustification: "",
    },
    nihAppendixC: {
      cI: false,
      cII: false,
      cIII: false,
      cIV: false,
      cV: false,
      cVI: false,
      cVII: false,
      cVIII: false,
      cIX: false,
      additionalConsiderations: "",
    },
    hazardousProcedures: [],
    syntheticExperiments: [],
    
    // Methods and Procedures defaults
    materialAndMethods: "",
    proceduresInvolvingInfectiousAgents: "",
    cellCultureProcedures: "",
    nucleicAcidExtractionMethods: "",
    animalProcedures: "",
    
    // Safety and Containment defaults
    containmentProcedures: "",
    emergencyProcedures: "",
    wasteDisposalPlan: "",
    
    // Legacy biosafety checkboxes defaults
    recombinantDNA: false,
    animalWork: false,
    fieldWork: false,
    
    // Human/NHP Section defaults
    humanOrigin: false,
    humanMaterials: [],
    humanMaterialsTissuesOther: "",
    humanMaterialsOtherMaterial: "",
    nonHumanPrimateOrigin: false,
    stemCells: [],
    exposureControlPlanCompliance: false,
    handWashingDevice: false,
    laundryMethod: [],
    laundryMethodOther: "",
    materialsContainKnownPathogens: false,
    materialPathogenDetails: "",
    materialTreatmentDetails: "",
    infectionSymptoms: "",
  };

  // Get all principal investigators for selection
  const { data: principalInvestigators, isLoading: piLoading } = useQuery<Scientist[]>({
    queryKey: ['/api/principal-investigators'],
  });

  const form = useForm<CreateIbcApplicationFormValues>({
    resolver: zodResolver(createIbcApplicationSchema),
    defaultValues,
  });

  const selectedPIId = form.watch('principalInvestigatorId');
  const selectedSDRIds = form.watch('researchActivityIds') || [];

  // Get research activities filtered by selected PI
  const { data: researchActivities, isLoading: activitiesLoading } = useQuery<ResearchActivity[]>({
    queryKey: ['/api/research-activities', selectedPIId],
    queryFn: async () => {
      if (!selectedPIId) return [];
      const response = await fetch(`/api/research-activities?principalInvestigatorId=${selectedPIId}`);
      if (!response.ok) throw new Error('Failed to fetch research activities');
      return response.json();
    },
    enabled: !!selectedPIId,
  });

  // Get staff from selected SDRs for team member selection  
  const { data: availableStaff, isLoading: staffLoading } = useQuery<Scientist[]>({
    queryKey: ['/api/research-activities/staff', selectedSDRIds],
    queryFn: async () => {
      if (!selectedSDRIds.length) return [];
      const staffPromises = selectedSDRIds.map(async (sdrId) => {
        const response = await fetch(`/api/research-activities/${sdrId}/staff`);
        if (!response.ok) return [];
        return response.json();
      });
      const staffArrays = await Promise.all(staffPromises);
      const allStaff = staffArrays.flat();
      
      // Remove duplicates and exclude the PI
      const uniqueStaff = allStaff.filter((staff, index, arr) => 
        arr.findIndex(s => s.id === staff.id) === index && 
        staff.id !== selectedPIId
      );
      
      return uniqueStaff;
    },
    enabled: selectedSDRIds.length > 0,
  });

  // Save as Draft mutation
  const saveDraftMutation = useMutation({
    mutationFn: async (data: CreateIbcApplicationFormValues) => {
      // Extract research activity IDs for the junction table
      const researchActivityIds = data.researchActivityIds;
      
      // Prepare the main IBC application data (excluding the junction table data)
      const { researchActivityIds: _, ...ibcApplicationData } = data;
      
      // Send the complete request with isDraft flag
      const requestBody = {
        ...ibcApplicationData,
        researchActivityIds,
        isDraft: true,
      };

      const response = await apiRequest("POST", "/api/ibc-applications", requestBody);
      return response.json();
    },
    onSuccess: (response, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ibc-applications'] });
      toast({
        title: "Draft Saved",
        description: "The IBC application has been saved as a draft.",
      });
      navigate("/ibc");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "There was an error saving the draft.",
        variant: "destructive",
      });
    },
  });

  // Submit Application mutation
  const submitApplicationMutation = useMutation({
    mutationFn: async (data: CreateIbcApplicationFormValues) => {
      // Extract research activity IDs for the junction table
      const researchActivityIds = data.researchActivityIds;
      
      // Prepare the main IBC application data (excluding the junction table data)
      const { researchActivityIds: _, ...ibcApplicationData } = data;
      
      // Send the complete request (backend handles auto-generation)
      const requestBody = {
        ...ibcApplicationData,
        researchActivityIds,
        isDraft: false,
      };

      const response = await apiRequest("POST", "/api/ibc-applications", requestBody);
      return response.json();
    },
    onSuccess: (response, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ibc-applications'] });
      toast({
        title: "Application Submitted",
        description: "The IBC application has been successfully submitted for review.",
      });
      navigate("/ibc");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "There was an error submitting the application.",
        variant: "destructive",
      });
    },
  });

  // Handler for saving as draft
  const onSaveAsDraft = (data: CreateIbcApplicationFormValues) => {
    saveDraftMutation.mutate(data);
  };

  // Handler for submitting application
  const onSubmitApplication = (data: CreateIbcApplicationFormValues) => {
    submitApplicationMutation.mutate(data);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4 mb-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate("/ibc")}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to IBC Applications
            </Button>
          </div>
          <CardTitle className="text-2xl font-bold">Create New IBC Application</CardTitle>
          <CardDescription>
            Submit a new application for Institutional Biosafety Committee review
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="space-y-8">
              <Tabs defaultValue="basics" className="w-full">
                <TabsList className="w-full flex overflow-x-auto px-2 gap-1" style={{scrollPaddingLeft: '8px', scrollPaddingRight: '8px'}}>
                  <TabsTrigger value="basics" className="whitespace-nowrap flex-shrink-0">Basics</TabsTrigger>
                  <TabsTrigger value="staff" className="whitespace-nowrap flex-shrink-0">Staff</TabsTrigger>
                  <TabsTrigger value="overview" className="whitespace-nowrap flex-shrink-0">Overview</TabsTrigger>
                </TabsList>
                
                <TabsContent value="basics" className="space-y-6 mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Basic Information</CardTitle>
                      <CardDescription>Core IBC application details</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="principalInvestigatorId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Principal Investigator</FormLabel>
                              <FormDescription>
                                Select the PI first to filter related research activities
                              </FormDescription>
                              <Select
                                onValueChange={(value) => {
                                  field.onChange(parseInt(value));
                                  form.setValue('researchActivityIds', []);
                                }}
                                value={field.value?.toString() || ""}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select a Principal Investigator" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {piLoading ? (
                                    <SelectItem value="loading" disabled>Loading PIs...</SelectItem>
                                  ) : (
                                    principalInvestigators?.map((pi) => (
                                      <SelectItem key={pi.id} value={pi.id.toString()}>
                                        {pi.firstName} {pi.lastName} ({pi.jobTitle || "Researcher"})
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
                          name="researchActivityIds"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Research Activities (SDRs)</FormLabel>
                              <FormDescription>
                                Select one or more research activities that share biosafety protocols
                              </FormDescription>
                              <div className="space-y-2">
                                {!selectedPIId ? (
                                  <div className="text-sm text-muted-foreground italic">
                                    Please select a Principal Investigator first to see available research activities
                                  </div>
                                ) : activitiesLoading ? (
                                  <div className="text-sm text-muted-foreground">Loading research activities...</div>
                                ) : researchActivities && researchActivities.length > 0 ? (
                                  researchActivities.map((activity) => (
                                    <div key={activity.id} className="flex items-center space-x-2">
                                      <input
                                        type="checkbox"
                                        id={`sdr-${activity.id}`}
                                        checked={field.value?.includes(activity.id) || false}
                                        onChange={(e) => {
                                          const currentValues = field.value || [];
                                          if (e.target.checked) {
                                            field.onChange([...currentValues, activity.id]);
                                          } else {
                                            field.onChange(currentValues.filter(id => id !== activity.id));
                                          }
                                        }}
                                        className="rounded border-gray-300 dark:border-gray-600"
                                      />
                                      <label htmlFor={`sdr-${activity.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                        {activity.sdrNumber} - {activity.title}
                                      </label>
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-sm text-muted-foreground italic">
                                    No research activities available for the selected PI
                                  </div>
                                )}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="title"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Title</FormLabel>
                              <FormControl>
                                <Input placeholder="IBC application title" {...field} value={field.value || ""} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="shortTitle"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Short Title</FormLabel>
                              <FormControl>
                                <Input placeholder="Short recognition title" {...field} value={field.value || ""} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Legacy IDs Section */}
                      <Card className="border-dashed">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium text-muted-foreground">Legacy IDs (optional)</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="cayuseProtocolNumber"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Cayuse Protocol Number</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Cayuse protocol number" {...field} value={field.value || ""} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            
                            <FormField
                              control={form.control}
                              name="irbnetIbcNumber"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>IRBnet IBC Number</FormLabel>
                                  <FormControl>
                                    <Input placeholder="IRBnet IBC number" {...field} value={field.value || ""} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </CardContent>
                      </Card>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="biosafetyLevel"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Biosafety Level</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select biosafety level" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="BSL-1">BSL-1</SelectItem>
                                  <SelectItem value="BSL-2">BSL-2</SelectItem>
                                  <SelectItem value="BSL-3">BSL-3</SelectItem>
                                  <SelectItem value="BSL-4">BSL-4</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="riskGroupClassification"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Risk Group Classification</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select risk group" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Risk Group 1">Risk Group 1 - No or low risk</SelectItem>
                                <SelectItem value="Risk Group 2">Risk Group 2 - Moderate risk</SelectItem>
                                <SelectItem value="Risk Group 3">Risk Group 3 - High risk</SelectItem>
                                <SelectItem value="Risk Group 4">Risk Group 4 - Extreme danger</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  {/* Biosafety Options Sections */}
                  <div className="space-y-6">
                    <h3 className="text-lg font-semibold">Biosafety Materials</h3>
                    <div className="text-sm text-muted-foreground">
                      Please indicate all materials that will be used in this research project.
                    </div>

                    <FormField
                      control={form.control}
                      name="recombinantSyntheticNucleicAcid"
                      render={({ field }) => (
                        <FormItem className="bg-white p-4 rounded-lg border border-gray-200 dark:bg-card dark:border-gray-700">
                          <div className="space-y-3">
                            <FormLabel className="text-base font-medium">
                              Recombinant and/or Synthetic Nucleic Acid Molecules (e.g., plasmids, viral vectors, synthetic DNA/RNA)
                            </FormLabel>
                            <FormControl>
                              <div className="flex items-center space-x-6">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    checked={field.value === true}
                                    onChange={() => field.onChange(true)}
                                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                  />
                                  <span>Yes</span>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    checked={field.value === false}
                                    onChange={() => field.onChange(false)}
                                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                  />
                                  <span>No</span>
                                </label>
                              </div>
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="wholeAnimalsAnimalMaterial"
                      render={({ field }) => (
                        <FormItem className="bg-white p-4 rounded-lg border border-gray-200 dark:bg-card dark:border-gray-700">
                          <div className="space-y-3">
                            <FormLabel className="text-base font-medium">
                              Whole Animals and/or Animal Materials (e.g., tissues, cells, sera, proteins)
                            </FormLabel>
                            <FormControl>
                              <div className="flex items-center space-x-6">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    checked={field.value === true}
                                    onChange={() => field.onChange(true)}
                                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                  />
                                  <span>Yes</span>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    checked={field.value === false}
                                    onChange={() => field.onChange(false)}
                                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                  />
                                  <span>No</span>
                                </label>
                              </div>
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Conditional sub-options for Animal Material */}
                    {form.watch('wholeAnimalsAnimalMaterial') && (
                      <FormField
                        control={form.control}
                        name="animalMaterialSubOptions"
                        render={({ field }) => (
                          <FormItem className="bg-blue-50 p-4 rounded-lg border border-blue-200 ml-8 dark:bg-blue-950 dark:border-blue-800">
                            <div className="space-y-3">
                              <FormLabel className="text-base font-medium text-blue-800 dark:text-blue-300">
                                Please specify which animal materials will be used:
                              </FormLabel>
                              <FormControl>
                                <div className="grid grid-cols-2 gap-3">
                                  {[
                                    { id: "live_animals", label: "Live Animals" },
                                    { id: "animal_tissues", label: "Animal Tissues" },
                                    { id: "animal_cell_lines", label: "Animal Cell Lines" },
                                    { id: "animal_blood_serum", label: "Animal Blood/Serum" },
                                    { id: "animal_derived_products", label: "Animal-derived Products" },
                                    { id: "transgenic_animals", label: "Transgenic Animals" },
                                    { id: "animal_waste", label: "Animal Waste/Excretions" },
                                    { id: "other_animal_materials", label: "Other Animal Materials" }
                                  ].map((option) => (
                                    <div key={option.id} className="flex items-center space-x-3">
                                      <Checkbox
                                        id={option.id}
                                        checked={(field.value || []).includes(option.id)}
                                        onCheckedChange={(checked) => {
                                          const currentValues = field.value || [];
                                          if (checked) {
                                            field.onChange([...currentValues, option.id]);
                                          } else {
                                            field.onChange(currentValues.filter((value) => value !== option.id));
                                          }
                                        }}
                                      />
                                      <label
                                        htmlFor={option.id}
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                      >
                                        {option.label}
                                      </label>
                                    </div>
                                  ))}
                                </div>
                              </FormControl>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name="humanNonHumanPrimateMaterial"
                      render={({ field }) => (
                        <FormItem className="bg-white p-4 rounded-lg border border-gray-200 dark:bg-card dark:border-gray-700">
                          <div className="space-y-3">
                            <FormLabel className="text-base font-medium">
                              Human & Non-Human Primate Material (e.g., blood, fluids, tissues, primary/established cell lines)
                            </FormLabel>
                            <FormControl>
                              <div className="flex items-center space-x-6">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    checked={field.value === true}
                                    onChange={() => field.onChange(true)}
                                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                  />
                                  <span>Yes</span>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    checked={field.value === false}
                                    onChange={() => field.onChange(false)}
                                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                  />
                                  <span>No</span>
                                </label>
                              </div>
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Conditional sub-question for Human/Non-Human Primate Material */}
                    {form.watch('humanNonHumanPrimateMaterial') && (
                      <FormField
                        control={form.control}
                        name="introducingPrimateMaterialIntoAnimals"
                        render={({ field }) => (
                          <FormItem className="bg-orange-50 p-4 rounded-lg border border-orange-200 ml-8 dark:bg-orange-950 dark:border-orange-800">
                            <div className="space-y-3">
                              <FormLabel className="text-base font-medium text-orange-800 dark:text-orange-300">
                                Will you be introducing these materials into animals?
                              </FormLabel>
                              <FormControl>
                                <div className="flex items-center space-x-6">
                                  <label className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                      type="radio"
                                      checked={field.value === true}
                                      onChange={() => field.onChange(true)}
                                      className="w-4 h-4 text-orange-600 dark:text-orange-400"
                                    />
                                    <span>Yes</span>
                                  </label>
                                  <label className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                      type="radio"
                                      checked={field.value === false}
                                      onChange={() => field.onChange(false)}
                                      className="w-4 h-4 text-orange-600 dark:text-orange-400"
                                    />
                                    <span>No</span>
                                  </label>
                                </div>
                              </FormControl>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name="microorganismsInfectiousMaterial"
                      render={({ field }) => (
                        <FormItem className="bg-white p-4 rounded-lg border border-gray-200 dark:bg-card dark:border-gray-700">
                          <div className="space-y-3">
                            <FormLabel className="text-base font-medium">
                              Microorganisms/Potentially Infectious Material (e.g., viruses, bacteria, yeast, fungi, parasites, prions)
                            </FormLabel>
                            <FormControl>
                              <div className="flex items-center space-x-6">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    checked={field.value === true}
                                    onChange={() => field.onChange(true)}
                                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                  />
                                  <span>Yes</span>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    checked={field.value === false}
                                    onChange={() => field.onChange(false)}
                                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                  />
                                  <span>No</span>
                                </label>
                              </div>
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Conditional sub-question for Microorganisms */}
                    {form.watch('microorganismsInfectiousMaterial') && (
                      <FormField
                        control={form.control}
                        name="introducingRecombinantDnaToMicroorganisms"
                        render={({ field }) => (
                          <FormItem className="bg-blue-50 p-4 rounded-lg border border-blue-200 ml-8 dark:bg-blue-950 dark:border-blue-800">
                            <div className="space-y-3">
                              <FormLabel className="text-base font-medium text-blue-800 dark:text-blue-300">
                                Will you introduce recombinant/synthetic DNA to any microorganism/potentially infectious agent, use recombinant/synthetic DNA to change the genetic make-up of any microorganism/potentially infectious agent, or use DNA from any microorganism/infectious agent to perform any recombinant DNA experiments? <span className="text-red-500">*</span>
                              </FormLabel>
                              <FormControl>
                                <div className="flex items-center space-x-6">
                                  <label className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                      type="radio"
                                      checked={field.value === true}
                                      onChange={() => field.onChange(true)}
                                      className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                    />
                                    <span>Yes</span>
                                  </label>
                                  <label className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                      type="radio"
                                      checked={field.value === false}
                                      onChange={() => field.onChange(false)}
                                      className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                    />
                                    <span>No</span>
                                  </label>
                                </div>
                              </FormControl>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name="biologicalToxins"
                      render={({ field }) => (
                        <FormItem className="bg-white p-4 rounded-lg border border-gray-200 dark:bg-card dark:border-gray-700">
                          <div className="space-y-3">
                            <FormLabel className="text-base font-medium">
                              Biological Toxins (e.g., cholera toxin, pertussis toxin, diphtheria toxin, tetrodotoxin)
                            </FormLabel>
                            <FormControl>
                              <div className="flex items-center space-x-6">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    checked={field.value === true}
                                    onChange={() => field.onChange(true)}
                                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                  />
                                  <span>Yes</span>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    checked={field.value === false}
                                    onChange={() => field.onChange(false)}
                                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                  />
                                  <span>No</span>
                                </label>
                              </div>
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="nanoparticles"
                      render={({ field }) => (
                        <FormItem className="bg-white p-4 rounded-lg border border-gray-200 dark:bg-card dark:border-gray-700">
                          <div className="space-y-3">
                            <FormLabel className="text-base font-medium">
                              Nanoparticles (e.g., use of Jet-Pei or Poly-L-Lysine to form nano-sized particles)
                            </FormLabel>
                            <FormControl>
                              <div className="flex items-center space-x-6">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    checked={field.value === true}
                                    onChange={() => field.onChange(true)}
                                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                  />
                                  <span>Yes</span>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    checked={field.value === false}
                                    onChange={() => field.onChange(false)}
                                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                  />
                                  <span>No</span>
                                </label>
                              </div>
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="arthropods"
                      render={({ field }) => (
                        <FormItem className="bg-white p-4 rounded-lg border border-gray-200 dark:bg-card dark:border-gray-700">
                          <div className="space-y-3">
                            <FormLabel className="text-base font-medium">
                              Arthropods (e.g., insects, spiders, crabs, lobsters, shrimp)
                            </FormLabel>
                            <FormControl>
                              <div className="flex items-center space-x-6">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    checked={field.value === true}
                                    onChange={() => field.onChange(true)}
                                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                  />
                                  <span>Yes</span>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    checked={field.value === false}
                                    onChange={() => field.onChange(false)}
                                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                  />
                                  <span>No</span>
                                </label>
                              </div>
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Conditional sub-question for Arthropods */}
                    {form.watch('arthropods') && (
                      <FormField
                        control={form.control}
                        name="transgenicArthropodsOrExposure"
                        render={({ field }) => (
                          <FormItem className="bg-blue-50 p-4 rounded-lg border border-blue-200 ml-8 dark:bg-blue-950 dark:border-blue-800">
                            <div className="space-y-3">
                              <FormLabel className="text-base font-medium text-blue-800 dark:text-blue-300">
                                Will you be using, creating, or breeding transgenic arthropods or exposing arthropods to recombinant DNA? <span className="text-red-500">*</span>
                              </FormLabel>
                              <FormControl>
                                <div className="flex items-center space-x-6">
                                  <label className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                      type="radio"
                                      checked={field.value === true}
                                      onChange={() => field.onChange(true)}
                                      className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                    />
                                    <span>Yes</span>
                                  </label>
                                  <label className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                      type="radio"
                                      checked={field.value === false}
                                      onChange={() => field.onChange(false)}
                                      className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                    />
                                    <span>No</span>
                                  </label>
                                </div>
                              </FormControl>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name="plants"
                      render={({ field }) => (
                        <FormItem className="bg-white p-4 rounded-lg border border-gray-200 dark:bg-card dark:border-gray-700">
                          <div className="space-y-3">
                            <FormLabel className="text-base font-medium">
                              Plants (e.g., toxic/transgenic plants)
                            </FormLabel>
                            <FormControl>
                              <div className="flex items-center space-x-6">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    checked={field.value === true}
                                    onChange={() => field.onChange(true)}
                                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                  />
                                  <span>Yes</span>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    checked={field.value === false}
                                    onChange={() => field.onChange(false)}
                                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                  />
                                  <span>No</span>
                                </label>
                              </div>
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Conditional sub-question for Plants */}
                    {form.watch('plants') && (
                      <FormField
                        control={form.control}
                        name="transgenicPlantsOrExposure"
                        render={({ field }) => (
                          <FormItem className="bg-blue-50 p-4 rounded-lg border border-blue-200 ml-8 dark:bg-blue-950 dark:border-blue-800">
                            <div className="space-y-3">
                              <FormLabel className="text-base font-medium text-blue-800 dark:text-blue-300">
                                Will you be creating transgenic plants, exposing plant to recombinant DNA, transgenic arthropods, or transgenic microorganism/infectious agents? <span className="text-red-500">*</span>
                              </FormLabel>
                              <FormControl>
                                <div className="flex items-center space-x-6">
                                  <label className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                      type="radio"
                                      checked={field.value === true}
                                      onChange={() => field.onChange(true)}
                                      className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                    />
                                    <span>Yes</span>
                                  </label>
                                  <label className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                      type="radio"
                                      checked={field.value === false}
                                      onChange={() => field.onChange(false)}
                                      className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                    />
                                    <span>No</span>
                                  </label>
                                </div>
                              </FormControl>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="staff" className="space-y-6 mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Protocol Team Members
                      </CardTitle>
                      <CardDescription>
                        Add team members from available SDR staff who will be involved in this protocol
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Team member selection section */}
                      {selectedSDRIds.length > 0 && availableStaff && availableStaff.length > 0 && (
                        <div className="space-y-4 p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
                          <h4 className="font-medium">Add Team Member from Research Activities</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Select value={selectedMember} onValueChange={setSelectedMember}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a team member" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableStaff.map((staff) => (
                                  <SelectItem key={staff.id} value={staff.id.toString()}>
                                    {staff.firstName} {staff.lastName} ({staff.jobTitle || "Staff"})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            <Select 
                              value={selectedRoles[0] || ""} 
                              onValueChange={(value) => setSelectedRoles([value])}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select role" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="team_member">Team Member</SelectItem>
                                <SelectItem value="team_leader">Team Leader</SelectItem>
                                <SelectItem value="safety_representative">Safety Representative</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <Button 
                            type="button" 
                            onClick={() => {
                              if (selectedMember && selectedRoles.length > 0) {
                                const staff = availableStaff.find(s => s.id.toString() === selectedMember);
                                if (staff) {
                                  const currentMembers = form.getValues('teamMembers') || [];
                                  const newMember = {
                                    scientistId: staff.id,
                                    role: selectedRoles[0] as "team_member" | "team_leader" | "safety_representative"
                                  };
                                  
                                  // Check if member already exists
                                  const exists = currentMembers.some(member => 
                                    'scientistId' in member && member.scientistId === staff.id
                                  );
                                  
                                  if (!exists) {
                                    form.setValue('teamMembers', [...currentMembers, newMember]);
                                    setSelectedMember("");
                                    setSelectedRoles([]);
                                  }
                                }
                              }
                            }}
                            disabled={!selectedMember || selectedRoles.length === 0}
                            className="w-full"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Team Member
                          </Button>
                        </div>
                      )}
                      
                      {/* Current team members list */}
                      <div className="space-y-2">
                        <h4 className="font-medium">Current Team Members</h4>
                        {form.watch('teamMembers')?.map((member, index) => {
                          if ('scientistId' in member) {
                            // Team member from staff database
                            const staff = availableStaff?.find(s => s.id === member.scientistId);
                            return (
                              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg dark:bg-gray-900">
                                <div className="flex items-center space-x-3">
                                  <div>
                                    <div className="font-medium">
                                      {staff ? `${staff.firstName} ${staff.lastName}` : `Staff ID: ${member.scientistId}`}
                                    </div>
                                    <div className="text-sm text-gray-600 dark:text-gray-300">
                                      {staff?.jobTitle || "Staff"} • Role: {member.role.replace('_', ' ')}
                                    </div>
                                  </div>
                                </div>
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => {
                                    const currentMembers = form.getValues('teamMembers') || [];
                                    form.setValue('teamMembers', 
                                      currentMembers.filter((_, i) => i !== index)
                                    );
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            );
                          } else {
                            // External team member
                            return (
                              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg dark:bg-gray-900">
                                <div className="flex items-center space-x-3">
                                  <div>
                                    <div className="font-medium">{member.name}</div>
                                    <div className="text-sm text-gray-600 dark:text-gray-300">
                                      {member.email && `${member.email} • `}Role: {member.role}
                                    </div>
                                  </div>
                                </div>
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => {
                                    const currentMembers = form.getValues('teamMembers') || [];
                                    form.setValue('teamMembers', 
                                      currentMembers.filter((_, i) => i !== index)
                                    );
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            );
                          }
                        })}
                        
                        {(!form.watch('teamMembers') || form.watch('teamMembers')?.length === 0) && (
                          <div className="text-center py-4 text-gray-500 text-sm dark:text-gray-400">
                            No team members added yet
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="overview" className="space-y-6 mt-6">
                  <div className="grid grid-cols-1 gap-6">
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Project Description</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Provide a general overview of your research - describe what your research will be about, the scientific objectives, and the broader goals of the study" 
                              className="resize-none" 
                              rows={4}
                              {...field}
                              value={field.value || ""} 
                            />
                          </FormControl>
                          <FormDescription>
                            Describe the general overview of what your research will be about
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="protocolSummary"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Protocol Summary</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Describe the key protocols or methods being used in this research - include specific experimental procedures, techniques, equipment, and methodological approaches that will be employed" 
                              className="resize-none" 
                              rows={6}
                              {...field}
                              value={field.value || ""} 
                            />
                          </FormControl>
                          <FormDescription>
                            Provide details about the key protocols or methods being used in your research
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="text-sm text-muted-foreground bg-gray-50 p-3 rounded-md dark:bg-gray-900">
                      <strong>Note:</strong> Submission, approval, and expiration dates will be automatically set by the system during the review process.
                    </div>
                  </div>
                </TabsContent>




              </Tabs>

              {/* Additional tabs message */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6 dark:bg-blue-950 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <strong>Note:</strong> Additional tabs (Facilities, Inactivation/Decontamination, Disposal, Transport/Shipping, Dual Use, NIH Guidelines, etc.) will be available after you save this application.
                </p>
              </div>

              <CardFooter className="flex justify-end space-x-2 px-0 mt-6">
                <Button 
                  variant="outline" 
                  onClick={() => navigate("/ibc")}
                  type="button"
                >
                  Cancel
                </Button>
                <Button 
                  type="button"
                  disabled={saveDraftMutation.isPending}
                  onClick={form.handleSubmit(onSaveAsDraft)}
                >
                  {saveDraftMutation.isPending ? 'Saving...' : 'Save Application'}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}