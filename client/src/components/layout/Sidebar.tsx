import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  Beaker, LayoutDashboard, Users, FlaskConical, Database, 
  BookOpen, Award, FileText, Table, Handshake, PieChart,
  Settings, LogOut, UserPlus, X, Shield, Biohazard, Building,
  FolderTree, FileCheck, ShieldCheck, TestTube, TrendingUp, ChevronDown, Eye,
  ClipboardList, Briefcase
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentUser, DUMMY_USERS } from "@/hooks/useCurrentUser";
import { useTheme, themes } from "@/contexts/ThemeContext";
import qbridgeLogo from "@assets/image_1767775219373.png";

interface SidebarProps {
  mobile?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ mobile = false, onClose }: SidebarProps) {
  const [location] = useLocation();
  const { isHidden, isReadOnly } = usePermissions();
  const { themeName, currentLabels, isSectionVisible } = useTheme();
  const { authConfig, logout } = useAuth();
  const { currentUser, setCurrentUser } = useCurrentUser();
  const ssoEnabled = authConfig.ssoEnabled;
  const availableUsers = DUMMY_USERS;

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
      "/irb": "irb-applications",
      "/irb-office": "irb-office",
      "/irb-reviewer": "irb-reviewer",
      "/ibc": "ibc-applications",
      "/ibc-office": "ibc-office",
      "/ibc-reviewer": "ibc-reviewer",
      "/data-management": "data-management",
      "/contracts": "contracts",
      "/publications": "publications",
      "/outcome-office": "outcome-office",
      "/patents": "patents",
      "/reports": "reports",
      "/grants": "grants",
      "/certifications": "certifications",
      "/settings": "settings"
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
          icon: <LayoutDashboard className="w-4 h-4 mr-3" />
        }
      ]
    },
    {
      title: "Research Management",
      items: [
        { 
          href: "/scientists",
          label: "Scientists & Staff",
          icon: <Users className="w-4 h-4 mr-3" />
        },
        { 
          href: "/facilities",
          label: "Facilities",
          icon: <Building className="w-4 h-4 mr-3" />
        },
        { 
          href: "/certifications",
          label: "Certifications",
          icon: <ShieldCheck className="w-4 h-4 mr-3" />
        }
      ]
    },
    {
      title: "PMO Office",
      items: [
        { 
          href: "/pmo/programs",
          label: `${pluralize(currentLabels.tier1)} (${currentLabels.abbr1 || 'PRM'})`,
          icon: <Beaker className="w-4 h-4 mr-3" />
        },
        { 
          href: "/pmo/projects",
          label: `${pluralize(currentLabels.tier2)} (${currentLabels.abbr2 || 'PRJ'})`,
          icon: <FlaskConical className="w-4 h-4 mr-3" />
        },
        { 
          href: "/pmo/research-activities",
          label: `${pluralize(currentLabels.tier3)} (${currentLabels.abbr3 || 'SDR'})`,
          icon: <Database className="w-4 h-4 mr-3" />
        },
        { 
          href: "/pmo/applications",
          label: "PMO Applications",
          icon: <ClipboardList className="w-4 h-4 mr-3" />
        },
        { 
          href: "/pmo/office",
          label: "PMO Office Review",
          icon: <Eye className="w-4 h-4 mr-3" />
        }
      ]
    },
    {
      title: "IRB Compliance",
      items: [
        { 
          href: "/irb",
          label: "IRB Applications",
          icon: <Shield className="w-4 h-4 mr-3" />
        },
        { 
          href: "/irb-office",
          label: "IRB Office",
          icon: <Building className="w-4 h-4 mr-3" />
        },
        { 
          href: "/irb-reviewer",
          label: "IRB Reviewer",
          icon: <FileCheck className="w-4 h-4 mr-3" />
        }
      ]
    },
    {
      title: "IBC Compliance",
      items: [
        { 
          href: "/ibc",
          label: "IBC Applications",
          icon: <Biohazard className="w-4 h-4 mr-3" />
        },
        { 
          href: "/ibc-office",
          label: "IBC Office",
          icon: <TestTube className="w-4 h-4 mr-3" />
        },
        { 
          href: "/ibc-reviewer",
          label: "IBC Reviewer",
          icon: <ShieldCheck className="w-4 h-4 mr-3" />
        }
      ]
    },
    {
      title: "Research Data Management",
      items: [
        { 
          href: "/data-management",
          label: "Data Management Plans",
          icon: <FileText className="w-4 h-4 mr-3" />
        },
        { 
          href: "/contracts",
          label: "Research Contracts",
          icon: <Handshake className="w-4 h-4 mr-3" />
        },
        { 
          href: "/grants",
          label: "Grants Office",
          icon: <PieChart className="w-4 h-4 mr-3" />
        }
      ]
    },
    {
      title: "Outcomes & Reports",
      items: [
        { 
          href: "/publications",
          label: "Publications",
          icon: <BookOpen className="w-4 h-4 mr-3" />
        },
        { 
          href: "/outcome-office",
          label: "Outcome Office",
          icon: <Building className="w-4 h-4 mr-3" />
        },
        { 
          href: "/patents",
          label: "Patents",
          icon: <Award className="w-4 h-4 mr-3" />
        },
        { 
          href: "/reports",
          label: "Reports",
          icon: <TrendingUp className="w-4 h-4 mr-3" />
        }
      ]
    }
  ];

  return (
    <div className={mobile ? "flex flex-shrink-0 h-full" : "hidden md:flex md:flex-shrink-0"}>
      <div className={cn(
        "flex flex-col w-64 border-r border-primary/30 bg-card",
        mobile ? "h-full" : ""
      )}>
        {/* Logo/Brand */}
        <div className="h-20 flex items-center justify-between px-2 border-b border-primary/30 bg-primary">
          <div className="flex items-center space-x-2 w-full">
            <img 
              src={qbridgeLogo} 
              alt="Q-BRIDGE Logo" 
              className="h-16 w-16 flex-shrink-0"
            />
            <div className="flex flex-col min-w-0 flex-1">
              <div className="font-semibold text-sm text-white leading-tight">
                Q-BRIDGE
              </div>
              <div className="text-xs text-white/90 leading-tight">
                Qatar Biomedical Research Inter-Institutional Data & Governance Ecosystem
              </div>
              <div className="text-xs text-white/70 leading-tight mt-0.5">
                {themes[themeName].name}
              </div>
            </div>
          </div>
          {mobile && onClose && (
            <button 
              onClick={onClose}
              className="text-white hover:text-sidra-teal-light"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* User Info */}
        <div className="p-4 border-b border-primary/30">
          <div className="flex items-center space-x-3 mb-3">
            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium flex-shrink-0">
              {getInitials(currentUser.name || currentUser.role)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-card-foreground truncate">{currentUser.name}</div>
              <div className="text-xs text-muted-foreground truncate">{currentUser.role}</div>
              <div className="text-xs text-muted-foreground/70 truncate">
                {ssoEnabled
                  ? `Signed in${authConfig.providerName ? ' with ' + authConfig.providerName : ' via SSO'}`
                  : 'Role-based Testing'}
              </div>
            </div>
          </div>

          {/* Role Selector — test mode only (hidden under SSO/real auth) */}
          {!ssoEnabled && (
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

        {/* Navigation */}
        <nav className={cn(
          "flex-1 pt-2 pb-4",
          mobile ? "overflow-y-auto max-h-[calc(100vh-200px)]" : "overflow-y-auto"
        )}>
          <div className="px-2 space-y-4">
            {navigationSections.map((section, sectionIndex) => (
              <div key={section.title}>
                {sectionIndex > 0 && (
                  <div className="px-3 py-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {section.title}
                    </h3>
                  </div>
                )}
                {isSectionVisible(section.title) && (
                <div className={sectionIndex === 0 ? "space-y-1" : "space-y-1 mt-1"}>
                  {section.items
                    .filter((item) => {
                      const navItemId = getNavigationItemId(item.href);
                      return !isHidden(currentUser.role, navItemId);
                    })
                    .map((item) => {
                      const navItemId = getNavigationItemId(item.href);
                      const itemIsReadOnly = isReadOnly(currentUser.role, navItemId);
                      
                      return (
                        <Link 
                          key={item.href} 
                          href={item.href}
                          onClick={() => {
                            // Close mobile menu when navigation item is clicked
                            if (mobile && onClose) {
                              onClose();
                            }
                          }}
                          className={cn(
                            "flex items-center px-3 py-2 text-sm rounded-lg transition-colors",
                            location === item.href 
                              ? "bg-primary text-primary-foreground font-medium shadow-sm" 
                              : "text-card-foreground hover:bg-primary/10 hover:text-primary",
                            itemIsReadOnly && "opacity-80"
                          )}
                        >
                          {item.icon}
                          <span className="flex-1">{item.label}</span>
                          {itemIsReadOnly && (
                            <Eye className="w-3 h-3 ml-2 opacity-60" />
                          )}
                        </Link>
                      );
                    })}
                </div>
                )}
              </div>
            ))}
          </div>
        </nav>
        
        {/* Bottom Nav */}
        <div className={cn(
          "border-t border-primary/30 p-4",
          mobile ? "flex-shrink-0" : ""
        )}>
          <div className="flex items-center">
            {(currentUser.role === 'admin' || currentUser.role === 'superadmin') && (
              <>
                <Link
                  href="/settings/users"
                  className="flex items-center text-sm text-muted-foreground hover:text-primary cursor-pointer"
                  onClick={() => { if (mobile && onClose) onClose(); }}
                >
                  <Users className="w-4 h-4 mr-2" />
                  Users
                </Link>
                <div className="border-l border-primary/30 h-5 mx-3"></div>
              </>
            )}
            <Link
              href="/settings"
              className="flex items-center text-sm text-muted-foreground hover:text-primary cursor-pointer"
              onClick={() => {
                if (mobile && onClose) {
                  onClose();
                }
              }}
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Link>
            <div className="border-l border-primary/30 h-5 mx-3"></div>
            <button
              type="button"
              onClick={() => { void logout(); }}
              className="flex items-center text-sm text-muted-foreground hover:text-primary cursor-pointer bg-transparent border-0 p-0"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
