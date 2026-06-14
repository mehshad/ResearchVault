import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const JOB_TITLES = [
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
  "Management",
  "Other",
];

const STAFF_TYPES = [
  { value: "scientific", label: "Scientific Staff" },
  { value: "administrative", label: "Administrative Staff" },
  { value: "clinical", label: "Clinical Staff" },
];

const HONORIFICS = ["Dr.", "Prof.", "Mr.", "Ms.", "Mrs.", "Mx.", ""];

/** Split a display name into first / last parts as best we can. */
function splitName(fullName: string | undefined): { firstName: string; lastName: string } {
  if (!fullName?.trim()) return { firstName: "", lastName: "" };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** If the user's role exactly matches a known job title, pre-select it. */
function deriveJobTitle(role: string | undefined): string {
  if (!role) return "";
  return JOB_TITLES.includes(role) ? role : "";
}

export default function RegisterPage() {
  const { user, refreshUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Derive sensible defaults from the auth session so the user has to type as little as possible.
  const { firstName: derivedFirst, lastName: derivedLast } = splitName(user?.name);

  const [form, setForm] = useState({
    honorificTitle: "",
    firstName: derivedFirst,
    lastName: derivedLast,
    jobTitle: deriveJobTitle(user?.role),
    staffType: "scientific",
    department: "",
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/register", data);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message || "Registration failed");
      }
      return res.json();
    },
    onSuccess: async () => {
      toast({ title: "Profile created", description: "Welcome to the platform!" });
      await refreshUser();
      navigate("/app");
    },
    onError: (err: any) => {
      toast({ title: "Registration failed", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Normalise the "__none__" sentinel back to an empty string before submitting
    mutation.mutate({ ...form, honorificTitle: form.honorificTitle === "__none__" ? "" : form.honorificTitle });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Complete Your Profile</CardTitle>
          <CardDescription>
            Welcome{user?.name ? `, ${user.name}` : ""}. Please confirm your details before accessing the platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Email — read-only, pulled from session */}
            <div>
              <Label>Email</Label>
              <Input value={user?.email ?? ""} readOnly className="bg-muted text-muted-foreground cursor-not-allowed" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Honorific</Label>
                <Select
                  value={form.honorificTitle || "__none__"}
                  onValueChange={(v) => setForm((f) => ({ ...f, honorificTitle: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {HONORIFICS.map((h) => (
                      <SelectItem key={h || "__none__"} value={h || "__none__"}>
                        {h || "— None —"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  required
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  required
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label>Job Title *</Label>
              <Select
                value={form.jobTitle}
                onValueChange={(v) => setForm((f) => ({ ...f, jobTitle: v }))}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select your role…" />
                </SelectTrigger>
                <SelectContent>
                  {JOB_TITLES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Staff Type *</Label>
              <Select
                value={form.staffType}
                onValueChange={(v) => setForm((f) => ({ ...f, staffType: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
              />
            </div>

            <Button type="submit" className="w-full" disabled={mutation.isPending || !form.jobTitle}>
              {mutation.isPending ? "Saving…" : "Complete Registration"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
