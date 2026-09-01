import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Palette, Settings as SettingsIcon, MessageSquarePlus, Send, Lightbulb, Zap, AlertCircle, CheckCircle, Clock, X, ChevronDown, ChevronUp, ThumbsUp, User, Calendar, Users, ShieldCheck, KeyRound, Layers, Lock, Sun, Moon } from "lucide-react";
import { useTheme, themes, defaultInstitutionLabels, TOGGLEABLE_SECTIONS, TOGGLEABLE_PAGES, type InstitutionConfig } from "@/contexts/ThemeContext";
import { useTheme as useColorMode } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import TeamManagement from "@/components/settings/TeamManagement";
import BulkDataHub from "@/components/settings/BulkDataHub";
import RoleAccessConfig from "@/pages/scientists/role-access-config";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { isAdministrator, hasAnyRole } from "@shared/effectiveRoles";

// Types for feature requests
interface FeatureRequest {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  originalRequest: string;
  enhancedPrompt?: string;
  approvedPrompt?: string;
  aiProvider?: string;
  implementationNotes?: string;
  estimatedEffort?: string;
  tags?: string[];
  requestedBy: string;
  upvotes: number;
  upvotedBy?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const aiProviders = [
  { id: 'groq', name: 'Groq (Fast & Free)', description: 'High-speed inference with free tier' },
  { id: 'huggingface', name: 'HuggingFace', description: 'Open source models' },
  { id: 'together_ai', name: 'Together AI', description: 'Collaborative AI platform' }
];

const categoryOptions = [
  { value: 'ui', label: 'User Interface', icon: '🎨' },
  { value: 'backend', label: 'Backend', icon: '⚙️' },
  { value: 'feature', label: 'New Feature', icon: '✨' },
  { value: 'bugfix', label: 'Bug Fix', icon: '🐛' },
  { value: 'enhancement', label: 'Enhancement', icon: '🔧' }
];

const priorityOptions = [
  { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300' },
  { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  { value: 'critical', label: 'Critical', color: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' }
];

const statusOptions = [
  { value: 'pending', label: 'Pending', icon: Clock, color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
  { value: 'enhanced', label: 'AI Enhanced', icon: Lightbulb, color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' },
  { value: 'approved', label: 'Approved', icon: CheckCircle, color: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' },
  { value: 'implemented', label: 'Implemented', icon: CheckCircle, color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  { value: 'rejected', label: 'Rejected', icon: X, color: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' }
];

export default function Settings() {
  const { themeName, setTheme, institutionLabels, setInstitutionLabels, isSectionVisible, setSectionVisible, isPageVisible, setPageVisible, saveSettings } = useTheme();
  const { resolvedTheme } = useColorMode();
  const mode = resolvedTheme === 'dark' ? 'dark' : 'light';
  const { authConfig } = useAuth();
  const { currentUser } = useCurrentUser();
  // isAdministrator already covers admin and superadmin in any slot. The demo
  // clause mirrors requireAdmin on the server, which treats the fixed demo
  // Management session as an administrator so protected screens are previewable.
  const userIsAdmin =
    isAdministrator(currentUser) ||
    (authConfig.mode === 'demo' && currentUser.role === 'Management');
  const { toast } = useToast();

  // Global default color mode — loaded from server, saved together with other settings
  const [globalColorMode, setGlobalColorMode] = useState<'light' | 'dark'>('light');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/system-configurations/color_mode_default')
      .then(r => r.ok ? r.json() : null)
      .then(cfg => {
        if (!cfg) return;
        const val = typeof cfg.value === 'string' ? cfg.value : cfg.value?.mode;
        if (val === 'dark' || val === 'light') setGlobalColorMode(val);
      })
      .catch(() => {});
  }, []);

  const handleSaveSettings = async () => {
    setSaving(true);
    const ok = await saveSettings({ color_mode_default: globalColorMode });
    setSaving(false);
    if (ok) {
      toast({ title: 'Settings saved', description: 'All changes have been applied globally.' });
    } else {
      toast({ title: 'Failed to save settings', variant: 'destructive' });
    }
  };
  const queryClient = useQueryClient();
  
  // Active tab — can be set via URL hash (e.g. /settings#access-control)
  const [activeTab, setActiveTab] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    const valid = ['layout-theme', 'team', 'authentication', 'access-control', 'data-import-export'];
    return valid.includes(hash) ? hash : 'layout-theme';
  });

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    const valid = ['layout-theme', 'team', 'authentication', 'access-control', 'data-import-export'];
    if (valid.includes(hash)) setActiveTab(hash);
  }, []);

  // Feature request form state
  const [requestForm, setRequestForm] = useState({
    title: '',
    description: '',
    category: 'feature',
    priority: 'medium',
    tags: '',
    requestedBy: ''
  });
  
  const [selectedAiProvider, setSelectedAiProvider] = useState(aiProviders[0].id);
  const [enhancingRequest, setEnhancingRequest] = useState<number | null>(null);
  const [expandedRequests, setExpandedRequests] = useState<Set<number>>(new Set());
  const [votingRequest, setVotingRequest] = useState<number | null>(null);

  // React Query hooks for feature requests
  const { data: featureRequests = [], isLoading: requestsLoading, error: requestsError } = useQuery({
    queryKey: ['/api/feature-requests'],
    queryFn: async () => {
      const response = await fetch('/api/feature-requests');
      if (!response.ok) {
        throw new Error('Failed to fetch feature requests');
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    retry: false
  });

  const createRequestMutation = useMutation({
    mutationFn: (data: any) => fetch('/api/feature-requests', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' }
    }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/feature-requests'] });
      setRequestForm({ title: '', description: '', category: 'feature', priority: 'medium', tags: '', requestedBy: '' });
      toast({ title: "Feature request submitted successfully!" });
    },
    onError: (error: any) => {
      toast({ title: "Error submitting request", description: error.message, variant: "destructive" });
    }
  });

  const updateRequestMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => fetch(`/api/feature-requests/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' }
    }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/feature-requests'] });
      toast({ title: "Feature request updated successfully!" });
    }
  });

  const deleteRequestMutation = useMutation({
    mutationFn: (id: number) => fetch(`/api/feature-requests/${id}`, { method: 'DELETE' }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/feature-requests'] });
      toast({ title: "Feature request deleted successfully!" });
    }
  });

  const upvoteRequestMutation = useMutation({
    mutationFn: ({ id, userId }: { id: number; userId: string }) => fetch(`/api/feature-requests/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ upvoteUserId: userId }),
      headers: { 'Content-Type': 'application/json' }
    }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/feature-requests'] });
      setVotingRequest(null);
    }
  });

  // Form handlers
  const handleSubmitRequest = () => {
    if (!requestForm.title.trim() || !requestForm.description.trim()) {
      toast({ title: "Please fill in title and description", variant: "destructive" });
      return;
    }

    const tags = requestForm.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    const requesterName = requestForm.requestedBy.trim() || 'Anonymous User';
    
    createRequestMutation.mutate({
      title: requestForm.title,
      description: requestForm.description,
      category: requestForm.category,
      priority: requestForm.priority,
      originalRequest: requestForm.description,
      requestedBy: requesterName,
      tags
    });
  };

  const handleEnhanceRequest = async (request: FeatureRequest) => {
    setEnhancingRequest(request.id);
    
    // Simulate AI enhancement (replace with actual AI service call)
    setTimeout(() => {
      const enhancedPrompt = generateEnhancedPrompt(request);
      updateRequestMutation.mutate({
        id: request.id,
        data: {
          enhancedPrompt,
          aiProvider: selectedAiProvider,
          status: 'enhanced'
        }
      });
      setEnhancingRequest(null);
    }, 2000);
  };

  const generateEnhancedPrompt = (request: FeatureRequest) => {
    return `# Developer Prompt - Q-BRIDGE Feature Request

## Context
Q-BRIDGE is a research governance and information management platform built with:
- Frontend: React + TypeScript + Tailwind CSS + shadcn/ui
- Backend: Express.js + Node.js + PostgreSQL
- Database: Drizzle ORM with type-safe operations

## User Request
**Title:** ${request.title}
**Category:** ${request.category}
**Priority:** ${request.priority}
**Description:** ${request.description}

## Implementation Requirements
1. **Technical Approach**: Implement using existing architecture patterns
2. **UI Components**: Use shadcn/ui components with consistent theming
3. **Data Layer**: Add necessary database schema and API endpoints
4. **Integration**: Follow existing code patterns and conventions

## Acceptance Criteria
- [ ] Feature works as described
- [ ] Follows existing UI/UX patterns
- [ ] Includes proper error handling
- [ ] Database changes use Drizzle ORM
- [ ] API endpoints follow REST conventions
- [ ] TypeScript types are properly defined

## Files Likely to be Modified
- Database schema: \`shared/schema.ts\`
- API routes: \`server/routes.ts\`
- Frontend pages: \`client/src/pages/\`
- UI components: \`client/src/components/\`

*Generated by Q-BRIDGE AI Assistant using ${selectedAiProvider.toUpperCase()}*`;
  };

  const handleUpvote = (requestId: number) => {
    setVotingRequest(requestId);
    // Simple user ID simulation - in real app, use actual user ID from auth
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    upvoteRequestMutation.mutate({ id: requestId, userId });
  };

  const toggleRequestExpanded = (requestId: number) => {
    const newExpanded = new Set(expandedRequests);
    if (newExpanded.has(requestId)) {
      newExpanded.delete(requestId);
    } else {
      newExpanded.add(requestId);
    }
    setExpandedRequests(newExpanded);
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const themeOptions = [
    {
      id: "sidra",
      name: themes.sidra.name,
      description: "Teal and green palette",
      preview: "bg-gradient-to-r from-teal-500 to-emerald-500"
    },
    {
      id: "hbku",
      name: themes.hbku.name,
      description: "Blue and indigo palette",
      preview: "bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-800"
    },
    {
      id: "wcmq",
      name: themes.wcmq.name,
      description: "Cornell red palette",
      preview: "bg-gradient-to-r from-red-400 via-red-500 to-red-700"
    }
  ];

  const handleLabelChange = (institution: string, tier: 'tier1' | 'tier2' | 'tier3' | 'abbr1' | 'abbr2' | 'abbr3', value: string) => {
    setInstitutionLabels({
      ...institutionLabels,
      [institution]: {
        ...institutionLabels[institution],
        [tier]: value
      }
    });
  };

  const resetLabelsToDefault = () => {
    setInstitutionLabels(defaultInstitutionLabels);
    toast({ title: "Labels reset to defaults" });
  };

  // Guard — non-admin users should not reach this page
  if (!userIsAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <Lock className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Access Restricted</h2>
        <p className="text-muted-foreground max-w-sm">
          Settings are only accessible to administrators. Contact your system admin if you need access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-foreground" />
          <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full ml-1">Admin only</span>
        </div>
        <Button
          onClick={handleSaveSettings}
          disabled={saving}
          className="bg-primary min-w-[120px]"
          data-testid="button-save-settings"
        >
          {saving ? (
            <>
              <span className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full inline-block" />
              Saving…
            </>
          ) : (
            'Save Settings'
          )}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-1 sm:grid-cols-2 xl:grid-cols-5">
          <TabsTrigger value="layout-theme" className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Layout & Theme
          </TabsTrigger>
          <TabsTrigger value="team" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Team Members
          </TabsTrigger>
          <TabsTrigger value="access-control" className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Access Control
          </TabsTrigger>
          <TabsTrigger value="authentication" className="flex items-center gap-2" data-testid="tab-authentication">
            <ShieldCheck className="h-4 w-4" />
            Authentication
          </TabsTrigger>
          <TabsTrigger value="data-import-export" className="flex items-center gap-2" data-testid="tab-data-import-export">
            <Layers className="h-4 w-4" />
            Data Import & Export
          </TabsTrigger>
        </TabsList>

        <TabsContent value="layout-theme" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Theme Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Theme Selection
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="theme-selector">Application Theme</Label>
                  <Select value={themeName} onValueChange={setTheme}>
                    <SelectTrigger id="theme-selector">
                      <SelectValue placeholder="Select a theme" />
                    </SelectTrigger>
                    <SelectContent>
                      {themeOptions.map((theme) => (
                        <SelectItem key={theme.id} value={theme.id}>
                          <div className="flex items-center gap-3">
                            <div className={`w-4 h-4 rounded ${theme.preview}`}></div>
                            <div>
                              <div className="font-medium">{theme.name}</div>
                              <div className="text-sm text-muted-foreground">{theme.description}</div>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Theme Preview */}
                <div className="space-y-2">
                  <Label>Theme Preview</Label>
                  <div className="border rounded-lg p-4 space-y-3">
                    {themeOptions.map((theme) => (
                      theme.id === themeName && (
                        <div key={theme.id} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{theme.name}</span>
                            <div className={`w-6 h-6 rounded ${theme.preview}`}></div>
                          </div>
                          <div className="text-sm text-muted-foreground">{theme.description}</div>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Global Default Color Mode — admin only */}
            {userIsAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {globalColorMode === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                    Default Color Mode
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Sets the color mode applied to users who have not set their own preference.
                    Individual users can still override this using the toggle in the top navigation bar.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3 rounded-lg border p-4">
                    <button
                      type="button"
                      onClick={() => setGlobalColorMode('light')}
                      className={`flex-1 flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                        globalColorMode === 'light'
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <Sun className={`h-6 w-6 ${globalColorMode === 'light' ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className={`text-sm font-medium ${globalColorMode === 'light' ? 'text-primary' : 'text-muted-foreground'}`}>
                        Light
                      </span>
                      {globalColorMode === 'light' && (
                        <span className="text-xs text-primary">Current default</span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setGlobalColorMode('dark')}
                      className={`flex-1 flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                        globalColorMode === 'dark'
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <Moon className={`h-6 w-6 ${globalColorMode === 'dark' ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className={`text-sm font-medium ${globalColorMode === 'dark' ? 'text-primary' : 'text-muted-foreground'}`}>
                        Dark
                      </span>
                      {globalColorMode === 'dark' && (
                        <span className="text-xs text-primary">Current default</span>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Saved when you click <strong>Save Settings</strong>. Applies to all users who haven't set a personal preference. Users who have manually toggled their own mode are not affected.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Institution Labels Configuration - Only show active institution */}
          {(() => {
            const activeTheme = themeOptions.find(t => t.id === themeName);
            if (!activeTheme) return null;
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded ${activeTheme.preview}`}></div>
                      <span>{activeTheme.name} Labels</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={resetLabelsToDefault}>
                      Reset to Defaults
                    </Button>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Customize the terminology for your institution's project hierarchy
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor={`${activeTheme.id}-tier1`} className="text-xs text-muted-foreground">
                        Tier 1 Label
                      </Label>
                      <Input
                        id={`${activeTheme.id}-tier1`}
                        value={institutionLabels[activeTheme.id]?.tier1 || ''}
                        onChange={(e) => handleLabelChange(activeTheme.id, 'tier1', e.target.value)}
                        placeholder="e.g., Program, Department"
                        data-testid={`input-label-${activeTheme.id}-tier1`}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${activeTheme.id}-tier2`} className="text-xs text-muted-foreground">
                        Tier 2 Label
                      </Label>
                      <Input
                        id={`${activeTheme.id}-tier2`}
                        value={institutionLabels[activeTheme.id]?.tier2 || ''}
                        onChange={(e) => handleLabelChange(activeTheme.id, 'tier2', e.target.value)}
                        placeholder="e.g., Project, Laboratory"
                        data-testid={`input-label-${activeTheme.id}-tier2`}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${activeTheme.id}-tier3`} className="text-xs text-muted-foreground">
                        Tier 3 Label
                      </Label>
                      <Input
                        id={`${activeTheme.id}-tier3`}
                        value={institutionLabels[activeTheme.id]?.tier3 || ''}
                        onChange={(e) => handleLabelChange(activeTheme.id, 'tier3', e.target.value)}
                        placeholder="e.g., Research Activity, Study"
                        data-testid={`input-label-${activeTheme.id}-tier3`}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor={`${activeTheme.id}-abbr1`} className="text-xs text-muted-foreground">
                        Tier 1 Abbreviation
                      </Label>
                      <Input
                        id={`${activeTheme.id}-abbr1`}
                        value={institutionLabels[activeTheme.id]?.abbr1 || ''}
                        onChange={(e) => handleLabelChange(activeTheme.id, 'abbr1', e.target.value)}
                        placeholder="e.g., PRM, DPT"
                        data-testid={`input-abbr-${activeTheme.id}-abbr1`}
                        className="uppercase"
                        maxLength={5}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${activeTheme.id}-abbr2`} className="text-xs text-muted-foreground">
                        Tier 2 Abbreviation
                      </Label>
                      <Input
                        id={`${activeTheme.id}-abbr2`}
                        value={institutionLabels[activeTheme.id]?.abbr2 || ''}
                        onChange={(e) => handleLabelChange(activeTheme.id, 'abbr2', e.target.value)}
                        placeholder="e.g., PRJ, LAB"
                        data-testid={`input-abbr-${activeTheme.id}-abbr2`}
                        className="uppercase"
                        maxLength={5}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${activeTheme.id}-abbr3`} className="text-xs text-muted-foreground">
                        Tier 3 Abbreviation
                      </Label>
                      <Input
                        id={`${activeTheme.id}-abbr3`}
                        value={institutionLabels[activeTheme.id]?.abbr3 || ''}
                        onChange={(e) => handleLabelChange(activeTheme.id, 'abbr3', e.target.value)}
                        placeholder="e.g., SDR, STD"
                        data-testid={`input-abbr-${activeTheme.id}-abbr3`}
                        className="uppercase"
                        maxLength={5}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Section Rollout */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Section Rollout
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Turn whole sections or individual pages on and off to roll out the portal one
                area at a time. When a section is off, all its pages are hidden; within a
                visible section, each page can be switched separately.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {TOGGLEABLE_SECTIONS.map((sectionTitle) => (
                  <div
                    key={sectionTitle}
                    className="rounded-lg border p-3 space-y-2"
                    data-testid={`row-section-${sectionTitle}`}
                  >
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`switch-section-${sectionTitle}`} className="cursor-pointer font-medium">
                        {sectionTitle}
                      </Label>
                      <Switch
                        id={`switch-section-${sectionTitle}`}
                        checked={isSectionVisible(sectionTitle)}
                        onCheckedChange={(checked) => setSectionVisible(sectionTitle, checked)}
                        data-testid={`switch-section-${sectionTitle}`}
                      />
                    </div>
                    {isSectionVisible(sectionTitle) && (TOGGLEABLE_PAGES[sectionTitle] || []).length > 0 && (
                      <div className="ml-4 border-l pl-4 space-y-2">
                        {(TOGGLEABLE_PAGES[sectionTitle] || []).map((page) => (
                          <div
                            key={page.href}
                            className="flex items-center justify-between"
                            data-testid={`row-page-${page.href}`}
                          >
                            <Label
                              htmlFor={`switch-page-${page.href}`}
                              className="cursor-pointer text-sm text-muted-foreground"
                            >
                              {page.label}
                            </Label>
                            <Switch
                              id={`switch-page-${page.href}`}
                              checked={isPageVisible(page.href)}
                              onCheckedChange={(checked) => setPageVisible(page.href, checked)}
                              data-testid={`switch-page-${page.href}`}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Application Info */}
          <Card>
            <CardHeader>
              <CardTitle>Application Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="font-medium text-muted-foreground">Application Name</div>
                  <div>Q-BRIDGE: Qatar Biomedical Research Inter-Institutional Data &amp; Governance Ecosystem</div>
                </div>
                <div>
                  <div className="font-medium text-muted-foreground">Current Theme</div>
                  <div>{themeOptions.find(t => t.id === themeName)?.name}</div>
                </div>
                <div>
                  <div className="font-medium text-muted-foreground">Display Mode</div>
                  <div>{mode === 'dark' ? 'Dark Mode' : 'Light Mode'}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sticky save bar */}
          <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t pt-4 pb-2 flex justify-end gap-3">
            <p className="text-sm text-muted-foreground self-center">
              Changes on this tab are not applied until you save.
            </p>
            <Button
              onClick={handleSaveSettings}
              disabled={saving}
              className="bg-primary min-w-[120px]"
            >
              {saving ? (
                <>
                  <span className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full inline-block" />
                  Saving…
                </>
              ) : (
                'Save Settings'
              )}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="team" className="space-y-6">
          <TeamManagement />
        </TabsContent>

        <TabsContent value="authentication" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Sign-in Mode
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* SSO enable toggle — defaults to off. The toggle reflects the
                  server-controlled AUTH_MODE setting; flipping SSO on/off is done
                  on the server (see the env vars below), so the control is shown
                  read-only here. */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-1">
                  <Label className="font-medium" htmlFor="switch-sso-enabled">
                    Single Sign-On (SSO)
                  </Label>
                  <div className="text-sm text-muted-foreground">
                    Off by default. When off, users pick a role from the sidebar
                    (development) or sign in with a local username and password.
                    Turn on by setting <code className="px-1 rounded bg-muted">AUTH_MODE</code> to
                    {" "}<code className="px-1 rounded bg-muted">ldap</code> or
                    {" "}<code className="px-1 rounded bg-muted">oidc</code> on the server.
                  </div>
                </div>
                <Switch
                  id="switch-sso-enabled"
                  checked={authConfig.ssoEnabled}
                  disabled
                  data-testid="switch-sso-enabled"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-1">
                  <div className="font-medium" data-testid="text-auth-mode">
                    {authConfig.mode === "oidc"
                      ? `Single Sign-On — ${authConfig.providerName || "OIDC"}`
                      : authConfig.mode === "ldap"
                      ? "Single Sign-On — LDAP / Active Directory"
                      : authConfig.mode === "demo"
                      ? "Demo mode (open access guest)"
                      : "Local login / role emulation"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {authConfig.ssoEnabled
                      ? "Users sign in through your identity provider. The role selector and local login form are hidden."
                      : authConfig.mode === "demo"
                      ? "Everyone is signed in as a shared guest. No login is required."
                      : "Anyone can pick a role from the sidebar to emulate that user. No real authentication is enforced."}
                  </div>
                </div>
                <Badge
                  variant={authConfig.ssoEnabled ? "default" : "secondary"}
                  data-testid="badge-auth-status"
                >
                  {authConfig.ssoEnabled ? "SSO ON" : "SSO OFF"}
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border p-3">
                  <div className="text-xs uppercase text-muted-foreground">Mode</div>
                  <div className="font-medium" data-testid="text-auth-provider">{authConfig.mode}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs uppercase text-muted-foreground">Logout endpoint</div>
                  <div className="font-medium">
                    {authConfig.mode === "oidc"
                      ? "Provider end-session"
                      : "Local /api/auth/logout"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Switching on SSO
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Sign-in is controlled by the <code className="px-1 rounded bg-muted">AUTH_MODE</code> environment
                variable on the server: <code className="px-1 rounded bg-muted">local</code> (default),
                {" "}<code className="px-1 rounded bg-muted">demo</code>,
                {" "}<code className="px-1 rounded bg-muted">ldap</code>, or
                {" "}<code className="px-1 rounded bg-muted">oidc</code>. Set it in the institution's
                deployment and restart the app — no code changes required.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>
                  Choose a mode by setting <code className="px-1 rounded bg-muted">AUTH_MODE</code>.
                  Leave it unset (or <code className="px-1 rounded bg-muted">local</code>) to keep
                  today's behaviour.
                </li>
                <li>For OIDC (e.g. Microsoft Entra ID), set the OIDC variables below; for LDAP set the LDAP variables.</li>
                <li>Restart the app. The server log shows the active mode, e.g.
                  <code className="px-1 mx-1 rounded bg-muted">[auth] SSO ENABLED — mode=oidc</code>.</li>
                <li>To turn SSO back off, set <code className="px-1 rounded bg-muted">AUTH_MODE=local</code> and restart.</li>
              </ol>

              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 font-medium">Variable</th>
                      <th className="text-left p-2 font-medium">Mode</th>
                      <th className="text-left p-2 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="p-2 font-mono text-xs">AUTH_MODE</td>
                      <td className="p-2">all</td>
                      <td className="p-2 text-muted-foreground">local (default) | demo | ldap | oidc</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-xs">AUTH_DEFAULT_ROLE</td>
                      <td className="p-2">ldap / oidc</td>
                      <td className="p-2 text-muted-foreground">Role for new SSO users on first sign-in (default Investigator)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-xs">OIDC_ISSUER_URL</td>
                      <td className="p-2">oidc</td>
                      <td className="p-2 text-muted-foreground">Issuer URL, e.g. https://login.microsoftonline.com/&lt;tenant&gt;/v2.0</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-xs">OIDC_CLIENT_ID</td>
                      <td className="p-2">oidc</td>
                      <td className="p-2 text-muted-foreground">Application (client) ID</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-xs">OIDC_CLIENT_SECRET</td>
                      <td className="p-2">oidc</td>
                      <td className="p-2 text-muted-foreground">Client secret value</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-xs">OIDC_REDIRECT_URI</td>
                      <td className="p-2">oidc</td>
                      <td className="p-2 text-muted-foreground">Must match the registered redirect, e.g. https://&lt;host&gt;/api/auth/callback</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-xs">OIDC_PROVIDER_NAME</td>
                      <td className="p-2">oidc</td>
                      <td className="p-2 text-muted-foreground">Button label, e.g. "Microsoft"</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-xs">OIDC_POST_LOGOUT_REDIRECT_URI</td>
                      <td className="p-2">oidc</td>
                      <td className="p-2 text-muted-foreground">Optional — where the provider sends users after sign-out</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-xs">LDAP_URL</td>
                      <td className="p-2">ldap</td>
                      <td className="p-2 text-muted-foreground">Directory URL, e.g. ldaps://ad.example.org:636</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-xs">LDAP_BIND_DN / LDAP_BIND_PASSWORD</td>
                      <td className="p-2">ldap</td>
                      <td className="p-2 text-muted-foreground">Service account used to search for users</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-xs">LDAP_SEARCH_BASE / LDAP_SEARCH_FILTER</td>
                      <td className="p-2">ldap</td>
                      <td className="p-2 text-muted-foreground">Where/how to find a user (use {"{{username}}"} placeholder)</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 dark:text-amber-400" />
                <div>
                  When SSO is enabled, the sidebar role selector and the local username /
                  password form are hidden. New users are auto-provisioned from their
                  provider profile and assigned the default role above.
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="feature-requests" className="space-y-6">
          {/* User Explanation Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5" />
                How AI-Powered Feature Requests Work
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <div className="bg-blue-100 dark:bg-blue-900/20 text-blue-600 rounded-full p-1 mt-0.5 dark:text-blue-400">
                    <MessageSquarePlus className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium">1. Submit Your Request</div>
                    <div className="text-muted-foreground">Describe what you need in plain language. Include your name and categorize the request by priority.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-green-100 dark:bg-green-900/20 text-green-600 rounded-full p-1 mt-0.5 dark:text-green-400">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium">2. AI Enhancement</div>
                    <div className="text-muted-foreground">Click "Enhance" to let AI analyze your request and generate a detailed developer prompt with technical requirements, suggested implementation approach, and acceptance criteria.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-purple-100 dark:bg-purple-900/20 text-purple-600 rounded-full p-1 mt-0.5 dark:text-purple-400">
                    <ThumbsUp className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium">3. Community Voting</div>
                    <div className="text-muted-foreground">Other users can upvote requests they find valuable, helping prioritize the most requested features.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-orange-100 dark:bg-orange-900/20 text-orange-600 rounded-full p-1 mt-0.5 dark:text-orange-400">
                    <CheckCircle className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium">4. Developer Implementation</div>
                    <div className="text-muted-foreground">Copy the AI-generated prompt and use it with development tools like Replit Agent for efficient implementation.</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Submit New Request */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquarePlus className="h-5 w-5" />
                  Submit Feature Request
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="request-title">Title</Label>
                  <Input
                    id="request-title"
                    placeholder="Brief description of the feature"
                    value={requestForm.title}
                    onChange={(e) => setRequestForm({ ...requestForm, title: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="request-description">Description</Label>
                  <Textarea
                    id="request-description"
                    placeholder="Detailed description of what you need..."
                    className="min-h-[100px]"
                    value={requestForm.description}
                    onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="request-category">Category</Label>
                    <Select value={requestForm.category} onValueChange={(value) => setRequestForm({ ...requestForm, category: value })}>
                      <SelectTrigger id="request-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categoryOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <span>{option.icon}</span>
                              {option.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="request-priority">Priority</Label>
                    <Select value={requestForm.priority} onValueChange={(value) => setRequestForm({ ...requestForm, priority: value })}>
                      <SelectTrigger id="request-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {priorityOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="request-tags">Tags (comma-separated)</Label>
                  <Input
                    id="request-tags"
                    placeholder="dashboard, export, automation"
                    value={requestForm.tags}
                    onChange={(e) => setRequestForm({ ...requestForm, tags: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="requested-by">Your Name (optional)</Label>
                  <Input
                    id="requested-by"
                    placeholder="Your name for credit"
                    value={requestForm.requestedBy}
                    onChange={(e) => setRequestForm({ ...requestForm, requestedBy: e.target.value })}
                  />
                  <div className="text-xs text-muted-foreground mt-1">
                    Leave blank for anonymous submission
                  </div>
                </div>

                <Button 
                  onClick={handleSubmitRequest} 
                  className="w-full bg-primary" 
                  disabled={createRequestMutation.isPending}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {createRequestMutation.isPending ? 'Submitting...' : 'Submit Request'}
                </Button>
              </CardContent>
            </Card>

            {/* AI Enhancement Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5" />
                  AI Enhancement
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="ai-provider">AI Provider</Label>
                  <Select value={selectedAiProvider} onValueChange={setSelectedAiProvider}>
                    <SelectTrigger id="ai-provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {aiProviders.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          <div>
                            <div className="font-medium">{provider.name}</div>
                            <div className="text-sm text-muted-foreground">{provider.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Zap className="h-4 w-4 text-blue-600 mt-0.5 dark:text-blue-400" />
                    <div className="text-sm">
                      <div className="font-medium text-blue-600 dark:text-blue-400">How it works</div>
                      <div className="text-blue-600/80 mt-1">
                        AI analyzes your request and generates a detailed developer prompt with technical requirements, 
                        implementation suggestions, and acceptance criteria based on Q-BRIDGE architecture.
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Request Statistics */}
            <Card>
              <CardHeader>
                <CardTitle>Request Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {statusOptions.map((status) => {
                    const count = Array.isArray(featureRequests) ? featureRequests.filter(req => req.status === status.value).length : 0;
                    const Icon = status.icon;
                    return (
                      <div key={status.value} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <span className="text-sm">{status.label}</span>
                        </div>
                        <Badge variant="outline" className={status.color}>
                          {count}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Feature Requests List */}
          <Card>
            <CardHeader>
              <CardTitle>Feature Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {requestsLoading ? (
                <div className="text-center py-8">Loading requests...</div>
              ) : !Array.isArray(featureRequests) || featureRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No feature requests yet. Submit your first request above!
                </div>
              ) : (
                <div className="space-y-4">
                  {Array.isArray(featureRequests) && featureRequests
                    .sort((a, b) => b.upvotes - a.upvotes) // Sort by upvotes (most popular first)
                    .map((request) => {
                    const statusInfo = statusOptions.find(s => s.value === request.status);
                    const priorityInfo = priorityOptions.find(p => p.value === request.priority);
                    const categoryInfo = categoryOptions.find(c => c.value === request.category);
                    const StatusIcon = statusInfo?.icon || Clock;
                    const isExpanded = expandedRequests.has(request.id);

                    return (
                      <div key={request.id} className="border rounded-lg overflow-hidden">
                        {/* Request Header - Always Visible */}
                        <div className="p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleRequestExpanded(request.id)}
                                  className="p-1 h-6 w-6"
                                >
                                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                                <h3 className="font-medium">{request.title}</h3>
                                <Badge variant="outline" className={statusInfo?.color}>
                                  <StatusIcon className="h-3 w-3 mr-1" />
                                  {statusInfo?.label}
                                </Badge>
                                <Badge variant="outline" className={priorityInfo?.color}>
                                  {priorityInfo?.label}
                                </Badge>
                                <Badge variant="outline">
                                  {categoryInfo?.icon} {categoryInfo?.label}
                                </Badge>
                              </div>
                              
                              {/* Request Info Row */}
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  <span>{request.requestedBy}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  <span>{formatDate(request.createdAt)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <ThumbsUp className="h-3 w-3" />
                                  <span>{request.upvotes} votes</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex gap-2 ml-4">
                              {/* Upvote Button */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleUpvote(request.id)}
                                disabled={votingRequest === request.id}
                                className="flex items-center gap-1"
                              >
                                <ThumbsUp className={`h-4 w-4 ${request.upvotes > 0 ? 'text-blue-600' : ''}`} />
                                {request.upvotes}
                              </Button>

                              {request.status === 'pending' && (
                                <Button
                                  size="sm"
                                  onClick={() => handleEnhanceRequest(request)}
                                  disabled={enhancingRequest === request.id}
                                  className="bg-primary"
                                >
                                  <Lightbulb className="h-4 w-4 mr-1" />
                                  {enhancingRequest === request.id ? 'Enhancing...' : 'Enhance'}
                                </Button>
                              )}
                              
                              {request.enhancedPrompt && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    navigator.clipboard.writeText(request.enhancedPrompt!);
                                    toast({ title: "Prompt copied to clipboard!" });
                                  }}
                                >
                                  Copy Prompt
                                </Button>
                              )}

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => deleteRequestMutation.mutate(request.id)}
                                disabled={deleteRequestMutation.isPending}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Collapsible Content */}
                        {isExpanded && (
                          <div className="border-t bg-muted/50 p-4 space-y-3">
                            <div>
                              <div className="text-sm font-medium mb-2">Description</div>
                              <p className="text-sm text-muted-foreground">{request.description}</p>
                            </div>
                            
                            {request.tags && request.tags.length > 0 && (
                              <div>
                                <div className="text-sm font-medium mb-2">Tags</div>
                                <div className="flex gap-1 flex-wrap">
                                  {request.tags.map((tag: string, idx: number) => (
                                    <Badge key={idx} variant="secondary" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {request.enhancedPrompt && (
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <Lightbulb className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                  <span className="text-sm font-medium">AI-Enhanced Developer Prompt</span>
                                  <Badge variant="outline" className="text-xs">
                                    {request.aiProvider?.toUpperCase()}
                                  </Badge>
                                </div>
                                <div className="bg-white dark:bg-gray-900 border rounded p-3 max-h-60 overflow-y-auto">
                                  <pre className="text-xs whitespace-pre-wrap text-muted-foreground">
                                    {request.enhancedPrompt}
                                  </pre>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="access-control" className="space-y-6">
          <RoleAccessConfig embedded />
        </TabsContent>

        <TabsContent value="data-import-export" className="space-y-6">
          <BulkDataHub />
        </TabsContent>
      </Tabs>
    </div>
  );
}