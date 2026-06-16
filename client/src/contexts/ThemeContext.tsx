import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type ThemeName = 'sidra' | 'hbku' | 'wcmq';

export interface InstitutionLabels {
  tier1: string;
  tier2: string;
  tier3: string;
  abbr1: string;
  abbr2: string;
  abbr3: string;
}

export interface InstitutionConfig {
  [key: string]: InstitutionLabels;
}

// Sidebar sections that can be rolled out one at a time.
export const TOGGLEABLE_SECTIONS = [
  'Research Management',
  'PMO Office',
  'IRB Compliance',
  'IBC Compliance',
  'Research Data Management',
  'Outcomes & Reports',
] as const;

export type SectionVisibility = Record<string, boolean>;

export const defaultInstitutionLabels: InstitutionConfig = {
  sidra: { tier1: 'Program', tier2: 'Project', tier3: 'Research Activity', abbr1: 'PRM', abbr2: 'PRJ', abbr3: 'SDR' },
  hbku: { tier1: 'Scientific Center', tier2: 'Laboratory', tier3: 'Project', abbr1: 'SC', abbr2: 'LAB', abbr3: 'PRJ' },
  wcmq: { tier1: 'Department', tier2: 'Research Program', tier3: 'Study', abbr1: 'DPT', abbr2: 'RP', abbr3: 'STD' }
};

