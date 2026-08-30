import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { RESTRICTED_USER_ROLE, RESEARCH_OFFICER_ROLE, RESEARCHER_ROLE, ACCESS_ROLES } from "@shared/constants";
import {
  allRolesOf,
  isAdministrator,
  isRestrictedOnly,
  maxAccessLevel,
  type RoleBearer,
} from "@shared/effectiveRoles";
import { useAuth } from "@/hooks/useAuth";
import {
  getOfficeDashboardDefaultAccess,
  isAdministratorRole,
  NAVIGATION_ITEMS,
} from "@/lib/navigationPermissions";

export type AccessLevel = "hide" | "view" | "edit";

export interface NavigationPermission {
  id: string;
  jobTitle: string;
  navigationItem: string;
  accessLevel: AccessLevel;
}

interface PermissionsContextType {
  permissions: NavigationPermission[];
  setPermissions: (permissions: NavigationPermission[]) => void;
  /** Access for one role — what the matrix editor asks. */
  getAccessLevel: (jobTitle: string, navigationItem: string) => AccessLevel;
  /** Access for a person, taking the union of every role they hold. */
  getEffectiveAccessLevel: (user: RoleBearer | null | undefined, navigationItem: string) => AccessLevel;
  canViewAs: (user: RoleBearer | null | undefined, navigationItem: string) => boolean;
  canEditAs: (user: RoleBearer | null | undefined, navigationItem: string) => boolean;
  canView: (jobTitle: string, navigationItem: string) => boolean;
  canEdit: (jobTitle: string, navigationItem: string) => boolean;
  canCreate: (jobTitle: string, navigationItem: string) => boolean;
  isHidden: (jobTitle: string, navigationItem: string) => boolean;
  isReadOnly: (jobTitle: string, navigationItem: string) => boolean;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

// The matrix is keyed by access role, not job title: several job titles share
// one access role, so the two lists are no longer the same set.
const MATRIX_ROLES = ACCESS_ROLES;

const createDefaultPermissions = (): NavigationPermission[] => {
  const defaultPermissions: NavigationPermission[] = [];
  MATRIX_ROLES.forEach((jobTitle) => {
    NAVIGATION_ITEMS.forEach((navItem) => {
      // Set some realistic defaults for different roles
      let defaultAccess: AccessLevel = "edit";
      
      // Investigators have limited access to office/reviewer functions
      if (jobTitle === "Investigator") {
        if (navItem.includes("-office") || navItem.includes("-reviewer")) {
          defaultAccess = "hide";
        } else if (navItem === "reports") {
          defaultAccess = "view";
        }
      }
      
      // PhD Students have more restrictions
      if (jobTitle === "PhD Student") {
        if (navItem.includes("-office") || navItem.includes("-reviewer") || 
            navItem === "contracts" || navItem === "patents") {
          defaultAccess = "hide";
        } else if (navItem === "reports" || navItem === "programs") {
          defaultAccess = "view";
        }
      }
      
      // The Research Office owns grants and contracts together. This merges the
      // former Grant Officer and Contracts Officer defaults, taking the more
      // permissive of the two wherever they differed (grants and scientists).
      if (jobTitle === RESEARCH_OFFICER_ROLE) {
        if (navItem.includes("-office") || navItem.includes("-reviewer")) {
          // Other departments' offices and reviewer screens stay hidden.
          defaultAccess = "hide";
        } else if (
          navItem === "grants" || navItem === "contracts" ||
          navItem === "programs" || navItem === "projects" ||
          navItem === "research-activities" || navItem === "scientists"
        ) {
          defaultAccess = "edit";
        } else if (navItem === "reports" || navItem === "publications" || navItem === "patents") {
          defaultAccess = "view";
        }
      }

      const officeDashboardAccess = getOfficeDashboardDefaultAccess(jobTitle, navItem);
      if (officeDashboardAccess) defaultAccess = officeDashboardAccess;
      
      defaultPermissions.push({
        id: `${jobTitle}-${navItem}`,
        jobTitle,
        navigationItem: navItem,
        accessLevel: defaultAccess
      });
    });
  });
  return defaultPermissions;
};

// Convert database permissions to frontend format
const convertDbPermissionsToFrontend = (dbPermissions: any[]): NavigationPermission[] => {
  return dbPermissions.map(p => ({
    id: `${p.jobTitle}-${p.navigationItem}`,
    jobTitle: p.jobTitle,
    navigationItem: p.navigationItem,
    accessLevel: p.accessLevel as AccessLevel
  }));
};

// Older databases can contain only a subset of the role/navigation grid.
// Keep saved choices, but fill every missing cell with the same default the
// app would use for a new installation so the access matrix remains complete.
const mergeWithDefaultPermissions = (dbPermissions: any[]): NavigationPermission[] => {
  const savedPermissions = convertDbPermissionsToFrontend(dbPermissions);
  const savedByKey = new Map(
    savedPermissions.map((permission) => [
      `${permission.jobTitle}:${permission.navigationItem}`,
      permission,
    ])
  );
  const defaults = createDefaultPermissions();
  const defaultKeys = new Set(
    defaults.map((permission) => `${permission.jobTitle}:${permission.navigationItem}`)
  );

  return [
    ...defaults.map(
      (permission) =>
        savedByKey.get(`${permission.jobTitle}:${permission.navigationItem}`) ?? permission
    ),
    // Preserve any custom role/navigation entries that are not part of the
    // standard matrix.
    ...savedPermissions.filter(
      (permission) => !defaultKeys.has(`${permission.jobTitle}:${permission.navigationItem}`)
    ),
  ];
};

// Convert frontend permissions to database format for bulk updates
const convertFrontendPermissionsToDb = (permissions: NavigationPermission[]) => {
  return permissions.map(p => ({
    jobTitle: p.jobTitle,
    navigationItem: p.navigationItem,
    accessLevel: p.accessLevel
  }));
};

interface PermissionsProviderProps {
  children: ReactNode;
}

export function PermissionsProvider({ children }: PermissionsProviderProps) {
  const [permissions, setPermissions] = useState<NavigationPermission[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const { authConfig, isAdmin } = useAuth();

  // Load permissions from database on mount
  useEffect(() => {
    const loadPermissions = async () => {
      try {
        const response = await fetch('/api/role-permissions');
        if (response.ok) {
          const dbPermissions = await response.json();
          if (dbPermissions.length > 0) {
            setPermissions(mergeWithDefaultPermissions(dbPermissions));
          } else {
            // No permissions stored yet. Use the defaults locally so the
            // interface still renders, but only an administrator may write them
            // back — seeding is a change to the access matrix, and any browser
            // being able to make it was the hole this guard closes.
            const defaults = createDefaultPermissions();
            setPermissions(defaults);
            if (isAdmin) {
              await seedDefaultPermissions(defaults);
            }
          }
        } else {
          // API failed, use defaults  
          setPermissions(createDefaultPermissions());
        }
      } catch (error) {
        console.warn('Failed to load permissions from database:', error);
        setPermissions(createDefaultPermissions());
      } finally {
        setIsLoaded(true);
      }
    };

    loadPermissions();
    // isAdmin arrives after the auth config resolves; re-run so a first-time
    // seed is still performed for an administrator.
  }, [isAdmin]);

  // Seed default permissions to database
  const seedDefaultPermissions = async (defaultPermissions: NavigationPermission[]) => {
    try {
      const dbFormat = convertFrontendPermissionsToDb(defaultPermissions);
      await fetch('/api/role-permissions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: dbFormat })
      });
    } catch (error) {
      console.warn('Failed to seed default permissions:', error);
    }
  };

  // Enhanced setPermissions that saves to database
  const setPermissionsWithPersistence = async (newPermissions: NavigationPermission[]) => {
    setPermissions(newPermissions);
    
    try {
      const dbFormat = convertFrontendPermissionsToDb(newPermissions);
      await fetch('/api/role-permissions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: dbFormat })
      });
    } catch (error) {
      console.warn('Failed to save permissions to database:', error);
    }
  };

