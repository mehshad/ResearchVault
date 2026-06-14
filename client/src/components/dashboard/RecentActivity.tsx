import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText, CheckCircle, BookOpen, UserPlus,
  FolderPlus, FlaskConical, ClipboardList, Bell
} from "lucide-react";

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  date: string;
}

export default function RecentActivity() {
  const { data: activities, isLoading } = useQuery<ActivityItem[]>({
    queryKey: ['/api/dashboard/recent-activity'],
  });

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'irb_submission':
      case 'ibc_submission':
        return <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-500">
          <FileText className="h-5 w-5" />
        </div>;
      case 'pmo_submission':
        return <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-green-500 dark:bg-green-950">
          <ClipboardList className="h-5 w-5" />
        </div>;
      case 'project_added':
        return <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-500 dark:bg-emerald-950">
          <FolderPlus className="h-5 w-5" />
        </div>;
      case 'activity_added':
        return <div className="h-10 w-10 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-500 dark:bg-cyan-950">
          <FlaskConical className="h-5 w-5" />
        </div>;
      case 'project_approval':
        return <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-green-500 dark:bg-green-950">
          <CheckCircle className="h-5 w-5" />
        </div>;
      case 'publication_added':
        return <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-500 dark:bg-blue-950">
          <BookOpen className="h-5 w-5" />
        </div>;
      case 'staff_added':
        return <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-500 dark:bg-amber-950">
          <UserPlus className="h-5 w-5" />
        </div>;
      default:
        return <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          <Bell className="h-5 w-5" />
        </div>;
    }
  };

  const formatDate = (date: Date | string) => {
    const activityDate = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - activityDate.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const hours = activityDate.getHours();
    const minutes = activityDate.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
    const timeString = `${formattedHours}:${formattedMinutes} ${ampm}`;

    if (diffHrs < 24) {
      return `Today, ${timeString}`;
    } else if (diffDays === 1) {
      return `Yesterday, ${timeString}`;
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      const options: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      };
      return activityDate.toLocaleDateString('en-US', options);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm dark:bg-card">
        <div className="p-6 border-b border-neutral-100">
          <h2 className="font-medium text-lg">Recent Activity</h2>
        </div>
        <div className="p-6 space-y-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-start">
              <Skeleton className="h-10 w-10 rounded-full mr-4" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/4 mt-1" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm dark:bg-card">
      <div className="p-6 border-b border-neutral-100">
        <h2 className="font-medium text-lg">Recent Activity</h2>
      </div>
      <div className="p-6 divide-y divide-neutral-100">
        {(!activities || activities.length === 0) ? (
          <div className="py-8 text-center text-muted-foreground" data-testid="text-no-activity">
            <Bell className="h-8 w-8 mx-auto mb-2" />
            <p>No recent activity yet</p>
            <p className="text-xs">New records across the portal will appear here</p>
          </div>
        ) : (
          activities.map((activity) => (
            <div key={activity.id} className="py-4 flex" data-testid={`activity-${activity.id}`}>
              <div className="mr-4 flex-shrink-0">
                {getActivityIcon(activity.type)}
              </div>
              <div>
                <p className="font-medium">{activity.description}</p>
                <p className="text-sm text-muted-foreground">{activity.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatDate(activity.date)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
