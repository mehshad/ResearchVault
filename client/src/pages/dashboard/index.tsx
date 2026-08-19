import { useQuery } from "@tanstack/react-query";
import { PauseCircle } from "lucide-react";
import StatsCard from "@/components/dashboard/StatsCard";
import RecentProjects from "@/components/dashboard/RecentProjects";
import RecentActivity from "@/components/dashboard/RecentActivity";
import UpcomingDeadlines from "@/components/dashboard/UpcomingDeadlines";
import { DashboardStats } from "@/lib/types";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['/api/dashboard/stats'],
  });

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
      </div>

      <div
        className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        role="status"
        data-testid="notice-compliance-on-hold"
      >
        <PauseCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-medium">IRB and IBC services are currently on hold</p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
            Applications and compliance workflows for these modules are temporarily unavailable.
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatsCard 
          title="Active Research Activities"
          value={statsLoading ? 0 : stats?.activeResearchActivities || 0}
          type="projects" 
        />
        <StatsCard 
          title="Publications" 
          value={statsLoading ? 0 : stats?.publications || 0} 
          type="publications" 
        />
        <StatsCard 
          title="Patents" 
          value={statsLoading ? 0 : stats?.patents || 0} 
          type="patents" 
        />
      </div>

      {/* Projects & Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Projects */}
        <div className="lg:col-span-2">
          <RecentProjects limit={4} />
        </div>

        {/* Recent Activity */}
        <div>
          <RecentActivity />
        </div>
      </div>

      {/* Upcoming Deadlines */}
      <div>
        <UpcomingDeadlines />
      </div>
    </div>
  );
}