  const getAccessLevel = (jobTitle: string, navigationItem: string): AccessLevel => {
    // Administrators always have full access — they are not in the configurable
    // permissions matrix, so we must short-circuit before the DB lookup.
    if (jobTitle === "superadmin" || jobTitle === "admin") {
      return "edit";
    }

    if (authConfig.mode !== "demo" && jobTitle === RESTRICTED_USER_ROLE) {
      return navigationItem === "publications" ? "view" : "hide";
    }

    const permission = permissions.find(p =>
      p.jobTitle === jobTitle && p.navigationItem === navigationItem
    );
    return permission?.accessLevel || "hide";
  };

  /**
   * Access for a person rather than for a single role. Someone may hold a
   * primary role plus secondaries — a Physician who is also an Investigator,
   * or anyone carrying admin as a secondary — and their access is the union.
   * Use this wherever the *current user* is being checked; getAccessLevel
   * stays the per-role answer the matrix editor needs.
   */
  const getEffectiveAccessLevel = (user: RoleBearer | null | undefined, navigationItem: string): AccessLevel => {
    if (isAdministrator(user)) return "edit";
    if (authConfig.mode !== "demo" && isRestrictedOnly(user)) {
      return navigationItem === "publications" ? "view" : "hide";
    }
    let best: AccessLevel | null = null;
    for (const role of allRolesOf(user)) {
      best = maxAccessLevel(best, getAccessLevel(role, navigationItem)) as AccessLevel | null;
    }
    return best ?? "hide";
  };

