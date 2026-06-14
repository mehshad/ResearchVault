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
import { Badge } from "@/components/ui/badge";
import { EnhancedPatent } from "@/lib/types";
import { Plus, Search, MoreHorizontal, Calendar, Award } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function PatentsList() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: patents, isLoading } = useQuery<EnhancedPatent[]>({
    queryKey: ['/api/patents'],
  });

  const formatDate = (date: string | Date | undefined) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short',
      day: 'numeric'
    });
  };

  const statusColors = {
    filed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    granted: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    rejected: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
    "in preparation": "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
  };

  const filteredPatents = patents?.filter(patent => {
    return (
      patent.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patent.inventors.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (patent.patentNumber && patent.patentNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (patent.description && patent.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Patents</h1>
        <Link href="/patents/create">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
            Add Patent
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Registered Patents</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
              <Input
                type="search"
                placeholder="Search patents..."
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
                  <TableHead className="w-[40%]">Title & Inventors</TableHead>
                  <TableHead>Patent Number</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPatents?.map((patent) => (
                  <TableRow key={patent.id}>
                    <TableCell>
                      <div className="font-medium">
                        <Link href={`/patents/${patent.id}`}>
                          <a className="hover:text-primary-500 transition-colors">{patent.title}</a>
                        </Link>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {patent.inventors}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Award className="h-4 w-4 mr-2 text-amber-500" />
                        <span>{patent.patentNumber || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {patent.filingDate && (
                          <div className="flex items-center mb-1">
                            <Calendar className="h-3 w-3 mr-1 text-muted-foreground" />
                            <span>Filed: {formatDate(patent.filingDate)}</span>
                          </div>
                        )}
                        {patent.grantDate && (
                          <div className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1 text-muted-foreground" />
                            <span>Granted: {formatDate(patent.grantDate)}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {patent.project ? (
                        <Link href={`/projects/${patent.project.id}`}>
                          <a className="text-primary-500 hover:text-primary-600 transition-colors text-sm">
                            {patent.project.title}
                          </a>
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {patent.status && (
                        <Badge 
                          variant="outline"
                          className={`capitalize ${statusColors[patent.status.toLowerCase() as keyof typeof statusColors] || "bg-gray-100 text-gray-600"}`}
                        >
                          {patent.status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredPatents?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No patents found matching your search.
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
