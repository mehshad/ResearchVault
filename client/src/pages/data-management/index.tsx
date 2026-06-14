import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, TableBody, TableCell, TableHead, 
  TableHeader, TableRow 
} from "@/components/ui/table";
import { EnhancedDataManagementPlan } from "@/lib/types";
import { 
  Plus, Search, MoreHorizontal, Database, 
  Share2, CalendarClock 
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PermissionWrapper } from "@/components/PermissionWrapper";
import { usePermissions } from "@/hooks/usePermissions";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export default function DataManagementList() {
  const [searchQuery, setSearchQuery] = useState("");
  const { currentUser } = useCurrentUser();

  const { data: plans, isLoading } = useQuery<EnhancedDataManagementPlan[]>({
    queryKey: ['/api/data-management-plans'],
  });

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short',
      day: 'numeric'
    });
  };

  const filteredPlans = plans?.filter(plan => {
    return (
      plan.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (plan.description && plan.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (plan.dataCollectionMethods && plan.dataCollectionMethods.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (plan.dataStoragePlan && plan.dataStoragePlan.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (plan.dataSharingPlan && plan.dataSharingPlan.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (plan.project && plan.project.title.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Data Management Plans</h1>
        <PermissionWrapper 
          currentUserRole={currentUser.role} 
          navigationItem="data-management" 
          requiredPermissions={['canAdd']}
        >
          <Link href="/data-management/create">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              New Plan
            </Button>
          </Link>
        </PermissionWrapper>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Data Management Plans</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
              <Input
                type="search"
                placeholder="Search plans..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-3">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-64" />
                    <div className="flex gap-4">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Plan Title</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Data Collection Methods</TableHead>
                  <TableHead>Storage & Sharing</TableHead>
                  <TableHead>Retention Period</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlans?.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <div className="font-medium">
                        <Link href={`/data-management/${plan.id}`}>
                          <a className="hover:text-primary-500 transition-colors">{plan.title}</a>
                        </Link>
                      </div>
                      {plan.description && (
                        <div className="text-sm text-muted-foreground mt-1 line-clamp-1">
                          {plan.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {plan.project ? (
                        <Link href={`/projects/${plan.project.id}`}>
                          <a className="text-primary-500 hover:text-primary-600 transition-colors text-sm">
                            {plan.project.title}
                          </a>
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {plan.dataCollectionMethods ? (
                          <div className="line-clamp-2">{plan.dataCollectionMethods}</div>
                        ) : (
                          "—"
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        {plan.dataStoragePlan && (
                          <div className="flex items-center text-xs">
                            <Database className="h-3 w-3 mr-1 text-blue-500" />
                            <span className="line-clamp-1">{plan.dataStoragePlan}</span>
                          </div>
                        )}
                        {plan.dataSharingPlan && (
                          <div className="flex items-center text-xs">
                            <Share2 className="h-3 w-3 mr-1 text-green-500" />
                            <span className="line-clamp-1">{plan.dataSharingPlan}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{plan.retentionPeriod || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center text-sm text-muted-foreground">
                        <CalendarClock className="h-3 w-3 mr-1" />
                        <span>{formatDate(plan.updatedAt)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <PermissionWrapper 
                        currentUserRole={currentUser.role} 
                        navigationItem="data-management" 
                        requiredPermissions={['canEdit']}
                      >
                        <Button variant="ghost" size="sm" data-testid="button-more-actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </PermissionWrapper>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredPlans?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No data management plans found matching your search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
