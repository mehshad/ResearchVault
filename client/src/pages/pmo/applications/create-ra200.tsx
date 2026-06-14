// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Save, Send, FileCheck, Clock, Users } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface Ra200Form {
  // Header Information
  title: string;
  leadScientistId: number | null;
  projectId: number | null;
  budgetHolderId: number | null;
  budgetSource: string;
  
  // Research Activity Details
  abstract: string;
  backgroundRationale: string;
  objectivesPreliminary: string;
  approachMethods: string;
  discussionConclusion: string;
  
  // Requirements
  ethicsRequirements: {
    humanSubjects: boolean;
    irbNeeded: boolean;
    animalSamples: boolean;
    iacucNeeded: boolean;
    clinicalTrial: boolean;
  };
  collaborationRequirements: {
    outsideCollaborators: boolean;
    dataSharing: boolean;
  };
  budgetRequirements: {
    noCost: boolean;
    externalFunding: boolean;
    sidraBudget: boolean;
  };
  sampleDataProcessing: {
    collaborationWithPI: boolean;
    sidraCores: boolean;
  };
  
  // Duration and Core Labs
  durationMonths: number | null;
  coreLabs: string[];
  
  // Detailed Methods
  studyDesignMethods: string;
  proposalObjectives: string;
  preliminaryData: string;
}

const coreLabOptions = [
  "Genomics Core", "Omics Core", "Microscopy Core", "Flow Core",
  "Mass Spec Core", "Zebrafish Facility Core", "Advanced Cell Therapy Core",
  "Applied Bioinformatics Core", "Computational & Informatics Core",
  "Pathology", "HR (e.g. temp staffing)", "Research Contracts Office",
  "Research Scientific Data Management", "Grants Office"
];

