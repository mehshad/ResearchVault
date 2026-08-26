import {
  MANAGEMENT_REPORT_DOMAINS,
  type ManagementReportConfig as ValidManagementReportConfig,
  type ManagementReportDomain,
} from "@shared/managementReports";

export const REPORT_DOMAINS = MANAGEMENT_REPORT_DOMAINS;

export type ReportDomain = ManagementReportDomain;
export type ReportTargetType = "staff" | "section";

export interface ManagementReportConfig {
  targetType: ReportTargetType;
  targetId: number | null;
  domains: ReportDomain[];
  lookbackYears: number;
  activeSdrOnly: boolean;
  awardedGrantsOnly: boolean;
  publicationStatuses: string[];
  contractStatuses: string[];
  patentStatuses: string[];
}

export type ManagementReportRequest = ValidManagementReportConfig;

export function buildManagementReportRequest(
  config: ManagementReportConfig,
): ManagementReportRequest {
  if (!Number.isInteger(config.targetId) || Number(config.targetId) <= 0) {
    throw new Error(`Select a ${config.targetType} before generating a report.`);
  }
  if (config.domains.length === 0) {
    throw new Error("Select at least one report domain.");
  }
  if (!Number.isInteger(config.lookbackYears) || config.lookbackYears < 1 || config.lookbackYears > 20) {
    throw new Error("Lookback must be between 1 and 20 years.");
  }

  return {
    ...config,
    targetId: Number(config.targetId),
    domains: REPORT_DOMAINS.filter((domain) => config.domains.includes(domain)),
    publicationStatuses: [...new Set(config.publicationStatuses)].sort(),
    contractStatuses: [...new Set(config.contractStatuses)].sort(),
    patentStatuses: [...new Set(config.patentStatuses)].sort(),
  };
}

export function filenameFromDisposition(
  disposition: string | null,
  fallback = "management-report.pdf",
): string {
  if (!disposition) return fallback;
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded).replace(/[\\/]/g, "-");
    } catch {
      return fallback;
    }
  }
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1]?.trim();
  return plain ? plain.replace(/[\\/]/g, "-") : fallback;
}

export async function responseError(response: Response, fallback: string): Promise<Error> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => null);
    return new Error(body?.message || body?.error || fallback);
  }
  const text = await response.text().catch(() => "");
  return new Error(text.trim() || fallback);
}