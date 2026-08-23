import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Shield, User } from "lucide-react";

const ASSIGNABLE_ROLES = [
  "user",
  "admin",
  "Management",
  "Investigator",
  "Staff Scientist",
  "Physician",
  "Lab Manager",
  "Postdoctoral Researcher",
  "PhD Student",
  "IRB Board Member",
  "IBC Board Member",
  "Outcome Officer",
  "PMO Officer",
  "IRB Officer",
  "IBC Officer",
  "Grant Officer",
  "Contracts Officer",
  "IT Officer",
];

interface AppUser {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  scientistId: number | null;
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
  const { user: me } = useAuth();
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

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: number; role: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}/role`, { role });
      return res.json();
    },
    onSuccess: (_data, { id }) => {
      toast({ title: "Role updated successfully" });
      setPendingRole((prev) => { const copy = { ...prev }; delete copy[id]; return copy; });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update role", description: err.message, variant: "destructive" });
    },
  });

  if (!me || (me.role !== "admin" && me.role !== "superadmin")) {
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
          Assign roles to users. The super admin account (set via <code>SUPER_ADMIN_EMAIL</code>) cannot
          be changed here.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>{users.length} registered account{users.length !== 1 ? "s" : ""}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <div className="divide-y">
              <div className="hidden md:grid grid-cols-[minmax(0,1fr)_12rem_16rem] gap-4 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <div>User</div>
                <div>Last login</div>
                <div>Role</div>
              </div>
              {users.map((u) => {
                const isSelf = u.id === me.id;
                const isSuperAdmin = u.role === "superadmin";
                const currentRole = pendingRole[u.id] ?? u.role;
                return (
                  <div key={u.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_12rem_16rem] md:items-center md:gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{u.name || u.username}</div>
                        <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                      </div>
                    </div>

                    <div className="text-sm text-muted-foreground" title={u.lastLoginAt ?? undefined}>
                      <span className="mr-2 font-medium text-foreground md:hidden">Last login:</span>
                      {formatLastLogin(u.lastLoginAt)}
                    </div>

                    <div className="flex items-center gap-3 md:justify-start">
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
                              {ASSIGNABLE_ROLES.map((r) => (
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
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
