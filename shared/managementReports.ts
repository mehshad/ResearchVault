import { z } from "zod";

export const MANAGEMENT_REPORT_CATEGORIES = [
  "sdrs",
  "publications",
  "grants",
  "contracts",
  "patents",
] as const;

export type ManagementReportCategory = typeof MANAGEMENT_REPORT_CATEGORIES[number];
export const MANAGEMENT_REPORT_DOMAINS = [
  "overview",
  ...MANAGEMENT_REPORT_CATEGORIES,
  "sidra",
] as const;
export type ManagementReportDomain = typeof MANAGEMENT_REPORT_DOMAINS[number];

export const MANAGEMENT_REPORT_LIMITS = {
  maxStaffInSection: 250,
  maxRowsPerCategory: 1_001,
  maxTotalRows: 2_000,
  maxTextBytes: 2_000_000,
} as const;

export const managementReportConfigSchema = z.object({
  targetType: z.enum(["staff", "section"]),
  targetId: z.number().int().positive(),
  domains: z.array(z.enum(MANAGEMENT_REPORT_DOMAINS)).min(1)
    .transform((values) => [...new Set(values)]),
  lookbackYears: z.number().int().min(1).max(20),
  activeSdrOnly: z.boolean(),
  awardedGrantsOnly: z.boolean(),
  publicationStatuses: z.array(z.string().trim().min(1).max(100)).max(50),
  contractStatuses: z.array(z.string().trim().min(1).max(100)).max(50),
  patentStatuses: z.array(z.string().trim().min(1).max(100)).max(50),
}).strict();

export type ManagementReportConfig = z.infer<typeof managementReportConfigSchema>;

export const MANAGEMENT_REPORT_FILTER_DEFINITIONS = {
  dateRange:
    "The inclusive rolling lookback starts on the same UTC calendar date lookbackYears before generation. SDR uses startDate; publication uses publicationDate; grant uses startDate; contract uses startDate; patent uses filingDate. Records without that category date are excluded.",
  statuses:
    "Exact, case-insensitive matches against each record's current status. An omitted or empty category list does not filter that category.",
  relationships:
    "SDRs use projectMembers; publications use publicationAuthors; grants use LPI or grantResearchActivities linked to a member SDR; contracts use leadPI or their linked member SDR; patents use only a related SDR's projectMembers membership. Free-text author, inventor, and co-investigator names are never used.",
} as const;

export interface ManagementReportRow {
  id: number;
  reference: string | null;
  title: string;
  status: string | null;
  date: string | null;
  scientistIds: number[];
}

export interface ManagementReportStaff {
  id: number;
  name: string;
  staffId: string | null;
  sectionId: number | null;
}

export interface ManagementReportData {
  generatedAt: string;
  config: ManagementReportConfig;
  filterDefinitions: typeof MANAGEMENT_REPORT_FILTER_DEFINITIONS;
  targetLabel: string;
  staff: ManagementReportStaff[];
  rows: Partial<Record<ManagementReportCategory, ManagementReportRow[]>>;
  totals: Record<ManagementReportCategory, number>;
  /** Alias used by compact preview clients. */
  counts: Record<ManagementReportCategory, number>;
  total: number;
  overview?: {
    scope: {
      targetType: "staff" | "section";
      targetId: number;
      staffCount: number;
    };
    totalRecords: number;
    domains: Array<{
      domain: ManagementReportCategory;
      count: number;
      statusCounts: Record<string, number>;
    }>;
  };
  officialSidra?: Array<{
    scientistId: number;
    publicationsCount: number;
    sidraScore: number;
  }>;
  /**
   * Benchmarking of a single subject against their peer cohort. Only produced
   * for single-staff reports. Peers are deliberately anonymised: an individual
   * evaluation report should show where someone stands without distributing
   * named performance data about colleagues.
   */
  peerComparison?: ManagementReportPeerComparison;
}

export interface ManagementReportPeerComparison {
  subject: { scientistId: number; name: string; sidraScore: number; publicationsCount: number };
  cohort: {
    label: string;
    size: number;
    scored: number;
    mean: number;
    median: number;
    p25: number;
    p75: number;
    max: number;
  };
  rank: number;
  percentile: number;
  /** Score distribution across the cohort, subject's bin flagged. */
  distribution: Array<{ label: string; count: number; containsSubject: boolean }>;
  /** Anonymised ladder around the subject's position. */
  ladder: Array<{ label: string; score: number; publications: number; isSubject: boolean }>;
  /** Subject output per calendar year, with the cohort median for context. */
  yearly: Array<{ year: number; publications: number; score: number; cohortMedianPublications: number }>;
  /** Authorship role mix across the subject's counted publications. */
  authorship: Array<{ role: string; count: number }>;
  /** Highest-scoring publications for the subject. */
  topPublications: Array<{
    title: string;
    journal: string | null;
    year: number;
    impactFactor: number;
    roles: string[];
    score: number;
  }>;
  departmentCohort?: { label: string; size: number; median: number; rank: number };
}