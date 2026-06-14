import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight } from "lucide-react";
import { Deadline } from "@/lib/types";

export default function UpcomingDeadlines() {
  const { data: deadlines, isLoading, error } = useQuery<Deadline[]>({
    queryKey: ['/api/dashboard/upcoming-deadlines'],
  });

  const formatDate = (dateString: string | Date) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return {
        month: 'N/A',
        day: 0
      };
    }
    return {
      month: date.toLocaleString('default', { month: 'short' }),
      day: date.getDate()
    };
  };

  const getRemainingDaysText = (dueDate: string | Date) => {
    const today = new Date();
    const deadline = new Date(dueDate);
    if (isNaN(deadline.getTime())) {
      return "Invalid date";
    }
    const diffTime = Math.abs(deadline.getTime() - today.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return "Due today";
    } else if (diffDays === 1) {
      return "1 day left";
    } else if (diffDays <= 7) {
      return `${diffDays} days left`;
    } else if (diffDays <= 14) {
      return "1 week left";
    } else if (diffDays <= 30) {
      return `${Math.floor(diffDays / 7)} weeks left`;
    } else {
      return `${Math.floor(diffDays / 30)} months left`;
    }
  };

  const getStatusColor = (dueDate: string | Date) => {
    const today = new Date();
    const deadline = new Date(dueDate);
    if (isNaN(deadline.getTime())) {
      return "bg-neutral-50 text-muted-foreground";
    }
    const diffTime = deadline.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 3) {
      return "bg-red-50 text-red-500 dark:bg-red-950"; // Urgent
    } else if (diffDays <= 10) {
      return "bg-yellow-50 text-yellow-500 dark:bg-yellow-950"; // Warning
    } else {
      return "bg-blue-50 text-blue-500 dark:bg-blue-950"; // Info
    }
  };

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 dark:bg-card">
        <p className="text-red-500">Error loading upcoming deadlines</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm dark:bg-card">
      <div className="p-6 border-b border-neutral-100">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-lg">Upcoming Deadlines</h2>
          <Button variant="link" className="text-primary-500 px-0">View Calendar</Button>
        </div>
      </div>
      
      {isLoading ? (
        <div className="p-6 space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-start">
              <Skeleton className="h-16 w-16 rounded mr-4" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <Skeleton className="h-8 w-24 rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="p-6 divide-y divide-neutral-100">
          {deadlines?.map((deadline) => {
            const { month, day } = formatDate(deadline.dueDate);
            const statusColor = getStatusColor(deadline.dueDate);
            const remainingText = getRemainingDaysText(deadline.dueDate);
            
            return (
              <div key={deadline.id} className="py-4 flex justify-between items-center">
                <div className="flex items-start">
                  <div className={`mr-4 px-3 py-2 rounded ${statusColor.replace('text', 'bg').replace('500', '100')} text-center min-w-[60px]`}>
                    <div className="text-xs text-muted-foreground uppercase">{month}</div>
                    <div className={`text-xl font-semibold ${statusColor.replace('bg', 'text')}`}>{day}</div>
                  </div>
                  <div>
                    <p className="font-medium">{deadline.title}</p>
                    <p className="text-sm text-muted-foreground">{deadline.description}</p>
                  </div>
                </div>
                <div className="flex items-center">
                  <span className={`px-2 py-1 text-xs rounded-full ${statusColor} mr-2`}>
                    {remainingText}
                  </span>
                  <Button variant="ghost" size="icon" className="text-primary-500">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
