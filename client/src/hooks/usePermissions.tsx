import { createContext, useContext, useState, ReactNode, useEffect } from "react";

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
  getAccessLevel: (jobTitle: string, navigationItem: string) => AccessLevel;
  canView: (jobTitle: string, navigationItem: string) => boolean;
  canEdit: (jobTitle: string, navigationItem: string) => boolean;
  canCreate: (jobTitle: string, navigationItem: string) => boolean;
  isHidden: (jobTitle: string, navigationItem: string) => boolean;
  isReadOnly: (jobTitle: string, navigationItem: string) => boolean;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

const JOB_TITLES = [
  "Investigator",
  "Staff Scientist", 
  "Physician",
  "Research Specialist",
  "Research Associate",
  "Research Assistant",
  "Lab Manager",
  "Postdoctoral Researcher",
  "PhD Student",
  "Management",
  "IRB Board Member",
  "IBC Board Member", 
  "PMO Officer",
  "IRB Officer",
  "IBC Officer",
  "Outcome Officer",
  "Grant Officer",
  "Contracts Officer",
  "IT Officer"
];

const NAVIGATION_ITEMS = [
  "dashboard", "scientists", "facilities", "programs", "projects", "research-activities",
  "irb-applications", "irb-office", "irb-reviewer", "ibc-applications", "ibc-office", 
  "ibc-reviewer", "data-management", "contracts", "publications", "outcome-office", "patents", "reports", "grants"
];

const createDefaultPermissions = (): NavigationPermission[] => {
  const defaultPermissions: NavigationPermission[] = [];
  JOB_TITLES.forEach((jobTitle) => {
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
      
      // Grant Officer has specialized access
      if (jobTitle === "Grant Officer") {
        if (navItem.includes("-office") || navItem.includes("-reviewer")) {
          // Hide other department offices/reviewer functions
          if (navItem !== "grants") {
            defaultAccess = "hide";
          }
        } else if (navItem === "grants" || navItem === "contracts" || navItem === "programs" || navItem === "projects") {
          // Full access to grants and related areas
          defaultAccess = "edit";
        } else if (navItem === "reports" || navItem === "publications" || navItem === "patents") {
          // View access to reports and research outputs
          defaultAccess = "view";
        }
      }
      
      // Contracts Officer has specialized access
      if (jobTitle === "Contracts Officer") {
        if (navItem.includes("-office") || navItem.includes("-reviewer")) {
          // Hide other department offices/reviewer functions
          defaultAccess = "hide";
        } else if (navItem === "contracts" || navItem === "programs" || navItem === "projects" || navItem === "research-activities") {
          // Full access to contracts and related areas
          defaultAccess = "edit";
        } else if (navItem === "reports" || navItem === "publications" || navItem === "patents" || navItem === "grants" || navItem === "scientists") {
          // View access to reports and research outputs
          defaultAccess = "view";
        }
      }
      
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

  // Load permissions from database on mount
  useEffect(() => {
    const loadPermissions = async () => {
      try {
        const response = await fetch('/api/role-permissions');
        if (response.ok) {
          const dbPermissions = await response.json();
          if (dbPermissions.length > 0) {
            setPermissions(convertDbPermissionsToFrontend(dbPermissions));
          } else {
            // No permissions in database, seed with defaults
            const defaults = createDefaultPermissions();
            setPermissions(defaults);
            await seedDefaultPermissions(defaults);
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
  }, []);

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
    const permission = permissions.find(p => 
      p.jobTitle === jobTitle && p.navigationItem === navigationItem
    );
    return permission?.accessLevel || "edit"; // Default to edit if not found
  };

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
    return accessLevel === "edit" || accessLevel === "create";
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