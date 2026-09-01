import { useMemo, useState, type ReactNode } from "react";
import { CurrentUserContext } from "@/contexts/CurrentUserContext";
import { useAuth } from "@/hooks/useAuth";
import {
  DEFAULT_DEMO_ROLE,
  DUMMY_USERS,
  SUPER_ADMIN_USER,
  type DummyUser,
} from "@/lib/currentUserRoleData";

interface CurrentUserProviderProps {
  children: ReactNode;
}

// Looked up by role rather than by position: the list is derived from
// ACCESS_ROLES now, so an index would silently point at a different person the
// next time a role is added or retired.
const DEFAULT_DEMO_USER: DummyUser =
  DUMMY_USERS.find((user) => user.role === DEFAULT_DEMO_ROLE) ?? DUMMY_USERS[0];

export function CurrentUserProvider({ children }: CurrentUserProviderProps) {
  const { authConfig, user: authUser, refreshUser } = useAuth();
  const [currentUser, setCurrentUser] = useState<DummyUser>(DEFAULT_DEMO_USER);

  // Every mode except demo uses the real authenticated session. Demo alone
  // exposes the role-emulation selector.
  const hasRealAuth = authConfig.mode !== "demo";

  const effectiveUser = useMemo<DummyUser>(() => {
    if (hasRealAuth) {
      if (authUser) {
        return {
          id: authUser.id,
          name: authUser.name,
          email: authUser.email,
          role: authUser.role,
          // The session carries these and every permission check reads them
          // from here. Dropping them made the client resolve the primary role
          // alone, so an administrator whose admin is a secondary role was
          // shown a stripped-down interface over an API that allowed them
          // everything.
          secondaryRoles: authUser.secondaryRoles ?? [],
        };
      }
      return { id: 0, name: "Loading…", email: "", role: "user" };
    }
    return currentUser;
  }, [hasRealAuth, authUser, currentUser]);

  /**
   * Switching role has to reach the server, not just this context.
   *
   * The permission matrix is enforced on both sides now. If only the browser
   * knew about the switch, the interface would render one role's access while
   * every API call was answered as another — which is exactly what made the
   * selector look like it worked while changing nothing.
   */
  const updateCurrentUser = async (user: DummyUser) => {
    if (hasRealAuth) return;
    setCurrentUser(user);
    try {
      const response = await fetch("/api/auth/demo-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: user.role }),
      });
      if (!response.ok) {
        // Put the selector back rather than leaving it showing a role the
        // server never adopted.
        console.warn("Demo role switch was refused by the server.");
        setCurrentUser(currentUser);
        return;
      }
      // Pull the session back so useAuth — and every page resolving permissions
      // from it — sees the new role.
      await refreshUser();
    } catch (error) {
      console.warn("Failed to switch demo role:", error);
      setCurrentUser(currentUser);
    }
  };

  return (
    <CurrentUserContext.Provider value={{ currentUser: effectiveUser, setCurrentUser: updateCurrentUser }}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export { SUPER_ADMIN_USER };
