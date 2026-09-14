import { createContext } from "react";
import type { DummyUser } from "@/lib/currentUserRoleData";

export interface CurrentUserContextValue {
  currentUser: DummyUser;
}

export const CurrentUserContext = createContext<CurrentUserContextValue | undefined>(undefined);
