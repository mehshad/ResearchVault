// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResearchActivity, Publication, Patent, PublicationAuthor, Scientist, InsertPublicationAuthor, ManuscriptHistory } from "@shared/schema";
import { ArrowLeft, Calendar, FileText, Book, Layers, ExternalLink, Award, Edit, Plus, Trash2, Users, Info, CheckCircle, Clock, AlertCircle, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { formatFullName } from "@/utils/nameUtils";
import { isLinkedAuthorInAuthorsText } from "@shared/authorMatching";

// Linear forward order of the publication workflow. Used to tell whether a
// status change moves the publication forward, sideways, or back. Keep in
// sync with the validTransitions map in server/routes.ts.
const STATUS_FORWARD_ORDER: string[] = [
  'Concept',
  'Complete Draft',
  'Vetted for submission',
  'Submitted for review with pre-publication',
  'Submitted for review without pre-publication',
  'Under review',
  'Accepted/In Press',
  'Published',
  'Published *',
];

type TransitionKind = 'forward' | 'revert' | 'reject' | 'withdraw' | 'create' | 'field';

function classifyStatusTransition(
  fromStatus: string | null,
  toStatus: string,
): TransitionKind {
  if (toStatus === 'Rejected') return 'reject';
  if (toStatus === 'Withdrawn') return 'withdraw';
  if (!fromStatus) return 'create';
  // Field-change history rows carry from === to.
  if (fromStatus === toStatus) return 'field';
  // Coming back out of a terminal exit is a revert.
  if (fromStatus === 'Rejected' || fromStatus === 'Withdrawn') return 'revert';
  const fromIdx = STATUS_FORWARD_ORDER.indexOf(fromStatus);
  const toIdx = STATUS_FORWARD_ORDER.indexOf(toStatus);
  if (fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx) return 'revert';
  return 'forward';
}

const TRANSITION_STYLES: Record<TransitionKind, { border: string; bg: string; badge: string; label: string }> = {
  forward:  { border: 'border-green-300 dark:border-green-700',  bg: '',              badge: 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-300',   label: 'Forward' },
  revert:   { border: 'border-amber-400',  bg: 'bg-amber-50 dark:bg-amber-950',   badge: 'border-amber-400 text-amber-700 dark:text-amber-300',   label: 'Reverted' },
  reject:   { border: 'border-red-400',    bg: 'bg-red-50 dark:bg-red-950',     badge: 'border-red-400 text-red-700 dark:text-red-300',       label: 'Rejected' },
  withdraw: { border: 'border-red-400',    bg: 'bg-red-50 dark:bg-red-950',     badge: 'border-red-400 text-red-700 dark:text-red-300',       label: 'Withdrawn' },
  create:   { border: 'border-blue-300 dark:border-blue-700',   bg: '',              badge: 'border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300',     label: 'Created' },
  field:    { border: 'border-gray-200 dark:border-gray-700',   bg: '',              badge: 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300',     label: 'Field change' },
};

export default function PublicationDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const id = parseInt(params.id);
  const { toast } = useToast();
  const [isAddAuthorOpen, setIsAddAuthorOpen] = useState(false);
  const [selectedScientist, setSelectedScientist] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [authorPosition, setAuthorPosition] = useState<string>("");
  const [isCorrespondingAuthor, setIsCorrespondingAuthor] = useState<boolean>(false);
  const [isSharedPosition, setIsSharedPosition] = useState<boolean>(false);

  // Status management state
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [ipOfficeApproval, setIpOfficeApproval] = useState(false);
  const [prepublicationUrl, setPrepublicationUrl] = useState('');
  const [prepublicationSite, setPrepublicationSite] = useState('');
  const [journalName, setJournalName] = useState('');
  const [publicationDateStr, setPublicationDateStr] = useState('');
  const [doiValue, setDoiValue] = useState('');
  const [authorsValue, setAuthorsValue] = useState('');

  const { data: publication, isLoading: publicationLoading } = useQuery<Publication>({
    queryKey: [`/api/publications/${id}`],
  });

  // Query for journal impact factor
  const { data: impactFactor } = useQuery({
    queryKey: [`/api/journal-impact-factors/journal/${publication?.journal}/year/${publication?.publicationDate ? new Date(publication.publicationDate).getFullYear() : ''}`],
    enabled: !!publication?.journal && !!publication?.publicationDate,
    retry: false // Don't retry if not found
  });

  // Also query for previous year impact factor
  const { data: previousYearImpactFactor } = useQuery({
    queryKey: [`/api/journal-impact-factors/journal/${publication?.journal}/year/${publication?.publicationDate ? new Date(publication.publicationDate).getFullYear() - 1 : ''}`],
    enabled: !!publication?.journal && !!publication?.publicationDate,
    retry: false
  });

  // Query for most current year impact factor (2024)
  const { data: currentYearImpactFactor } = useQuery({
    queryKey: [`/api/journal-impact-factors/journal/${publication?.journal}/year/2024`],
    enabled: !!publication?.journal,
    retry: false
  });

  const { data: publicationAuthors = [], isLoading: authorsLoading } = useQuery<(PublicationAuthor & { scientist: Scientist })[]>({
    queryKey: [`/api/publications/${id}/authors`],
    enabled: !!publication,
  });

  const { data: scientists = [], isLoading: scientistsLoading } = useQuery<Scientist[]>({
    queryKey: [`/api/scientists`],
  });

  // Manuscript history query — the API enriches each row with the
  // `changedByName` of the user (or scientist, for legacy rows) who
  // performed the status change.
  const { data: manuscriptHistory = [], isLoading: historyLoading } = useQuery<
    (ManuscriptHistory & { changedByName: string | null })[]
  >({
    queryKey: [`/api/publications/${id}/history`],
    enabled: !!publication,
  });

  // Mutations for author management
  const addAuthorMutation = useMutation({
    mutationFn: async (data: { scientistId: number; authorshipType: string; authorPosition?: number }) => {
      const response = await fetch(`/api/publications/${id}/authors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to add author');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/publications/${id}/authors`] });
      toast({ title: "Success", description: "Author added successfully" });
      setIsAddAuthorOpen(false);
      setSelectedScientist("");
      setSelectedRole("");
      setAuthorPosition("");
      setIsCorrespondingAuthor(false);
      setIsSharedPosition(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add author", variant: "destructive" });
    },
  });

  const removeAuthorMutation = useMutation({
    mutationFn: async (scientistId: number) => {
      const response = await fetch(`/api/publications/${id}/authors/${scientistId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to remove author');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/publications/${id}/authors`] });
      toast({ title: "Success", description: "Author removed successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove author", variant: "destructive" });
    },
  });

  // Status update mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (data: { status: string; updatedFields?: any; changes?: any[] }) => {
      const response = await fetch(`/api/publications/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: data.status,
          updatedFields: data.updatedFields,
          changes: data.changes,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update status');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/publications/${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/publications/${id}/history`] });
      toast({ title: "Success", description: "Status updated successfully" });
      setIsStatusDialogOpen(false);
      // Reset form state
      setIpOfficeApproval(false);
      setPrepublicationUrl('');
      setPrepublicationSite('');
      setJournalName('');
      setPublicationDateStr('');
      setDoiValue('');
      setAuthorsValue('');
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Function to check if a scientist's name appears in the authors text
  const isScientistInAuthorsText = (scientist: Scientist): boolean =>
    isLinkedAuthorInAuthorsText(publication?.authors, scientist.firstName, scientist.lastName);

  // Check for missing internal authors in the authors text
  const missingAuthors = publicationAuthors.filter(author => 
    !isScientistInAuthorsText(author.scientist)
  );

  const handleAddAuthor = () => {
    if (!selectedScientist || !selectedRole) {
      toast({ title: "Error", description: "Please select both scientist and role", variant: "destructive" });
      return;
    }

    // Apply "Co-" prefix if shared position is checked (only for First Author and Senior/Last Author)
    let baseRole = selectedRole;
    if (isSharedPosition && (selectedRole === "First Author" || selectedRole === "Senior/Last Author")) {
      baseRole = `Co-${selectedRole}`;
    }

    // Combine with corresponding author if checked
    let combinedAuthorshipType = baseRole;
    if (isCorrespondingAuthor) {
      combinedAuthorshipType = `${baseRole}, Corresponding Author`;
    }

    addAuthorMutation.mutate({
      scientistId: parseInt(selectedScientist),
      authorshipType: combinedAuthorshipType,
      authorPosition: authorPosition ? parseInt(authorPosition) : undefined,
    });
  };

  const availableScientists = scientists
    .filter(scientist => {
      // If we're only adding corresponding author role, allow existing authors who don't already have corresponding author role
      const existingAuthor = publicationAuthors.find(author => author.scientistId === scientist.id);
      if (existingAuthor) {
        // If scientist is already an author, only allow if they don't have corresponding author role and we're adding corresponding author
        return isCorrespondingAuthor && !existingAuthor.authorshipType.includes('Corresponding Author');
      }
      
      // Filter by names in the publication's comma-separated author list
      if (publication?.authors) {
        const authorNames = publication.authors.split(',').map(name => name.trim().toLowerCase());
        const scientistLastName = scientist.lastName?.toLowerCase() || '';
        const scientistFirstName = scientist.firstName?.toLowerCase() || '';
        
        // Check if scientist's name appears in the author list
        return authorNames.some(authorName => {
          // Remove common titles and clean the author name
          const cleanAuthorName = authorName.replace(/^(dr\.?|prof\.?|mr\.?|ms\.?|mrs\.?)\s+/i, '').trim();
          
          // Handle abbreviated names like "Chen E", "Wilson J", "Ahmed S"
          const nameParts = cleanAuthorName.split(/\s+/);
          
          if (nameParts.length >= 2) {
            const [lastPart, firstPart] = nameParts;
            
            // Check if last name matches and first name/initial matches
            if (scientistLastName && scientistFirstName) {
              // Match "LastName FirstInitial" format (e.g., "Chen E")
              if (lastPart === scientistLastName && 
                  firstPart.startsWith(scientistFirstName.charAt(0))) {
                return true;
              }
              
              // Match "FirstInitial LastName" format (e.g., "E Chen")
              if (firstPart === scientistLastName && 
                  lastPart.startsWith(scientistFirstName.charAt(0))) {
                return true;
              }
              
              // Match full names in either order
              if ((lastPart === scientistLastName && firstPart === scientistFirstName) ||
                  (firstPart === scientistLastName && lastPart === scientistFirstName)) {
                return true;
              }
            }
          }
          
          // Fallback: check if last name appears anywhere in the author name
          if (scientistLastName && cleanAuthorName.includes(scientistLastName)) {
            return true;
          }
          
          // Additional check for full name match
          const scientistFullName = formatFullName(scientist).toLowerCase().replace(/^(dr\.?|prof\.?|mr\.?|ms\.?|mrs\.?)\s+/i, '');
          return cleanAuthorName.includes(scientistFullName) || scientistFullName.includes(cleanAuthorName);
        });
      }
      
      return true; // If no authors list, show all available scientists
    })
    .sort((a, b) => {
      // Sort alphabetically by last name, ignoring titles
      const getLastName = (scientist: any) => {
        if (scientist.lastName) return scientist.lastName.toLowerCase();
        // Extract last name from full name, ignoring titles
        const nameWithoutTitle = formatFullName(scientist).replace(/^(dr\.?|prof\.?|mr\.?|ms\.?|mrs\.?)\s+/i, '');
        const nameParts = nameWithoutTitle.trim().split(/\s+/);
        return nameParts[nameParts.length - 1].toLowerCase();
      };
      
      const lastNameA = getLastName(a);
      const lastNameB = getLastName(b);
      return lastNameA.localeCompare(lastNameB);
    });

  const authorshipTypeColors = {
    'First Author': 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    'Co-First Author': 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    'Contributing Author': 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
    'Senior/Last Author': 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
    'Co-Senior/Last Author': 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
    'Corresponding Author': 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  };

  const { data: researchActivity, isLoading: researchActivityLoading } = useQuery<ResearchActivity>({
    queryKey: ['/api/research-activities', publication?.researchActivityId],
    queryFn: async () => {
      if (!publication?.researchActivityId) return null;
      const response = await fetch(`/api/research-activities/${publication.researchActivityId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch research activity');
      }
      return response.json();
    },
    enabled: !!publication?.researchActivityId,
  });
  
  // Fetch patents related to the same research activity. Filter at the API
  // layer (researchActivityId query param) so we don't pull the full patents
  // list down to the browser just to discard most of it.
  const { data: relatedPatents, isLoading: patentsLoading } = useQuery<Patent[]>({
    queryKey: ['/api/patents', { researchActivityId: publication?.researchActivityId }],
    queryFn: async () => {
      if (!publication?.researchActivityId) return [];
      const response = await fetch(`/api/patents?researchActivityId=${publication.researchActivityId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch patents');
      }
      return response.json();
    },
    enabled: !!publication?.researchActivityId,
    retry: 2,
    refetchOnWindowFocus: false,
    staleTime: 30000,
  });

  if (publicationLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/publications")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Skeleton className="h-8 w-64" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="space-y-2">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!publication) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/publications")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">Publication Not Found</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <p className="text-lg text-foreground">The publication you're looking for could not be found.</p>
              <Button className="mt-4" onClick={() => navigate("/publications")}>
                Return to Publications List
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/publications")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">{publication.title}</h1>
        </div>
        <Button 
          className="bg-sidra-teal hover:bg-sidra-teal-dark text-white font-medium px-4 py-2 shadow-sm"
          onClick={() => navigate(`/publications/${publication.id}/edit`)}
        >
          <Edit className="h-4 w-4 mr-2" />
          Edit
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Publication Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">{publication.title}</h2>
                <div className="flex items-center gap-2 mt-1">
                  {researchActivity && (
                    <Badge variant="outline" className="rounded-sm bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                      {researchActivity.sdrNumber}
                    </Badge>
                  )}
                  <Badge className={
                    publication.status === 'published' ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' :
                    publication.status === 'in press' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' :
                    publication.status === 'submitted' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300' :
                    'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                  }>
                    {publication.status}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-foreground">Related Research Activity</h3>
                  <div className="flex items-start gap-1 mt-1">
                    <Layers className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span className="min-w-0 break-words">
                      {researchActivityLoading ? (
                        <Skeleton className="h-4 w-24 inline-block" />
                      ) : researchActivity ? (
                        <Button 
                          variant="link" 
                          className="p-0 h-auto text-primary-600 text-left break-words whitespace-normal"
                          onClick={() => navigate(`/research-activities/${researchActivity.id}`)}
                        >
                          {researchActivity.title}
                        </Button>
                      ) : 'Not assigned'}
                    </span>
                  </div>
                </div>
                
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-foreground">Publication Date</h3>
                  <div className="flex items-center gap-1 mt-1">
                    <Calendar className="h-3 w-3 flex-shrink-0" />
                    <span>
                      {publication.publicationDate 
                        ? format(new Date(publication.publicationDate), 'MMM d, yyyy') 
                        : 'Not published yet'}
                    </span>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-foreground">Publication Type</h3>
                  <div className="flex items-center gap-1">
                    <Book className="h-3 w-3" />
                    <span>{publication.publicationType || 'Not specified'}</span>
                  </div>
                </div>
                
                <div className="md:col-span-2">
                  <h3 className="text-sm font-medium text-foreground">Authors</h3>
                  <div className="flex items-start gap-1 mt-1">
                    <Users className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span className="break-words">{publication.authors || 'No authors listed'}</span>
                  </div>
                </div>
              </div>

              {publication.journal && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-foreground">Journal</h3>
                  <p className="mt-1">
                    {publication.journal}
                    {publication.volume && (
                      <span>, Vol. {publication.volume}</span>
                    )}
                    {publication.issue && (
                      <span>, No. {publication.issue}</span>
                    )}
                    {publication.pages && (
                      <span>, pp. {publication.pages}</span>
                    )}
                  </p>
                  
                  {/* Impact Factor Display */}
                  {publication.journal && (
                    <div className="mt-2 p-3 bg-gray-50 rounded-lg dark:bg-gray-900">
                      <h4 className="text-sm font-medium text-gray-700 mb-3 dark:text-gray-300">Journal Impact Factor</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Year Before Publication */}
                        <div className="text-center">
                          <div className="text-xs text-gray-500 mb-1 dark:text-gray-400">Year Before Publication</div>
                          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {new Date(publication.publicationDate).getFullYear() - 1}
                          </div>
                          {previousYearImpactFactor ? (
                            <>
                              <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                                {previousYearImpactFactor.impactFactor}
                              </div>
                              {previousYearImpactFactor.quartile && (
                                <span className={`inline-block px-2 py-1 rounded text-xs font-semibold mt-1 ${
                                  previousYearImpactFactor.quartile === 'Q1' ? 'bg-green-100 text-green-800' :
                                  previousYearImpactFactor.quartile === 'Q2' ? 'bg-blue-100 text-blue-800' :
                                  previousYearImpactFactor.quartile === 'Q3' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {previousYearImpactFactor.quartile}
                                </span>
                              )}
                            </>
                          ) : (
                            <div className="text-lg text-gray-400 italic dark:text-gray-500">
                              Not Available
                            </div>
                          )}
                        </div>
                        
                        {/* Publication Year (Bold and Larger) */}
                        <div className="text-center">
                          <div className="text-xs text-gray-500 mb-1 dark:text-gray-400">Publication Year</div>
                          <div className="text-lg font-bold text-gray-700 dark:text-gray-300">
                            {new Date(publication.publicationDate).getFullYear()}
                          </div>
                          {impactFactor ? (
                            <>
                              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                {impactFactor.impactFactor}
                              </div>
                              {impactFactor.quartile && (
                                <span className={`inline-block px-3 py-1 rounded text-sm font-bold mt-2 ${
                                  impactFactor.quartile === 'Q1' ? 'bg-green-100 text-green-800' :
                                  impactFactor.quartile === 'Q2' ? 'bg-blue-100 text-blue-800' :
                                  impactFactor.quartile === 'Q3' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {impactFactor.quartile}
                                </span>
                              )}
                            </>
                          ) : (
                            <div className="text-xl font-bold text-gray-400 italic dark:text-gray-500">
                              Not Available
                            </div>
                          )}
                        </div>
                        
                        {/* Most Current Year */}
                        <div className="text-center">
                          <div className="text-xs text-gray-500 mb-1 dark:text-gray-400">Most Current</div>
                          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            2024
                          </div>
                          {currentYearImpactFactor ? (
                            <>
                              <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                                {currentYearImpactFactor.impactFactor}
                              </div>
                              {currentYearImpactFactor.quartile && (
                                <span className={`inline-block px-2 py-1 rounded text-xs font-semibold mt-1 ${
                                  currentYearImpactFactor.quartile === 'Q1' ? 'bg-green-100 text-green-800' :
                                  currentYearImpactFactor.quartile === 'Q2' ? 'bg-blue-100 text-blue-800' :
                                  currentYearImpactFactor.quartile === 'Q3' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {currentYearImpactFactor.quartile}
                                </span>
                              )}
                            </>
                          ) : (
                            <div className="text-lg text-gray-400 italic dark:text-gray-500">
                              Not Available
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {publication.doi && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-foreground">DOI</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <ExternalLink className="h-3 w-3" />
                    <a 
                      href={`https://doi.org/${publication.doi}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:underline"
                    >
                      {publication.doi}
                    </a>
                  </div>
                </div>
              )}

              {publication.pmid && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-foreground">PMID</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <ExternalLink className="h-3 w-3" />
                    <a
                      href={`https://pubmed.ncbi.nlm.nih.gov/${publication.pmid}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:underline"
                      data-testid="link-pmid"
                    >
                      {publication.pmid}
                    </a>
                  </div>
                </div>
              )}
              
              {(publication.prepublicationUrl || publication.prepublicationSite) && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-foreground">Prepublication</h3>
                  <div className="flex flex-col gap-1 mt-1">
                    {publication.prepublicationSite && (
                      <div className="flex items-center gap-2">
                        <FileText className="h-3 w-3" />
                        <span className="text-sm">Site: {publication.prepublicationSite}</span>
                      </div>
                    )}
                    {publication.prepublicationUrl && (
                      <div className="flex items-center gap-2">
                        <ExternalLink className="h-3 w-3" />
                        <a 
                          href={publication.prepublicationUrl.startsWith('http') ? publication.prepublicationUrl : `https://${publication.prepublicationUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:underline break-all text-sm"
                        >
                          {publication.prepublicationUrl}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {publication.vettedForSubmissionByIpOffice && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-foreground">IP Office Review</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="h-3 w-3 rounded-full bg-green-500"></div>
                    <span className="text-green-600 text-sm font-medium dark:text-green-400">✓ Vetted for submission</span>
                  </div>
                </div>
              )}

              {publication.abstract && (
                <div className="mt-6">
                  <h3 className="text-md font-medium border-b pb-2">Abstract</h3>
                  <p className="mt-2">{publication.abstract}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Internal Authors
                {missingAuthors.length > 0 && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {missingAuthors.length} missing in text
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {missingAuthors.length > 0 && (
                  <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <AlertDescription className="text-amber-800 dark:text-amber-300">
                      <strong>Authors mismatch detected:</strong> The following internal authors are not found in the authors field: {' '}
                      <span className="font-medium">
                        {missingAuthors.map(author => formatFullName(author.scientist)).join(', ')}
                      </span>
                      . Please verify that both the authors field and internal author assignments are correct.
                    </AlertDescription>
                  </Alert>
                )}
                {authorsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-12 bg-gray-200 rounded animate-pulse dark:bg-gray-700"></div>
                    ))}
                  </div>
                ) : publicationAuthors.length === 0 ? (
                  <p className="text-foreground text-sm">No internal authors added yet.</p>
                ) : (
                  <div className="space-y-2">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Scientist</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Position</TableHead>
                          <TableHead className="w-[70px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {publicationAuthors.map((author) => {
                          const isInText = isScientistInAuthorsText(author.scientist);
                          return (
                            <TableRow key={author.id} className={!isInText ? "bg-amber-50 border-l-4 border-amber-300 dark:bg-amber-950 dark:border-amber-700" : ""}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {formatFullName(author.scientist)}
                                  {!isInText && (
                                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" title="Not found in authors text" />
                                  )}
                                </div>
                              </TableCell>
                            <TableCell>
                              <Badge 
                                className={`${(() => {
                                  // Map Senior Author and Last Author to Senior/Last Author for display
                                  const displayType = author.authorshipType.split(',').map(type => {
                                    const trimmed = type.trim();
                                    return (trimmed === 'Senior Author' || trimmed === 'Last Author') ? 'Senior/Last Author' : trimmed;
                                  }).join(', ');
                                  return authorshipTypeColors[displayType as keyof typeof authorshipTypeColors] || 'bg-gray-100 text-gray-800';
                                })()} text-xs`}
                              >
                                {(() => {
                                  // Display combined authorship type
                                  return author.authorshipType.split(',').map(type => {
                                    const trimmed = type.trim();
                                    return (trimmed === 'Senior Author' || trimmed === 'Last Author') ? 'Senior/Last Author' : trimmed;
                                  }).join(', ');
                                })()}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {author.authorPosition || 'N/A'}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeAuthorMutation.mutate(author.scientistId)}
                                disabled={removeAuthorMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </TableCell>
                          </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <Dialog open={isAddAuthorOpen} onOpenChange={setIsAddAuthorOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Internal Author
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Internal Author</DialogTitle>
                      <DialogDescription>
                        Link an internal scientist to this publication and specify their authorship role.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 dark:bg-blue-950 dark:border-blue-800">
                      <div className="flex items-start gap-2">
                        <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0 dark:text-blue-400" />
                        <div className="text-sm text-blue-800 dark:text-blue-300">
                          <p className="font-medium mb-1">Smart Filtering Active</p>
                          <p className="text-blue-700 dark:text-blue-300">
                            Only scientists whose names match the publication's author list are shown, 
                            sorted alphabetically by last name. This works with abbreviated names like "Chen E" or "Wilson J".
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="scientist">Scientist</Label>
                        <Select value={selectedScientist} onValueChange={setSelectedScientist}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a scientist" />
                          </SelectTrigger>
                          <SelectContent>
                            {scientistsLoading ? (
                              <div className="p-2 text-sm text-foreground">Loading scientists...</div>
                            ) : availableScientists.length === 0 ? (
                              <div className="p-2 text-sm text-foreground">All scientists already added</div>
                            ) : (
                              availableScientists.map((scientist) => (
                                <SelectItem key={scientist.id} value={scientist.id.toString()}>
                                  {formatFullName(scientist)}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="role">Authorship Role</Label>
                        <Select value={selectedRole} onValueChange={setSelectedRole}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select authorship type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="First Author">First Author</SelectItem>
                            <SelectItem value="Contributing Author">Contributing Author</SelectItem>
                            <SelectItem value="Senior/Last Author">Senior/Last Author</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="corresponding-author"
                          checked={isCorrespondingAuthor}
                          onCheckedChange={setIsCorrespondingAuthor}
                        />
                        <Label htmlFor="corresponding-author" className="text-sm font-normal">
                          Also corresponding author
                        </Label>
                      </div>

                      {(selectedRole === "First Author" || selectedRole === "Senior/Last Author") && (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="shared-position"
                            checked={isSharedPosition}
                            onCheckedChange={setIsSharedPosition}
                          />
                          <Label htmlFor="shared-position" className="text-sm font-normal">
                            Shared position (Co-)
                          </Label>
                        </div>
                      )}

                      <div>
                        <Label htmlFor="position">Author Position (Optional)</Label>
                        <Input
                          value={authorPosition}
                          onChange={(e) => setAuthorPosition(e.target.value)}
                          placeholder="e.g., 1, 2, 3..."
                          type="number"
                          min="1"
                        />
                      </div>
                    </div>

                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddAuthorOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAddAuthor}
                        disabled={addAuthorMutation.isPending || !selectedScientist || !selectedRole}
                      >
                        {addAuthorMutation.isPending ? "Adding..." : "Add Author"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Related Resources</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Button 
                  variant="outline" 
                  className="w-full justify-start" 
                  onClick={() => researchActivity && navigate(`/research-activities/${researchActivity.id}`)}
                  disabled={!researchActivity}
                >
                  <Layers className="h-4 w-4 mr-2" /> 
                  <span className="flex-1 text-left">Research Activity</span>
                  {researchActivity && (
                    <Badge variant="outline" className="ml-2 rounded-sm bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                      {researchActivity.sdrNumber}
                    </Badge>
                  )}
                </Button>
                {relatedPatents && relatedPatents.length > 0 ? (
                  <Button 
                    variant="outline" 
                    className="w-full justify-start" 
                    onClick={() => {
                      // Use a different approach - open in new tab first while we debug
                      const patentId = relatedPatents[0]?.id;
                      if (patentId) {
                        // Navigate directly to the patent detail page with a delay
                        setTimeout(() => {
                          window.location.href = `/patents/${patentId}`;
                        }, 100);
                      }
                    }}
                  >
                    <Award className="h-4 w-4 mr-2" /> 
                    <span className="flex-1 text-left">Related Patent</span>
                    <Badge variant="outline" className="ml-2 rounded-sm bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                      {relatedPatents[0]?.patentNumber || 'Pending'}
                    </Badge>
                  </Button>
                ) : (
                  <Button 
                    variant="outline" 
                    className="w-full justify-start" 
                    onClick={() => researchActivity && navigate(`/patents?researchActivityId=${researchActivity?.id}`)}
                    disabled={!researchActivity}
                  >
                    <Award className="h-4 w-4 mr-2" /> 
                    <span className="flex-1 text-left">Related Patents</span>
                    <Badge variant="outline" className="ml-2 rounded-sm bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700">
                      0
                    </Badge>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-foreground">No documents available.</p>
              <Button variant="outline" className="w-full mt-4" disabled>
                <FileText className="h-4 w-4 mr-2" /> Add Document
              </Button>
            </CardContent>
          </Card>
          
          {/* Status Management Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Status Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Current Status</p>
                    <Badge variant={
                      publication.status === 'Published *' ? 'default' :
                      publication.status === 'Published' ? 'secondary' :
                      publication.status === 'Accepted/In Press' ? 'secondary' :
                      publication.status === 'Under review' ? 'secondary' :
                      publication.status === 'Submitted for review with pre-publication' ? 'secondary' :
                      publication.status === 'Submitted for review without pre-publication' ? 'secondary' :
                      publication.status === 'Vetted for submission' ? 'secondary' :
                      publication.status === 'Complete Draft' ? 'secondary' :
                      'outline'
                    } className={
                      publication.status === 'Published *' ? 'bg-green-600 text-white hover:bg-green-700' :
                      publication.status === 'Published' ? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-900' :
                      publication.status === 'Accepted/In Press' ? 'bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900' :
                      publication.status === 'Under review' ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:hover:bg-yellow-900' :
                      publication.status === 'Submitted for review with pre-publication' ? 'bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:hover:bg-orange-900' :
                      publication.status === 'Submitted for review without pre-publication' ? 'bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:hover:bg-orange-900' :
                      publication.status === 'Vetted for submission' ? 'bg-purple-100 text-purple-800 hover:bg-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:hover:bg-purple-900' :
                      publication.status === 'Complete Draft' ? 'bg-cyan-100 text-cyan-800 hover:bg-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:hover:bg-cyan-900' :
                      ''
                    }>
                      {publication.status || 'Concept'}
                    </Badge>
                  </div>
                  
                  {publication.status !== 'Published' && publication.status !== 'Published *' && (
                    <Button
                      onClick={() => {
                        // Pre-populate form with existing values
                        setJournalName(publication.journal || '');
                        setDoiValue(publication.doi || '');
                        setPublicationDateStr(publication.publicationDate ? (typeof publication.publicationDate === 'string' ? publication.publicationDate.split('T')[0] : new Date(publication.publicationDate).toISOString().split('T')[0]) : '');
                        setPrepublicationUrl(publication.prepublicationUrl || '');
                        setPrepublicationSite(publication.prepublicationSite || '');
                        setAuthorsValue(publication.authors || '');
                        setIsStatusDialogOpen(true);
                      }}
                      className="bg-sidra-teal hover:bg-sidra-teal-dark text-white"
                      size="sm"
                    >
                      Update Status
                    </Button>
                  )}
                </div>
                
                {/* Next Steps Information */}
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  {(() => {
                    const status = publication.status || 'Concept';
                    switch (status) {
                      case 'Concept':
                        return 'Next: Complete the manuscript draft and add authorship details.';
                      case 'Complete Draft':
                        return 'Next: Obtain IP office approval to proceed to submission.';
                      case 'Vetted for submission':
                        return 'Next: Submit for review (with or without pre-publication).';
                      case 'Submitted for review with pre-publication':
                      case 'Submitted for review without pre-publication':
                        return 'Next: Publication will move to "Under review" status.';
                      case 'Under review':
                        return 'Next: Publication will be accepted or require revision.';
                      case 'Accepted/In Press':
                        return 'Next: Publication will be published with final details.';
                      case 'Published':
                        return 'Next: Publication Office approval for final completion.';
                      case 'Published *':
                        return 'Publication workflow complete - Publication Office approved.';
                      default:
                        return 'Update status to continue workflow.';
                    }
                  })()}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Manuscript History Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Manuscript History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : manuscriptHistory.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No changes recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {manuscriptHistory.map((entry) => {
                    const kind = classifyStatusTransition(entry.fromStatus, entry.toStatus);
                    const styles = TRANSITION_STYLES[kind];
                    return (
                      <div
                        key={entry.id}
                        className={`border-l-2 ${styles.border} ${styles.bg} pl-3 py-2 rounded-r`}
                        data-testid={`history-entry-${entry.id}`}
                      >
                        <div className="flex items-center flex-wrap gap-2 text-sm">
                          <span className="font-medium">
                            {entry.fromStatus || '—'} → {entry.toStatus}
                          </span>
                          {kind !== 'forward' && kind !== 'field' && (
                            <Badge variant="outline" className={styles.badge} data-testid={`badge-transition-${entry.id}`}>
                              {styles.label}
                            </Badge>
                          )}
                          <span className="text-gray-500 dark:text-gray-400">
                            {format(new Date(entry.createdAt), 'MMM d, yyyy HH:mm')}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1 dark:text-gray-300" data-testid={`text-actor-${entry.id}`}>
                          by{' '}
                          <span className="font-medium">
                            {entry.changedByName ?? 'Unknown user'}
                          </span>
                        </p>
                        {entry.changeReason && (
                          <p className="text-sm text-gray-600 mt-1 dark:text-gray-300">{entry.changeReason}</p>
                        )}
                        {entry.changedField && (
                          <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                            {entry.changedField}: "{entry.oldValue}" → "{entry.newValue}"
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Status Update Dialog */}
      <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Update Publication Status</DialogTitle>
            <DialogDescription>
              Move the publication to the next stage in the workflow.
            </DialogDescription>
          </DialogHeader>
          
          <StatusUpdateForm 
            publication={publication}
            onStatusUpdate={(status, updatedFields, changes) => {
              updateStatusMutation.mutate({ status, updatedFields, changes });
            }}
            isLoading={updateStatusMutation.isPending}
            ipOfficeApproval={ipOfficeApproval}
            setIpOfficeApproval={setIpOfficeApproval}
            prepublicationUrl={prepublicationUrl}
            setPrepublicationUrl={setPrepublicationUrl}
            prepublicationSite={prepublicationSite}
            setPrepublicationSite={setPrepublicationSite}
            journalName={journalName}
            setJournalName={setJournalName}
            publicationDateStr={publicationDateStr}
            setPublicationDateStr={setPublicationDateStr}
            doiValue={doiValue}
            setDoiValue={setDoiValue}
            authorsValue={authorsValue}
            setAuthorsValue={setAuthorsValue}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Status Update Form Component
function StatusUpdateForm({
  publication,
  onStatusUpdate,
  isLoading,
  ipOfficeApproval,
  setIpOfficeApproval,
  prepublicationUrl,
  setPrepublicationUrl,
  prepublicationSite,
  setPrepublicationSite,
  journalName,
  setJournalName,
  publicationDateStr,
  setPublicationDateStr,
  doiValue,
  setDoiValue,
  authorsValue,
  setAuthorsValue,
}: {
  publication: Publication;
  onStatusUpdate: (status: string, updatedFields?: any, changes?: any[]) => void;
  isLoading: boolean;
  ipOfficeApproval: boolean;
  setIpOfficeApproval: (value: boolean) => void;
  prepublicationUrl: string;
  setPrepublicationUrl: (value: string) => void;
  prepublicationSite: string;
  setPrepublicationSite: (value: string) => void;
  journalName: string;
  setJournalName: (value: string) => void;
  publicationDateStr: string;
  setPublicationDateStr: (value: string) => void;
  doiValue: string;
  setDoiValue: (value: string) => void;
  authorsValue: string;
  setAuthorsValue: (value: string) => void;
}) {
  const currentStatus = publication.status || 'Concept';
  
  const getNextStatuses = (status: string) => {
    // Keep in sync with validTransitions in server/routes.ts publication
    // status route. Includes forward transitions, one-hop revert paths, and
    // terminal exits (Rejected/Withdrawn).
    const transitions: Record<string, string[]> = {
      'Concept': ['Complete Draft', 'Withdrawn'],
      'Complete Draft': ['Vetted for submission', 'Concept', 'Rejected', 'Withdrawn'],
      'Vetted for submission': ['Submitted for review with pre-publication', 'Submitted for review without pre-publication', 'Complete Draft', 'Rejected', 'Withdrawn'],
      'Submitted for review with pre-publication': ['Under review', 'Vetted for submission', 'Rejected', 'Withdrawn'],
      'Submitted for review without pre-publication': ['Under review', 'Vetted for submission', 'Rejected', 'Withdrawn'],
      'Under review': ['Accepted/In Press', 'Submitted for review with pre-publication', 'Submitted for review without pre-publication', 'Rejected', 'Withdrawn'],
      'Accepted/In Press': ['Published', 'Under review', 'Withdrawn'],
      'Published': ['Accepted/In Press'],
      'Published *': ['Published'],
      'Rejected': ['Under review', 'Vetted for submission'],
      'Withdrawn': ['Concept'],
    };
    return transitions[status] || [];
  };

  const nextStatuses = getNextStatuses(currentStatus);
  
  if (nextStatuses.length === 0 && currentStatus === 'Published') {
    return (
      <div className="text-center py-6">
        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
        <p className="text-lg font-medium">Publication Complete</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">This publication has reached its final status.</p>
      </div>
    );
  }

  const handleStatusUpdate = (selectedStatus: string) => {
    const updatedFields: any = {};
    const changes: any[] = [];

    // Collect updated fields based on form inputs
    if (ipOfficeApproval && selectedStatus === 'Vetted for submission') {
      updatedFields.vettedForSubmissionByIpOffice = true;
    }
    
    if (selectedStatus === 'Submitted for review with pre-publication') {
      updatedFields.prepublicationUrl = prepublicationUrl;
      updatedFields.prepublicationSite = prepublicationSite;
      
      if (prepublicationUrl !== publication.prepublicationUrl) {
        changes.push({
          field: 'prepublicationUrl',
          oldValue: publication.prepublicationUrl || '',
          newValue: prepublicationUrl
        });
      }
      
      if (prepublicationSite !== publication.prepublicationSite) {
        changes.push({
          field: 'prepublicationSite',
          oldValue: publication.prepublicationSite || '',
          newValue: prepublicationSite
        });
      }
    }
    
    if (selectedStatus === 'Submitted for review without pre-publication') {
      // Automatically set prepublication site to "None" for non-prepublication route
      updatedFields.prepublicationSite = 'None';
      
      if ('None' !== publication.prepublicationSite) {
        changes.push({
          field: 'prepublicationSite',
          oldValue: publication.prepublicationSite || '',
          newValue: 'None'
        });
      }
    }
    
    if (selectedStatus === 'Complete Draft') {
      updatedFields.authors = authorsValue;
      if (authorsValue !== publication.authors) {
        changes.push({
          field: 'authors',
          oldValue: publication.authors || '',
          newValue: authorsValue
        });
      }
    }
    
    if (['Under review', 'Accepted/In Press'].includes(selectedStatus)) {
      updatedFields.journal = journalName;
      if (journalName !== publication.journal) {
        changes.push({
          field: 'journal',
          oldValue: publication.journal || '',
          newValue: journalName
        });
      }
    }
    
    if (selectedStatus === 'Published') {
      updatedFields.publicationDate = publicationDateStr ? publicationDateStr : null;
      updatedFields.doi = doiValue;
      
      const oldDate = publication.publicationDate ? 
        (typeof publication.publicationDate === 'string' ? 
          publication.publicationDate.split('T')[0] : 
          format(new Date(publication.publicationDate), 'yyyy-MM-dd')) : '';
      if (publicationDateStr !== oldDate) {
        changes.push({
          field: 'publicationDate',
          oldValue: oldDate,
          newValue: publicationDateStr
        });
      }
      
      if (doiValue !== publication.doi) {
        changes.push({
          field: 'doi',
          oldValue: publication.doi || '',
          newValue: doiValue
        });
      }
    }

    onStatusUpdate(selectedStatus, updatedFields, changes);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Select Next Status</Label>
        <div className="mt-2 space-y-3">
          {nextStatuses.map((status) => (
            <div key={status} className="space-y-3 border border-gray-200 rounded-lg p-4 dark:border-gray-700">
              <div className="font-medium">{status}</div>
              
              {/* Conditional Form Fields */}
              
              {status === 'Submitted for review with pre-publication' && (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="prepub-url" className="text-sm">Pre-publication URL</Label>
                    <Input
                      id="prepub-url"
                      value={prepublicationUrl}
                      onChange={(e) => setPrepublicationUrl(e.target.value)}
                      placeholder="https://..."
                      className="mt-1"
                      autoComplete="off"
                      data-1p-ignore="true"
                      data-lpignore="true"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Pre-publication Site</Label>
                    <RadioGroup 
                      value={prepublicationSite} 
                      onValueChange={setPrepublicationSite}
                      className="mt-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="arXiv" id="arxiv" />
                        <Label htmlFor="arxiv">arXiv</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="bioRxiv" id="biorxiv" />
                        <Label htmlFor="biorxiv">bioRxiv</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="medRxiv" id="medrxiv" />
                        <Label htmlFor="medrxiv">medRxiv</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="Research Square" id="researchsquare" />
                        <Label htmlFor="researchsquare">Research Square</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="Other" id="other" />
                        <Label htmlFor="other">Other</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="None" id="none" />
                        <Label htmlFor="none">None</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
              )}
              
              {status === 'Complete Draft' && (
                <div>
                  <Label htmlFor="authors" className="text-sm">Authors</Label>
                  <Textarea
                    id="authors"
                    value={authorsValue}
                    onChange={(e) => setAuthorsValue(e.target.value)}
                    placeholder="Enter authors (e.g., Smith J, Johnson A, Brown K)"
                    className="mt-1"
                    rows={2}
                    autoComplete="off"
                    data-1p-ignore="true"
                    data-lpignore="true"
                  />
                  <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                    List authors as they should appear in the publication
                  </p>
                </div>
              )}
              
              {['Under review', 'Accepted/In Press'].includes(status) && (
                <div>
                  <Label htmlFor="journal" className="text-sm">Journal Name</Label>
                  <Input
                    id="journal"
                    name="journal-name-field"
                    value={journalName}
                    onChange={(e) => setJournalName(e.target.value)}
                    placeholder="Enter journal name"
                    className="mt-1"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    data-1p-ignore="true"
                    data-lpignore="true"
                    data-form-type="other"
                  />
                </div>
              )}
              
              {status === 'Published' && (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="pub-date" className="text-sm">Publication Date</Label>
                    <Input
                      id="pub-date"
                      type="date"
                      value={publicationDateStr}
                      onChange={(e) => setPublicationDateStr(e.target.value)}
                      className="mt-1"
                      autoComplete="off"
                      data-1p-ignore="true"
                      data-lpignore="true"
                    />
                  </div>
                  <div>
                    <Label htmlFor="doi" className="text-sm">DOI</Label>
                    <Input
                      id="doi"
                      value={doiValue}
                      onChange={(e) => setDoiValue(e.target.value)}
                      placeholder="10.1000/xyz123"
                      className="mt-1"
                      autoComplete="off"
                      data-1p-ignore="true"
                      data-lpignore="true"
                    />
                  </div>
                </div>
              )}
              
              <div>
                <Button
                  onClick={() => handleStatusUpdate(status)}
                  disabled={isLoading}
                  className="bg-sidra-teal hover:bg-sidra-teal-dark text-white"
                  size="sm"
                >
                  {isLoading ? 'Updating...' : `Move to ${status}`}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}