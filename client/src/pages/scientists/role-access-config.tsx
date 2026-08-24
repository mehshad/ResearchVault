import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  Save,
  RotateCcw,
  Eye,
  EyeOff,
  Edit,
  ArrowUp,
  Trash2,
  Plus,
  ShieldCheck,
  LockKeyhole,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePermissions, type AccessLevel, type NavigationPermission } from "@/hooks/usePermissions";
import { JOB_TITLES, NAVIGATION_ITEMS } from "@shared/constants";

const KNOWN_RELATIONSHIPS = [
  "is_author",
  "is_pi",
  "is_team_member",
  "is_budget_holder",
  "is_lead_pi",
  "is_requester",
] as const;

const SERVER_ENFORCED_RULES = [
  {
    category: "Investigator eligibility",
    title: "Only approved staff can be Principal Investigators",
    appliesTo: "Project leads, program leadership, research activity PI/budget holders, IRB/IBC PIs, and PI team roles",
    enforcement:
      "A staff member must have the Investigator or Staff Scientist title, or an additional Investigator designation. The system rejects ineligible assignments even if a request bypasses the screen.",
  },
  {
    category: "Investigator eligibility",
    title: "Staff cannot grant themselves Investigator authority",
    appliesTo: "Staff profiles and first-time registration",
    enforcement:
      "Only Management, administrators, or superadministrators can set the additional Investigator designation or an eligibility-granting title. Ordinary profile updates remain available without those fields.",
  },
  {
    category: "Staff records",
    title: "Profile changes are limited to the owner or Management",
    appliesTo: "Staff profile edits and deletion",
    enforcement:
      "Staff can update their own profile. Management and administrators can manage all profiles. Deletion is limited to Management/administrators and is blocked while a profile is referenced by other records.",
  },
  {
    category: "Account administration",
    title: "Only administrators can change user roles",
    appliesTo: "User access administration",
    enforcement:
      "Only administrators and superadministrators can update a user's role. The superadministrator role cannot be assigned from the interface.",
  },
  {
    category: "Ownership access",
    title: "Record relationships can elevate access",
    appliesTo: "Configured ownership rules, such as being an author, PI, or requester",
    enforcement:
      "The effective access level uses the higher of the role-based access and a configured ownership override. Ownership rules are managed separately by administrators.",
  },
  {
    category: "Publication workflow",
    title: "IP vetting and sealed publications have extra safeguards",
    appliesTo: "Publication status changes and corrections",
    enforcement:
      "Only an Outcome Officer or higher authority can move a Complete Draft through IP vetting. Published records are sealed from ordinary changes; researcher corrections are limited to linked records.",
  },
  {
    category: "Publication visibility",
    title: "Unpublished publications are relationship-restricted",
    appliesTo: "Publication lists, direct publication details, staff profiles, profile charts, counts, filters, and author-link checks",
    enforcement:
      "Published and Published * records remain generally visible. An unpublished record is visible only to its creator, a linked internal author, the direct line manager of a linked author, or Management/administrators. Creator access remains valid even when no authors are linked.",
  },
  {
    category: "Publication visibility",
    title: "Outcome Office access is limited to the authorized office view",
    appliesTo: "Outcome Office publication queues and the ordinary Publications page",
    enforcement:
      "Outcome Officers can review all publication workflow records inside the server-authorized office view. That office authority does not expose unrelated unpublished records on the ordinary Publications list or through an ordinary direct-detail request.",
  },
  {
    category: "Staff data",
    title: "Bulk staff imports are restricted",
    appliesTo: "Staff import preview and apply actions",
    enforcement:
      "Only administrators can preview or apply staff imports. Organization assignments are also validated before staff records are saved.",
  },
] as const;

interface OwnershipOverride {
  id: number;
  module: string;
  relationship: string;
  grantedAccess: string;
  description: string | null;
}