  const canViewAs = (user: RoleBearer | null | undefined, navigationItem: string): boolean => {
    const level = getEffectiveAccessLevel(user, navigationItem);
    return level === "view" || level === "edit";
  };

  const canEditAs = (user: RoleBearer | null | undefined, navigationItem: string): boolean =>
    getEffectiveAccessLevel(user, navigationItem) === "edit";

  const canView = (jobTitle: string, navigationItem: string): boolean => {
    const accessLevel = getAccessLevel(jobTitle, navigationItem);
    return accessLevel === "view" || accessLevel === "edit";
  };

  const canEdit = (jobTitle: string, navigationItem: string): boolean => {
    const accessLevel = getAccessLevel(jobTitle, navigationItem);
    return accessLevel === "edit";
  };

  const canCreate = (jobTitle: string, navigationItem: string): boolean => {
    const accessLevel = getAccessLevel(jobTitle, navigationItem);
    return accessLevel === "edit";
  };

  const isHidden = (jobTitle: string, navigationItem: string): boolean => {
    const accessLevel = getAccessLevel(jobTitle, navigationItem);
    return accessLevel === "hide";
  };

  const isReadOnly = (jobTitle: string, navigationItem: string): boolean => {
    const accessLevel = getAccessLevel(jobTitle, navigationItem);
    return accessLevel === "view";
  };

  return (
    <PermissionsContext.Provider value={{
      permissions,
      setPermissions: setPermissionsWithPersistence,
      getAccessLevel,
      getEffectiveAccessLevel,
      canViewAs,
      canEditAs,
      canView,
      canEdit,
      canCreate,
      isHidden,
      isReadOnly
    }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
}

// ── Record-level (ownership-based) access ─────────────────────────────────

export interface RecordAccessResult {
  roleAccess: AccessLevel;
  ownershipAccess: AccessLevel | null;
  effectiveAccess: AccessLevel;
}

/**
 * Standalone async function — fetches effective access for a specific record.
 * Does NOT require the PermissionsContext.
 */
export async function fetchRecordAccess(module: string, recordId: number): Promise<RecordAccessResult> {
  const res = await fetch(`/api/access-check?module=${encodeURIComponent(module)}&recordId=${recordId}`);
  if (!res.ok) throw new Error(`Failed to check access: ${res.status}`);
  return res.json();
}

/**
 * React hook — returns the effective access level for a specific record.
 * Returns { effectiveAccess, isLoading }.
 */
export function useRecordAccess(module: string, recordId: number | null): { effectiveAccess: AccessLevel | null; isLoading: boolean } {
  const [effectiveAccess, setEffectiveAccess] = useState<AccessLevel | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (recordId === null) {
      setEffectiveAccess(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    fetchRecordAccess(module, recordId)
      .then((result) => {
        if (!cancelled) setEffectiveAccess(result.effectiveAccess);
      })
      .catch(() => {
        if (!cancelled) setEffectiveAccess(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [module, recordId]);

  return { effectiveAccess, isLoading };
}