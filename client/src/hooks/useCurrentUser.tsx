/**
 * useCurrentUser — role-emulation for open/test deployments.
 *
 * When SSO is OFF (AUTH_MODE=demo or local, i.e. the Replit test instances),
 * this provides a client-side role selector backed by DUMMY_USERS so testers
 * can switch roles freely without logging in — roles are NOT linked to auth.
 *
 * When SSO is ON (AUTH_MODE=ldap or oidc, i.e. the on-prem deployment), the
 * real authenticated session user is the single source of identity and the
 * dummy users are ignored.
 */
import { createContext, useContext, useState, ReactNode, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";

interface DummyUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface CurrentUserContextType {
  currentUser: DummyUser;
  setCurrentUser: (user: DummyUser) => void;
}

const CurrentUserContext = createContext<CurrentUserContextType | undefined>(undefined);

// Dummy users for development/testing (not in database)
const DUMMY_USERS: DummyUser[] = [
  { id: 1, name: 'Dr. Sarah Chen', email: 's.chen@research.org', role: 'Investigator' },
  { id: 2, name: 'Dr. Michael Rodriguez', email: 'm.rodriguez@research.org', role: 'Staff Scientist' },
  { id: 3, name: 'Dr. Emily Hassan', email: 'e.hassan@research.org', role: 'Physician' },
  { id: 4, name: 'Dr. James Wilson', email: 'j.wilson@research.org', role: 'Staff Scientist' },
  { id: 5, name: 'Lisa Thompson', email: 'l.thompson@research.org', role: 'Lab Manager' },
  { id: 6, name: 'Dr. Alex Kumar', email: 'a.kumar@research.org', role: 'Postdoctoral Researcher' },
  { id: 7, name: 'Maria Santos', email: 'm.santos@research.org', role: 'PhD Student' },
  { id: 8, name: 'Iris Administrator', email: 'iris.admin@research.org', role: 'Management' },
  { id: 9, name: 'Dr. Jennifer Park', email: 'j.park@research.org', role: 'IRB Board Member' },
  { id: 10, name: 'Dr. Robert Kim', email: 'r.kim@research.org', role: 'IBC Board Member' },
  { id: 11, name: 'Jessica Morgan', email: 'j.morgan@research.org', role: 'Outcome Officer' },
  { id: 12, name: 'Sarah Chen (PMO)', email: 'sarah.chen@research.org', role: 'PMO Officer' },
  { id: 13, name: 'Jennifer Park (IRB)', email: 'jennifer.park@research.org', role: 'IRB Officer' },
  { id: 14, name: 'Lisa Wong (IBC)', email: 'lisa.wong@research.org', role: 'IBC Officer' },
  { id: 15, name: 'Sarah Mitchell', email: 'sarah.mitchell@example.com', role: 'Grant Officer' },
  { id: 16, name: 'David Thompson', email: 'd.thompson@research.org', role: 'Contracts Officer' },
];

interface CurrentUserProviderProps {
  children: ReactNode;
}

export function CurrentUserProvider({ children }: CurrentUserProviderProps) {
  const { authConfig, user: authUser } = useAuth();
  const [currentUser, setCurrentUser] = useState<DummyUser>(DUMMY_USERS[7]); // Default to Management role

  // When SSO (ldap/oidc) is enabled, the real session user is the single source
  // of identity and the role-emulation dummy users are ignored.
  const effectiveUser = useMemo<DummyUser>(() => {
    if (authConfig.ssoEnabled) {
      if (authUser) {
        return {
          id: authUser.id,
          name: authUser.name,
          email: authUser.email,
          role: authUser.role,
        };
      }
      // No real session yet — return a neutral placeholder so consumers don't
      // accidentally render with elevated dummy permissions.
      return { id: 0, name: 'Loading…', email: '', role: 'user' };
    }
    return currentUser;
  }, [authConfig.ssoEnabled, authUser, currentUser]);

  const updateCurrentUser = (user: DummyUser) => {
    if (authConfig.ssoEnabled) return; // ignore role-switching under SSO
    setCurrentUser(user);
  };

  return (
    <CurrentUserContext.Provider value={{ currentUser: effectiveUser, setCurrentUser: updateCurrentUser }}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser() {
  const context = useContext(CurrentUserContext);
  if (context === undefined) {
    throw new Error('useCurrentUser must be used within a CurrentUserProvider');
  }
  return context;
}

export { DUMMY_USERS };
export type { DummyUser };
