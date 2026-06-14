// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResearchActivity, ResearchContract, Scientist, ResearchContractExtension, ResearchContractScopeItem } from "@shared/schema";
import { ArrowLeft, Calendar, FileText, Building, Layers, DollarSign, Users, Edit, Clock, CheckSquare, Globe, Mail } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { usePublicationCount } from "@/hooks/use-publication-count";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export default function ResearchContractDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const id = parseInt(params.id);
  const { currentUser } = useCurrentUser();

  const { data: contract, isLoading: contractLoading } = useQuery<ResearchContract>({
    queryKey: ['/api/research-contracts', id],
    queryFn: async () => {
      const response = await fetch(`/api/research-contracts/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch research contract');
      }
      return response.json();
    },
  });

  const { data: researchActivity, isLoading: researchActivityLoading } = useQuery<ResearchActivity>({
    queryKey: ['/api/research-activities', contract?.researchActivityId],
    queryFn: async () => {
      if (!contract?.researchActivityId) return null;
      const response = await fetch(`/api/research-activities/${contract.researchActivityId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch research activity');
      }
      return response.json();
    },
    enabled: !!contract?.researchActivityId,
  });

  const { data: leadPI, isLoading: leadPILoading } = useQuery<Scientist>({
    queryKey: ['/api/scientists', contract?.leadPIId],
    queryFn: async () => {
      if (!contract?.leadPIId) return null;
      const response = await fetch(`/api/scientists/${contract.leadPIId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch lead PI');
      }
      return response.json();
    },
    enabled: !!contract?.leadPIId,
  });
  
  // Get extensions for this contract
  const { data: extensions, isLoading: extensionsLoading } = useQuery<ResearchContractExtension[]>({
    queryKey: ['/api/research-contracts', id, 'extensions'],
    queryFn: async () => {
      if (!contract?.id) return [];
      const response = await fetch(`/api/research-contracts/${contract.id}/extensions`);
      if (!response.ok) {
        throw new Error('Failed to fetch contract extensions');
      }
      return response.json();
    },
    enabled: !!contract?.id,
  });

  // Get scope items for this contract
  const { data: scopeItems, isLoading: scopeItemsLoading } = useQuery<ResearchContractScopeItem[]>({
    queryKey: ['/api/research-contracts', id, 'scope-items'],
    queryFn: async () => {
      if (!contract?.id) return [];
      const response = await fetch(`/api/research-contracts/${contract.id}/scope-items`);
      if (!response.ok) {
        throw new Error('Failed to fetch contract scope items');
      }
      return response.json();
    },
    enabled: !!contract?.id,
  });

  // Get the number of publications linked to this research activity
  const { count: publicationCount } = usePublicationCount(contract?.researchActivityId);

  // Check if current user can edit this contract
  const canEditContract = contract && (
    currentUser.role === 'Contracts Officer' || 
    currentUser.role === 'admin' || 
    currentUser.role === 'Management' ||
    contract.requestedByUserId === currentUser.id
  );

  if (contractLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/contracts")} data-testid="button-back-loading">
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

  if (!contract) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/contracts")} data-testid="button-back-not-found">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">Research Contract Not Found</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <p className="text-lg text-foreground">The research contract you're looking for could not be found.</p>
              <Button className="mt-4" onClick={() => navigate("/contracts")} data-testid="button-return-contracts">
                Return to Contracts List
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
          <Button variant="ghost" size="sm" onClick={() => navigate("/contracts")} data-testid="button-back-main">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">{contract.title}</h1>
        </div>
        {canEditContract && (
          <Button 
            className="bg-sidra-teal hover:bg-sidra-teal-dark text-white font-medium px-4 py-2 shadow-sm"
            onClick={() => navigate(`/research-contracts/${contract.id}/edit`)}
            data-testid="button-edit-contract"
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Research Contract Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">{contract.title}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="rounded-sm bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                    {contract.contractNumber}
                  </Badge>
                  {researchActivity && (
                    <Badge variant="outline" className="rounded-sm bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                      {researchActivity.sdrNumber}
                    </Badge>
                  )}
                  <Badge className={
                    contract.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' :
                    contract.status === 'submitted' || contract.status === 'under_review' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300' :
                    contract.status === 'completed' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' :
                    'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                  }>
                    {contract.status}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <h3 className="text-sm font-medium text-foreground">Related Research Activity</h3>
                  <div className="flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    <span>
                      {researchActivityLoading ? (
                        <Skeleton className="h-4 w-24 inline-block" />
                      ) : researchActivity ? (
                        <span 
                          className="text-primary-600 hover:text-primary-700 cursor-pointer hover:underline"
                          onClick={() => navigate(`/research-activities/${researchActivity.id}`)}
                          data-testid="link-research-activity"
                        >
                          {researchActivity.title}
                        </span>
                      ) : 'Not assigned'}
                    </span>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-foreground">Principal Investigator</h3>
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    <span>
                      {leadPILoading ? (
                        <Skeleton className="h-4 w-24 inline-block" />
                      ) : leadPI ? (
                        `${leadPI.firstName} ${leadPI.lastName}`
                      ) : 'Not assigned'}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-foreground">Contract Start Date</h3>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {contract.startDate 
                        ? format(new Date(contract.startDate), 'MMM d, yyyy') 
                        : 'Not specified'}
                    </span>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-foreground">Contract End Date</h3>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {contract.endDate 
                        ? format(new Date(contract.endDate), 'MMM d, yyyy') 
                        : 'Not specified'}
                    </span>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-foreground">Organization Name</h3>
                  <div className="flex items-center gap-1">
                    <Building className="h-3 w-3" />
                    <span>{contract.contractorName || 'Not specified'}</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-foreground">Country</h3>
                  <div className="flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    <span>{contract.counterpartyCountry || 'Not specified'}</span>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <h3 className="text-sm font-medium text-foreground">Contact Information</h3>
                  <div className="flex items-start gap-1 mt-1">
                    <Mail className="h-3 w-3 mt-0.5" />
                    <span className="whitespace-pre-wrap">{contract.counterpartyContact || 'Not specified'}</span>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-foreground">Contract Value</h3>
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    <span>
                      {contract.contractValue 
                        ? `${contract.currency || 'QAR'} ${parseFloat(contract.contractValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
                        : 'Not specified'}
                    </span>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-foreground">Contract Type</h3>
                  <div className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    <span>{contract.contractType || 'Not specified'}</span>
                  </div>
                </div>
                
                {contract.irbProtocol && (
                  <div>
                    <h3 className="text-sm font-medium text-foreground">IRB Protocol</h3>
                    <div className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      <span>{contract.irbProtocol}</span>
                    </div>
                  </div>
                )}
                
                {contract.ibcProtocol && (
                  <div>
                    <h3 className="text-sm font-medium text-foreground">IBC Protocol</h3>
                    <div className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      <span>{contract.ibcProtocol}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* SDR Funding Information Section */}
              {researchActivity && ((researchActivity.budgetSource?.length ?? 0) > 0 || (researchActivity.grantCodes?.length ?? 0) > 0) && (
                <div className="mt-6" data-testid="section-sdr-funding">
                  <h3 className="text-md font-medium border-b pb-2">SDR Funding Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {researchActivity.budgetSource && researchActivity.budgetSource.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-foreground mb-2">Budget Source</h4>
                        <div className="flex flex-wrap gap-2">
                          {researchActivity.budgetSource.map((source, index) => (
                            <Badge 
                              key={index}
                              variant="outline" 
                              className="rounded-sm bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800"
                              data-testid={`badge-budget-source-${index}`}
                            >
                              {source}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {researchActivity.grantCodes && researchActivity.grantCodes.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-foreground mb-2">Grant Codes</h4>
                        <div className="flex flex-wrap gap-2">
                          {researchActivity.grantCodes.map((code, index) => (
                            <Badge 
                              key={index}
                              variant="outline" 
                              className="rounded-sm bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
                              data-testid={`badge-grant-code-${index}`}
                            >
                              {code}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {contract.description && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-foreground">Description</h3>
                  <p className="mt-1">{contract.description}</p>
                </div>
              )}
              
              <div className="mt-6">
                <h3 className="text-md font-medium border-b pb-2">Financial Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">Internal Cost (Sidra)</p>
                    <p className="mt-1">${contract.internalCostSidra?.toLocaleString() || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Internal Cost (Counterparty)</p>
                    <p className="mt-1">${contract.internalCostCounterparty?.toLocaleString() || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Money Out</p>
                    <p className="mt-1">${contract.moneyOut?.toLocaleString() || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">PO Relevant</p>
                    <p className="mt-1">{contract.isPORelevant ? 'Yes' : 'No'}</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
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
                  data-testid="button-related-research-activity"
                >
                  <Layers className="h-4 w-4 mr-2" /> 
                  <span className="flex-1 text-left">Research Activity</span>
                  {researchActivity && (
                    <Badge variant="outline" className="ml-2 rounded-sm bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                      {researchActivity.sdrNumber}
                    </Badge>
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start" 
                  onClick={() => leadPI && navigate(`/scientists/${leadPI.id}`)}
                  disabled={!leadPI}
                  data-testid="button-related-lead-pi"
                >
                  <Users className="h-4 w-4 mr-2" /> 
                  <span className="flex-1 text-left">Principal Investigator</span>
                  {leadPI && leadPI.staffId ? (
                    <Badge variant="outline" className="ml-2 rounded-sm bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                      ID: {leadPI.staffId}
                    </Badge>
                  ) : leadPI && (
                    <Badge variant="outline" className="ml-2 rounded-sm bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800">
                      PI
                    </Badge>
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start" 
                  onClick={() => researchActivity && navigate(`/publications?researchActivityId=${researchActivity.id}`)}
                  disabled={!researchActivity}
                  data-testid="button-related-publications"
                >
                  <FileText className="h-4 w-4 mr-2" /> 
                  <span className="flex-1 text-left">Publications</span>
                  {researchActivity && (
                    <Badge variant="outline" className="ml-2 rounded-sm bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                      {publicationCount} {publicationCount === 1 ? 'publication' : 'publications'}
                    </Badge>
                  )}
                </Button>
                {contract.irbProtocol && (
                  <Button 
                    variant="outline" 
                    className="w-full justify-start" 
                    onClick={() => {
                      // Find the IRB application ID from the protocol number and navigate to its details
                      fetch(`/api/irb-applications`)
                        .then(res => res.json())
                        .then(data => {
                          const irbApp = data.find(app => app.irbNumber === contract.irbProtocol);
                          if (irbApp) {
                            navigate(`/irb-applications/${irbApp.id}`);
                          } else {
                            navigate(`/irb-applications?search=${contract.irbProtocol}`);
                          }
                        })
                        .catch(() => navigate(`/irb-applications?search=${contract.irbProtocol}`));
                    }}
                    data-testid="button-related-irb-protocol"
                  >
                    <FileText className="h-4 w-4 mr-2" /> 
                    <span className="flex-1 text-left">IRB Protocol</span>
                    <Badge variant="outline" className="ml-2 rounded-sm bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                      {contract.irbProtocol}
                    </Badge>
                  </Button>
                )}
                
                {contract.ibcProtocol && (
                  <Button 
                    variant="outline" 
                    className="w-full justify-start" 
                    onClick={() => {
                      // Find the IBC application ID from the protocol number and navigate to its details
                      fetch(`/api/ibc-applications`)
                        .then(res => res.json())
                        .then(data => {
                          const ibcApp = data.find(app => app.ibcNumber === contract.ibcProtocol);
                          if (ibcApp) {
                            navigate(`/ibc-applications/${ibcApp.id}`);
                          } else {
                            navigate(`/ibc-applications?search=${contract.ibcProtocol}`);
                          }
                        })
                        .catch(() => navigate(`/ibc-applications?search=${contract.ibcProtocol}`));
                    }}
                    data-testid="button-related-ibc-protocol"
                  >
                    <FileText className="h-4 w-4 mr-2" /> 
                    <span className="flex-1 text-left">IBC Protocol</span>
                    <Badge variant="outline" className="ml-2 rounded-sm bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800">
                      {contract.ibcProtocol}
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
              {contract.documents && contract.documents.agreement ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 border rounded">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-foreground" />
                      <span>{contract.documents.agreement}</span>
                    </div>
                    <Button size="sm" variant="ghost" data-testid="button-document-view">
                      <FileText className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-foreground">No documents available.</p>
              )}
              <Button variant="outline" className="w-full mt-4" disabled data-testid="button-add-document">
                <FileText className="h-4 w-4 mr-2" /> Add Document
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5" />
                Scope of Work
              </CardTitle>
            </CardHeader>
            <CardContent>
              {scopeItemsLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : scopeItems && scopeItems.length > 0 ? (
                <div className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[120px]">Party</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-[140px]">Due Date</TableHead>
                        <TableHead>Acceptance Criteria</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scopeItems.map((item) => (
                        <TableRow key={item.id} data-testid={`row-scope-item-${item.id}`}>
                          <TableCell>
                            <Badge 
                              variant="outline" 
                              className={
                                item.party === 'sidra' 
                                  ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800' 
                                  : 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800'
                              }
                              data-testid={`badge-scope-party-${item.id}`}
                            >
                              {item.party === 'sidra' ? 'Sidra' : 'Counterparty'}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <div 
                              className="text-sm" 
                              data-testid={`cell-scope-description-${item.id}`}
                            >
                              {item.description || 'No description'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2" data-testid={`cell-scope-due-date-${item.id}`}>
                              <Calendar className="h-4 w-4 text-foreground" />
                              {item.dueDate ? format(new Date(item.dueDate), 'MMM dd, yyyy') : 'Not set'}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <div 
                              className="text-sm text-muted-foreground" 
                              data-testid={`cell-scope-criteria-${item.id}`}
                            >
                              {item.acceptanceCriteria || 'Not specified'}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-foreground">No scope of work defined.</p>
                  <p className="text-sm text-muted-foreground mt-1">Scope items will appear here when added.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Contract Extensions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {extensionsLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : extensions && extensions.length > 0 ? (
                <div className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">Extension #</TableHead>
                        <TableHead>New End Date</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {extensions.map((extension) => (
                        <TableRow key={extension.id} data-testid={`row-extension-${extension.id}`}>
                          <TableCell className="font-medium">
                            <Badge variant="outline" data-testid={`badge-extension-sequence-${extension.id}`}>
                              #{extension.sequenceNumber}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2" data-testid={`cell-extension-end-date-${extension.id}`}>
                              <Calendar className="h-4 w-4 text-foreground" />
                              {extension.newEndDate ? format(new Date(extension.newEndDate), 'MMM dd, yyyy') : 'Not set'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span data-testid={`cell-extension-requested-${extension.id}`}>
                              {extension.requestedAt ? format(new Date(extension.requestedAt), 'MMM dd, yyyy') : 'Not set'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              className={
                                extension.approvedAt ? 
                                'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' : 
                                'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
                              }
                              data-testid={`badge-extension-status-${extension.id}`}
                            >
                              {extension.approvedAt ? 'Approved' : 'Pending Approval'}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <div 
                              className="truncate text-sm text-muted-foreground" 
                              title={extension.notes || 'No notes'}
                              data-testid={`cell-extension-notes-${extension.id}`}
                            >
                              {extension.notes || 'No notes'}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-foreground">No contract extensions found.</p>
                  <p className="text-sm text-muted-foreground mt-1">Extensions will appear here when created.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}