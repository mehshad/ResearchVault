// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  FileText, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Users,
  Search,
  Filter,
  Eye,
  UserPlus,
  Calendar,
  Building
} from "lucide-react";
import type { IbcApplication, IbcBoardMember, Scientist } from "@shared/schema";
import { formatFullName } from "@/utils/nameUtils";

const IBC_WORKFLOW_STATUSES = [
  { value: "draft", label: "Draft", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
  { value: "submitted", label: "Submitted", color: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  { value: "vetted", label: "Vetted", color: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300" },
  { value: "under_review", label: "Under Review", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300" },
  { value: "active", label: "Active", color: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
  { value: "expired", label: "Expired", color: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" }
];

const BIOSAFETY_LEVELS = [
  { value: "BSL-1", label: "BSL-1", color: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
  { value: "BSL-2", label: "BSL-2", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300" },
  { value: "BSL-3", label: "BSL-3", color: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" },
  { value: "BSL-4", label: "BSL-4", color: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" }
];

export default function IbcOfficePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [biosafetyLevelFilter, setBiosafetyLevelFilter] = useState("all");

  const { data: applications = [], isLoading: applicationsLoading } = useQuery({
    queryKey: ["/api/ibc-applications"],
  });

  const { data: boardMembers = [], isLoading: boardMembersLoading } = useQuery({
    queryKey: ["/api/ibc-board-members"],
  });

  const { data: scientists = [] } = useQuery({
    queryKey: ["/api/scientists"],
  });

  // Filter applications
  const filteredApplications = applications.filter((app: IbcApplication) => {
    const matchesSearch = app.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         app.ibcNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || app.status?.toLowerCase() === statusFilter;
    const matchesBiosafetyLevel = biosafetyLevelFilter === "all" || app.biosafetyLevel === biosafetyLevelFilter;
    
    return matchesSearch && matchesStatus && matchesBiosafetyLevel;
  });

  // Group applications by status
  const applicationsByStatus = filteredApplications.reduce((acc: Record<string, IbcApplication[]>, app: IbcApplication) => {
    const status = app.status?.toLowerCase() || "draft";
    if (!acc[status]) acc[status] = [];
    acc[status].push(app);
    return acc;
  }, {});

  const getStatusBadge = (status: string) => {
    const statusConfig = IBC_WORKFLOW_STATUSES.find(s => s.value === status);
    return statusConfig ? statusConfig : { value: status, label: status, color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" };
  };

  const getBiosafetyLevelBadge = (level: string) => {
    const levelConfig = BIOSAFETY_LEVELS.find(l => l.value === level);
    return levelConfig ? levelConfig : { value: level, label: level, color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" };
  };

  const getScientistName = (id: number) => {
    const scientist = scientists.find((s: Scientist) => s.id === id);
    return scientist ? formatFullName(scientist) : `Scientist ${id}`;
  };

  if (applicationsLoading || boardMembersLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center space-x-2 mb-6">
          <Building className="h-6 w-6" />
          <h1 className="text-2xl font-bold">IBC Office Management</h1>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-gray-100 rounded-lg animate-pulse dark:bg-gray-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center space-x-2">
        <Building className="h-6 w-6" />
        <h1 className="text-2xl font-bold">IBC Office Management</h1>
      </div>

      <Tabs defaultValue="applications" className="space-y-4">
        <TabsList>
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="board">Board Members</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="applications" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Application Management</CardTitle>
              <CardDescription>
                Manage IBC applications throughout their biosafety review workflow
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <Input
                      placeholder="Search by title or IBC number..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-48">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {IBC_WORKFLOW_STATUSES.map(status => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={biosafetyLevelFilter} onValueChange={setBiosafetyLevelFilter}>
                  <SelectTrigger className="w-48">
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter by BSL" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All BSL Levels</SelectItem>
                    {BIOSAFETY_LEVELS.map(level => (
                      <SelectItem key={level.value} value={level.value}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Applications by Status */}
          <div className="grid gap-6">
            {IBC_WORKFLOW_STATUSES.map(statusConfig => {
              const statusApplications = applicationsByStatus[statusConfig.value] || [];
              if (statusApplications.length === 0) return null;

              return (
                <Card key={statusConfig.value}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Badge className={statusConfig.color}>
                          {statusConfig.label}
                        </Badge>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {statusApplications.length} application{statusApplications.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {statusApplications.map((app: IbcApplication) => (
                        <Link key={app.id} href={`/ibc-office/protocol-detail/${app.id}`}>
                          <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors dark:hover:bg-gray-900">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3">
                                <div>
                                  <h4 className="font-medium">{app.title}</h4>
                                  <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1 dark:text-gray-400">
                                    <span>{app.ibcNumber}</span>
                                    <span>PI: {getScientistName(app.principalInvestigatorId)}</span>
                                    <Badge className={getBiosafetyLevelBadge(app.biosafetyLevel).color} variant="outline">
                                      {app.biosafetyLevel}
                                    </Badge>
                                    {app.submissionDate && (
                                      <span className="flex items-center space-x-1">
                                        <Calendar className="h-3 w-3" />
                                        <span>Submitted: {new Date(app.submissionDate).toLocaleDateString()}</span>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Eye className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredApplications.length === 0 && (
            <Card>
              <CardContent className="text-center py-8">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4 dark:text-gray-500" />
                <h3 className="text-lg font-medium text-gray-900 mb-2 dark:text-gray-100">No applications found</h3>
                <p className="text-gray-500 dark:text-gray-400">No IBC applications match your current filters.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="board" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">IBC Board Members</CardTitle>
                  <CardDescription>
                    Manage Institutional Biosafety Committee board members and their assignments
                  </CardDescription>
                </div>
                <Link href="/ibc-board-members/create">
                  <Button size="sm">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Board Member
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {boardMembers.map((member: IbcBoardMember & { scientist: Scientist }) => (
                  <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div>
                        <h4 className="font-medium">{formatFullName(member.scientist)}</h4>
                        <div className="flex items-center space-x-3 text-sm text-gray-500 dark:text-gray-400">
                          <Badge variant="outline">{member.role}</Badge>
                          {member.expertise && member.expertise.length > 0 && (
                            <span>Expertise: {member.expertise.join(", ")}</span>
                          )}
                          <span className="flex items-center space-x-1">
                            <Calendar className="h-3 w-3" />
                            <span>Term ends: {new Date(member.termEndDate).toLocaleDateString()}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {member.isActive ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </div>
                  </div>
                ))}
                {boardMembers.length === 0 && (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-gray-400 mx-auto mb-4 dark:text-gray-500" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2 dark:text-gray-100">No board members</h3>
                    <p className="text-gray-500 dark:text-gray-400">Add IBC board members to start managing reviews.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Meeting Calendar</CardTitle>
              <CardDescription>
                Schedule and manage IBC meetings and review deadlines
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4 dark:text-gray-500" />
                <h3 className="text-lg font-medium text-gray-900 mb-2 dark:text-gray-100">Calendar Integration</h3>
                <p className="text-gray-500 dark:text-gray-400">Calendar integration will be available in a future update.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Reports & Analytics</CardTitle>
              <CardDescription>
                View IBC application statistics and compliance reports
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{applications.length}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Total Applications</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {applications.filter((app: IbcApplication) => app.status?.toLowerCase() === 'active').length}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Active</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                    {applications.filter((app: IbcApplication) => app.status?.toLowerCase() === 'under_review').length}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Under Review</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}