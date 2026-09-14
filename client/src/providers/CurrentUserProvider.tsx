import { useMemo, type ReactNode } from "react";
import { CurrentUserContext } from "@/contexts/CurrentUserContext";
import { useAuth } from "@/hooks/useAuth";
import type { DummyUser } from "@/lib/currentUserRoleData";

/**
 * The signed-in user, in the shape every client authorisation check reads.
 *
 * There used to be a second, emulated identity here for demo mode: a role
 * the selector changed in React state while the session held another, so the
 * interface and the API could disagree about who you were. Demo is real
 * seeded accounts now -- switching is a real sign-in -- so this simply
 * mirrors the authenticated session, and there is one answer to who you are.
 */
export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const { user: authUser } = useAuth();

  const currentUser = useMemo<DummyUser>(() => {
    if (!authUser) return { id: 0, name: "Loading…", email: "", role: "user" };
    return {
      id: authUser.id,
      name: authUser.name,
      email: authUser.email,
      role: authUser.role,
      // The session carries these and every permission check reads them from
      // here; dropping them would resolve the primary role alone, hiding the
      // admin interface from an administrator whose admin is a secondary role.
      secondaryRoles: authUser.secondaryRoles ?? [],
      adminPreviewOff: authUser.adminPreviewOff === true,
      scientistId: authUser.scientistId ?? null,
    };
  }, [authUser]);

  return (
    <CurrentUserContext.Provider value={{ currentUser }}>
      {children}
    </CurrentUserContext.Provider>
  );
}
