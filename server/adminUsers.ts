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
}

export function toAdminUserResponse(
  user: AdminUserRecord,
  profileJobTitle: string | null | undefined,
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
  };
}