import { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Badge } from "@/components/ui/badge";
import { Eye } from "lucide-react";

interface PermissionWrapperProps {
  children: ReactNode;
  /**
   * The current user's primary role. Retained because every call site passes
   * it and its presence is what asks for a check at all; the answer itself is
   * resolved for the whole person, not for this one role.
   */
  currentUserRole?: string;
  navigationItem?: string;
  requiredPermissions?: ('canEdit' | 'canCreate' | 'canAdd' | 'canView' | 'canDelete')[];
  fallback?: ReactNode;
  showReadOnlyBanner?: boolean;
}

export function PermissionWrapper({
  children,
  currentUserRole,
  navigationItem,
  requiredPermissions,
  fallback = null,
  showReadOnlyBanner = true
}: PermissionWrapperProps) {
  const { getEffectiveAccessLevel } = usePermissions();
  const { currentUser } = useCurrentUser();

  // Resolved for the person rather than for one role string. Access is the
  // union of the primary role and the secondaries, and administrator rights
  // are normally held as a secondary -- so resolving the primary alone hid
  // screens from exactly the people entitled to edit them, over an API that
  // was granting them.
  const accessLevel = navigationItem
    ? getEffectiveAccessLevel(currentUser, navigationItem)
    : null;

  // Handle button-level permission checking with requiredPermissions
  if (requiredPermissions && currentUserRole && navigationItem) {
    const hasRequiredPermission = requiredPermissions.every(permission => {
      if (permission === 'canView') {
        return accessLevel === 'view' || accessLevel === 'edit';
      }
      // canEdit, canCreate, canAdd and canDelete all require edit.
      return accessLevel === 'edit';
    });

    if (!hasRequiredPermission) {
      return <>{fallback}</>;
    }

    // If user has permission, render normally (no read-only banner for buttons)
    return <>{children}</>;
  }

  // Handle page-level permission checking with currentUserRole and navigationItem
  if (currentUserRole && navigationItem) {
    // If the section is hidden, don't render anything
    if (accessLevel === 'hide') {
      return <>{fallback}</>;
    }

    // If it's read-only, wrap with read-only styling and banner
    if (accessLevel === 'view') {
      return (
        <div className="space-y-4">
          {showReadOnlyBanner && (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-primary">View Only Mode</span>
                <Badge variant="secondary" className="bg-primary/10 text-primary text-xs">
                  Read Only
                </Badge>
              </div>
              <p className="text-xs text-primary/80 mt-1">
                You have view-only access to this section. Contact an administrator to request edit permissions.
              </p>
            </div>
          )}
          <div className="read-only-content">
            {children}
          </div>
        </div>
      );
    }
  }

  // Full access - render normally
  return <>{children}</>;
}

// Hook to check permissions for specific elements.
//
// `currentUserRole` is kept for call-site compatibility; like PermissionWrapper
// this resolves the whole person, so a role held as a secondary counts.
export function useElementPermissions(currentUserRole: string, navigationItem: string) {
  const { getEffectiveAccessLevel } = usePermissions();
  const { currentUser } = useCurrentUser();
  void currentUserRole;

  const accessLevel = getEffectiveAccessLevel(currentUser, navigationItem);

  return {
    isHidden: accessLevel === "hide",
    isReadOnly: accessLevel === "view",
    canEdit: accessLevel === "edit",
    canCreate: accessLevel === "edit",
    shouldHideEditButtons: accessLevel !== "edit",
    readOnlyClass: accessLevel === "view" ? "read-only" : ""
  };
}