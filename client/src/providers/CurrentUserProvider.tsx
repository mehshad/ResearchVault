import { useMemo, useState, type ReactNode } from "react";
import { CurrentUserContext } from "@/contexts/CurrentUserContext";
import { useAuth } from "@/hooks/useAuth";
import { DUMMY_USERS, type DummyUser } from "@/lib/currentUserRoleData";

interface CurrentUserProviderProps {
  children: ReactNode;
}

export function CurrentUserProvider({ children }: CurrentUserProviderProps) {
  const { authConfig, user: authUser } = useAuth();
  const [currentUser, setCurrentUser] = useState<DummyUser>(DUMMY_USERS[7]);

  // LDAP and OIDC use the authenticated session identity. Demo/local modes
  // retain the client-side role selector used for testing.
  const hasRealAuth = authConfig.mode === "ldap" || authConfig.mode === "oidc";

  const effectiveUser = useMemo<DummyUser>(() => {
    if (hasRealAuth) {
      if (authUser) {
        return {
          id: authUser.id,
          name: authUser.name,
          email: authUser.email,
          role: authUser.role,
        };
      }
      return { id: 0, name: "Loading…", email: "", role: "user" };
    }
    return currentUser;
  }, [hasRealAuth, authUser, currentUser]);

  const updateCurrentUser = (user: DummyUser) => {
    if (hasRealAuth) return;
    setCurrentUser(user);
  };

  return (
    <CurrentUserContext.Provider value={{ currentUser: effectiveUser, setCurrentUser: updateCurrentUser }}>
      {children}
    </CurrentUserContext.Provider>
  );
}