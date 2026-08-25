export function isRestrictedUserRouteAllowed(
  path: string,
  scientistId: number | null
): boolean {
  if (path === "/publications" || /^\/publications\/\d+$/.test(path)) {
    return true;
  }

  if (scientistId == null) {
    return path === "/register";
  }

  return (
    path === `/scientists/${scientistId}` ||
    path === `/scientists/${scientistId}/edit`
  );
}