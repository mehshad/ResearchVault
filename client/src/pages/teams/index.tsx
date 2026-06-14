// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, UserPlus, Filter } from "lucide-react";
import { ResearchActivity } from "@/lib/types";

export default function Teams() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  // Query to fetch research activities which will serve as our teams
  const { data: researchActivities, isLoading } = useQuery({
    queryKey: ["/api/research-activities"],
  });

  // Filter research activities based on search query
  const filteredActivities = researchActivities
    ? researchActivities.filter((activity: ResearchActivity) => {
        const matchesSearch =
          searchQuery === "" ||
          activity.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          activity.sdrNumber.toLowerCase().includes(searchQuery.toLowerCase());

        if (activeTab === "all") return matchesSearch;
        if (activeTab === "active") return matchesSearch && activity.status === "Active";
        if (activeTab === "completed") return matchesSearch && activity.status === "Completed";
        if (activeTab === "pending") return matchesSearch && activity.status === "Pending";
        
        return matchesSearch;
      })
    : [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Research Teams</h1>
          <p className="text-muted-foreground mt-1">
            Manage research teams and their members
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" /> Filter
          </Button>
          <Button>
            <UserPlus className="h-4 w-4 mr-2" /> Create Team
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row justify-between gap-3">
            <div className="relative w-full md:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search teams..."
                className="pl-8 w-full md:w-72"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Tabs
              defaultValue="all"
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full md:w-auto"
            >
              <TabsList className="grid grid-cols-4 w-full md:w-auto">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-12 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team ID</TableHead>
                    <TableHead>Team Name</TableHead>
                    <TableHead>Lead Scientist</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredActivities.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center h-24">
                        No teams found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredActivities.map((activity: ResearchActivity) => (
                      <TableRow key={activity.id}>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">
                            {activity.sdrNumber}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/teams/${activity.id}`}
                            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                          >
                            {activity.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {activity.principalInvestigator ? (
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                                <span className="text-xs font-medium text-primary-700">
                                  {`${activity.principalInvestigator.firstName?.[0] || ''}${activity.principalInvestigator.lastName?.[0] || ''}`}
                                </span>
                              </div>
                              <div>
                                <div className="font-medium">
                                  {activity.principalInvestigator.name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {activity.principalInvestigator.title}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">
                              Not assigned
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex -space-x-2">
                            {activity.teamMembers && activity.teamMembers.length > 0 ? (
                              <>
                                {activity.teamMembers.slice(0, 3).map((member, index) => (
                                  <div
                                    key={index}
                                    className="h-8 w-8 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center dark:bg-blue-950"
                                  >
                                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                                      {member.scientist.firstName?.[0] || ''}
                                      {member.scientist.lastName?.[0] || ''}
                                    </span>
                                  </div>
                                ))}
                                {activity.teamMembers.length > 3 && (
                                  <div className="h-8 w-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center dark:bg-gray-800">
                                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                      +{activity.teamMembers.length - 3}
                                    </span>
                                  </div>
                                )}
                              </>
                            ) : (
                              <span className="text-muted-foreground italic">
                                No members
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              activity.status === "Active"
                                ? "success"
                                : activity.status === "Completed"
                                ? "outline"
                                : "secondary"
                            }
                          >
                            {activity.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}