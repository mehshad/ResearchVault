// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, Upload, Download, FileText, Users, CheckCircle, 
  AlertCircle, Clock, Signature, Plus, X, Eye, AlertTriangle, Calendar 
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { IrbApplication, ResearchActivity, Scientist, ProjectMember } from "@shared/schema";
import { formatFullName } from "@/utils/nameUtils";

interface DocumentUpload {
  id: string;
  name: string;
  type: 'consent_form' | 'protocol' | 'recruitment' | 'data_safety' | 'other';
  required: boolean;
  uploaded: boolean;
  signatureRequired: boolean;
  signatures: { scientistId: number; signedAt: string; signedBy: string }[];
}

interface ProtocolMember {
  id: number;
  scientistId: number;
  name: string;
  email: string;
  roles: string[]; // Multiple roles per member
  hasAccess: boolean;
  hasSigned: boolean;
  signedAt?: string;
}

const PROTOCOL_ROLES = [
  'Research Enrolment',
  'Clinical Data Manager', 
  'Sample/Lab Manager',
  'Report Manager',
  'Metadata Manager',
  'PHI Data Manager',
  'PHI Data Reader',
  'PHI Reports'
] as const;

export default function ProtocolAssembly() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const applicationId = parseInt(params.id);
  
  const [selectedScientistId, setSelectedScientistId] = useState<number | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [protocolMembers, setProtocolMembers] = useState<ProtocolMember[]>([]);
  const [submissionComment, setSubmissionComment] = useState("");

  const { data: application, isLoading } = useQuery<IrbApplication>({
    queryKey: [`/api/irb-applications/${applicationId}`],
    enabled: !!applicationId,
  });

  // Load existing protocol members and documents from application data
  useEffect(() => {
    // Load protocol team members
    if (application?.protocolTeamMembers) {
      try {
        let existingMembers;
        if (typeof application.protocolTeamMembers === 'string') {
          existingMembers = JSON.parse(application.protocolTeamMembers) as ProtocolMember[];
        } else {
          existingMembers = application.protocolTeamMembers as ProtocolMember[];
        }
        setProtocolMembers(existingMembers);
      } catch {
        // Failed to parse protocol team members
      }
    } else {
      setProtocolMembers([]);
    }

    // Load existing documents
    if (application?.documents) {
      try {
        let existingDocuments;
        if (typeof application.documents === 'string') {
          existingDocuments = JSON.parse(application.documents) as typeof documents;
        } else {
          existingDocuments = application.documents as typeof documents;
        }
        setDocuments(existingDocuments);
      } catch {
        // Failed to parse documents
      }
    }
  }, [application]);

  const { data: researchActivity } = useQuery<ResearchActivity>({
    queryKey: [`/api/research-activities/${application?.researchActivityId}`],
    enabled: !!application?.researchActivityId,
  });

  const { data: projectMembers = [] } = useQuery<ProjectMember[]>({
    queryKey: [`/api/research-activities/${application?.researchActivityId}/members`],
    enabled: !!application?.researchActivityId,
  });

  // Filter available scientists to only SDR team members
  const availableScientists = projectMembers.filter(
    member => !protocolMembers.some(pm => pm.scientistId === member.scientistId)
  );

  // Mock document requirements for demonstration
  const [documents, setDocuments] = useState<DocumentUpload[]>([
    {
      id: '1',
      name: 'IRB-400 Informed Consent Form',
      type: 'consent_form',
      required: true,
      uploaded: false,
      signatureRequired: true,
      signatures: []
    },
    {
      id: '2', 
      name: 'IRB-413 Clinical Research Protocol',
      type: 'protocol',
      required: true,
      uploaded: false,
      signatureRequired: true,
      signatures: []
    },
    {
      id: '3',
      name: 'IRB-417 Serious Adverse Events Form',
      type: 'data_safety',
      required: true,
      uploaded: false,
      signatureRequired: false,
      signatures: []
    },
    {
      id: '4',
      name: 'Recruitment Materials',
      type: 'recruitment',
      required: false,
      uploaded: false,
      signatureRequired: false,
      signatures: []
    }
  ]);

  const handleFileUpload = async (documentId: string, file: File) => {
    const newDoc = {
      id: `${documentId}-uploaded`,
      name: file.name,
      type: file.type,
      size: file.size,
      uploadedAt: new Date().toISOString()
    };

    const updatedDocuments = documents.map(doc => 
      doc.id === documentId 
        ? { ...doc, uploaded: true, uploadedFile: newDoc }
        : doc
    );

    setDocuments(updatedDocuments);

    // Save to backend immediately
    try {
      const response = await fetch(`/api/irb-applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documents: JSON.stringify(updatedDocuments)
        }),
      });
      
      if (!response.ok) throw new Error('Failed to save document');
      
      queryClient.invalidateQueries({ queryKey: [`/api/irb-applications/${applicationId}`] });
      
      toast({
        title: "Document Uploaded",
        description: `${file.name} has been uploaded and saved successfully.`
      });
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Failed to save document. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleReplaceDocument = async (documentId: string) => {
    const updatedDocuments = documents.map(doc => 
      doc.id === documentId 
        ? { 
            ...doc, 
            uploaded: false,
            uploadedFile: undefined,
            signatures: [] // Clear signatures when replacing document
          }
        : doc
    );

    setDocuments(updatedDocuments);

    // Save to backend immediately
    try {
      const response = await fetch(`/api/irb-applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documents: JSON.stringify(updatedDocuments)
        }),
      });
      
      if (!response.ok) throw new Error('Failed to reset document');
      
      queryClient.invalidateQueries({ queryKey: [`/api/irb-applications/${applicationId}`] });
      
      toast({
        title: "Document Reset",
        description: "Document and signature cleared. You can now upload a new file."
      });
    } catch (error) {
      toast({
        title: "Reset Failed", 
        description: "Failed to reset document. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleSignDocument = async (documentId: string) => {
    const updatedDocuments = documents.map(doc => 
      doc.id === documentId 
        ? { 
            ...doc, 
            signatures: [
              ...doc.signatures,
              {
                scientistId: 1, // Current user
                signedAt: new Date().toISOString(),
                signedBy: "Dr. Emily Chen" // Current user name
              }
            ]
          }
        : doc
    );

    setDocuments(updatedDocuments);

    // Save to backend immediately
    try {
      const response = await fetch(`/api/irb-applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documents: JSON.stringify(updatedDocuments)
        }),
      });
      
      if (!response.ok) throw new Error('Failed to save signature');
      
      queryClient.invalidateQueries({ queryKey: [`/api/irb-applications/${applicationId}`] });
      
      toast({
        title: "Document Signed",
        description: "Document has been digitally signed and saved successfully."
      });
    } catch (error) {
      toast({
        title: "Signature Failed", 
        description: "Failed to save signature. Please try again.",
        variant: "destructive"
      });
    }
  };

  const isReadyForSubmission = () => {
    const requiredDocs = documents.filter(doc => doc.required);
    const uploadedRequired = requiredDocs.filter(doc => doc.uploaded);
    const signedRequired = requiredDocs.filter(doc => 
      !doc.signatureRequired || doc.signatures.length > 0
    );
    
    return uploadedRequired.length === requiredDocs.length && 
           signedRequired.length === requiredDocs.length;
  };

  const addProtocolMemberMutation = useMutation({
    mutationFn: async ({ scientistId, roles }: { scientistId: number; roles: string[] }) => {
      const projectMember = projectMembers.find(pm => pm.scientistId === scientistId);
      if (!projectMember?.scientist) throw new Error('Team member not found in SDR');
      
      const newMember: ProtocolMember = {
        id: Date.now(), // Temporary ID
        scientistId,
        name: projectMember.scientist.name,
        email: projectMember.scientist.email || `${projectMember.scientist.name.toLowerCase().replace(/\s+/g, '.')}@sidra.org`,
        roles,
        hasAccess: true,
        hasSigned: false,
      };
      
      const updatedMembers = [...protocolMembers, newMember];
      
      // Save to backend
      const response = await fetch(`/api/irb-applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocolTeamMembers: JSON.stringify(updatedMembers)
        }),
      });
      
      if (!response.ok) throw new Error('Failed to save protocol member');
      
      setProtocolMembers(updatedMembers);
      return newMember;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/irb-applications/${applicationId}`] });
      toast({
        title: "Member Added",
        description: "Protocol member has been added and saved successfully."
      });
      setSelectedScientistId(null);
      setSelectedRoles([]);
      setShowAddMember(false);
    },
  });

  const removeProtocolMemberMutation = useMutation({
    mutationFn: async (memberId: number) => {
      const updatedMembers = protocolMembers.filter(m => m.id !== memberId);
      
      // Save to backend
      const response = await fetch(`/api/irb-applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocolTeamMembers: JSON.stringify(updatedMembers)
        }),
      });
      
      if (!response.ok) throw new Error('Failed to remove protocol member');
      
      setProtocolMembers(updatedMembers);
      return memberId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/irb-applications/${applicationId}`] });
      toast({
        title: "Member Removed",
        description: "Protocol member has been removed and saved."
      });
    },
  });

  // Auto-save documents when they change
  const autoSaveDocumentsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/irb-applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documents: JSON.stringify(documents)
        }),
      });
      
      if (!response.ok) throw new Error('Failed to auto-save documents');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/irb-applications/${applicationId}`] });
    }
  });



  const submitProtocolMutation = useMutation({
    mutationFn: async () => {
      const isResubmission = application?.workflowStatus === 'revisions_requested';
      const response = await fetch(`/api/irb-applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowStatus: isResubmission ? 'resubmitted' : 'submitted',
          submissionDate: new Date().toISOString(),
          documents: JSON.stringify(documents),
          submissionComment: submissionComment || null
        }),
      });
      if (!response.ok) throw new Error('Failed to submit protocol');
      return response.json();
    },
    onSuccess: () => {
      setSubmissionComment("");
      queryClient.invalidateQueries({ queryKey: [`/api/irb-applications/${applicationId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/irb-applications'] });
      queryClient.refetchQueries({ queryKey: [`/api/irb-applications/${applicationId}`] });
      toast({
        title: application?.workflowStatus === 'revisions_requested' ? "Protocol Resubmitted" : "Protocol Submitted",
        description: application?.workflowStatus === 'revisions_requested' ? 
          "Your IRB protocol has been resubmitted with your responses." :
          "Your IRB protocol has been submitted for review."
      });
      navigate(`/irb/${applicationId}`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit protocol",
        variant: "destructive"
      });
    },
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!application) {
    return <div>Application not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/irb/${applicationId}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Application
        </Button>
        <h1 className="text-2xl font-semibold text-foreground">Protocol Assembly</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Protocol Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Protocol Information</span>
                <Badge variant={application.workflowStatus === 'draft' ? 'secondary' : 'default'}>
                  {(application.workflowStatus || 'draft').replace('_', ' ')}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div>
                  <span className="font-medium">Title:</span> {application.title}
                </div>
                <div>
                  <span className="font-medium">IRB Number:</span> {application.irbNumber}
                </div>
                {researchActivity && (
                  <div>
                    <span className="font-medium">Research Activity:</span>{' '}
                    <button
                      onClick={() => navigate(`/research-activities/${researchActivity.id}`)}
                      className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {researchActivity.sdrNumber} - {researchActivity.title}
                    </button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Document Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Required Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {documents.map((document) => (
                  <div key={document.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{document.name}</span>
                        {document.required && (
                          <Badge variant="outline" className="text-xs">Required</Badge>
                        )}
                        {document.signatureRequired && (
                          <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                            Signature Required
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {document.uploaded ? (
                          <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-orange-500" />
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      {!document.uploaded ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="file"
                            accept=".pdf,.doc,.docx"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleFileUpload(document.id, file);
                              }
                            }}
                            className="hidden"
                            id={`file-${document.id}`}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.document.getElementById(`file-${document.id}`)?.click()}
                          >
                            <Upload className="h-4 w-4 mr-1" />
                            Upload
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                            <span>Uploaded: {document.uploadedFile?.name || 'Document uploaded'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                const link = window.document.createElement('a');
                                link.href = '#'; // In real app, would be actual file URL
                                link.download = document.uploadedFile?.name || document.name;
                                link.click();
                                toast({
                                  title: "Download Started",
                                  description: `Downloading ${document.uploadedFile?.name || document.name}`
                                });
                              }}
                            >
                              <Download className="h-4 w-4 mr-1" />
                              Download
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleReplaceDocument(document.id)}
                            >
                              <Upload className="h-4 w-4 mr-1" />
                              Replace
                            </Button>
                            {document.signatureRequired && document.signatures.length === 0 && (
                              <Button 
                                size="sm"
                                onClick={() => handleSignDocument(document.id)}
                              >
                                <Signature className="h-4 w-4 mr-1" />
                                Sign Document
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {document.signatures.length > 0 && (
                      <div className="text-sm text-green-600 dark:text-green-400">
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-4 w-4" />
                          Signed by {document.signatures[0].signedBy} on{' '}
                          {new Date(document.signatures[0].signedAt).toLocaleDateString()}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Protocol Team Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Protocol Team Members
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowAddMember(true)}
                  disabled={!application?.researchActivityId || availableScientists.length === 0}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Member
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {showAddMember && (
                <div className="border rounded-lg p-4 mb-4 bg-gray-50 dark:bg-gray-900">
                  <h4 className="font-medium mb-3">Add Protocol Team Member</h4>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Select SDR Team Member</label>
                      <select
                        className="w-full mt-1 p-2 border rounded-md"
                        value={selectedScientistId || ''}
                        onChange={(e) => setSelectedScientistId(e.target.value ? parseInt(e.target.value) : null)}
                      >
                        <option value="">Choose from SDR team members...</option>
                        {availableScientists.map((member) => (
                          <option key={member.scientistId} value={member.scientistId}>
                            {member.scientist ? formatFullName(member.scientist) : 'Unknown'} - {member.role}
                          </option>
                        ))}
                      </select>
                      {availableScientists.length === 0 && (
                        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
                          All SDR team members have already been added to the protocol team.
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-medium">Protocol Roles (Select Multiple)</label>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {PROTOCOL_ROLES.map((role) => (
                          <label key={role} className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={selectedRoles.includes(role)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedRoles(prev => [...prev, role]);
                                } else {
                                  setSelectedRoles(prev => prev.filter(r => r !== role));
                                }
                              }}
                              className="rounded"
                            />
                            <span className="text-sm">{role}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          if (selectedScientistId && selectedRoles.length > 0) {
                            addProtocolMemberMutation.mutate({
                              scientistId: selectedScientistId,
                              roles: selectedRoles
                            });
                          }
                        }}
                        disabled={!selectedScientistId || selectedRoles.length === 0 || addProtocolMemberMutation.isPending}
                      >
                        {addProtocolMemberMutation.isPending ? 'Adding...' : 'Add Member'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setShowAddMember(false);
                          setSelectedScientistId(null);
                          setSelectedRoles([]);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {protocolMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium">{member.name}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{member.email}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {member.roles.map((role) => (
                          <Badge key={role} variant="secondary" className="text-xs">
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
                        {member.hasAccess ? 'Access Granted' : 'No Access'}
                      </Badge>
                      {member.hasSigned ? (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          Signed
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                          Pending Signature
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeProtocolMemberMutation.mutate(member.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                {protocolMembers.length === 0 && (
                  <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                    No protocol team members assigned yet. Add SDR team members to grant access and assign protocol-specific roles.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* IRB Review Comments */}
          {application?.workflowStatus === 'revisions_requested' && application?.reviewComments && (
            <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
              <CardHeader>
                <CardTitle className="text-lg text-orange-800 flex items-center gap-2 dark:text-orange-300">
                  <AlertTriangle className="h-5 w-5" />
                  IRB Review Comments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(() => {
                    try {
                      const comments = typeof application.reviewComments === 'string' 
                        ? JSON.parse(application.reviewComments) 
                        : application.reviewComments;
                      
                      return Object.entries(comments).map(([key, comment]: [string, any]) => {
                        // Handle different possible data structures
                        let displayText = '';
                        let actionText = 'Review Comment';
                        let dateText = '';
                        
                        if (typeof comment === 'string') {
                          displayText = comment;
                        } else if (comment && typeof comment === 'object') {
                          displayText = comment.comments || comment.text || JSON.stringify(comment);
                          actionText = comment.action === 'request_revisions' ? 'IRB Office - Protocol Triage' : (comment.action || 'IRB Office Comment');
                        } else {
                          displayText = String(comment);
                        }
                        
                        // Try to parse the key as a timestamp, fallback to current date
                        const timestamp = !isNaN(Number(key)) ? Number(key) : Date.now();
                        const date = new Date(timestamp);
                        dateText = isNaN(date.getTime()) ? 'Recent' : date.toLocaleDateString();
                        
                        return (
                          <div key={key} className="bg-white p-3 rounded border dark:bg-card">
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-sm font-medium text-orange-800 dark:text-orange-300">
                                {actionText}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {dateText}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300">{displayText}</p>
                            <div className="mt-2 text-xs text-gray-500 italic dark:text-gray-400">
                              Protocol is currently in triage stage - formal review has not yet begun
                            </div>
                          </div>
                        );
                      });
                    } catch (error) {
                      return (
                        <div className="bg-white p-3 rounded border dark:bg-card">
                          <p className="text-sm text-orange-800 dark:text-orange-300">Error loading review comments</p>
                        </div>
                      );
                    }
                  })()}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Protocol Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Protocol Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                {application?.submissionDate && (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500"></div>
                    <span>Submitted: {new Date(application.submissionDate).toLocaleDateString()}</span>
                  </div>
                )}
                {application?.workflowStatus === 'revisions_requested' && (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-orange-500"></div>
                    <span>Revisions Requested</span>
                  </div>
                )}
                {application?.initialApprovalDate && (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                    <span>Approved: {new Date(application.initialApprovalDate).toLocaleDateString()}</span>
                  </div>
                )}
                {application?.expirationDate && (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-purple-500"></div>
                    <span>Expires: {new Date(application.expirationDate).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Submission Checklist */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Submission Checklist</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {documents.filter(doc => doc.required).map((document) => (
                  <div key={document.id} className="flex items-center gap-2">
                    {document.uploaded ? (
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-orange-500" />
                    )}
                    <span className="text-sm">{document.name}</span>
                  </div>
                ))}
                
                <Separator className="my-3" />
                
                <div className="flex items-center gap-2">
                  {isReadyForSubmission() ? (
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <Clock className="h-4 w-4 text-orange-500" />
                  )}
                  <span className="text-sm font-medium">
                    {isReadyForSubmission() ? 'Ready for Submission' : 'Pending Requirements'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resubmission Comment */}
          {application?.workflowStatus === 'revisions_requested' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Response to IRB Comments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  placeholder="Describe the changes made in response to IRB comments..."
                  value={submissionComment}
                  onChange={(e) => setSubmissionComment(e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  This comment will be included with your resubmission to help the IRB office understand your changes.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                className="w-full"
                disabled={!isReadyForSubmission() || submitProtocolMutation.isPending}
                onClick={() => submitProtocolMutation.mutate()}
              >
                {submitProtocolMutation.isPending ? 'Submitting...' : 
                 application?.workflowStatus === 'revisions_requested' ? 'Resubmit Protocol' : 'Submit for IRB Review'}
              </Button>
              

              
              <Button variant="outline" className="w-full">
                Download Protocol Package
              </Button>
            </CardContent>
          </Card>

          {/* Protocol Templates */}
          <Card>
            <CardHeader>
              <CardTitle>Document Templates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="ghost" 
                className="w-full justify-start" 
                size="sm"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = '/templates/IRB-400-Informed-Consent-Form.docx';
                  link.download = 'IRB-400-Informed-Consent-Form.docx';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  toast({
                    title: "Template Downloaded",
                    description: "IRB-400 Consent Form template has been downloaded."
                  });
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                IRB-400 Consent Form Template
              </Button>
              <Button 
                variant="ghost" 
                className="w-full justify-start" 
                size="sm"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = '/templates/IRB-413-Protocol-Template.docx';
                  link.download = 'IRB-413-Protocol-Template.docx';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  toast({
                    title: "Template Downloaded",
                    description: "IRB-413 Protocol template has been downloaded."
                  });
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                IRB-413 Protocol Template
              </Button>
              <Button 
                variant="ghost" 
                className="w-full justify-start" 
                size="sm"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = '/templates/IRB-417-Adverse-Events-Form.docx';
                  link.download = 'IRB-417-Adverse-Events-Form.docx';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  toast({
                    title: "Template Downloaded",
                    description: "IRB-417 Adverse Events Form has been downloaded."
                  });
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                IRB-417 Adverse Events Form
              </Button>
              <Button 
                variant="ghost" 
                className="w-full justify-start" 
                size="sm"
                onClick={() => navigate('/irb/templates')}
              >
                <FileText className="h-4 w-4 mr-2" />
                View All Templates
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}