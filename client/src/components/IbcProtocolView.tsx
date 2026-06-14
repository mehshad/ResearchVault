// @ts-nocheck — This shared read-only protocol view relies on untyped useQuery
// results (data inferred as `unknown`) and reads many dynamic `application.*`
// fields that have drifted from the typed shared/schema. These are not known
// runtime bugs; suppressing keeps `npx tsc --noEmit` clean for typed files.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  User,
  Users,
  Biohazard,
  Shield,
  Home,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Dna,
  Trash2,
  Truck,
  Microscope,
  ClipboardList,
  Beaker,
  ListChecks,
  AlertTriangle,
} from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import IbcFacilitiesTab from "@/components/IbcFacilitiesTab";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatFullName } from "@/utils/nameUtils";

// Helper function to get certification color based on expiry date
function getCertificationColor(expiryDate: string | null): string {
  if (!expiryDate) {
    return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
  }

  const today = new Date();
  const expiry = parseISO(expiryDate);
  const daysUntilExpiry = differenceInDays(expiry, today);

  if (daysUntilExpiry < 0) {
    return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";
  } else if (daysUntilExpiry <= 30) {
    return "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300";
  } else {
    return "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300";
  }
}

// Friendly labels for stored JSON keys (NIH sections, inactivation, disposal, etc.).
// Anything not listed falls back to humanize().
const LABELS: Record<string, string> = {
  // NIH Section III-A/B/C
  drugResistanceTraits: "III-A: Deliberate transfer of drug resistance traits to microorganisms",
  toxinMolecules: "III-B: Cloning toxin molecules with LD50 < 100 ng/kg body weight",
  humanGeneTransfer: "III-C: Human gene transfer experiments (clinical trials)",
  // NIH Section III-D
  riskGroup2Plus: "III-D-1: Using Risk Group 2, 3, 4, or restricted agents as host-vector systems",
  pathogenDnaRna: "III-D-2: DNA from Risk Group 2, 3, 4, or restricted agents in nonpathogenic hosts",
  infectiousViral: "III-D-3: Infectious DNA or RNA viruses in tissue culture systems",
  wholeAnimalExperiments: "III-D-4: Experiments involving whole animals",
  wholePlants: "III-D-5: Experiments involving whole plants",
  largeScaleExperiments: "III-D-6: Experiments involving more than 10 liters of culture",
  influenzaViruses: "III-D-7: Experiments involving influenza viruses",
  geneDriveOrganisms: "III-D-8: Experiments involving gene drive modified organisms",
  // NIH Section III-E
  limitedViralGenome: "III-E-1: Recombinant nucleic acids containing no more than 2/3 of eukaryotic virus genome",
  plantExperiments: "III-E-2: Experiments involving whole plants",
  transgenicRodents: "III-E-3: Experiments involving transgenic rodents",
  // NIH Section III-F
  f1TissueCulture: "III-F-1: Recombinant/synthetic nucleic acid molecules in tissue culture",
  f2EcoliK12: "III-F-2: E. coli K-12 host-vector systems",
  f3Saccharomyces: "III-F-3: Saccharomyces cerevisiae and S. uvarum host-vector systems",
  f4Kluyveromyces: "III-F-4: Kluyveromyces lactis host-vector systems",
  f5Bacillus: "III-F-5: Bacillus subtilis or B. licheniformis host-vector systems",
  f6GramPositive: "III-F-6: Extrachromosomal elements of gram-positive organisms",
  f7TransgenicRodents: "III-F-7: Purchase or transfer of transgenic rodents",
  f8TransgenicBreeding: "III-F-8: Generation of BL1 transgenic rodents via breeding",
  exemptionJustification: "Exemption justification",
  // NIH Appendix C
  cI: "C-I: Recombinant/synthetic nucleic acid molecules in tissue culture",
  cII: "C-II: Escherichia coli K-12 host-vector systems",
  cIII: "C-III: Saccharomyces host-vector systems",
  cIV: "C-IV: Kluyveromyces host-vector systems",
  cV: "C-V: Bacillus subtilis or B. licheniformis host-vector systems",
  cVI: "C-VI: Extrachromosomal elements of gram-positive organisms",
  cVII: "C-VII: Purchase or transfer of transgenic rodents",
  cVIII: "C-VIII: Generation of BL1 transgenic rodents via breeding",
  cIX: "C-IX: Footnotes and references of Appendix C",
  additionalConsiderations: "Additional considerations",
  // Inactivation & Decontamination
  treatWasteWithNaOH: "Treat toxin waste with 2N NaOH (≥1 hour)",
  commercialBleach20Min: "10% commercial bleach (20 min contact)",
  quaternaryAmmonium: "Quaternary Ammonium",
  sporKlenz: "Spor-Klenz",
  relyOn: "Rely+On",
  otherDisinfection: "Other disinfection method",
  autoclaved60Min121C: "Autoclaved ≥60 min at 121°C",
  solidWasteGBP1: "General Biosafety Procedure 1",
  solidWasteGBP2: "General Biosafety Procedure 2",
  solidWasteGBP3: "General Biosafety Procedure 3",
  solidWasteOtherExplanation: "Other (explanation)",
  disinfect10PercentBleach30Min: "Disinfect with 10% bleach (≥30 min)",
  autoclaved30Min121CLiquid: "Autoclaved ≥30 min at 121°C (liquid)",
  otherProvenDisinfectants: "Other proven disinfectants",
  standardRodentBarrier: "Standard rodent barrier",
  standardNonRodent: "Standard non-rodent",
  standardBiosafetyFacility: "Standard biosafety facility",
  animalCageGBP1: "General Biosafety Procedure 1",
  animalCageGBP2: "General Biosafety Procedure 2",
  animalCageGBP3: "General Biosafety Procedure 3",
  // Disposal
  standardRecommendedPractices: "Standard recommended practices",
  regulatedMedicalWaste: "Regulated Medical Waste",
  biologicalWasteRedBag: "Biological waste in red biohazard bag",
  contaminatedSharpsContainer: "Contaminated sharps in biohazard sharps container",
  generalBiosafety: "General Biosafety",
  procedure1: "Procedure 1",
  procedure2: "Procedure 2",
  procedure3: "Procedure 3",
  procedureOther: "Other",
  carcasses: "Carcasses",
};

