import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { AlertTriangle, Loader2, Shield, User, UserPlus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { isAdministrator, hasAnyRole } from "@shared/effectiveRoles";
import { isRoleTitleMismatch, accessRoleForJobTitle } from "@shared/constants";

interface AppUser {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  secondaryRoles?: string[];
  scientistId: number | null;
  profileJobTitle: string | null;
  lastLoginAt: string | null;
}

function formatLastLogin(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function AdminUsersPage() {
  const { currentUser: me } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pendingRole, setPendingRole] = useState<Record<number, string>>({});

  const { data: users = [], isLoading } = useQuery<AppUser[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/users");
      return res.json();
    },
  });

  const { data: assignableRoles = [], isLoading: rolesLoading } = useQuery<string[]>({
    queryKey: ["/api/admin/roles"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/roles");
      return res.json();
    },
  });
  // Several job titles share one access role — a "Postdoctoral Researcher" holds
  // "Researcher" — so a plain string comparison would flag every one of them.
  const mismatchCount = users.filter(
    (user) => isRoleTitleMismatch(user.role, user.profileJobTitle)
  ).length;

  // Secondary roles are additive — a person's access is the union of their
  // primary role and these. Saved as a whole set so removing one is the same
  // operation as adding one.
  const [pendingSecondary, setPendingSecondary] = useState<Record<number, string[]>>({});
  const secondaryMutation = useMutation({
    mutationFn: async ({ id, roles }: { id: number; roles: string[] }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}/secondary-roles`, { roles });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setPendingSecondary((prev) => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
      toast({ title: "Secondary roles updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update secondary roles", description: err.message, variant: "destructive" });
    },
  });

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: number; role: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}/role`, { role });
      return res.json();
    },
    onSuccess: (_data, { id }) => {
      toast({ title: "Primary access role updated" });
      setPendingRole((prev) => { const copy = { ...prev }; delete copy[id]; return copy; });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update primary access role", description: err.message, variant: "destructive" });
    },
  });

  // Staff titled Investigator who hold no account cannot be granted the
  // Investigator access role, and eligibility now lives entirely on that role.
  // This creates the accounts so the role has somewhere to go; it does not
  // grant it.
  type ProvisionPlan = {
    plan: Array<{ username: string; name: string; email: string }>;
    skipped: Array<{ name: string; reason: string }>;
    created: Array<{ id: number; username: string; name: string }>;
  };
  const [provisionPlan, setProvisionPlan] = useState<ProvisionPlan | null>(null);
  const provisionMutation = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const res = await apiRequest("POST", "/api/admin/users/provision-investigators", { dryRun });
      return (await res.json()) as ProvisionPlan;
    },
    onSuccess: (data, dryRun) => {
      if (dryRun) {
        setProvisionPlan(data);
        return;
      }
      setProvisionPlan(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: `${data.created.length} account${data.created.length === 1 ? "" : "s"} created`,
        description:
          data.created.length > 0
            ? "Each starts with the restricted user role. Grant Investigator to the ones who need it."
            : "Nothing to create.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Could not create accounts", description: err.message, variant: "destructive" });
    },
  });

  if (!me || !isAdministrator(me)) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        You do not have permission to view this page.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6" /> User Management
        </h1>
        <p className="text-muted-foreground mt-1">
          Access roles assigned here control permissions — a person's access is the union of their
          primary role and any secondary roles. Profile job titles are shown for reference
          and do not grant access. The super admin account (set via <code>SUPER_ADMIN_EMAIL</code>) cannot be changed here.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => provisionMutation.mutate(true)}
          disabled={provisionMutation.isPending}
          data-testid="button-provision-investigators"
        >
          {provisionMutation.isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking…</>
          ) : (
            <><UserPlus className="mr-2 h-4 w-4" />Create accounts for Investigators</>
          )}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Gives every staff member titled Investigator an account to hold an access role. They are
          created with the restricted <code>user</code> role — grant Investigator here afterwards.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            {users.length} registered account{users.length !== 1 ? "s" : ""}
            {mismatchCount > 0 && (
              <> · {mismatchCount} access/profile mismatch{mismatchCount !== 1 ? "es" : ""}</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading || rolesLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <div>
              {mismatchCount > 0 && (
                <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                  <p>
                    Highlighted users hold an access role that does not correspond to their profile
                    job title. Several titles share one role — a Postdoctoral Researcher holds
                    Researcher — and those are not flagged. This may still be intentional;
                    permissions always follow the access role.
                  </p>
                </div>
              )}
              <div className="divide-y">
              <div className="hidden md:grid grid-cols-[minmax(0,1fr)_9rem_11rem_13rem_15rem] gap-4 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <div>User</div>
                <div>Last login</div>
                <div>Profile job title</div>
                <div>Primary access role</div>
                <div>Secondary roles</div>
              </div>
              {users.map((u) => {
                const isSelf = u.id === me.id;
                const isSuperAdmin = u.role === "superadmin";
                const currentRole = pendingRole[u.id] ?? u.role;
                const savedSecondary = u.secondaryRoles ?? [];
                const currentSecondary = pendingSecondary[u.id] ?? savedSecondary;
                const secondaryChanged =
                  JSON.stringify([...currentSecondary].sort()) !== JSON.stringify([...savedSecondary].sort());
                // A role already held as primary would be redundant, and
                // superadmin is never assignable from here.
                const availableSecondary = assignableRoles.filter(
                  (role) =>
                    role !== "user" &&
                    role !== currentRole &&
                    role !== "superadmin" &&
                    !currentSecondary.includes(role),
                );
                const hasRoleTitleMismatch = isRoleTitleMismatch(u.role, u.profileJobTitle);
                return (
                  <div
                    key={u.id}
                    className={`grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_9rem_11rem_13rem_15rem] md:items-start md:gap-4 ${
                      hasRoleTitleMismatch
                        ? "border-l-4 border-l-amber-500 bg-amber-500/5 pl-3 pr-2"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium truncate">{u.name || u.username}</span>
                          {hasRoleTitleMismatch && (
                            <Badge
                              variant="outline"
                              className="border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            >
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              Role/title differ
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                      </div>
                    </div>

                    <div className="text-sm text-muted-foreground" title={u.lastLoginAt ?? undefined}>
                      <span className="mr-2 font-medium text-foreground md:hidden">Last login:</span>
                      {formatLastLogin(u.lastLoginAt)}
                    </div>

                    <div className="min-w-0 text-sm">
                      <span className="mr-2 font-medium text-foreground md:hidden">Profile job title:</span>
                      {u.profileJobTitle ? (
                        <span className="break-words">{u.profileJobTitle}</span>
                      ) : (
                        <span className="text-muted-foreground">
                          {u.scientistId ? "Not set" : "No linked profile"}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 md:justify-start">
                      <span className="font-medium text-foreground md:hidden">Primary access role:</span>
                      {isSuperAdmin ? (
                        <Badge variant="destructive">Super Admin</Badge>
                      ) : isSelf ? (
                        <Badge variant="secondary">{u.role} (you)</Badge>
                      ) : (
                        <>
                          <Select
                            value={currentRole}
                            onValueChange={(v) => setPendingRole((prev) => ({ ...prev, [u.id]: v }))}
                          >
                            <SelectTrigger className="w-44 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {!assignableRoles.includes(currentRole) && (
                                <SelectItem value={currentRole} disabled className="text-xs">
                                  {currentRole} (not assignable)
                                </SelectItem>
                              )}
                              {assignableRoles.map((r) => (
                                <SelectItem key={r} value={r} className="text-xs">
                                  {r}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {pendingRole[u.id] && pendingRole[u.id] !== u.role && (
                            <Button
                              size="sm"
                              onClick={() => roleMutation.mutate({ id: u.id, role: currentRole })}
                              disabled={roleMutation.isPending}
                            >
                              Save
                            </Button>
                          )}
                        </>
                      )}
                    </div>

                    {/* Secondary roles: additive, and how administrator rights
                        are granted. Superadmin is excluded because it comes
                        from configuration, never from this screen. */}
                    <div className="min-w-0">
                      <span className="mr-2 font-medium text-foreground md:hidden">Secondary roles:</span>
                      {isSuperAdmin ? (
                        <span className="text-xs text-muted-foreground">Not applicable</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {currentSecondary.length === 0 && (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                          {currentSecondary.map((role) => (
                            <Badge
                              key={role}
                              variant={role === "admin" ? "default" : "secondary"}
                              className="gap-1 pr-1 text-xs font-normal"
                            >
                              {role}
                              <button
                                type="button"
                                aria-label={`Remove ${role}`}
                                className="rounded-sm px-0.5 hover:bg-background/40"
                                onClick={() =>
                                  setPendingSecondary((prev) => ({
                                    ...prev,
                                    [u.id]: currentSecondary.filter((held) => held !== role),
                                  }))
                                }
                              >
                                ×
                              </button>
                            </Badge>
                          ))}
                          <Select
                            value=""
                            onValueChange={(value) =>
                              setPendingSecondary((prev) => ({
                                ...prev,
                                [u.id]: [...currentSecondary, value].sort(),
                              }))
                            }
                          >
                            <SelectTrigger className="h-7 w-28 text-xs" aria-label="Add a secondary role">
                              <SelectValue placeholder="Add…" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableSecondary.length === 0 ? (
                                <SelectItem value="__none" disabled className="text-xs">
                                  Nothing left to add
                                </SelectItem>
                              ) : (
                                availableSecondary.map((role) => (
                                  <SelectItem key={role} value={role} className="text-xs">
                                    {role}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          {secondaryChanged && (
                            <Button
                              size="sm"
                              className="h-7"
                              onClick={() => secondaryMutation.mutate({ id: u.id, roles: currentSecondary })}
                              disabled={secondaryMutation.isPending}
                            >
                              Save
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={provisionPlan !== null}
        onOpenChange={(open) => { if (!open) setProvisionPlan(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {provisionPlan?.plan.length
                ? `Create ${provisionPlan.plan.length} account${provisionPlan.plan.length === 1 ? "" : "s"}?`
                : "Nothing to create"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {provisionPlan?.plan.length
                ? "Each account is created with the restricted user role and no password, so it grants nothing until you assign a role. An external sign-in matches it by username and adopts it."
                : "Every staff member titled Investigator already has an account, or has nothing to create one from."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {provisionPlan && provisionPlan.plan.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-md border" data-testid="list-provision-plan">
              {provisionPlan.plan.map((entry) => (
                <div key={entry.username} className="flex items-baseline justify-between gap-3 border-b px-3 py-2 text-sm last:border-b-0">
                  <span className="font-medium">{entry.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{entry.username}</span>
                </div>
              ))}
            </div>
          )}

          {provisionPlan && provisionPlan.skipped.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30" data-testid="list-provision-skipped">
              <p className="font-medium text-amber-900 dark:text-amber-200">
                {provisionPlan.skipped.length} skipped
              </p>
              <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-amber-900/90 dark:text-amber-200/90">
                {provisionPlan.skipped.map((entry, index) => (
                  <li key={`${entry.name}-${index}`}>{entry.name} — {entry.reason}</li>
                ))}
              </ul>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-provision">Cancel</AlertDialogCancel>
            {provisionPlan && provisionPlan.plan.length > 0 && (
              <AlertDialogAction
                onClick={(event) => { event.preventDefault(); provisionMutation.mutate(false); }}
                disabled={provisionMutation.isPending}
                data-testid="button-confirm-provision"
              >
                {provisionMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</>
                ) : (
                  "Yes, create the accounts"
                )}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
