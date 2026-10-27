import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Program, Project, Publication, Scientist } from "@shared/schema";
import {
  PUBLICATION_YEAR_WINDOWS,
  isWithinYearWindow,
  orderPublicationsNewestFirst,
  publicationYearOf,
  yearWindowStart,
  type PublicationYearWindow,
} from "@shared/programPublications";
import { isPublished } from "@shared/publicationOrdering";
import { fetchList } from "@/lib/fetchList";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ArrowLeft, Calendar, ExternalLink, FileText, FolderOpen, Globe, Layers, Plus, Edit, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { format } from "date-fns";
import { formatFullName } from "@/utils/nameUtils";

// What /api/publications attaches to each row: the SDR it is linked to, and
// the project that SDR belongs to, which is how the row reached this program.
type ProgramPublication = Publication & {
  researchActivity?: {
    id: number;
    sdrNumber: string;
    title: string;
    projectId: number | null;
  } | null;
};

const YEAR_WINDOW_LABELS: Record<PublicationYearWindow, string> = {
  1: "1 yr",
  3: "3 yrs",
  5: "5 yrs",
  all: "All",
};

export default function ProgramDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const id = parseInt(params.id);

  const { data: program, isLoading: programLoading } = useQuery<Program>({
    queryKey: ['/api/programs', id],
    queryFn: async () => {
      const response = await fetch(`/api/programs/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch program');
      }
      return response.json();
    },
  });
  
  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ['/api/programs', id, 'projects'],
    queryFn: async () => {
      const response = await fetch(`/api/programs/${id}/projects`);
      if (!response.ok) {
        throw new Error('Failed to fetch projects');
      }
      return response.json();
    },
    enabled: !!program,
  });

  // The server resolves publication -> SDR -> project -> program, and applies
  // the same visibility rule as the publications list, so a researcher sees
  // the program's published work plus their own unpublished work and nothing
  // else. A refusal reads as an empty list rather than a blank page.
  const { data: programPublications, isLoading: publicationsLoading } = useQuery<ProgramPublication[]>({
    queryKey: ['/api/publications', { programId: id }],
    queryFn: () => fetchList<ProgramPublication>(`/api/publications?programId=${id}`),
    enabled: !!program,
  });

  const [yearWindow, setYearWindow] = useState<PublicationYearWindow>(5);

  // Published and Published * only. A program's output is what has come out,
  // and a draft or a paper under review is not that yet -- and a reader who
  // may see somebody's unpublished work here would be told about it on the
  // program page rather than on the paper, which is not where that belongs.
  const publishedPublications = useMemo(
    () => (programPublications ?? []).filter(isPublished),
    [programPublications],
  );

  const visiblePublications = useMemo(
    () =>
      orderPublicationsNewestFirst(
        publishedPublications.filter((publication) => isWithinYearWindow(publication, yearWindow)),
      ),
    [publishedPublications, yearWindow],
  );

  const projectsById = useMemo(
    () => new Map((projects ?? []).map((project) => [project.id, project])),
    [projects],
  );

  const { data: programDirector, isLoading: pdLoading } = useQuery<Scientist>({
    queryKey: ['/api/scientists', program?.programDirectorId],
    queryFn: async () => {
      if (!program?.programDirectorId) return null;
      const response = await fetch(`/api/scientists/${program.programDirectorId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch program director');
      }
      return response.json();
    },
    enabled: !!program?.programDirectorId,
  });

  const { data: researchCoLead, isLoading: rclLoading } = useQuery<Scientist>({
    queryKey: ['/api/scientists', program?.researchCoLeadId],
    queryFn: async () => {
      if (!program?.researchCoLeadId) return null;
      const response = await fetch(`/api/scientists/${program.researchCoLeadId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch research co-lead');
      }
      return response.json();
    },
    enabled: !!program?.researchCoLeadId,
  });

  const { data: clinicalCoLead1, isLoading: ccl1Loading } = useQuery<Scientist>({
    queryKey: ['/api/scientists', program?.clinicalCoLead1Id],
    queryFn: async () => {
      if (!program?.clinicalCoLead1Id) return null;
      const response = await fetch(`/api/scientists/${program.clinicalCoLead1Id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch clinical co-lead 1');
      }
      return response.json();
    },
    enabled: !!program?.clinicalCoLead1Id,
  });

  const { data: clinicalCoLead2, isLoading: ccl2Loading } = useQuery<Scientist>({
    queryKey: ['/api/scientists', program?.clinicalCoLead2Id],
    queryFn: async () => {
      if (!program?.clinicalCoLead2Id) return null;
      const response = await fetch(`/api/scientists/${program.clinicalCoLead2Id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch clinical co-lead 2');
      }
      return response.json();
    },
    enabled: !!program?.clinicalCoLead2Id,
  });

  if (programLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/programs")}>
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

  if (!program) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/programs")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">Program Not Found</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <p className="text-lg text-foreground">The program you're looking for could not be found.</p>
              <Button className="mt-4" onClick={() => navigate("/programs")}>
                Return to Programs List
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
          <Button variant="ghost" size="sm" onClick={() => navigate("/programs")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">{program.name}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <CardTitle>Program Details</CardTitle>
            {/* On the card it edits, next to the fields it changes. */}
            <Button
              size="sm"
              className="bg-sidra-teal hover:bg-sidra-teal-dark text-white font-medium shadow-sm"
              onClick={() => navigate(`/programs/${program.id}/edit`)}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">{program.name}</h2>
                <div className="text-foreground flex items-center gap-1 mt-1">
                  <Badge variant="outline" className="rounded-sm bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">{program.programId}</Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <h3 className="text-sm font-medium text-foreground">Program Director</h3>
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span>
                      {pdLoading ? (
                        <Skeleton className="h-4 w-24 inline-block" />
                      ) : programDirector ? (
                        <Button 
                          variant="link" 
                          className="p-0 h-auto text-primary-600"
                          onClick={() => navigate(`/scientists/${programDirector.id}`)}
                        >
                          {formatFullName(programDirector)}
                        </Button>
                      ) : 'Not assigned'}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-foreground">Research Co-Lead</h3>
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span>
                      {rclLoading ? (
                        <Skeleton className="h-4 w-24 inline-block" />
                      ) : researchCoLead ? (
                        <Button 
                          variant="link" 
                          className="p-0 h-auto text-primary-600"
                          onClick={() => navigate(`/scientists/${researchCoLead.id}`)}
                        >
                          {formatFullName(researchCoLead)}
                        </Button>
                      ) : 'Not assigned'}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-foreground">Clinical Co-Lead 1</h3>
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span>
                      {ccl1Loading ? (
                        <Skeleton className="h-4 w-24 inline-block" />
                      ) : clinicalCoLead1 ? (
                        <Button 
                          variant="link" 
                          className="p-0 h-auto text-primary-600"
                          onClick={() => navigate(`/scientists/${clinicalCoLead1.id}`)}
                        >
                          {formatFullName(clinicalCoLead1)}
                        </Button>
                      ) : 'Not assigned'}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-foreground">Clinical Co-Lead 2</h3>
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span>
                      {ccl2Loading ? (
                        <Skeleton className="h-4 w-24 inline-block" />
                      ) : clinicalCoLead2 ? (
                        <Button 
                          variant="link" 
                          className="p-0 h-auto text-primary-600"
                          onClick={() => navigate(`/scientists/${clinicalCoLead2.id}`)}
                        >
                          {formatFullName(clinicalCoLead2)}
                        </Button>
                      ) : 'Not assigned'}
                    </span>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-foreground">Added Date</h3>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{program.createdAt ? format(new Date(program.createdAt), 'MMM d, yyyy') : 'Not specified'}</span>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-foreground">Last Updated</h3>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{program.updatedAt ? format(new Date(program.updatedAt), 'MMM d, yyyy') : 'Not specified'}</span>
                  </div>
                </div>
              </div>

              {(program.sharepointUrl || program.websiteUrl) && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-foreground">Links</h3>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {program.sharepointUrl && (
                      <a
                        href={program.sharepointUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors text-sm dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-950"
                        data-testid="link-sharepoint"
                      >
                        <FolderOpen className="h-4 w-4" />
                        SharePoint
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {program.websiteUrl && (
                      <a
                        href={program.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-50 text-green-700 hover:bg-green-100 transition-colors text-sm dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-950"
                        data-testid="link-website"
                      >
                        <Globe className="h-4 w-4" />
                        Website
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {program.description && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-foreground">Description</h3>
                  <p className="mt-1">{program.description}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Projects</CardTitle>
              <Button size="sm" variant="outline" onClick={() => navigate("/projects/create")}>
                <Plus className="h-4 w-4 mr-2" /> Add Project
              </Button>
            </CardHeader>
            <CardContent>
              {projectsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : projects && projects.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.map((project) => (
                      <TableRow key={project.id}>
                        <TableCell>
                          <Badge variant="outline">{project.projectId}</Badge>
                        </TableCell>
                        <TableCell>
                          <Link href={`/projects/${project.id}`} className="text-primary hover:underline font-medium">
                            {project.name}
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-sm truncate">
                          {project.description || "No description available"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-4">
                  <p className="text-foreground mb-4">No projects have been added to this program yet.</p>
                  <Button variant="outline" size="sm" onClick={() => navigate("/projects/create")}>
                    <Plus className="h-4 w-4 mr-2" /> Add Project
                  </Button>
                </div>
              )}
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
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Publications</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Published papers linked to an SDR under one of this program's projects, newest first. Work still in progress is not listed.
            </p>
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={String(yearWindow)}
            onValueChange={(value) => {
              // Radix reports "" when the pressed item is pressed again; keep the window.
              if (!value) return;
              setYearWindow(value === "all" ? "all" : (Number(value) as PublicationYearWindow));
            }}
            aria-label="Years to show"
          >
            {PUBLICATION_YEAR_WINDOWS.map((window) => (
              <ToggleGroupItem key={window} value={String(window)} aria-label={YEAR_WINDOW_LABELS[window]}>
                {YEAR_WINDOW_LABELS[window]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardHeader>
        <CardContent>
          {publicationsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : publishedPublications.length === 0 ? (
            <p className="text-foreground text-center py-4">
              No published papers are linked to an SDR under this program's projects yet.
            </p>
          ) : visiblePublications.length === 0 ? (
            <p className="text-foreground text-center py-4">
              None from {yearWindowStart(yearWindow)} onwards. {publishedPublications.length} in total; choose All to see them.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-2">
                {yearWindow === "all"
                  ? `${visiblePublications.length} in total`
                  : `${visiblePublications.length} of ${publishedPublications.length} from ${yearWindowStart(yearWindow)} onwards`}
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Year</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Journal</TableHead>
                      <TableHead>SDR</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visiblePublications.map((publication) => {
                      const project = publication.researchActivity?.projectId != null
                        ? projectsById.get(publication.researchActivity.projectId)
                        : undefined;
                      return (
                        <TableRow key={publication.id}>
                          <TableCell className="tabular-nums">{publicationYearOf(publication) ?? "\u2014"}</TableCell>
                          <TableCell className="max-w-md">
                            <Link href={`/publications/${publication.id}`} className="text-primary hover:underline font-medium">
                              {publication.title}
                            </Link>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">{publication.journal || "\u2014"}</TableCell>
                          <TableCell>
                            {publication.researchActivity ? (
                              <Link href={`/research-activities/${publication.researchActivity.id}`} className="text-primary hover:underline">
                                {publication.researchActivity.sdrNumber}
                              </Link>
                            ) : "\u2014"}
                          </TableCell>
                          <TableCell>
                            {project ? (
                              <Link href={`/projects/${project.id}`} className="text-primary hover:underline">
                                {project.projectId}
                              </Link>
                            ) : "\u2014"}
                          </TableCell>
                          <TableCell>
                            {publication.status ? <Badge variant="outline">{publication.status}</Badge> : "\u2014"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}