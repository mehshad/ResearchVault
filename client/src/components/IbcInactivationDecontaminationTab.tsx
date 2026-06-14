import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Beaker, Trash2, Shield, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";

// Schema for the inactivation and decontamination form
const inactivationDecontaminationSchema = z.object({
  // Toxin Inactivation Procedures
  treatWasteWithNaOH: z.enum(["yes", "no", ""]).optional(),
  
  // Lab or Surface Disinfection
  commercialBleach20Min: z.boolean().default(false),
  quaternaryAmmonium: z.boolean().default(false),
  sporKlenz: z.boolean().default(false),
  relyOn: z.boolean().default(false),
  otherDisinfection: z.boolean().default(false),
  
  // Solid Waste
  autoclaved60Min121C: z.boolean().default(false),
  
  // General Biosafety Practice (GBP) - Solid Waste
  solidWasteGBP1: z.boolean().default(false),
  solidWasteGBP2: z.boolean().default(false),
  solidWasteGBP3: z.boolean().default(false),
  solidWasteOtherExplanation: z.string().optional(),
  
  // Liquid Waste
  disinfect10PercentBleach30Min: z.boolean().default(false),
  autoclaved30Min121CLiquid: z.boolean().default(false),
  otherProvenDisinfectants: z.enum(["yes", "no", ""]).optional(),
  
  // Animal Cage Decontamination
  standardRodentBarrier: z.boolean().default(false),
  standardNonRodent: z.boolean().default(false),
  standardBiosafetyFacility: z.boolean().default(false),
  
  // General Biosafety Procedures (GBP) - Animal Cages
  animalCageGBP1: z.boolean().default(false),
  animalCageGBP2: z.boolean().default(false),
  animalCageGBP3: z.boolean().default(false),
  
  // Other
  other: z.boolean().default(false),
});

interface IbcInactivationDecontaminationTabProps {
  applicationId: number;
  application: any;
  isReadOnly?: boolean;
}