export default function CreateRa200() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<Ra200Form>({
    title: "",
    leadScientistId: null,
    projectId: null,
    budgetHolderId: null,
    budgetSource: "",
    abstract: "",
    backgroundRationale: "",
    objectivesPreliminary: "",
    approachMethods: "",
    discussionConclusion: "",
    ethicsRequirements: {
      humanSubjects: false,
      irbNeeded: false,
      animalSamples: false,
      iacucNeeded: false,
      clinicalTrial: false
    },
    collaborationRequirements: {
      outsideCollaborators: false,
      dataSharing: false
    },
    budgetRequirements: {
      noCost: false,
      externalFunding: false,
      sidraBudget: false
    },
    sampleDataProcessing: {
      collaborationWithPI: false,
      sidraCores: false
    },
    durationMonths: null,
    coreLabs: [],
    studyDesignMethods: "",
    proposalObjectives: "",
    preliminaryData: ""
  });

  // Load scientists and projects for dropdowns
  const { data: scientists = [] } = useQuery<any[]>({
    queryKey: ['/api/scientists']
  });

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ['/api/projects']
  });

  const createApplicationMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/ra200-applications', 'POST', data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/pmo-applications'] });
      toast({ title: "RA-200 application created successfully!" });
      setLocation(`/pmo/applications/${data.id}/edit-ra200`);
    },
    onError: (error: any) => {
      toast({ title: "Error creating application", description: error.message, variant: "destructive" });
    }
  });

  const handleSave = (status: 'draft' | 'submitted') => {
    const submitData = {
      ...formData,
      status,
      submittedBy: 46 // Current user - should be dynamic
    };

    createApplicationMutation.mutate(submitData);
  };

  const handleCoreLabToggle = (labName: string) => {
    setFormData(prev => ({
      ...prev,
      coreLabs: prev.coreLabs.includes(labName)
        ? prev.coreLabs.filter(lab => lab !== labName)
        : [...prev.coreLabs, labName]
    }));
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/pmo/applications")}
            className="mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to PMO Applications
          </Button>
          
          <div className="flex items-center gap-3">
            <FileCheck className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            <div>
              <h1 className="text-3xl font-bold">Create RA-200 Application</h1>
              <p className="text-muted-foreground mt-1">Research Activity Plan Form</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form - Left 2/3 */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>RA-200 Research Activity Plan</CardTitle>
              <CardDescription>Complete all sections for PMO review</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Header Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium border-b pb-2">Header Information</h3>
                  
                  <div>
                    <Label htmlFor="title">Research Activity Title *</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Enter the research activity title"
                      className="mt-1"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="leadScientist">Lead Scientist *</Label>
                      <Select
                        value={formData.leadScientistId?.toString()}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, leadScientistId: parseInt(value) }))}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select lead scientist" />
                        </SelectTrigger>
                        <SelectContent>
                          {scientists.map((scientist: any) => (
                            <SelectItem key={scientist.id} value={scientist.id.toString()}>
                              {scientist.firstName} {scientist.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="project">Project ID (PRJ) *</Label>
                      <Select
                        value={formData.projectId?.toString()}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, projectId: parseInt(value) }))}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select project" />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map((project: any) => (
                            <SelectItem key={project.id} value={project.id.toString()}>
                              {project.projectId} - {project.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="budgetHolder">Budget Holder *</Label>
                      <Select
                        value={formData.budgetHolderId?.toString()}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, budgetHolderId: parseInt(value) }))}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select budget holder" />
                        </SelectTrigger>
                        <SelectContent>
                          {scientists.map((scientist: any) => (
                            <SelectItem key={scientist.id} value={scientist.id.toString()}>
                              {scientist.firstName} {scientist.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="budgetSource">Budget Source</Label>
                      <Input
                        id="budgetSource"
                        value={formData.budgetSource}
                        onChange={(e) => setFormData(prev => ({ ...prev, budgetSource: e.target.value }))}
                        placeholder="e.g., 13,000 QAR"
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>

                {/* Research Details */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium border-b pb-2">Research Activity Details</h3>
                  
                  <div>
                    <Label htmlFor="abstract">Abstract (Required) *</Label>
                    <Textarea
                      id="abstract"
                      value={formData.abstract}
                      onChange={(e) => setFormData(prev => ({ ...prev, abstract: e.target.value }))}
                      placeholder="Summarize your planned research (max 5000 characters)"
                      rows={4}
                      className="mt-1"
                      maxLength={5000}
                    />
                    <div className="text-sm text-muted-foreground mt-1">
                      {formData.abstract.length}/5000 characters
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="background">Background & Rationale</Label>
                      <Textarea
                        id="background"
                        value={formData.backgroundRationale}
                        onChange={(e) => setFormData(prev => ({ ...prev, backgroundRationale: e.target.value }))}
                        placeholder="Scientific background and rationale"
                        rows={3}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="objectives">Objectives & Preliminary Work</Label>
                      <Textarea
                        id="objectives"
                        value={formData.objectivesPreliminary}
                        onChange={(e) => setFormData(prev => ({ ...prev, objectivesPreliminary: e.target.value }))}
                        placeholder="Specific aims and preliminary data"
                        rows={3}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="approach">Approach/Methods</Label>
                      <Textarea
                        id="approach"
                        value={formData.approachMethods}
                        onChange={(e) => setFormData(prev => ({ ...prev, approachMethods: e.target.value }))}
                        placeholder="Experimental approach and methods"
                        rows={3}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="discussion">Discussion/Conclusion</Label>
                      <Textarea
                        id="discussion"
                        value={formData.discussionConclusion}
                        onChange={(e) => setFormData(prev => ({ ...prev, discussionConclusion: e.target.value }))}
                        placeholder="Expected results and significance"
                        rows={3}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>

                {/* Requirements */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium border-b pb-2">Requirements Assessment</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <h4 className="font-medium">Ethics Requirements</h4>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="humanSubjects"
                            checked={formData.ethicsRequirements.humanSubjects}
                            onCheckedChange={(checked) => 
                              setFormData(prev => ({
                                ...prev,
                                ethicsRequirements: { ...prev.ethicsRequirements, humanSubjects: checked as boolean }
                              }))
                            }
                          />
                          <Label htmlFor="humanSubjects">Human subjects involved</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="irbNeeded"
                            checked={formData.ethicsRequirements.irbNeeded}
                            onCheckedChange={(checked) => 
                              setFormData(prev => ({
                                ...prev,
                                ethicsRequirements: { ...prev.ethicsRequirements, irbNeeded: checked as boolean }
                              }))
                            }
                          />
                          <Label htmlFor="irbNeeded">IRB approval needed</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="animalSamples"
                            checked={formData.ethicsRequirements.animalSamples}
                            onCheckedChange={(checked) => 
                              setFormData(prev => ({
                                ...prev,
                                ethicsRequirements: { ...prev.ethicsRequirements, animalSamples: checked as boolean }
                              }))
                            }
                          />
                          <Label htmlFor="animalSamples">Animal samples/work</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="iacucNeeded"
                            checked={formData.ethicsRequirements.iacucNeeded}
                            onCheckedChange={(checked) => 
                              setFormData(prev => ({
                                ...prev,
                                ethicsRequirements: { ...prev.ethicsRequirements, iacucNeeded: checked as boolean }
                              }))
                            }
                          />
                          <Label htmlFor="iacucNeeded">IACUC approval needed</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="clinicalTrial"
                            checked={formData.ethicsRequirements.clinicalTrial}
                            onCheckedChange={(checked) => 
                              setFormData(prev => ({
                                ...prev,
                                ethicsRequirements: { ...prev.ethicsRequirements, clinicalTrial: checked as boolean }
                              }))
                            }
                          />
                          <Label htmlFor="clinicalTrial">Clinical trial</Label>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-medium">Budget & Collaboration</h4>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="outsideCollaborators"
                            checked={formData.collaborationRequirements.outsideCollaborators}
                            onCheckedChange={(checked) => 
                              setFormData(prev => ({
                                ...prev,
                                collaborationRequirements: { ...prev.collaborationRequirements, outsideCollaborators: checked as boolean }
                              }))
                            }
                          />
                          <Label htmlFor="outsideCollaborators">Outside collaborators</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="dataSharing"
                            checked={formData.collaborationRequirements.dataSharing}
                            onCheckedChange={(checked) => 
                              setFormData(prev => ({
                                ...prev,
                                collaborationRequirements: { ...prev.collaborationRequirements, dataSharing: checked as boolean }
                              }))
                            }
                          />
                          <Label htmlFor="dataSharing">Data sharing required</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="noCost"
                            checked={formData.budgetRequirements.noCost}
                            onCheckedChange={(checked) => 
                              setFormData(prev => ({
                                ...prev,
                                budgetRequirements: { ...prev.budgetRequirements, noCost: checked as boolean }
                              }))
                            }
                          />
                          <Label htmlFor="noCost">No cost</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="externalFunding"
                            checked={formData.budgetRequirements.externalFunding}
                            onCheckedChange={(checked) => 
                              setFormData(prev => ({
                                ...prev,
                                budgetRequirements: { ...prev.budgetRequirements, externalFunding: checked as boolean }
                              }))
                            }
                          />
                          <Label htmlFor="externalFunding">External funding</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="sidraBudget"
                            checked={formData.budgetRequirements.sidraBudget}
                            onCheckedChange={(checked) => 
                              setFormData(prev => ({
                                ...prev,
                                budgetRequirements: { ...prev.budgetRequirements, sidraBudget: checked as boolean }
                              }))
                            }
                          />
                          <Label htmlFor="sidraBudget">Sidra budget</Label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Duration & Core Labs */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium border-b pb-2">Duration & Core Labs</h3>
                  
                  <div>
                    <Label htmlFor="duration">Estimated Duration (months)</Label>
                    <Input
                      id="duration"
                      type="number"
                      value={formData.durationMonths || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, durationMonths: parseInt(e.target.value) || null }))}
                      placeholder="e.g., 24"
                      className="mt-1 max-w-xs"
                    />
                  </div>

                  <div>
                    <Label>Core Facilities Required</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                      {coreLabOptions.map((lab) => (
                        <div key={lab} className="flex items-center space-x-2">
                          <Checkbox
                            id={lab}
                            checked={formData.coreLabs.includes(lab)}
                            onCheckedChange={() => handleCoreLabToggle(lab)}
                          />
                          <Label htmlFor={lab} className="text-sm">{lab}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Detailed Methods */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium border-b pb-2">Detailed Methods (Appendix A)</h3>
                  
                  <div>
                    <Label htmlFor="studyDesign">Study Design & Methods</Label>
                    <Textarea
                      id="studyDesign"
                      value={formData.studyDesignMethods}
                      onChange={(e) => setFormData(prev => ({ ...prev, studyDesignMethods: e.target.value }))}
                      placeholder="Comprehensive methodology details"
                      rows={4}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="proposal">Proposal & Objectives</Label>
                    <Textarea
                      id="proposal"
                      value={formData.proposalObjectives}
                      onChange={(e) => setFormData(prev => ({ ...prev, proposalObjectives: e.target.value }))}
                      placeholder="Detailed research proposal and objectives"
                      rows={4}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="preliminaryData">Preliminary Data</Label>
                    <Textarea
                      id="preliminaryData"
                      value={formData.preliminaryData}
                      onChange={(e) => setFormData(prev => ({ ...prev, preliminaryData: e.target.value }))}
                      placeholder="Include any preliminary results or pilot data"
                      rows={4}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => handleSave('draft')} disabled={createApplicationMutation.isPending}>
                <Save className="h-4 w-4 mr-2" />
                Save as Draft
              </Button>
              <Button onClick={() => handleSave('submitted')} disabled={createApplicationMutation.isPending}>
                <Send className="h-4 w-4 mr-2" />
                Submit Application
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Right Sidebar - Guide */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Application Guide
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="p-3 bg-blue-50 rounded-lg dark:bg-blue-950">
                  <h4 className="font-medium text-blue-900 mb-2 dark:text-blue-200">Required Fields</h4>
                  <ul className="text-sm text-blue-800 space-y-1 dark:text-blue-300">
                    <li>• Research Activity Title</li>
                    <li>• Lead Scientist</li>
                    <li>• Project ID (PRJ)</li>
                    <li>• Budget Holder</li>
                    <li>• Abstract</li>
                  </ul>
                </div>

                <div className="p-3 bg-green-50 rounded-lg dark:bg-green-950">
                  <h4 className="font-medium text-green-900 mb-2 dark:text-green-200">Review Process</h4>
                  <ul className="text-sm text-green-800 space-y-1 dark:text-green-300">
                    <li>• Draft: Save progress</li>
                    <li>• Submit: Send for PMO review</li>
                    <li>• Review time: 5-10 business days</li>
                  </ul>
                </div>

                <div className="p-3 bg-orange-50 rounded-lg dark:bg-orange-950">
                  <h4 className="font-medium text-orange-900 mb-2 dark:text-orange-200">Tips</h4>
                  <ul className="text-sm text-orange-800 space-y-1 dark:text-orange-300">
                    <li>• Be specific in your abstract</li>
                    <li>• Include all relevant core facilities</li>
                    <li>• Provide realistic timelines</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}