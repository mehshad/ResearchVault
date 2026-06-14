import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { MoreVertical, ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFullName, getInitials } from "@/utils/nameUtils";

interface PersonInfo {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  profileImageInitials?: string | null;
}

interface EnhancedResearchActivity {
  id: number;
  title: string;
  status: string;
  updatedAt: string | Date;
  leadScientist?: PersonInfo | null;
  principalInvestigator?: PersonInfo | null;
}

interface RecentProjectsProps {
  limit?: number;
}

export default function RecentProjects({ limit = 5 }: RecentProjectsProps) {
  const { data: activities, isLoading, error } = useQuery<EnhancedResearchActivity[]>({
    queryKey: ['/api/dashboard/recent-projects', { limit }],
  });

  const statusColors = {
    active: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
    planning: "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
    completed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
    on_hold: "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 1) {
      return "Today";
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
    } else {
      const months = Math.floor(diffDays / 30);
      return `${months} ${months === 1 ? 'month' : 'months'} ago`;
    }
  };

  const renderPerson = (person: PersonInfo | null | undefined, label: string) => {
    if (!person) {
      return <span className="text-gray-400 dark:text-gray-500">Unassigned</span>;
    }
    
    const initials = person.profileImageInitials || getInitials(person);
    const name = formatFullName(person);
    
    return (
      <div className="flex items-center">
        <div className="h-7 w-7 rounded-full bg-primary-200 flex items-center justify-center text-xs text-primary-700 font-medium mr-2">
          {initials}
        </div>
        <span>{name}</span>
      </div>
    );
  };

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 dark:bg-card">
        <p className="text-red-500">Error loading recent activities</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm dark:bg-card">
      <div className="p-6 border-b border-neutral-100">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-lg">Recent Research Activities</h2>
          <Link href="/research-activities">
            <Button variant="link" className="text-primary-500 px-0">View All</Button>
          </Link>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: limit }).map((_, index) => (
              <div key={index} className="flex flex-col space-y-2">
                <Skeleton className="h-6 w-72" />
                <Skeleton className="h-4 w-48" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <table className="min-w-full">
              <thead>
                <tr className="bg-neutral-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Activity Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">PI</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Lead Scientist</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Update</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {activities?.map((activity) => (
                  <tr key={activity.id} data-testid={`row-activity-${activity.id}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link href={`/research-activities/${activity.id}`} className="font-medium text-gray-900 hover:text-primary-600 dark:text-gray-100">
                        {activity.title}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {renderPerson(activity.principalInvestigator, "PI")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {renderPerson(activity.leadScientist, "Lead Scientist")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full capitalize ${statusColors[activity.status.toLowerCase() as keyof typeof statusColors] || "bg-gray-100 text-gray-600"}`}>
                        {activity.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {formatDate(activity.updatedAt.toString())}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary-500">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <div className="p-4 border-t border-neutral-100 flex items-center justify-between gap-2">
              <Button variant="outline" size="sm" disabled className="text-muted-foreground">
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page 1 of 1</span>
              <Button variant="outline" size="sm" className="text-primary-500">
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