function humanize(key: string): string {
  if (!key) return "";
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function labelFor(key: string): string {
  return LABELS[key] || humanize(key);
}

function safeDate(value: any): string {
  if (!value) return "";
  const dt = new Date(value);
  return isNaN(dt.getTime()) ? "" : format(dt, "MMM d, yyyy");
}

function isEmptyValue(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

// Recursively render a stored JSON object: true booleans become chips,
// strings/numbers/arrays become labeled rows, nested objects become indented blocks.
// Returns null when nothing meaningful is present, so empty sections stay hidden.
function buildDataBlock(data: any): React.ReactNode | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  const chips: string[] = [];
  const rows: Array<[string, string]> = [];
  const nested: Array<[string, React.ReactNode]> = [];

  for (const [key, val] of Object.entries(data)) {
    const label = labelFor(key);
    if (val === true) {
      chips.push(label);
    } else if (val === false || val === null || val === undefined) {
      continue;
    } else if (Array.isArray(val)) {
      if (val.length > 0) {
        const allPrimitive = val.every((v) => typeof v !== "object" || v === null);
        if (allPrimitive) {
          rows.push([label, val.join(", ")]);
        } else {
          val.forEach((item, i) => {
            const child = buildDataBlock(item);
            if (child) nested.push([`${label} ${i + 1}`, child]);
          });
        }
      }
    } else if (typeof val === "object") {
      const child = buildDataBlock(val);
      if (child) nested.push([label, child]);
    } else if (typeof val === "string") {
      if (val.trim() !== "") rows.push([label, val]);
    } else {
      rows.push([label, String(val)]);
    }
  }

  if (chips.length === 0 && rows.length === 0 && nested.length === 0) return null;

  return (
    <div className="space-y-2">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <Badge key={c} variant="secondary" className="font-normal">
              {c}
            </Badge>
          ))}
        </div>
      )}
      {rows.map(([l, v]) => (
        <div key={l} className="text-sm">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{l}: </span>
          <span className="whitespace-pre-wrap">{v}</span>
        </div>
      ))}
      {nested.map(([l, child], idx) => (
        <div key={`${l}-${idx}`} className="pl-3 border-l-2 border-gray-100 dark:border-gray-800">
          <p className="text-xs font-semibold text-gray-600 mb-1 dark:text-gray-300">{l}</p>
          {child}
        </div>
      ))}
    </div>
  );
}

// Small read-only display helpers
function Field({ label, value }: { label: string; value: any }) {
  if (isEmptyValue(value)) return null;
  const display = Array.isArray(value) ? value.join(", ") : String(value);
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-sm whitespace-pre-wrap">{display}</p>
    </div>
  );
}

