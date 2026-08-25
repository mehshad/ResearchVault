import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isRestrictedUserRouteAllowed } from "@/lib/restrictedUserPolicy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const restrictedUserNoticeKey = (userId: number) =>
  `restricted-user-notice:${userId}`;

export function RestrictedUserGate({ children }: { children: ReactNode }) {
  const { user, authConfig } = useAuth();
  const [location] = useLocation();
  const [noticeOpen, setNoticeOpen] = useState(false);
  const isRestricted =
    authConfig.mode !== "demo" && user?.role === "user";

  useEffect(() => {
    if (!isRestricted || !user || user.needsRegistration) {
      setNoticeOpen(false);
      return;
    }

    const key = restrictedUserNoticeKey(user.id);
    if (sessionStorage.getItem(key) !== "shown") {
      sessionStorage.setItem(key, "shown");
      setNoticeOpen(true);
    }
  }, [isRestricted, user]);

  if (!isRestricted || !user) {
    return <>{children}</>;
  }

  const routeAllowed = isRestrictedUserRouteAllowed(
    location,
    user.scientistId
  );

  return (
    <>
      {routeAllowed ? (
        children
      ) : (
        <main className="min-h-screen bg-muted/30 p-6 flex items-center justify-center">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <CardTitle>Access not assigned yet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm text-muted-foreground">
                An administrator must assign your access role before you can use
                this area. Your account currently has access to your own profile
                and ordinary Publications only.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/publications">Go to Publications</Link>
                </Button>
                {user.scientistId != null && (
                  <Button variant="outline" asChild>
                    <Link href={`/scientists/${user.scientistId}`}>
                      View my profile
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </main>
      )}

      <Dialog open={noticeOpen} onOpenChange={setNoticeOpen}>
        <DialogContent
          className="sm:max-w-md [&>button]:hidden"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Your account has limited access</DialogTitle>
            <DialogDescription className="pt-2 leading-6">
              An administrator needs to assign your access role. Until then,
              you can use your own profile and view ordinary Publications.
              Nothing is sent when you continue.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setNoticeOpen(false)}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}