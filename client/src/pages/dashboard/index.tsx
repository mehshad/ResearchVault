import { useQuery } from "@tanstack/react-query";
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