export default function RoleAccessConfig({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useToast();
  const { permissions, setPermissions, getAccessLevel } = usePermissions();

  // ── Ownership overrides state ──────────────────────────────────────────────
  const [ownershipOverrides, setOwnershipOverrides] = useState<OwnershipOverride[]>([]);
  const [newRule, setNewRule] = useState({ module: "", relationship: "", grantedAccess: "edit", description: "" });
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [editingRule, setEditingRule] = useState<Partial<OwnershipOverride>>({});

  useEffect(() => {
    fetch('/api/ownership-overrides')
      .then(r => r.ok ? r.json() : [])
      .then(setOwnershipOverrides)
      .catch(() => {});
  }, []);

  const addOwnershipRule = async () => {
    if (!newRule.module || !newRule.relationship || !newRule.grantedAccess) {
      toast({ title: "Validation", description: "Module, relationship, and granted access are required.", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch('/api/ownership-overrides', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRule),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setOwnershipOverrides(prev => {
        const exists = prev.findIndex(o => o.id === created.id);
        if (exists >= 0) { const copy = [...prev]; copy[exists] = created; return copy; }
        return [...prev, created];
      });
      setNewRule({ module: "", relationship: "", grantedAccess: "edit", description: "" });
      toast({ title: "Rule saved", description: `${created.module} / ${created.relationship} rule saved.` });
    } catch {
      toast({ title: "Error", description: "Failed to save ownership rule.", variant: "destructive" });
    }
  };

  const saveEditingRule = async () => {
    if (!editingRuleId || !editingRule.module || !editingRule.relationship || !editingRule.grantedAccess) return;
    try {
      const res = await fetch('/api/ownership-overrides', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingRule),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setOwnershipOverrides(prev => prev.map(o => o.id === updated.id ? updated : o));
      setEditingRuleId(null);
      toast({ title: "Rule updated" });
    } catch {
      toast({ title: "Error", description: "Failed to update rule.", variant: "destructive" });
    }
  };

  const deleteOwnershipRule = async (id: number) => {
    try {
      const res = await fetch(`/api/ownership-overrides/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setOwnershipOverrides(prev => prev.filter(o => o.id !== id));
      toast({ title: "Rule deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete rule.", variant: "destructive" });
    }
  };
  
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(`section-${sectionId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };
  
  const scrollToTop = () => {
    // Find the scrollable main content container
    const mainContent = document.querySelector('main');
    if (mainContent) {
      mainContent.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Fallback to window scroll
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const updatePermission = (id: string, accessLevel: AccessLevel) => {
    setPermissions(permissions.map(perm => 
      perm.id === id ? { ...perm, accessLevel } : perm
    ));
  };

  const resetToDefaults = () => {
    const defaultPermissions: NavigationPermission[] = [];
    JOB_TITLES.forEach((jobTitle) => {
      NAVIGATION_ITEMS.forEach((navItem) => {
        // Set some realistic defaults for different roles
        let defaultAccess: AccessLevel = "edit";
        
        // Investigators have limited access to office/reviewer functions
        if (jobTitle === "Investigator") {
          if (navItem.id.includes("-office") || navItem.id.includes("-reviewer")) {
            defaultAccess = "hide";
          } else if (navItem.id === "reports") {
            defaultAccess = "view";
          }
        }
        
        // PhD Students have more restrictions
        if (jobTitle === "PhD Student") {
          if (navItem.id.includes("-office") || navItem.id.includes("-reviewer") || 
              navItem.id === "contracts" || navItem.id === "patents") {
            defaultAccess = "hide";
          } else if (navItem.id === "reports" || navItem.id === "programs") {
            defaultAccess = "view";
          }
        }
        
        // Grant Officer has specialized access
        if (jobTitle === "Grant Officer") {
          if (navItem.id.includes("-office") || navItem.id.includes("-reviewer")) {
            // Hide other department offices/reviewer functions
            defaultAccess = "hide";
          } else if (navItem.id === "grants" || navItem.id === "contracts" || navItem.id === "programs" || navItem.id === "projects") {
            // Full access to grants and related areas
            defaultAccess = "edit";
          } else if (navItem.id === "reports" || navItem.id === "publications" || navItem.id === "patents") {
            // View access to reports and research outputs
            defaultAccess = "view";
          }
        }
        
        defaultPermissions.push({
          id: `${jobTitle}-${navItem.id}`,
          jobTitle,
          navigationItem: navItem.id,
          accessLevel: defaultAccess
        });
      });
    });
    setPermissions(defaultPermissions);
    toast({
      title: "Reset Complete",
      description: "All navigation permissions have been reset to defaults with role-appropriate access levels."
    });
  };

  const savePermissions = () => {
    // For now, just show a success message since we're not storing in database yet
    toast({
      title: "Permissions Saved",
      description: "Navigation access permissions have been updated successfully."
    });
  };

  const getPermissionForRole = (jobTitle: string, navItemId: string) => {
    return permissions.find(p => p.jobTitle === jobTitle && p.navigationItem === navItemId);
  };

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Link href="/scientists">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Scientists
              </Button>
            </Link>
            <h1 className="text-2xl font-semibold text-foreground">Configure Role Based Access</h1>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={resetToDefaults}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Defaults
            </Button>
            <Button onClick={savePermissions}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </div>
      )}
      {embedded && (
        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" onClick={resetToDefaults}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
          <Button onClick={savePermissions}>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>
      )}

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Server-Enforced Access Rules
            </CardTitle>
            <Badge variant="secondary" className="gap-1">
              <LockKeyhole className="h-3 w-3" />
              Read only
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            These safeguards are enforced by the system and cannot be overridden by the
            navigation matrix below. They are shown here so access decisions remain
            transparent as the platform evolves.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-2">
            {SERVER_ENFORCED_RULES.map((rule) => (
              <section
                key={rule.title}
                className="rounded-lg border bg-muted/20 p-4"
                aria-label={rule.title}
              >
                <Badge variant="outline" className="mb-3 text-xs">
                  {rule.category}
                </Badge>
                <h3 className="font-medium leading-tight">{rule.title}</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="font-medium text-muted-foreground">Applies to</dt>
                    <dd className="mt-0.5">{rule.appliesTo}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted-foreground">System rule</dt>
                    <dd className="mt-0.5 text-muted-foreground">{rule.enforcement}</dd>
                  </div>
                </dl>
              </section>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Navigation Permission Matrix</CardTitle>
          <p className="text-sm text-muted-foreground">
            Configure navigation visibility and screen-level access for each job role:
            Hide (not visible), View Only (read-only), or Full Access (can edit).
            Server-enforced rules above still apply to every request.
          </p>
        </CardHeader>
        
        {/* Quick Navigation */}
        <div className="sticky top-0 z-20 border-b bg-card/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <h3 className="text-sm font-medium mb-3 text-muted-foreground">Quick Navigation</h3>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {NAVIGATION_ITEMS.map((navItem) => (
              <Button
                key={navItem.id}
                variant="outline"
                size="sm"
                onClick={() => scrollToSection(navItem.id)}
                className="h-7 shrink-0 text-xs"
              >
                {navItem.name}
              </Button>
            ))}
          </div>
        </div>
        <CardContent>
          <div className="space-y-6">
            {NAVIGATION_ITEMS.map((navItem) => (
              <div key={navItem.id} id={`section-${navItem.id}`} className="scroll-mt-28 space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <div>
                    <h3 className="font-medium text-lg">{navItem.name}</h3>
                    <p className="text-sm text-muted-foreground">{navItem.description}</p>
                  </div>
                </div>

                <div className="grid gap-3">
                  {/* Header */}
                  <div className="grid grid-cols-3 gap-4 text-sm font-medium text-muted-foreground border-b pb-2">
                    <div>Job Title</div>
                    <div className="text-center">Access Level</div>
                    <div className="text-center">Status</div>
                  </div>

                  {/* Permission rows */}
                  {JOB_TITLES.map((jobTitle) => {
                    const permission = getPermissionForRole(jobTitle, navItem.id);
                    if (!permission) return null;

                    const getStatusBadge = (accessLevel: AccessLevel) => {
                      switch (accessLevel) {
                        case "hide":
                          return (
                            <Badge variant="destructive" className="bg-red-100 text-red-800 flex items-center gap-1 dark:bg-red-950 dark:text-red-300">
                              <EyeOff className="h-3 w-3" />
                              Hidden
                            </Badge>
                          );
                        case "view":
                          return (
                            <Badge variant="secondary" className="bg-blue-100 text-blue-800 flex items-center gap-1 dark:bg-blue-950 dark:text-blue-300">
                              <Eye className="h-3 w-3" />
                              View Only
                            </Badge>
                          );
                        case "edit":
                          return (
                            <Badge variant="default" className="bg-green-100 text-green-800 flex items-center gap-1 dark:bg-green-950 dark:text-green-300">
                              <Edit className="h-3 w-3" />
                              Full Access
                            </Badge>
                          );
                      }
                    };

                    return (
                      <div key={`${jobTitle}-${navItem.id}`} className="grid grid-cols-3 gap-4 items-center py-2 hover:bg-muted/50 rounded-lg px-2">
                        <div className="font-medium">{jobTitle}</div>
                        
                        <div className="flex justify-center">
                          <RadioGroup
                            value={permission.accessLevel}
                            onValueChange={(value) => updatePermission(permission.id, value as AccessLevel)}
                            className="flex gap-4"
                          >
                            <div className="flex items-center space-x-1">
                              <RadioGroupItem value="hide" id={`${permission.id}-hide`} />
                              <Label htmlFor={`${permission.id}-hide`} className="flex items-center gap-1 text-xs cursor-pointer">
                                <EyeOff className="h-3 w-3" />
                                Hide
                              </Label>
                            </div>
                            <div className="flex items-center space-x-1">
                              <RadioGroupItem value="view" id={`${permission.id}-view`} />
                              <Label htmlFor={`${permission.id}-view`} className="flex items-center gap-1 text-xs cursor-pointer">
                                <Eye className="h-3 w-3" />
                                View
                              </Label>
                            </div>
                            <div className="flex items-center space-x-1">
                              <RadioGroupItem value="edit" id={`${permission.id}-edit`} />
                              <Label htmlFor={`${permission.id}-edit`} className="flex items-center gap-1 text-xs cursor-pointer">
                                <Edit className="h-3 w-3" />
                                Edit
                              </Label>
                            </div>
                          </RadioGroup>
                        </div>

                        <div className="flex justify-center">
                          {getStatusBadge(permission.accessLevel)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Ownership Rules */}
      <Card>
        <CardHeader>
          <CardTitle>Ownership Rules</CardTitle>
          <p className="text-sm text-muted-foreground">
            When a user is related to a record (e.g., is its author or PI), these rules elevate their access above their role-based level.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4">Module</th>
                  <th className="text-left py-2 pr-4">Relationship</th>
                  <th className="text-left py-2 pr-4">Granted Access</th>
                  <th className="text-left py-2 pr-4">Description</th>
                  <th className="text-left py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ownershipOverrides.map(rule => (
                  <tr key={rule.id} className="border-b hover:bg-muted/50">
                    {editingRuleId === rule.id ? (
                      <>
                        <td className="py-2 pr-4">
                          <Select value={editingRule.module ?? ""} onValueChange={v => setEditingRule(p => ({...p, module: v}))}>
                            <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                            <SelectContent>{NAVIGATION_ITEMS.map(n => <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 pr-4">
                          <Select value={editingRule.relationship ?? ""} onValueChange={v => setEditingRule(p => ({...p, relationship: v}))}>
                            <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                            <SelectContent>{KNOWN_RELATIONSHIPS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 pr-4">
                          <Select value={editingRule.grantedAccess ?? "edit"} onValueChange={v => setEditingRule(p => ({...p, grantedAccess: v}))}>
                            <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="view">view</SelectItem>
                              <SelectItem value="create">create</SelectItem>
                              <SelectItem value="edit">edit</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 pr-4">
                          <Input className="h-8" value={editingRule.description ?? ""} onChange={e => setEditingRule(p => ({...p, description: e.target.value}))} />
                        </td>
                        <td className="py-2 flex gap-2">
                          <Button size="sm" onClick={saveEditingRule}>Save</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingRuleId(null)}>Cancel</Button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-4 font-mono text-xs">{rule.module}</td>
                        <td className="py-2 pr-4 font-mono text-xs">{rule.relationship}</td>
                        <td className="py-2 pr-4">
                          <Badge variant={rule.grantedAccess === "edit" ? "default" : "secondary"} className="text-xs">
                            {rule.grantedAccess}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">{rule.description}</td>
                        <td className="py-2 flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => { setEditingRuleId(rule.id); setEditingRule({...rule}); }}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => deleteOwnershipRule(rule.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {ownershipOverrides.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No ownership rules configured.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Add Rule form */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2"><Plus className="h-4 w-4" />Add Rule</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
              <div>
                <Label className="text-xs mb-1 block">Module</Label>
                <Select value={newRule.module} onValueChange={v => setNewRule(p => ({...p, module: v}))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select module" /></SelectTrigger>
                  <SelectContent>{NAVIGATION_ITEMS.map(n => <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Relationship</Label>
                <Select value={newRule.relationship} onValueChange={v => setNewRule(p => ({...p, relationship: v}))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select relationship" /></SelectTrigger>
                  <SelectContent>{KNOWN_RELATIONSHIPS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Granted Access</Label>
                <Select value={newRule.grantedAccess} onValueChange={v => setNewRule(p => ({...p, grantedAccess: v}))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">view</SelectItem>
                    <SelectItem value="create">create</SelectItem>
                    <SelectItem value="edit">edit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Description</Label>
                <Input className="h-9" placeholder="Optional label" value={newRule.description} onChange={e => setNewRule(p => ({...p, description: e.target.value}))} />
              </div>
            </div>
            <Button className="mt-3" onClick={addOwnershipRule}>
              <Plus className="h-4 w-4 mr-2" />
              Add Rule
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Floating Back to Top Button */}
      <div className="fixed bottom-6 right-6">
        <Button
          onClick={scrollToTop}
          className="rounded-full h-12 w-12 shadow-lg"
          size="icon"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}