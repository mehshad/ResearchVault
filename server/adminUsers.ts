import type { User } from "@shared/schema";

export type AdminUserRecord = Pick<
  User,
  | "id"
  | "username"
  | "name"
  | "email"
  | "role"
  | "scientistId"
  | "lastLoginAt"
>;

export interface AdminUserResponse extends AdminUserRecord {
  profileJobTitle: string | null;
  /**
   * Roles held alongside the primary one. Access is the union of all of them,
   * so this is shown next to the primary rather than buried in a detail view.
   */
  secondaryRoles: string[];
}

export function toAdminUserResponse(
  user: AdminUserRecord,
  profileJobTitle: string | null | undefined,
  secondaryRoles: string[] = [],
): AdminUserResponse {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    scientistId: user.scientistId,
    lastLoginAt: user.lastLoginAt,
    profileJobTitle: profileJobTitle ?? null,
    secondaryRoles,
  };
}