export function IbcInactivationDecontaminationTab({ 
  applicationId, 
  application, 
  isReadOnly = false 
}: IbcInactivationDecontaminationTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form setup
  const form = useForm<z.infer<typeof inactivationDecontaminationSchema>>({
    resolver: zodResolver(inactivationDecontaminationSchema),
    defaultValues: {
      treatWasteWithNaOH: "",
      commercialBleach20Min: false,
      quaternaryAmmonium: false,
      sporKlenz: false,
      relyOn: false,
      otherDisinfection: false,
      autoclaved60Min121C: false,
      solidWasteGBP1: false,
      solidWasteGBP2: false,
      solidWasteGBP3: false,
      solidWasteOtherExplanation: "",
      disinfect10PercentBleach30Min: false,
      autoclaved30Min121CLiquid: false,
      otherProvenDisinfectants: "",
      standardRodentBarrier: false,
      standardNonRodent: false,
      standardBiosafetyFacility: false,
      animalCageGBP1: false,
      animalCageGBP2: false,
      animalCageGBP3: false,
      other: false,
    },
  });

  // Load existing data when application changes
  useEffect(() => {
    if (application?.inactivationDecontamination) {
      const data = application.inactivationDecontamination;
      form.reset(data);
    }
  }, [application, form]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (data: z.infer<typeof inactivationDecontaminationSchema>) =>
      apiRequest('PATCH', `/api/ibc-applications/${applicationId}`, {
        inactivationDecontamination: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/ibc-applications/${applicationId}`] });
      toast({ title: "Inactivation and decontamination data saved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to save inactivation and decontamination data", variant: "destructive" });
    },
  });

  const onSubmit = (data: z.infer<typeof inactivationDecontaminationSchema>) => {
    saveMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Inactivation and Decontamination</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Specify procedures for inactivation and decontamination of materials and equipment
          </p>
        </div>
        {!isReadOnly && (
          <Button 
            onClick={form.handleSubmit(onSubmit)}
            disabled={saveMutation.isPending}
          >
            Save Changes
          </Button>
        )}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Toxin Inactivation Procedures */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Beaker className="h-5 w-5" />
                Toxin Inactivation Procedures
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="treatWasteWithNaOH"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Are you treating waste containing the toxin with 2N NaOH for at least 1 hour to inactivate?
                    </FormLabel>
                    <FormControl>
                      <RadioGroup 
                        onValueChange={field.onChange} 
                        value={field.value || ""}
                        disabled={isReadOnly}
                        className="flex gap-6"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="yes" id="naoh-yes" />
                          <label htmlFor="naoh-yes" className="text-sm">Yes</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="no" id="naoh-no" />
                          <label htmlFor="naoh-no" className="text-sm">No</label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Lab or Surface Disinfection */}
          <Card>
            <CardHeader>
              <CardTitle>Lab or Surface Disinfection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="commercialBleach20Min"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isReadOnly}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        10% Commercial bleach (equivalent to .5% sodium hypochlorite), with 20 minutes contact time
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="quaternaryAmmonium"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isReadOnly}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Quaternary Ammonium?</FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sporKlenz"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isReadOnly}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Spor-Klenz?</FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="relyOn"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isReadOnly}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Rely On?</FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="otherDisinfection"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isReadOnly}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Other?</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Solid Waste */}
          <Card>
            <CardHeader>
              <CardTitle>Solid Waste</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="autoclaved60Min121C"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isReadOnly}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Materials will be autoclaved for a minimum of 60 minutes, at 121 degrees C, under 14 psi. Test autoclave monthly (see Autoclave GBP)
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              <div className="pt-4">
                <h4 className="font-medium mb-3">General Biosafety Practice (GBP)</h4>
                <div className="space-y-3">
                  <FormField
                    control={form.control}
                    name="solidWasteGBP1"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isReadOnly}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>General Biosafety Procedure 1</FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="solidWasteGBP2"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isReadOnly}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>General Biosafety Procedure 2</FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="solidWasteGBP3"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isReadOnly}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>General Biosafety Procedure 3</FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="solidWasteOtherExplanation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>If other, please explain</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Explain other procedures..."
                            {...field}
                            disabled={isReadOnly}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Liquid Waste */}
          <Card>
            <CardHeader>
              <CardTitle>Liquid Waste</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="disinfect10PercentBleach30Min"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isReadOnly}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Disinfect with 10% (1:9 v/v) bleach for at least 30 minutes contact time
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="autoclaved30Min121CLiquid"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isReadOnly}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Materials will be autoclaved for a minimum of 30 minutes, at 121 degrees C, on liquid cycle. Test autoclave monthly (see Autoclave GBP)
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="otherProvenDisinfectants"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Are you using other proven effective disinfectants
                    </FormLabel>
                    <FormControl>
                      <RadioGroup 
                        onValueChange={field.onChange} 
                        value={field.value || ""}
                        disabled={isReadOnly}
                        className="flex gap-6"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="yes" id="disinfectants-yes" />
                          <label htmlFor="disinfectants-yes" className="text-sm">Yes</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="no" id="disinfectants-no" />
                          <label htmlFor="disinfectants-no" className="text-sm">No</label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Animal Cage Decontamination */}
          <Card>
            <CardHeader>
              <CardTitle>Animal Cage Decontamination</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="standardRodentBarrier"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isReadOnly}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Standard Rodent barrier methods (cage washed but not autoclaved)</FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="standardNonRodent"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isReadOnly}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Standard non rodent methods (cage washed but not autoclaved)</FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="standardBiosafetyFacility"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isReadOnly}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Standard Biosafety facility methods</FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              <div className="pt-4">
                <h4 className="font-medium mb-3">General Biosafety Procedures (GBP)</h4>
                <div className="space-y-3">
                  <FormField
                    control={form.control}
                    name="animalCageGBP1"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isReadOnly}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>General Biosafety Procedure 1</FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="animalCageGBP2"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isReadOnly}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>General Biosafety Procedure 2</FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="animalCageGBP3"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isReadOnly}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>General Biosafety Procedure 3</FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Other */}
          <Card>
            <CardHeader>
              <CardTitle>Other</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="other"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isReadOnly}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Other</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  );
}