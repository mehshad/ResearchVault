import { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Badge } from "@/components/ui/badge";
import { Eye, Lock } from "lucide-react";
import { RESTRICTED_USER_ROLE } from "@shared/constants";

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
  /**
   * What to render instead of the children. Left unset on a whole page, the
   * page explains that access is denied rather than rendering nothing -- see
   * the hide branch below. Button-level checks keep rendering nothing.
   */
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
    if (accessLevel === 'hide') {
      // A caller that supplied its own fallback gets it. Otherwise say so:
      // rendering nothing gives a blank white page with no heading, no
      // navigation cue and nothing to act on, which reads as the application
      // being broken rather than as a permission being withheld. It is how an
      // account whose role has no entries in the access matrix -- `user`, which
      // is what the account-creation buttons assign -- experiences every screen.
      if (fallback !== null && fallback !== undefined) {
        return <>{fallback}</>;
      }
      // A restricted account is a different situation from a role that simply
      // lacks this area, and it needs a different instruction: `user` is what
      // new accounts are created as, it is hidden from everything but
      // publications by rule rather than by the matrix, and editing the matrix
      // would not change it. The fix is to give the person a real access role.
      const isAwaitingRole = currentUser?.role === RESTRICTED_USER_ROLE;
      return (
        <div className="flex min-h-[50vh] items-center justify-center p-6">
          <div className="max-w-md rounded-lg border bg-card p-6 text-center">
            <Lock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <h2 className="text-lg font-semibold">
              {isAwaitingRole
                ? "Your account is waiting for an access role"
                : "You do not have access to this section"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {isAwaitingRole ? (
                <>
                  New accounts start without one and can only see publications until an
                  administrator assigns a role in Settings → Users.
                </>
              ) : (
                <>
                  Your access role{currentUserRole ? ` (${currentUserRole})` : ""} does not include
                  this area. An administrator can grant it in Settings → Access Control.
                </>
              )}
            </p>
          </div>
        </div>
      );
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