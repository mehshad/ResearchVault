import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Beaker, LayoutDashboard, Users, FlaskConical, Database,
  BookOpen, Award, FileText, Table, Handshake, PieChart,
  Settings, LogOut, UserPlus, X, Shield, Biohazard, Building,
  FolderTree, FileCheck, ShieldCheck, TestTube, TrendingUp, ChevronDown, Eye,
  ClipboardList, Briefcase, ChevronLeft, ChevronRight, Home, UserCog, MessageSquarePlus
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { DUMMY_USERS, SUPER_ADMIN_USER } from "@/lib/currentUserRoleData";
import { useTheme, themes } from "@/contexts/ThemeContext";
import qbridgeLogo from "@assets/image_1767775219373.png";
import { isAdministrator, hasAnyRole } from "@shared/effectiveRoles";

interface SidebarProps {
  mobile?: boolean;
  onClose?: () => void;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export default function Sidebar({ mobile = false, onClose, onCollapsedChange }: SidebarProps) {
  const [location, navigate] = useLocation();
  // Resolved for the whole person, not the primary role alone. Access is the
  // union of every role held, and admin is normally a secondary -- reading
  // currentUser.role by itself hid menu items from people the server was
  // letting straight through to the same screens.
  const { getEffectiveAccessLevel } = usePermissions();
  const { themeName, currentLabels, isSectionVisible, isPageVisible } = useTheme();
  const { authConfig, logout, user: authUser } = useAuth();
  const { currentUser, setCurrentUser } = useCurrentUser();
  // Every mode except demo uses the role from the authenticated session.
  const hasRealAuth = authConfig.mode !== 'demo';
  const isRestrictedRealUser = hasRealAuth && authUser?.role === 'user';
  // Expose the Super Admin test identity in the role selector only in demo mode.
  const availableUsers = authConfig.mode === 'demo'
    ? [...DUMMY_USERS, SUPER_ADMIN_USER]
    : DUMMY_USERS;

  // Default scientist record for open test/demo mode (Dr. Wouter Hendrickx).
  const DEMO_SCIENTIST_ID = 48;

  // Resolve the current user to their own scientist record. Under SSO the
  // signed-in user's linked scientistId is authoritative; in open test/demo
  // mode there is no real link, so we always land on the demo scientist.
  const resolvedScientistId = hasRealAuth ? authUser?.scientistId ?? null : DEMO_SCIENTIST_ID;

  // Navigate to the current user's scientist detail page. If no scientist can
  // be resolved (SSO user with no linked record), fall back to the list so the
  // click never produces a broken/missing-id route.
  const handleUserCardClick = () => {
    if (resolvedScientistId != null) {
      navigate(`/scientists/${resolvedScientistId}`);
    } else {
      navigate('/scientists');
    }
    if (mobile && onClose) onClose();
  };

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem("sidebar-collapsed", String(next)); } catch {}
    onCollapsedChange?.(next);
  };

  // Notify parent on mount
  useEffect(() => {
    onCollapsedChange?.(collapsed);
  }, []);

  const handleUserSwitch = (userId: string) => {
    const selected = availableUsers.find((u) => u.id.toString() === userId);
    if (selected) setCurrentUser(selected);
  };

  // Simple pluralization helper
  const pluralize = (word: string): string => {
    if (word.endsWith('y') && !['a','e','i','o','u'].includes(word[word.length - 2]?.toLowerCase())) {
      return word.slice(0, -1) + 'ies';
    }
    if (word.endsWith('s') || word.endsWith('x') || word.endsWith('ch') || word.endsWith('sh')) {
      return word + 'es';
    }
    return word + 's';
  };

  // Generate initials from user name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Map href to navigation item identifier
  const getNavigationItemId = (href: string): string => {
    const pathMap: Record<string, string> = {
      "/app": "dashboard",
      "/scientists": "scientists",
      "/facilities": "facilities",
      "/pmo": "pmo",
      "/pmo/programs": "programs",
      "/pmo/projects": "projects",
      "/pmo/research-activities": "research-activities",
      "/pmo/applications": "pmo-applications",
      "/pmo/office": "pmo-office",
       "/research-office": "research-office",
      "/irb": "irb-applications",
      "/irb-office": "irb-office",
      "/irb-reviewer": "irb-reviewer",
      "/ibc": "ibc-applications",
      "/ibc-office": "ibc-office",
      "/ibc-reviewer": "ibc-reviewer",
      "/data-management": "data-management",
      "/contracts": "contracts",
      "/publications": "publications",
      "/outcome-office/overview": "outcome-office",
      "/outcome-office": "outcome-office",
      "/patents": "patents",
      "/reports": "reports",
      "/grants": "grants",
      "/certifications": "certifications",
      "/settings": "settings",
      "/management": "management"
    };
    return pathMap[href] || href.substring(1);
  };

  const navigationSections = [
    {
      title: "Dashboard",
      items: [
        {
          href: "/app",
          label: "Dashboard",
          icon: LayoutDashboard
        }
      ]
    },
    {
      title: "Management",
      items: [
        {
          href: "/management",
          label: "Management Hub",
          icon: Briefcase
        }
      ]
    },
    {
      title: "Research Management",
      items: [
        {
          href: "/scientists",
          label: "Scientists & Staff",
          icon: Users
        },
        {
          href: "/facilities",
          label: "Facilities",
          icon: Building
        },
        {
          href: "/certifications",
          label: "Certifications",
          icon: ShieldCheck
        }
      ]
    },
    {
      title: "PMO Office",
      items: [
        {
          href: "/pmo/programs",
          label: `${pluralize(currentLabels.tier1)} (${currentLabels.abbr1 || 'PRM'})`,
          icon: Beaker
        },
        {
          href: "/pmo/projects",
          label: `${pluralize(currentLabels.tier2)} (${currentLabels.abbr2 || 'PRJ'})`,
          icon: FlaskConical
        },
        {
          href: "/pmo/research-activities",
          label: `${pluralize(currentLabels.tier3)} (${currentLabels.abbr3 || 'SDR'})`,
          icon: Database
        },
        {
          href: "/pmo/applications",
          label: "PMO Applications",
          icon: ClipboardList
        },
        {
          href: "/pmo/office",
           label: "PMO Dashboard & Review",
          icon: Eye
        }
      ]
    },
    {
      title: "IRB Compliance",
      items: [
        {
          href: "/irb",
          label: "IRB Applications",
          icon: Shield
        },
        {
          href: "/irb-office",
          label: "IRB Office",
          icon: Building
        },
        {
          href: "/irb-reviewer",
          label: "IRB Reviewer",
          icon: FileCheck
        }
      ]
    },
    {
      title: "IBC Compliance",
      items: [
        {
          href: "/ibc",
          label: "IBC Applications",
          icon: Biohazard
        },
        {
          href: "/ibc-office",
          label: "IBC Office",
          icon: TestTube
        },
        {
          href: "/ibc-reviewer",
          label: "IBC Reviewer",
          icon: ShieldCheck
        }
      ]
    },
    {
      title: "Research Office",
      items: [
        {
          href: "/research-office",
          label: "Research Office Dashboard",
          icon: LayoutDashboard
        },
        {
          href: "/data-management",
          label: "Data Management Plans",
          icon: FileText
        },
        {
          href: "/contracts",
          label: "Research Contracts",
          icon: Handshake
        },
        {
          href: "/grants",
          label: "Grants Office",
          icon: PieChart
        }
      ]
    },
    {
      title: "Outcomes & Reports",
      items: [
        {
          href: "/publications",
          label: "Publications",
          icon: BookOpen
        },
        {
          href: "/outcome-office/overview",
          label: "Outcome Dashboard",
          icon: LayoutDashboard
        },
        {
          href: "/outcome-office",
          label: "Outcome Office",
          icon: Building
        },
        {
          href: "/patents",
          label: "Patents",
          icon: Award
        },
        {
          href: "/reports",
          label: "Reports",
          icon: TrendingUp
        }
      ]
    }
  ];

  const isCollapsed = !mobile && collapsed;

  return (
    <div className={mobile ? "flex flex-shrink-0 h-full" : "hidden md:flex md:flex-shrink-0"}>
      <div className={cn(
        "flex flex-col border-r border-primary/30 bg-card transition-all duration-200",
        isCollapsed ? "w-16" : "w-64",
        mobile ? "h-full w-64" : ""
      )}>
        {/* Logo/Brand */}
        <div className="relative h-28 flex items-center border-b border-primary/30 bg-primary px-2 overflow-hidden">
          {/* Full-height logo watermark — more visible when the sidebar is collapsed */}
          <img
            src={qbridgeLogo}
            alt="Q-BRIDGE Logo"
            className={cn(
              "pointer-events-none absolute inset-y-0 h-full w-auto max-w-none object-contain",
              isCollapsed
                ? "left-1/2 -translate-x-1/2 opacity-70"
                : "right-0 opacity-40 mix-blend-multiply"
            )}
          />

          {/* Text — only in expanded mode */}
          {!isCollapsed && (
            <div className="relative z-10 flex flex-col min-w-0 flex-1 ml-2 drop-shadow-sm">
              <div className="font-semibold text-sm text-white leading-tight truncate">
                Q-BRIDGE
              </div>
              <div className="text-xs text-white/90 leading-snug">
                Qatar Biomedical Research Inter-Institutional Data &amp; Governance Ecosystem
              </div>
              <div className="text-xs text-white/70 leading-tight mt-0.5 truncate">
                {themes[themeName].name}
              </div>
            </div>
          )}

          {/* Mobile close button */}
          {mobile && onClose && (
            <button
              onClick={onClose}
              className="ml-auto text-white hover:text-white/70 flex-shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          )}

          {/* Desktop collapse toggle — inline, never absolute */}
          {!mobile && (
            <button
              onClick={toggleCollapsed}
              className={cn(
                "relative z-10 flex-shrink-0 text-white/70 hover:text-white transition-colors rounded p-1 hover:bg-white/10",
                isCollapsed ? "ml-auto" : "ml-auto"
              )}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          )}
        </div>

        {/* User Info */}
        {!isCollapsed && (
          <div className="p-4 border-b border-primary/30">
            <button
              type="button"
              onClick={handleUserCardClick}
              title="View my profile"
              className="flex items-center space-x-3 mb-3 w-full text-left rounded-md p-1 -m-1 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors cursor-pointer"
              data-testid="button-user-card"
            >
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium flex-shrink-0">
                {getInitials(currentUser.name || currentUser.role)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-card-foreground truncate">{currentUser.name}</div>
                <div className="text-xs text-muted-foreground truncate">{currentUser.role}</div>
                <div className="text-xs text-muted-foreground/70 truncate">
                  {hasRealAuth
                    ? `Signed in${authConfig.providerName ? ' with ' + authConfig.providerName : ' via SSO'}`
                    : 'Role-based Testing'}
                </div>
              </div>
            </button>

            {/* Role Selector — test mode only (hidden under SSO/real auth) */}
            {!hasRealAuth && (
              <Select value={currentUser.id.toString()} onValueChange={handleUserSwitch}>
                <SelectTrigger className="w-full h-8 text-xs" data-testid="select-role">
                  <SelectValue placeholder="Switch role..." />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id.toString()} data-testid={`option-role-${user.id}`}>
                      <div className="flex items-center space-x-2">
                        <div className="h-4 w-4 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary font-medium">
                          {getInitials(user.role)}
                        </div>
                        <span>{user.role}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Collapsed user avatar */}
        {isCollapsed && (
          <div className="flex justify-center py-3 border-b border-primary/30">
            <button
              type="button"
              onClick={handleUserCardClick}
              className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium flex-shrink-0 hover:bg-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors cursor-pointer"
              title={`${currentUser.name} (${currentUser.role}) — View my profile`}
              data-testid="button-user-card-collapsed"
            >
              {getInitials(currentUser.name || currentUser.role)}
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className={cn(
          "flex-1 pt-2 pb-4",
          mobile ? "overflow-y-auto max-h-[calc(100vh-200px)]" : "overflow-y-auto"
        )}>
          <div className={cn("space-y-4", isCollapsed ? "px-1" : "px-2")}>
            {navigationSections.map((section, sectionIndex) => {
              const visibleItems = section.items.filter((item) => {
                const navItemId = getNavigationItemId(item.href);
                return getEffectiveAccessLevel(currentUser, navItemId) !== "hide" && isPageVisible(item.href);
              });

              if (!isSectionVisible(section.title) || visibleItems.length === 0) {
                return null;
              }

              return (
                <div key={section.title}>
                  {!isCollapsed && sectionIndex > 0 && (
                    <div className="px-3 py-2">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {section.title}
                      </h3>
                    </div>
                  )}
                  {isCollapsed && sectionIndex > 0 && (
                    <div className="border-t border-primary/20 mx-2 my-1" />
                  )}
                  <div className={sectionIndex === 0 ? "space-y-1" : "space-y-1 mt-1"}>
                    {visibleItems.map((item) => {
                      const navItemId = getNavigationItemId(item.href);
                      const itemIsReadOnly = getEffectiveAccessLevel(currentUser, navItemId) === "view";
                      const IconComponent = item.icon;

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => {
                            if (mobile && onClose) onClose();
                          }}
                          title={isCollapsed ? item.label : undefined}
                          className={cn(
                            "flex items-center rounded-lg transition-colors",
                            isCollapsed ? "justify-center px-2 py-2" : "px-3 py-2 text-sm",
                            location === item.href
                              ? "bg-primary text-primary-foreground font-medium shadow-sm"
                              : "text-card-foreground hover:bg-primary/10 hover:text-primary",
                            itemIsReadOnly && "opacity-80"
                          )}
                        >
                          <IconComponent className={cn("w-4 h-4 flex-shrink-0", !isCollapsed && "mr-3")} />
                          {!isCollapsed && (
                            <>
                              <span className="flex-1">{item.label}</span>
                              {itemIsReadOnly && (
                                <Eye className="w-3 h-3 ml-2 opacity-60" />
                              )}
                            </>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </nav>

        {/* Bottom Nav */}
        <div className={cn(
          "border-t border-primary/30",
          isCollapsed ? "py-3 px-1" : "p-4",
          mobile ? "flex-shrink-0" : ""
        )}>
          {isCollapsed ? (
            // Icon-only column layout
            <div className="flex flex-col items-center space-y-2">
              {!isRestrictedRealUser && (
                <Link href="/" title="Home">
                  <button className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                    <Home className="w-4 h-4" />
                  </button>
                </Link>
              )}
              {!isRestrictedRealUser && <Link href="/feature-requests" title="Feature Request" onClick={() => { if (mobile && onClose) onClose(); }}>
                <button
                  className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  data-testid="link-feature-requests"
                >
                  <MessageSquarePlus className="w-4 h-4" />
                </button>
              </Link>}
              {hasAnyRole(currentUser, ['admin', 'superadmin', 'Management']) && (
                <>
                  <Link href="/settings/users" title="Manage Users" onClick={() => { if (mobile && onClose) onClose(); }}>
                    <button className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                      <UserCog className="w-4 h-4" />
                    </button>
                  </Link>
                  <Link href="/settings" title="Settings" onClick={() => { if (mobile && onClose) onClose(); }}>
                    <button className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                      <Settings className="w-4 h-4" />
                    </button>
                  </Link>
                </>
              )}
              <button
                type="button"
                onClick={() => { void logout(); }}
                title="Logout"
                className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors bg-transparent border-0"
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            // Expanded: icon row with labels
            <div className="flex items-center justify-around">
              {!isRestrictedRealUser && (
                <Link href="/" title="Home">
                  <button className="flex flex-col items-center gap-0.5 text-muted-foreground hover:text-primary transition-colors p-1">
                    <Home className="w-4 h-4" />
                    <span className="text-[10px]">Home</span>
                  </button>
                </Link>
              )}
              {!isRestrictedRealUser && <Link href="/feature-requests" title="Feature Request" onClick={() => { if (mobile && onClose) onClose(); }}>
                <button
                  className="flex flex-col items-center gap-0.5 text-muted-foreground hover:text-primary transition-colors p-1"
                  data-testid="link-feature-requests"
                >
                  <MessageSquarePlus className="w-4 h-4" />
                  <span className="text-[10px]">Request</span>
                </button>
              </Link>}
              {hasAnyRole(currentUser, ['admin', 'superadmin', 'Management']) && (
                <>
                  <Link href="/settings/users" onClick={() => { if (mobile && onClose) onClose(); }}>
                    <button className="flex flex-col items-center gap-0.5 text-muted-foreground hover:text-primary transition-colors p-1">
                      <UserCog className="w-4 h-4" />
                      <span className="text-[10px]">Users</span>
                    </button>
                  </Link>
                  <Link href="/settings" onClick={() => { if (mobile && onClose) onClose(); }}>
                    <button className="flex flex-col items-center gap-0.5 text-muted-foreground hover:text-primary transition-colors p-1">
                      <Settings className="w-4 h-4" />
                      <span className="text-[10px]">Settings</span>
                    </button>
                  </Link>
                </>
              )}
              <button
                type="button"
                onClick={() => { void logout(); }}
                className="flex flex-col items-center gap-0.5 text-muted-foreground hover:text-destructive transition-colors p-1 bg-transparent border-0"
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-[10px]">Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
