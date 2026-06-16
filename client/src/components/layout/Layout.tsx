import { useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { DatabaseStatus } from "../DatabaseStatus";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleMobileSidebar = () => {
    setMobileSidebarOpen(prev => !prev);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile sidebar */}
      <div className={cn(
        "fixed inset-0 z-40 flex md:hidden",
        mobileSidebarOpen ? "block" : "hidden"
      )}>
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={toggleMobileSidebar}></div>
        <div className="relative flex-1 flex flex-col max-w-xs w-full bg-card h-full">
          <Sidebar mobile={true} onClose={toggleMobileSidebar} />
        </div>
      </div>

      {/* Desktop sidebar */}
      <Sidebar onCollapsedChange={setSidebarCollapsed} />

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Header onMenuClick={toggleMobileSidebar} />

        <main className="flex-1 overflow-y-auto p-6 bg-background">
          <DatabaseStatus />
          {children}
        </main>
      </div>
    </div>
  );
}
