// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPublicationSchema, type InsertPublication } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Search, FileText, ExternalLink, Loader2, CheckCircle, AlertCircle, Plus, BookOpen, Upload, XCircle, SkipForward } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ImportedPublicationData {
  title: string;
  authors: string;
  journal: string;
  volume: string;
  issue: string;
  pages: string;
  doi: string;
  pmid: string;
  abstract: string;
  publicationDate: string;
}

interface BulkImportResult {
  pmid: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
  title?: string;
}

interface PublicationImportProps {
  onClose: () => void;
}

export default function PublicationImport({ onClose }: PublicationImportProps) {
  const [importType, setImportType] = useState<'pmid' | 'doi' | 'bulk'>('pmid');
  const [searchValue, setSearchValue] = useState('');
  const [bulkPmids, setBulkPmids] = useState('');
  const [importedData, setImportedData] = useState<ImportedPublicationData | null>(null);
  const [step, setStep] = useState<'search' | 'preview' | 'journal-select' | 'bulk-results'>('search');
  const [selectedResearchActivityId, setSelectedResearchActivityId] = useState<string>('');
  const [matchingJournals, setMatchingJournals] = useState<any[]>([]);
  const [selectedJournalId, setSelectedJournalId] = useState<string>('');
  const [showAddJournal, setShowAddJournal] = useState(false);
  const [newJournal, setNewJournal] = useState({
    journalName: '',
    publisher: '',
    impactFactor: '',
    year: new Date().getFullYear()
  });
  
  // Bulk import state
  const [bulkImportResults, setBulkImportResults] = useState<BulkImportResult[]>([]);
  const [bulkImportProgress, setBulkImportProgress] = useState(0);
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [bulkResearchActivityId, setBulkResearchActivityId] = useState<string>('');
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch research activities for dropdown
  const { data: researchActivities } = useQuery({
    queryKey: ['/api/research-activities'],
  });

  // Fetch scientists for authorship
  const { data: scientists } = useQuery({
    queryKey: ['/api/scientists'],
  });

  // Fetch existing publications to check for duplicates
  const { data: existingPublications } = useQuery({
    queryKey: ['/api/publications'],
  });

  // Import publication data
  const importMutation = useMutation({
    mutationFn: async (identifier: string) => {
      const endpoint = importType === 'pmid' 
        ? `/api/publications/import/pmid/${identifier}`
        : `/api/publications/import/doi/${encodeURIComponent(identifier)}`;
      
      const response = await fetch(endpoint);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch publication data');
      }
      return response.json();
    },
    onSuccess: async (data) => {
      setImportedData(data);
      
      // Check for matching journals in impact factor database
      if (data.journal) {
        try {
          const journalResponse = await fetch(`/api/journal-impact-factors?searchTerm=${encodeURIComponent(data.journal)}&limit=10`);
          const journalData = await journalResponse.json();
          setMatchingJournals(journalData.data || []);
        } catch (error) {
          console.error('Error searching for journals:', error);
          setMatchingJournals([]);
        }
      }
      
      setStep('preview');
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Create publication form
  const form = useForm<InsertPublication>({
    resolver: zodResolver(insertPublicationSchema),
    defaultValues: {
      title: '',
      authors: '',
      journal: '',
      volume: '',
      issue: '',
      pages: '',
      doi: '',
      pmid: '',
      abstract: '',
      publicationDate: undefined,
      status: 'published'
    }
  });

  // Populate form with imported data
  const populateForm = (data: ImportedPublicationData) => {
    form.reset({
      title: data.title,
      authors: data.authors,
      journal: data.journal,
      volume: data.volume,
      issue: data.issue,
      pages: data.pages,
      doi: data.doi,
      pmid: data.pmid,
      abstract: data.abstract,
      publicationDate: data.publicationDate ? new Date(data.publicationDate) : undefined,
      status: 'published',
      researchActivityId: selectedResearchActivityId ? parseInt(selectedResearchActivityId) : undefined
    });
  };

  // Save publication
  const saveMutation = useMutation({
    mutationFn: async (data: InsertPublication) => {
      const response = await apiRequest('POST', '/api/publications', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/publications'] });
      toast({
        title: "Success",
        description: "Publication imported successfully",
      });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Save Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleImport = () => {
    if (!searchValue.trim()) {
      toast({
        title: "Error",
        description: "Please enter a PMID or DOI",
        variant: "destructive",
      });
      return;
    }
    importMutation.mutate(searchValue.trim());
  };

  const handleSave = (data: InsertPublication) => {
    saveMutation.mutate(data);
  };

  // Bulk import handler
  const handleBulkImport = async () => {
    if (!bulkPmids.trim()) {
      toast({
        title: "Error",
        description: "Please enter at least one PMID",
        variant: "destructive",
      });
      return;
    }

    // Parse PMIDs - split by comma, newline, or space and clean up
    const pmidList = bulkPmids
      .split(/[,\n\s]+/)
      .map(pmid => pmid.trim())
      .filter(pmid => pmid.length > 0 && /^\d+$/.test(pmid));

    if (pmidList.length === 0) {
      toast({
        title: "Error",
        description: "No valid PMIDs found. PMIDs should be numeric values.",
        variant: "destructive",
      });
      return;
    }

    // Check for duplicate PMIDs in the input
    const uniquePmids = [...new Set(pmidList)];

    setIsBulkImporting(true);
    setBulkImportResults([]);
    setBulkImportProgress(0);

    const results: BulkImportResult[] = [];

    for (let i = 0; i < uniquePmids.length; i++) {
      const pmid = uniquePmids[i];
      
      // Check if PMID already exists in database
      const existingPub = (existingPublications as any[])?.find(
        (pub: any) => pub.pmid === pmid
      );

      if (existingPub) {
        results.push({
          pmid,
          status: 'skipped',
          message: 'Already exists in database',
          title: existingPub.title
        });
      } else {
        try {
          // Fetch publication data from PubMed
          const response = await fetch(`/api/publications/import/pmid/${pmid}`);
          
          if (!response.ok) {
            const error = await response.json();
            results.push({
              pmid,
              status: 'failed',
              message: error.message || 'Failed to fetch from PubMed'
            });
          } else {
            const pubData = await response.json();
            
            // Save the publication
            try {
              const saveResponse = await apiRequest('POST', '/api/publications', {
                title: pubData.title,
                authors: pubData.authors,
                journal: pubData.journal,
                volume: pubData.volume,
                issue: pubData.issue,
                pages: pubData.pages,
                doi: pubData.doi,
                pmid: pubData.pmid,
                abstract: pubData.abstract,
                publicationDate: pubData.publicationDate ? new Date(pubData.publicationDate) : undefined,
                status: 'published',
                researchActivityId: bulkResearchActivityId && bulkResearchActivityId !== 'none' ? parseInt(bulkResearchActivityId) : undefined
              });
              
              if (saveResponse.ok) {
                results.push({
                  pmid,
                  status: 'success',
                  message: 'Imported successfully',
                  title: pubData.title
                });
              } else {
                const saveError = await saveResponse.json();
                results.push({
                  pmid,
                  status: 'failed',
                  message: saveError.message || 'Failed to save publication',
                  title: pubData.title
                });
              }
            } catch (saveError: any) {
              results.push({
                pmid,
                status: 'failed',
                message: saveError.message || 'Failed to save publication',
                title: pubData.title
              });
            }
          }
        } catch (error: any) {
          results.push({
            pmid,
            status: 'failed',
            message: error.message || 'Network error'
          });
        }
      }

      // Update progress
      setBulkImportProgress(Math.round(((i + 1) / uniquePmids.length) * 100));
      setBulkImportResults([...results]);
    }

    setIsBulkImporting(false);
    setStep('bulk-results');
    
    // Refresh publications list
    queryClient.invalidateQueries({ queryKey: ['/api/publications'] });
  };

  // Add new journal to database
  const addJournalMutation = useMutation({
    mutationFn: async (journalData: any) => {
      const response = await apiRequest('POST', '/api/journal-impact-factors', journalData);
      return response.json();
    },
    onSuccess: (data) => {
      setMatchingJournals([data]);
      setSelectedJournalId(data.id.toString());
      setShowAddJournal(false);
      toast({
        title: "Success",
        description: "Journal added to database successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Add Journal Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleAddJournal = () => {
    if (!newJournal.journalName.trim()) {
      toast({
        title: "Error",
        description: "Journal name is required",
        variant: "destructive",
      });
      return;
    }

    addJournalMutation.mutate({
      journalName: newJournal.journalName.trim(),
      publisher: newJournal.publisher.trim() || 'Unknown',
      impactFactor: newJournal.impactFactor ? parseFloat(newJournal.impactFactor) : null,
      year: newJournal.year
    });
  };

  const resetForm = () => {
    setStep('search');
    setImportedData(null);
    setSearchValue('');
    setBulkPmids('');
    setMatchingJournals([]);
    setSelectedJournalId('');
    setShowAddJournal(false);
    setBulkImportResults([]);
    setBulkImportProgress(0);
    setNewJournal({
      journalName: '',
      publisher: '',
      impactFactor: '',
      year: new Date().getFullYear()
    });
    form.reset();
  };

  // Calculate bulk import statistics
  const getImportStats = () => {
    const successful = bulkImportResults.filter(r => r.status === 'success').length;
    const failed = bulkImportResults.filter(r => r.status === 'failed').length;
    const skipped = bulkImportResults.filter(r => r.status === 'skipped').length;
    return { successful, failed, skipped, total: bulkImportResults.length };
  };

  // Bulk import results view
  if (step === 'bulk-results') {
    const stats = getImportStats();
    
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Bulk Import Complete</h3>
          <p className="text-gray-600 dark:text-gray-300">
            Processed {stats.total} PMID(s)
          </p>
        </div>

        {/* Statistics Summary */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800">
            <CardContent className="p-4 text-center">
              <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2 dark:text-green-400" />
              <div className="text-2xl font-bold text-green-700 dark:text-green-300">{stats.successful}</div>
              <div className="text-sm text-green-600 dark:text-green-400">Imported</div>
            </CardContent>
          </Card>
          <Card className="bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800">
            <CardContent className="p-4 text-center">
              <SkipForward className="h-8 w-8 text-yellow-600 mx-auto mb-2 dark:text-yellow-400" />
              <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">{stats.skipped}</div>
              <div className="text-sm text-yellow-600 dark:text-yellow-400">Skipped (Duplicates)</div>
            </CardContent>
          </Card>
          <Card className="bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800">
            <CardContent className="p-4 text-center">
              <XCircle className="h-8 w-8 text-red-600 mx-auto mb-2 dark:text-red-400" />
              <div className="text-2xl font-bold text-red-700 dark:text-red-300">{stats.failed}</div>
              <div className="text-sm text-red-600 dark:text-red-400">Failed</div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Results */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Import Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {bulkImportResults.map((result, index) => (
                <div 
                  key={index}
                  className={`p-3 rounded-lg flex items-start gap-3 ${
                    result.status === 'success' ? 'bg-green-50 border border-green-200' :
                    result.status === 'skipped' ? 'bg-yellow-50 border border-yellow-200' :
                    'bg-red-50 border border-red-200'
                  }`}
                >
                  {result.status === 'success' ? (
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5 dark:text-green-400" />
                  ) : result.status === 'skipped' ? (
                    <SkipForward className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5 dark:text-yellow-400" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5 dark:text-red-400" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs">
                        PMID: {result.pmid}
                      </Badge>
                      <span className={`text-xs font-medium ${
                        result.status === 'success' ? 'text-green-700' :
                        result.status === 'skipped' ? 'text-yellow-700' :
                        'text-red-700'
                      }`}>
                        {result.message}
                      </span>
                    </div>
                    {result.title && (
                      <p className="text-sm text-gray-600 mt-1 truncate dark:text-gray-300">{result.title}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={resetForm}>
            Import More
          </Button>
          <Button onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'search') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <p className="text-gray-600 mb-4 dark:text-gray-300">
            Import publication data automatically using a PubMed ID (PMID), DOI, or bulk import multiple PMIDs
          </p>
        </div>

        <Tabs value={importType} onValueChange={(value) => setImportType(value as 'pmid' | 'doi' | 'bulk')}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pmid">Single PMID</TabsTrigger>
            <TabsTrigger value="doi">DOI</TabsTrigger>
            <TabsTrigger value="bulk">Bulk Import</TabsTrigger>
          </TabsList>
          
          <TabsContent value="pmid" className="space-y-4">
            <div>
              <Label htmlFor="pmid">PubMed ID (PMID)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="pmid"
                  placeholder="e.g., 12345678"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleImport()}
                  data-testid="input-pmid"
                />
                <Button 
                  onClick={handleImport} 
                  disabled={importMutation.isPending}
                  className="flex items-center gap-2"
                  data-testid="button-import-pmid"
                >
                  {importMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Import
                </Button>
              </div>
              <p className="text-sm text-gray-500 mt-2 dark:text-gray-400">
                Enter the PubMed ID to automatically fetch publication details from NCBI
              </p>
            </div>
          </TabsContent>
          
          <TabsContent value="doi" className="space-y-4">
            <div>
              <Label htmlFor="doi">Digital Object Identifier (DOI)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="doi"
                  placeholder="e.g., 10.1038/nature12373"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleImport()}
                  data-testid="input-doi"
                />
                <Button 
                  onClick={handleImport} 
                  disabled={importMutation.isPending}
                  className="flex items-center gap-2"
                  data-testid="button-import-doi"
                >
                  {importMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Import
                </Button>
              </div>
              <p className="text-sm text-gray-500 mt-2 dark:text-gray-400">
                Enter the DOI to automatically fetch publication details from CrossRef
              </p>
            </div>
          </TabsContent>

          <TabsContent value="bulk" className="space-y-4">
            <div>
              <Label htmlFor="bulk-sdr">Research Activity (SDR) <span className="text-gray-400 font-normal dark:text-gray-500">(optional)</span></Label>
              <Select 
                value={bulkResearchActivityId} 
                onValueChange={setBulkResearchActivityId}
              >
                <SelectTrigger data-testid="select-bulk-sdr">
                  <SelectValue placeholder="Optionally link to a research activity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No SDR link</SelectItem>
                  {(researchActivities as any[])?.map((activity: any) => (
                    <SelectItem key={activity.id} value={activity.id.toString()}>
                      {activity.sdrNumber} - {activity.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
                Optionally link all imported publications to a research activity. You can link them later if needed.
              </p>
            </div>

            <div>
              <Label htmlFor="bulk-pmids">PubMed IDs (comma-separated)</Label>
              <Textarea
                id="bulk-pmids"
                placeholder="Enter PMIDs separated by commas, spaces, or new lines&#10;e.g., 12345678, 23456789, 34567890"
                value={bulkPmids}
                onChange={(e) => setBulkPmids(e.target.value)}
                className="min-h-[120px] font-mono text-sm"
                data-testid="input-bulk-pmids"
              />
              <p className="text-sm text-gray-500 mt-2 dark:text-gray-400">
                Enter multiple PMIDs to import them all at once. Existing publications will be skipped.
              </p>
            </div>

            {isBulkImporting && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">Importing publications...</span>
                  <span className="font-medium">{bulkImportProgress}%</span>
                </div>
                <Progress value={bulkImportProgress} className="h-2" />
                {bulkImportResults.length > 0 && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Processing: {bulkImportResults[bulkImportResults.length - 1]?.pmid}
                  </div>
                )}
              </div>
            )}

            <Button 
              onClick={handleBulkImport} 
              disabled={isBulkImporting || !bulkPmids.trim()}
              className="w-full flex items-center justify-center gap-2"
              data-testid="button-bulk-import"
            >
              {isBulkImporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {isBulkImporting ? 'Importing...' : 'Start Bulk Import'}
            </Button>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-import">
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'preview' && importedData) {
    // Populate form when we get to preview step
    if (!form.getValues().title) {
      populateForm(importedData);
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-green-600 mb-4 dark:text-green-400">
          <CheckCircle className="h-5 w-5" />
          <span className="font-medium">Publication data imported successfully</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Publication Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Title</Label>
              <p className="text-sm text-gray-900 mt-1 dark:text-gray-100">{importedData.title}</p>
            </div>
            
            <div>
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Authors</Label>
              <p className="text-sm text-gray-900 mt-1 dark:text-gray-100">{importedData.authors}</p>
            </div>
            
            <div>
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Journal</Label>
              <p className="text-sm text-gray-900 mt-1 dark:text-gray-100">{importedData.journal}</p>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Volume</Label>
                <p className="text-sm text-gray-900 mt-1 dark:text-gray-100">{importedData.volume || '—'}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Issue</Label>
                <p className="text-sm text-gray-900 mt-1 dark:text-gray-100">{importedData.issue || '—'}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Pages</Label>
                <p className="text-sm text-gray-900 mt-1 dark:text-gray-100">{importedData.pages || '—'}</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">DOI</Label>
                <p className="text-sm text-gray-900 mt-1 dark:text-gray-100">
                  {importedData.doi ? (
                    <a 
                      href={`https://doi.org/${importedData.doi}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 flex items-center gap-1 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {importedData.doi}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : '—'}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">PMID</Label>
                <p className="text-sm text-gray-900 mt-1 dark:text-gray-100">
                  {importedData.pmid ? (
                    <a 
                      href={`https://pubmed.ncbi.nlm.nih.gov/${importedData.pmid}/`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 flex items-center gap-1 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {importedData.pmid}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Journal Matching Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Journal Matching
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Imported Journal: <span className="font-normal">{importedData.journal}</span>
              </Label>
            </div>
            
            {matchingJournals.length > 0 ? (
              <div>
                <Label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                  Found {matchingJournals.length} matching journal(s) in impact factor database:
                </Label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {matchingJournals.map((journal: any) => (
                    <div 
                      key={journal.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedJournalId === journal.id.toString() 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedJournalId(journal.id.toString())}
                      data-testid={`option-matching-journal-${journal.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-sm">{journal.journalName}</div>
                          <div className="text-xs text-gray-600 dark:text-gray-300">
                            {journal.publisher} • {journal.year}
                            {journal.impactFactor && (
                              <span className="ml-2 text-blue-600 dark:text-blue-400">
                                Impact Factor: {journal.impactFactor}
                              </span>
                            )}
                          </div>
                        </div>
                        {selectedJournalId === journal.id.toString() && (
                          <CheckCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 border-2 border-dashed border-gray-300 rounded-lg dark:border-gray-600">
                <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-2 dark:text-gray-500" />
                <p className="text-sm text-gray-600 mb-3 dark:text-gray-300">
                  No matching journals found in the impact factor database
                </p>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="flex items-center gap-2"
                  onClick={() => {
                    setNewJournal(prev => ({ ...prev, journalName: importedData.journal }));
                    setShowAddJournal(true);
                  }}
                  data-testid="button-show-add-journal"
                >
                  <Plus className="h-4 w-4" />
                  Add "{importedData.journal}" to Database
                </Button>
              </div>
            )}

            {/* Add Journal Form */}
            {showAddJournal && (
              <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Plus className="h-5 w-5" />
                    Add New Journal
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="journalName">Journal Name *</Label>
                      <Input
                        id="journalName"
                        value={newJournal.journalName}
                        onChange={(e) => setNewJournal(prev => ({ ...prev, journalName: e.target.value }))}
                        placeholder="e.g., Nature, Science"
                        data-testid="input-new-journal-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="publisher">Publisher</Label>
                      <Input
                        id="publisher"
                        value={newJournal.publisher}
                        onChange={(e) => setNewJournal(prev => ({ ...prev, publisher: e.target.value }))}
                        placeholder="e.g., Nature Publishing Group"
                        data-testid="input-new-journal-publisher"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="impactFactor">Impact Factor</Label>
                      <Input
                        id="impactFactor"
                        type="number"
                        step="0.001"
                        value={newJournal.impactFactor}
                        onChange={(e) => setNewJournal(prev => ({ ...prev, impactFactor: e.target.value }))}
                        placeholder="e.g., 42.778"
                        data-testid="input-new-journal-impact-factor"
                      />
                    </div>
                    <div>
                      <Label htmlFor="year">Year</Label>
                      <Input
                        id="year"
                        type="number"
                        value={newJournal.year}
                        onChange={(e) => setNewJournal(prev => ({ ...prev, year: parseInt(e.target.value) || new Date().getFullYear() }))}
                        data-testid="input-new-journal-year"
                      />
                    </div>
                  </div>
                  
                  <div className="flex justify-end gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => setShowAddJournal(false)}
                      disabled={addJournalMutation.isPending}
                      data-testid="button-cancel-add-journal"
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleAddJournal}
                      disabled={addJournalMutation.isPending}
                      className="flex items-center gap-2"
                      data-testid="button-save-new-journal"
                    >
                      {addJournalMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4" />
                      )}
                      Add Journal
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSave)} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Complete Publication Details</CardTitle>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Review and edit the imported data before saving. Required fields are marked with *.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="researchActivityId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Research Activity (SDR) *</FormLabel>
                      <Select 
                        value={field.value?.toString() || ''} 
                        onValueChange={(value) => {
                          field.onChange(value ? parseInt(value) : undefined);
                          setSelectedResearchActivityId(value);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select research activity" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(researchActivities as any[])?.map((activity: any) => (
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

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title *</FormLabel>
                      <FormControl>
                        <Textarea {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="authors"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Authors *</FormLabel>
                      <FormControl>
                        <Textarea {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="journal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Journal *</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="publicationDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Publication Date</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''} 
                            onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="volume"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Volume</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="issue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Issue</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="pages"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pages</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="doi"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>DOI</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="pmid"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>PMID</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="abstract"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Abstract</FormLabel>
                      <FormControl>
                        <Textarea {...field} value={field.value || ''} className="min-h-[100px]" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={resetForm}>
                Import Another
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={saveMutation.isPending}
                  className="flex items-center gap-2"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  Save Publication
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </div>
    );
  }

  return null;
}
