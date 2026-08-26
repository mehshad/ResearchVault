export function buildAssignableRoles(matrixRoles: string[]): string[] {
  const configurableRoles = Array.from(new Set(matrixRoles))
    .filter(
      (role) =>
        role.length > 0 &&
        role !== "user" &&
        role !== "admin" &&
        role !== "superadmin"
    )
    .sort((a, b) => a.localeCompare(b));

  return ["user", "admin", ...configurableRoles];
}