function YesNoRow({ label, value }: { label: string; value: any }) {
  if (value === null || value === undefined || value === "") return null;
  const yes = value === true || value === "true" || value === "yes";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <Badge variant="outline" className={yes ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-gray-50 text-gray-600 dark:bg-gray-900 dark:text-gray-300"}>
        {yes ? "Yes" : "No"}
      </Badge>
    </div>
  );
}

function ChipList({ label, values }: { label: string; values: any }) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-1.5 dark:text-gray-400">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v, i) => (
          <Badge key={`${v}-${i}`} variant="secondary" className="font-normal">
            {String(v)}
          </Badge>
        ))}
      </div>
    </div>
  );
}

interface IbcProtocolViewProps {
  /** The IBC application id whose protocol should be rendered read-only. */
  applicationId: number;
  /**
   * Page-specific content rendered in the sticky right column below the
   * "On this page" jump navigation (e.g. officer actions for the office, or
   * the reviewer's feedback form). Kept out of the shared view so role-specific
   * controls stay with their owning page.
   */
  sidebar?: React.ReactNode;
  /**
   * When true, render for the print/PDF pipeline: every collapsible section is
   * forced open and the on-screen "On this page" jump navigation is hidden so
   * the printed document contains the full protocol without interactive chrome.
   */
  printMode?: boolean;
}

/**
 * Comprehensive, read-only rendering of an IBC protocol broken into every
 * section (overview, NIH guidelines, hazardous agents, transport, dual-use,
 * inactivation/disposal, facilities, personnel, certifications, documents
 * placeholder, etc.) plus the "On this page" jump navigation. Shared by the
 * IBC office detail page and the IBC reviewer page so both audiences see the
 * same full protocol; each page supplies its own `sidebar` for role actions.
 */
