import { useQuery } from "@tanstack/react-query";
import StatsCard from "@/components/dashboard/StatsCard";
import RecentProjects from "@/components/dashboard/RecentProjects";
import RecentActivity from "@/components/dashboard/RecentActivity";
import UpcomingDeadlines from "@/components/dashboard/UpcomingDeadlines";
import { DashboardStats } from "@/lib/types";
import GrantFundingByProvider from "@/components/dashboard/GrantFundingByProvider";

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
      </div>

      {/* Grants, from the widest figure inwards: everything ever submitted,
          how many of those were won, and how many are running now. Awarded is
          the lasting milestone rather than the current status, so a grant that
          was won and has since completed still counts as awarded. */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatsCard
          title="Grants Submitted (all time)"
          value={statsLoading ? 0 : stats?.grants?.submitted ?? 0}
          type="projects"
        />
        <StatsCard
          title="Awaiting a Decision"
          value={statsLoading ? 0 : stats?.grants?.underReview ?? 0}
          type="applications"
        />
        <StatsCard
          title="Awarded Grants"
          value={statsLoading ? 0 : stats?.grants?.awarded ?? 0}
          type="patents"
        />
        <StatsCard
          title="Active Grants"
          value={statsLoading ? 0 : stats?.grants?.active ?? 0}
          type="projects"
        />
      </div>

      <GrantFundingByProvider stats={stats?.grants} isLoading={statsLoading} />

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