interface ThemeContextType {
  themeName: ThemeName;
  institutionLabels: InstitutionConfig;
  currentLabels: InstitutionLabels;
  sectionVisibility: SectionVisibility;
  isSectionVisible: (sectionTitle: string) => boolean;
  setSectionVisible: (sectionTitle: string, visible: boolean) => void;
  setTheme: (theme: ThemeName) => void;
  setInstitutionLabels: (labels: InstitutionConfig) => void;
  /** Persists all current settings to the server. Returns true on success. */
  saveSettings: (extraKeys?: Record<string, unknown>) => Promise<boolean>;
  settingsLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const themes = {
  sidra: {
    name: 'Sidra Medicine',
    colors: {
      primary: {
        50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4',
        400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e',
        800: '#115e59', 900: '#134e4a',
      },
      secondary: {
        50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac',
        400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d',
        800: '#166534', 900: '#14532d',
      }
    }
  },
  hbku: {
    name: 'Hamad Bin Khalifa University',
    colors: {
      primary: {
        50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc',
        400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1',
        800: '#075985', 900: '#0c4a6e',
      },
      secondary: {
        50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc',
        400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca',
        800: '#3730a3', 900: '#312e81',
      }
    }
  },
  wcmq: {
    name: 'Weill Cornell Medicine-Qatar',
    colors: {
      primary: {
        50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5',
        400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c',
        800: '#991b1b', 900: '#7f1d1d',
      },
      secondary: {
        50: '#fafafa', 100: '#f5f5f5', 200: '#e5e5e5', 300: '#d4d4d4',
        400: '#a3a3a3', 500: '#737373', 600: '#525252', 700: '#404040',
        800: '#262626', 900: '#171717',
      }
    }
  }
};

// ---------------------------------------------------------------------------
// Helpers to read / write system_configurations
// ---------------------------------------------------------------------------
async function fetchConfig(key: string): Promise<unknown> {
  const res = await fetch(`/api/system-configurations/${key}`);
  if (!res.ok) return undefined;
  const cfg = await res.json();
  return cfg?.value;
}

async function upsertConfig(key: string, value: unknown, category = 'appearance'): Promise<void> {
  const putRes = await fetch(`/api/system-configurations/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value, category }),
  });
  if (putRes.status === 404) {
    await fetch('/api/system-configurations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value, category }),
    });
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  // Initialise from localStorage so the first paint is instant, then the
  // useEffect below overwrites with the server values.
  const [themeName, setThemeName] = useState<ThemeName>(() => {
    const stored = localStorage.getItem('theme-name');
    if (stored === 'qbri') return 'hbku'; // legacy migration
    return (stored as ThemeName) || 'sidra';
  });

  const [institutionLabels, setInstitutionLabels] = useState<InstitutionConfig>(() => {
    const stored = localStorage.getItem('institution-labels');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const merged: InstitutionConfig = {};
        for (const key of Object.keys(defaultInstitutionLabels)) {
          merged[key] = { ...defaultInstitutionLabels[key], ...(parsed[key] || {}) };
        }
        return merged;
      } catch { /**/ }
    }
    return defaultInstitutionLabels;
  });

  const [sectionVisibility, setSectionVisibility] = useState<SectionVisibility>(() => {
    const stored = localStorage.getItem('section-visibility');
    if (stored) {
      try { return JSON.parse(stored) as SectionVisibility; } catch { /**/ }
    }
    return {};
  });

  const [settingsLoading, setSettingsLoading] = useState(true);

  // ----- Load settings from server on mount --------------------------------
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [theme, labels, sections] = await Promise.all([
          fetchConfig('app_theme_name'),
          fetchConfig('app_institution_labels'),
          fetchConfig('app_section_visibility'),
        ]);

        if (cancelled) return;

        if (typeof theme === 'string' && (theme === 'sidra' || theme === 'hbku' || theme === 'wcmq')) {
          setThemeName(theme as ThemeName);
          localStorage.setItem('theme-name', theme);
        }
        if (labels && typeof labels === 'object') {
          const merged: InstitutionConfig = {};
          for (const key of Object.keys(defaultInstitutionLabels)) {
            merged[key] = {
              ...defaultInstitutionLabels[key],
              ...((labels as InstitutionConfig)[key] || {}),
            };
          }
          setInstitutionLabels(merged);
          localStorage.setItem('institution-labels', JSON.stringify(merged));
        }
        if (sections && typeof sections === 'object') {
          setSectionVisibility(sections as SectionVisibility);
          localStorage.setItem('section-visibility', JSON.stringify(sections));
        }
      } catch {
        // Server unreachable — localStorage fallback already applied
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ----- Apply theme CSS whenever themeName changes ------------------------
  useEffect(() => {
    const root = document.documentElement;
    const theme = themes[themeName];
    root.setAttribute('data-theme', themeName);
    Object.entries(theme.colors.primary).forEach(([shade, color]) => {
      root.style.setProperty(`--color-primary-${shade}`, color);
    });
    Object.entries(theme.colors.secondary).forEach(([shade, color]) => {
      root.style.setProperty(`--color-secondary-${shade}`, color);
    });
    root.style.setProperty('--color-primary', theme.colors.primary[500]);
    root.style.setProperty('--color-primary-foreground', '#ffffff');
    root.style.setProperty('--color-secondary', theme.colors.secondary[500]);
    root.style.setProperty('--color-secondary-foreground', '#ffffff');
  }, [themeName]);

  // ----- Setters (in-memory only — nothing auto-saves to server) -----------
  const setTheme = useCallback((theme: ThemeName) => {
    setThemeName(theme);
  }, []);

  const setSectionVisible = useCallback((sectionTitle: string, visible: boolean) => {
    setSectionVisibility(prev => ({ ...prev, [sectionTitle]: visible }));
  }, []);

  // ----- Save all settings to server + localStorage ------------------------
  const saveSettings = useCallback(async (extraKeys: Record<string, unknown> = {}): Promise<boolean> => {
    try {
      await Promise.all([
        upsertConfig('app_theme_name', themeName),
        upsertConfig('app_institution_labels', institutionLabels),
        upsertConfig('app_section_visibility', sectionVisibility),
        ...Object.entries(extraKeys).map(([k, v]) => upsertConfig(k, v)),
      ]);
      // Mirror to localStorage so the next page-load is instant
      localStorage.setItem('theme-name', themeName);
      localStorage.setItem('institution-labels', JSON.stringify(institutionLabels));
      localStorage.setItem('section-visibility', JSON.stringify(sectionVisibility));
      return true;
    } catch {
      return false;
    }
  }, [themeName, institutionLabels, sectionVisibility]);

  const isSectionVisible = useCallback(
    (sectionTitle: string) => sectionVisibility[sectionTitle] !== false,
    [sectionVisibility]
  );

  const currentLabels = institutionLabels[themeName] || defaultInstitutionLabels.sidra;

  const value: ThemeContextType = {
    themeName,
    institutionLabels,
    currentLabels,
    sectionVisibility,
    isSectionVisible,
    setSectionVisible,
    setTheme,
    setInstitutionLabels,
    saveSettings,
    settingsLoading,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export { themes };