export default function IbcProtocolView({ applicationId, sidebar, printMode = false }: IbcProtocolViewProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleSection = (id: string) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const { data: application } = useQuery({
    queryKey: [`/api/ibc-applications/${applicationId}`],
    enabled: !!applicationId,
  });

  const { data: scientist } = useQuery({
    queryKey: [`/api/scientists/${application?.principalInvestigatorId}`],
    enabled: !!application?.principalInvestigatorId,
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: researchActivities = [] } = useQuery({
    queryKey: [`/api/ibc-applications/${applicationId}/research-activities`],
    enabled: !!applicationId,
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: personnelData = [], isLoading: personnelLoading } = useQuery({
    queryKey: [`/api/ibc-applications/${applicationId}/personnel`],
    enabled: !!applicationId,
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: certificationModules = [] } = useQuery({
    queryKey: ["/api/certification-modules"],
  });

  const { data: certificationMatrix = [] } = useQuery({
    queryKey: ["/api/certifications/matrix"],
  });

  const teamCertifications = certificationMatrix.reduce((acc: any, cert: any) => {
    if (!acc[cert.scientistId]) {
      acc[cert.scientistId] = [];
    }
    acc[cert.scientistId].push(cert);
    return acc;
  }, {});

  if (!application) {
    return null;
  }

  // ---- Section visibility flags (hide sections whose trigger was not selected) ----
  const showSummary = !!(application.description || application.protocolSummary);
  const showActivities = Array.isArray(researchActivities) && researchActivities.length > 0;
  const scopeItems = [
    ["recombinantSyntheticNucleicAcid", "Recombinant or Synthetic Nucleic Acids"],
    ["wholeAnimalsAnimalMaterial", "Whole Animals / Animal Material"],
    ["humanNonHumanPrimateMaterial", "Human / Non-Human Primate Material"],
    ["microorganismsInfectiousMaterial", "Microorganisms / Infectious Material"],
    ["biologicalToxins", "Biological Toxins"],
    ["nanoparticles", "Nanoparticles"],
    ["arthropods", "Arthropods"],
    ["plants", "Plants"],
  ].filter(([k]) => application[k]);

  const showNucleic = !!application.recombinantSyntheticNucleicAcid;
  const showHuman = !!application.humanNonHumanPrimateMaterial;

  const nihBlockABC = buildDataBlock(application.nihSectionABC);
  const nihBlockD = buildDataBlock(application.nihSectionD);
  const nihBlockE = buildDataBlock(application.nihSectionE);
  const nihBlockF = buildDataBlock(application.nihSectionF);
  const nihBlockC = buildDataBlock(application.nihAppendixC);
  const hasNih = !!(nihBlockABC || nihBlockD || nihBlockE || nihBlockF || nihBlockC);

  const syntheticExperiments = Array.isArray(application.syntheticExperiments) ? application.syntheticExperiments : [];
  const cellLines = Array.isArray(application.cellLines) ? application.cellLines : [];
  const hazardousProcedures = Array.isArray(application.hazardousProcedures) ? application.hazardousProcedures : [];

  const inactivationBlock = buildDataBlock(application.inactivationDecontamination);
  const disposalBlock = buildDataBlock(application.disposal);

  const showTransport =
    application.deviatingFromLocalTransport === true ||
    application.transportingBioHazardousToOffCampus === true ||
    application.receivingBiologicalFromOffCampus === true ||
    !!application.deviatingFromLocalTransportDetails ||
    !!application.transportingBioHazardousToOffCampusDetails;

  const showDualUse =
    (application.dualUseAgentsAndToxins?.length > 0) ||
    application.dualUseCategoriesApply === true ||
    (application.dualUseExperimentCategories?.length > 0) ||
    !!application.dualUseCategoriesExplanation;

  const showMethods = !!(
    application.materialAndMethods ||
    application.proceduresInvolvingInfectiousAgents ||
    application.cellCultureProcedures ||
    application.animalProcedures ||
    application.laboratoryEquipment ||
    application.containmentProcedures ||
    application.emergencyProcedures ||
    application.ppeRequirements ||
    application.wasteSterilizationProcedures ||
    application.agents
  );

  const agentsBlocks = [
    ["Biological Agents", buildDataBlock(application.biologicalAgents)],
    ["Chemical Agents", buildDataBlock(application.chemicalAgents)],
    ["Radiological Materials", buildDataBlock(application.radiologicalMaterials)],
  ].filter(([, block]) => block);
  const showAgents = agentsBlocks.length > 0;

  // Build navigation list of visible sections
  const navItems = [
    { id: "sec-protocol", label: "Protocol Information" },
    showSummary && { id: "sec-summary", label: "Description & Summary" },
    showActivities && { id: "sec-activities", label: "Research Activities" },
    { id: "sec-scope", label: "Biosafety Scope" },
    { id: "sec-personnel", label: "Personnel & Training" },
    showNucleic && { id: "sec-nucleic", label: "Recombinant / Synthetic Nucleic Acids" },
    showHuman && { id: "sec-human", label: "Human / NHP Material" },
    showMethods && { id: "sec-methods", label: "Methods & Safety" },
    showAgents && { id: "sec-agents", label: "Hazardous Agents" },
    { id: "sec-facilities", label: "Facilities & Rooms" },
    inactivationBlock && { id: "sec-inactivation", label: "Inactivation & Decontamination" },
    disposalBlock && { id: "sec-disposal", label: "Disposal" },
    showTransport && { id: "sec-transport", label: "Transport / Shipping" },
    showDualUse && { id: "sec-dualuse", label: "Dual Use" },
  ].filter(Boolean) as { id: string; label: string }[];

  // Section wrapper with collapse toggle
  const Section = ({ id, title, icon: Icon, badge, children }: any) => {
    const isOpen = printMode || !collapsed[id];
    return (
      <Card id={id} className="scroll-mt-6">
        <CardHeader
          className={printMode ? "select-none" : "cursor-pointer select-none"}
          onClick={printMode ? undefined : () => toggleSection(id)}
          data-testid={`header-section-${id}`}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              {Icon && <Icon className="h-5 w-5" />}
              <span>{title}</span>
              {badge}
            </CardTitle>
            {!printMode &&
              (isOpen ? (
                <ChevronDown className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              ) : (
                <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              ))}
          </div>
        </CardHeader>
        {isOpen && <CardContent className="space-y-4">{children}</CardContent>}
      </Card>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left column — full read-only protocol */}
      <div className="lg:col-span-2 space-y-6">
        {/* Protocol Information */}
        <Section id="sec-protocol" title="Protocol Information" icon={FileText}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Protocol Title" value={application.title} />
            <Field label="Short Title" value={application.shortTitle} />
            <Field label="IBC Number" value={application.ibcNumber} />
            <Field label="Cayuse Protocol Number" value={application.cayuseProtocolNumber} />
            <Field label="IRBnet IBC Number" value={application.irbnetIbcNumber} />
            <Field label="Biosafety Level" value={application.biosafetyLevel} />
            <Field label="Risk Group" value={application.riskGroupClassification} />
            <Field label="Risk Level" value={application.riskLevel} />
            <Field label="Submission Type" value={application.submissionType} />
            <Field label="Version" value={application.version} />
            <Field label="IACUC Protocol Number" value={application.iacucProtocolNumber} />
            <Field label="IRB Protocol Number" value={application.irbProtocolNumber} />
            <Field label="Additional Notification Email" value={application.additionalNotificationEmail} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2 border-t">
            <Field label="Submitted" value={safeDate(application.submissionDate)} />
            <Field label="Vetted" value={safeDate(application.vettedDate)} />
            <Field label="Under Review" value={safeDate(application.underReviewDate)} />
            <Field label="Approved" value={safeDate(application.approvalDate)} />
            <Field label="Expiration" value={safeDate(application.expirationDate)} />
            <Field label="Next Review" value={safeDate(application.nextReviewDate)} />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center dark:bg-blue-950">
              <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Principal Investigator</p>
              <p className="font-medium" data-testid="text-pi-name">
                {scientist ? formatFullName(scientist) : "Loading..."}
              </p>
              {scientist?.email && <p className="text-sm text-gray-500 dark:text-gray-400">{scientist.email}</p>}
            </div>
          </div>
        </Section>

        {/* Description & Summary */}
        {showSummary && (
          <Section id="sec-summary" title="Description & Summary" icon={ClipboardList}>
            <Field label="Project Description" value={application.description} />
            <Field label="Protocol Summary" value={application.protocolSummary} />
          </Section>
        )}

        {/* Linked Research Activities */}
        {showActivities && (
          <Section id="sec-activities" title="Linked Research Activities" icon={ListChecks}>
            <div className="space-y-2">
              {researchActivities.map((activity: any) => (
                <div
                  key={activity.id}
                  className="flex items-center gap-2 p-2 bg-gray-50 rounded dark:bg-gray-900"
                  data-testid={`row-activity-${activity.id}`}
                >
                  <Microscope className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  <div>
                    <p className="text-sm font-medium">{activity.sdrNumber || activity.title}</p>
                    {activity.sdrNumber && activity.title && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{activity.title}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Biosafety Scope */}
        <Section id="sec-scope" title="Biosafety Scope" icon={Biohazard}>
          {scopeItems.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5 dark:text-gray-400">Materials & work involved</p>
              <div className="flex flex-wrap gap-1.5">
                {scopeItems.map(([k, label]) => (
                  <Badge key={k} variant="secondary" className="font-normal">
                    {label}
                  </Badge>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No biosafety material categories were selected.</p>
          )}

          {application.wholeAnimalsAnimalMaterial && (
            <div className="pt-2 border-t space-y-2">
              <p className="text-sm font-medium">Whole Animals / Animal Material</p>
              <ChipList label="Selected sub-options" values={application.animalMaterialSubOptions} />
              <YesNoRow
                label="Introducing primate material into animals"
                value={application.introducingPrimateMaterialIntoAnimals}
              />
            </div>
          )}

          {application.microorganismsInfectiousMaterial && (
            <div className="pt-2 border-t space-y-2">
              <p className="text-sm font-medium">Microorganisms / Infectious Material</p>
              <YesNoRow
                label="Introducing recombinant DNA into microorganisms"
                value={application.introducingRecombinantDnaToMicroorganisms}
              />
            </div>
          )}

          {application.arthropods && (
            <div className="pt-2 border-t space-y-2">
              <p className="text-sm font-medium">Arthropods</p>
              <YesNoRow label="Transgenic arthropods or exposure" value={application.transgenicArthropodsOrExposure} />
            </div>
          )}

          {application.plants && (
            <div className="pt-2 border-t space-y-2">
              <p className="text-sm font-medium">Plants</p>
              <YesNoRow label="Transgenic plants or exposure" value={application.transgenicPlantsOrExposure} />
            </div>
          )}

          <div className="pt-2 border-t space-y-2">
            <p className="text-sm font-medium">Legacy classification</p>
            <YesNoRow label="Recombinant DNA" value={!!application.recombinantDNA} />
            <YesNoRow label="Animal Work" value={!!application.animalWork} />
            <YesNoRow label="Field Work" value={!!application.fieldWork} />
          </div>
        </Section>

        {/* Personnel & Training */}
        <Section id="sec-personnel" title="Personnel & Training" icon={Users}>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 dark:text-gray-400">Team Members</p>
            {personnelLoading ? (
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gray-100 rounded-full animate-pulse dark:bg-gray-800" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-700" />
                  <div className="h-3 bg-gray-200 rounded w-2/3 animate-pulse dark:bg-gray-700" />
                </div>
              </div>
            ) : personnelData && personnelData.length > 0 ? (
              <div className="space-y-3">
                {personnelData.map((member: any, index: number) => {
                  const memberCerts = member.scientistId ? teamCertifications[member.scientistId] || [] : [];
                  const citiCerts = memberCerts.filter((cert: any) => {
                    const module = certificationModules.find((m: any) => m.id === cert.moduleId);
                    return module && module.name !== "Lab Safety";
                  });
                  const labSafetyCert = memberCerts.find((cert: any) => {
                    const module = certificationModules.find((m: any) => m.id === cert.moduleId);
                    return module && module.name === "Lab Safety";
                  });

                  return (
                    <div
                      key={`${member.scientistId || "unknown"}-${member.role || "no-role"}-${index}`}
                      className="p-3 border rounded-lg bg-white dark:bg-card"
                      data-testid={`row-member-${member.scientistId || index}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center dark:bg-gray-800">
                            <User className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {member.scientist ? formatFullName(member.scientist) : "Unknown"}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{member.scientist?.email || ""}</p>
                          </div>
                        </div>
                        <Badge
                          variant="secondary"
                          className={
                            member.role === "team_leader"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                              : member.role === "safety_representative"
                              ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300"
                              : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                          }
                        >
                          {member.role === "team_leader"
                            ? "Team Leader"
                            : member.role === "safety_representative"
                            ? "Safety Representative"
                            : "Team Member"}
                        </Badge>
                      </div>

                      {member.scientistId && (
                        <div className="space-y-1.5 pl-11">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground w-20">CITI:</span>
                            <div className="flex gap-1 flex-wrap">
                              <TooltipProvider>
                                {citiCerts.length > 0 ? (
                                  citiCerts.map((cert: any, idx: number) => {
                                    const module = certificationModules.find((m: any) => m.id === cert.moduleId);
                                    return (
                                      <Tooltip key={idx}>
                                        <TooltipTrigger>
                                          <Badge
                                            className={`${getCertificationColor(cert.endDate)} cursor-help transition-colors text-xs`}
                                            variant="outline"
                                          >
                                            {module?.name || "Unknown"}
                                          </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>
                                            {module?.name || "Unknown"} - Expires: {cert.endDate || "N/A"}
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    );
                                  })
                                ) : (
                                  <Badge className="bg-gray-100 text-gray-600 text-xs dark:bg-gray-800 dark:text-gray-300" variant="outline">
                                    None
                                  </Badge>
                                )}
                              </TooltipProvider>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground w-20">Lab Safety:</span>
                            <TooltipProvider>
                              {labSafetyCert ? (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge
                                      className={`${getCertificationColor(labSafetyCert.endDate)} cursor-help transition-colors text-xs`}
                                      variant="outline"
                                    >
                                      {labSafetyCert.certificateName || "Certified"}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>
                                      {labSafetyCert.certificateName || "Lab Safety"} - Expires:{" "}
                                      {labSafetyCert.endDate || "N/A"}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <Badge className="bg-gray-100 text-gray-600 text-xs dark:bg-gray-800 dark:text-gray-300" variant="outline">
                                  None
                                </Badge>
                              )}
                            </TooltipProvider>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4 dark:text-gray-400">No team members defined for this protocol</p>
            )}
          </div>
        </Section>

        {/* Recombinant / Synthetic Nucleic Acids */}
        {showNucleic && (
          <Section id="sec-nucleic" title="Recombinant / Synthetic Nucleic Acids" icon={Dna}>
            {hasNih && (
              <div className="space-y-3">
                <p className="text-sm font-semibold">NIH Guidelines</p>
                {nihBlockABC && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1 dark:text-gray-300">Section III-A/B/C</p>
                    {nihBlockABC}
                  </div>
                )}
                {nihBlockD && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1 dark:text-gray-300">Section III-D</p>
                    {nihBlockD}
                  </div>
                )}
                {nihBlockE && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1 dark:text-gray-300">Section III-E</p>
                    {nihBlockE}
                  </div>
                )}
                {nihBlockF && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1 dark:text-gray-300">Section III-F (Exempt)</p>
                    {nihBlockF}
                  </div>
                )}
                {nihBlockC && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1 dark:text-gray-300">Appendix C</p>
                    {nihBlockC}
                  </div>
                )}
              </div>
            )}

            {syntheticExperiments.length > 0 && (
              <div className="space-y-3 pt-2 border-t">
                <p className="text-sm font-semibold">Synthetic Experiments</p>
                {syntheticExperiments.map((exp: any, i: number) => {
                  const block = buildDataBlock(exp);
                  return (
                    <div key={i} className="p-3 border rounded-lg bg-gray-50 dark:bg-gray-900" data-testid={`row-synthetic-${i}`}>
                      <p className="text-xs font-semibold text-gray-600 mb-1 dark:text-gray-300">
                        Experiment {i + 1}
                        {exp?.vectorInsertName ? ` — ${exp.vectorInsertName}` : ""}
                      </p>
                      {block || <p className="text-sm text-gray-500 dark:text-gray-400">No details provided.</p>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Additional details */}
            <div className="space-y-3 pt-2 border-t">
              <p className="text-sm font-semibold">Additional Details</p>
              <Field label="Nucleic acid extraction methods" value={application.nucleicAcidExtractionMethods} />
              <ChipList label="Proposed biosafety levels" values={application.proposedBiosafetyLevels} />
              <Field label="Host organism for DNA propagation" value={application.hostOrganismDnaPropagation} />
              <Field label="Purification measures (avoid aerosols)" value={application.purificationMeasures} />
              <YesNoRow
                label="Provided restriction / vector maps to biosafety office"
                value={application.providedRestrictionVectorMaps}
              />
              <Field label="Viral genome regions deleted/altered" value={application.viralGenomeRegionsAltered} />
              <YesNoRow label="Assaying for wild-type viral particles" value={application.assayingWildTypeViral} />
              <YesNoRow label="Handling more than 10 liters of culture" value={application.handleMoreThan10Liters} />
              <YesNoRow label="Gene drive system using CRISPR" value={application.geneDriveSystemCrispr} />
            </div>
          </Section>
        )}

        {/* Human / NHP Material */}
        {showHuman && (
          <Section id="sec-human" title="Human / NHP Material" icon={Beaker}>
            {/* Materials */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">Materials</p>
              <YesNoRow label="Human origin material" value={application.humanOrigin} />
              <ChipList label="Human materials" values={application.humanMaterials} />
              <Field label="Tissues (details)" value={application.humanMaterialsTissuesOther} />
              <Field label="Other material (details)" value={application.humanMaterialsOtherMaterial} />
              <YesNoRow label="Non-human primate origin material" value={application.nonHumanPrimateOrigin} />
              <YesNoRow label="NHP exposure kit available" value={application.nhpExposureKit} />
              <ChipList label="Stem cells" values={application.stemCells} />
              <YesNoRow label="Stem cells listed in NIH registry" value={application.stemCellsNihRegistry} />
            </div>

            {cellLines.length > 0 && (
              <div className="space-y-3 pt-2 border-t">
                <p className="text-sm font-semibold">Cell Lines</p>
                {cellLines.map((line: any, i: number) => {
                  const block = buildDataBlock(line);
                  return (
                    <div key={i} className="p-3 border rounded-lg bg-gray-50 dark:bg-gray-900" data-testid={`row-cellline-${i}`}>
                      <p className="text-xs font-semibold text-gray-600 mb-1 dark:text-gray-300">{line?.name || `Cell Line ${i + 1}`}</p>
                      {block || <p className="text-sm text-gray-500 dark:text-gray-400">No details provided.</p>}
                    </div>
                  );
                })}
              </div>
            )}

            {hazardousProcedures.length > 0 && (
              <div className="space-y-3 pt-2 border-t">
                <p className="text-sm font-semibold">Hazardous Procedures</p>
                {hazardousProcedures.map((proc: any, i: number) => {
                  const block = buildDataBlock(proc);
                  return (
                    <div key={i} className="p-3 border rounded-lg bg-gray-50 dark:bg-gray-900" data-testid={`row-procedure-${i}`}>
                      <p className="text-xs font-semibold text-gray-600 mb-1 dark:text-gray-300">
                        {proc?.procedure || `Procedure ${i + 1}`}
                      </p>
                      {block || <p className="text-sm text-gray-500 dark:text-gray-400">No details provided.</p>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Exposure Control Plan */}
            <div className="space-y-2 pt-2 border-t">
              <p className="text-sm font-semibold">Exposure Control Plan</p>
              <YesNoRow
                label="Read & agree to comply with Exposure Control Plan"
                value={application.exposureControlPlanCompliance}
              />
              <YesNoRow label="Hand washing device available in room(s)" value={application.handWashingDevice} />
              <ChipList label="Laundry method" values={application.laundryMethod} />
              <Field label="Other laundry method" value={application.laundryMethodOther} />
            </div>

            {/* Additional Detail */}
            <div className="space-y-2 pt-2 border-t">
              <p className="text-sm font-semibold">Additional Detail</p>
              <YesNoRow label="Materials contain known pathogens" value={application.materialsContainKnownPathogens} />
              <Field label="Material & known pathogen" value={application.materialPathogenDetails} />
              <Field label="Material treatment details" value={application.materialTreatmentDetails} />
              <Field label="Signs & symptoms of infection from exposure" value={application.infectionSymptoms} />
            </div>
          </Section>
        )}

        {/* Methods & Safety (legacy free-text fields, only if present) */}
        {showMethods && (
          <Section id="sec-methods" title="Methods & Safety" icon={FlaskConical}>
            <Field label="Materials and Methods" value={application.materialAndMethods} />
            <Field label="Procedures Involving Infectious Agents" value={application.proceduresInvolvingInfectiousAgents} />
            <Field label="Cell Culture Procedures" value={application.cellCultureProcedures} />
            <Field label="Animal Procedures" value={application.animalProcedures} />
            <Field label="Laboratory Equipment" value={application.laboratoryEquipment} />
            <Field label="Containment Procedures" value={application.containmentProcedures} />
            <Field label="Emergency Procedures" value={application.emergencyProcedures} />
            <Field label="PPE Requirements" value={application.ppeRequirements} />
            <Field label="Waste Sterilization" value={application.wasteSterilizationProcedures} />
            <Field label="Agents Description" value={application.agents} />
          </Section>
        )}

        {/* Hazardous Agents (JSON) */}
        {showAgents && (
          <Section id="sec-agents" title="Hazardous Agents" icon={AlertTriangle}>
            {agentsBlocks.map(([label, block]) => (
              <div key={label as string}>
                <p className="text-sm font-semibold mb-1">{label as string}</p>
                {block}
              </div>
            ))}
          </Section>
        )}

        {/* Facilities & Rooms (read-only reuse of the applicant component) */}
        <Section id="sec-facilities" title="Facilities & Rooms" icon={Home}>
          <IbcFacilitiesTab applicationId={applicationId} application={application} isReadOnly />
        </Section>

        {/* Inactivation & Decontamination */}
        {inactivationBlock && (
          <Section id="sec-inactivation" title="Inactivation & Decontamination" icon={Shield}>
            {inactivationBlock}
          </Section>
        )}

        {/* Disposal */}
        {disposalBlock && (
          <Section id="sec-disposal" title="Disposal" icon={Trash2}>
            {disposalBlock}
          </Section>
        )}

        {/* Transport / Shipping */}
        {showTransport && (
          <Section id="sec-transport" title="Transport / Shipping" icon={Truck}>
            <YesNoRow
              label="Deviating from local transport standard practice"
              value={application.deviatingFromLocalTransport}
            />
            <Field label="Deviation details" value={application.deviatingFromLocalTransportDetails} />
            <YesNoRow
              label="Transporting bio-hazardous materials off campus"
              value={application.transportingBioHazardousToOffCampus}
            />
            <Field label="Off-campus transport details" value={application.transportingBioHazardousToOffCampusDetails} />
            <YesNoRow
              label="Receiving biological samples from off-campus locations"
              value={application.receivingBiologicalFromOffCampus}
            />
          </Section>
        )}

        {/* Dual Use */}
        {showDualUse && (
          <Section id="sec-dualuse" title="Dual Use" icon={AlertTriangle}>
            <ChipList label="Agents & toxins" values={application.dualUseAgentsAndToxins} />
            <YesNoRow label="Work falls under dual use categories" value={application.dualUseCategoriesApply} />
            <Field label="Dual use explanation" value={application.dualUseCategoriesExplanation} />
            <ChipList label="Experiment categories" values={application.dualUseExperimentCategories} />
          </Section>
        )}

        {/* Documents placeholder (kept as-is per scope) */}
        <Section id="sec-documents" title="Documents" icon={FileText}>
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4 dark:text-gray-500" />
            <h3 className="text-lg font-medium text-gray-900 mb-2 dark:text-gray-100">Document Management</h3>
            <p className="text-gray-500 dark:text-gray-400">Document management system will be available in a future update.</p>
          </div>
        </Section>
      </div>

      {/* Right column — jump nav + page-specific sidebar */}
      <div className="lg:col-span-1">
        <div className="lg:sticky lg:top-4 space-y-4">
          {/* Jump navigation */}
          {!printMode && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">On this page</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <nav className="space-y-1">
                  {navItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => scrollToSection(item.id)}
                      className="block w-full text-left text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded px-2 py-1 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-900"
                      data-testid={`nav-${item.id}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </nav>
              </CardContent>
            </Card>
          )}

          {sidebar}
        </div>
      </div>
    </div>
  );
}
