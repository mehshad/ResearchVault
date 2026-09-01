import { useState } from "react";
import { Search, Bell, Menu, HelpCircle, Sun, Moon, Shield, ShieldOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { holdsAdministratorRole } from "@shared/effectiveRoles";

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { authConfig, user, refreshUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [previewPending, setPreviewPending] = useState(false);

  // Offered on what the database says you hold, not on the resolved answer:
  // while previewing you are not an administrator anywhere, and the control to
  // turn it back on would disappear with the rights.
  const canPreview = authConfig.mode !== "demo" && holdsAdministratorRole(user);
  const previewOff = user?.adminPreviewOff === true;

  const toggleAdminPreview = async () => {
    setPreviewPending(true);
    try {
      const response = await fetch("/api/auth/admin-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ off: !previewOff }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ?? "Could not change the preview.");
      }
      await refreshUser();
      // Every cached answer was given to a different set of rights.
      queryClient.clear();
      toast({
        title: previewOff ? "Administrator rights restored" : "Previewing without administrator rights",
        description: previewOff
          ? "You can see and change everything again."
          : "The interface and the API both treat you as your other roles alone. Turn it off here to get them back.",
      });
    } catch (error) {
      toast({
        title: "Could not change the preview",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setPreviewPending(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement search functionality
  };

  return (
    <header className="flex items-center justify-between h-16 px-6 border-b border-primary/30 bg-card shadow-sm">
      <div className="flex items-center md:hidden">
        <button
          className="text-primary hover:text-primary/80"
          onClick={onMenuClick}
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>

      <div className="flex items-center">
        <form onSubmit={handleSearch} className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-muted-foreground" />
          </span>
          <Input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-input rounded-lg text-sm placeholder:text-muted-foreground focus:border-primary focus:ring-primary bg-background text-foreground"
            placeholder="Search projects, people, resources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </form>
      </div>

      <div className="flex items-center space-x-4">
        {/* Administrator preview toggle — see the app without admin rights */}
        {canPreview && (
          <button
            className={
              previewOff
                ? "rounded-md bg-amber-100 px-2 py-1 text-amber-900 transition-colors hover:bg-amber-200 dark:bg-amber-950/50 dark:text-amber-200"
                : "text-primary transition-colors hover:text-primary/80"
            }
            onClick={toggleAdminPreview}
            disabled={previewPending}
            title={
              previewOff
                ? "You are previewing without administrator rights — click to restore them"
                : "Preview the application without your administrator rights"
            }
            data-testid="button-admin-preview"
          >
            {previewOff ? (
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <ShieldOff className="h-4 w-4" />
                Admin off
              </span>
            ) : (
              <Shield className="h-5 w-5" />
            )}
          </button>
        )}

        {/* Dark / light mode toggle */}
        <button
          className="text-primary hover:text-primary/80 transition-colors"
          onClick={() => {
            localStorage.setItem("theme-user-set", "true");
            setTheme(isDark ? "light" : "dark");
          }}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        <button className="text-primary hover:text-primary/80 relative">
          <Bell className="h-5 w-5" />
          <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-destructive"></span>
        </button>
        <button className="text-primary hover:text-primary/80">
          <HelpCircle className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
