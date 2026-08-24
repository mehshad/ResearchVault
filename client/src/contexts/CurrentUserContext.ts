import { createContext } from "react";
import type { DummyUser } from "@/lib/currentUserRoleData";

export interface CurrentUserContextValue {
  currentUser: DummyUser;
  setCurrentUser: (user: DummyUser) => void;
}

export const CurrentUserContext = createContext<CurrentUserContextValue | undefined>(undefined);