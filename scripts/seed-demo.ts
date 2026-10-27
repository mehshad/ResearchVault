/**
 * scripts/seed-demo.ts
 *
 * Seeds a demo instance: one sign-in account per access role, marked
 * auth_provider='demo', plus a small but complete set of sample data so every
 * list and detail page has something to show.
 *
 *   npm run seed:demo                       # seeds an empty database, skips if demo accounts exist
 *   SEED_RESET_CONFIRM=yes npm run seed:demo -- --reset   # wipes the seeded tables first
 *
 * Runs against DATABASE_URL through server/db.ts, and writes through the
 * shared drizzle schema so a column that no longer exists fails the typecheck
 * rather than the run. Where a storage method holds an invariant (a
 * publication and its first manuscript-history row are written together) the
 * storage method is used rather than a raw insert.
 *
 * Every demo account's password is "demo".
 */
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { eq, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import { db } from "../server/db";
import { hashPassword } from "../server/auth";
import { DatabaseStorage } from "../server/databaseStorage";
import {
  ACCESS_ROLES,
  NAVIGATION_ITEMS,
  RESEARCHER_ROLE,
  RESEARCH_OFFICER_ROLE,
  type AccessLevel,
} from "@shared/constants";
import { BUILT_IN_GRANT_STATUSES } from "@shared/grantStatusRegistry";
import { institutionKey, referenceNameKey } from "@shared/institutions";
import {
  IP_VETTED_STATUS,
  IP_VETTING_READY_STATUS,
  PUBLISHED_FINAL_STATUS,
  PUBLISHED_STATUS,
} from "@shared/publicationWorkflow";
import {
  CONTRACT_TYPES,
  branches,
  buildings,
  certificationModules,
  certifications,
  contractTypes,
  dataManagementPlans,
  departments,
  grantCoInvestigators,
  grantCollaboratingInstitutions,
  grantInstitutionCollaborators,
  grantResearchActivities,
  grantStatuses,
  grants,
  ibcApplicationResearchActivities,
  ibcApplicationRooms,
  ibcApplications,
  ibcBoardMembers,
  institutions,
  irbApplications,
  irbBoardMembers,
  journalImpactFactorMetrics,
  journals,
  manuscriptHistory,
  patents,
  programs,
  projectMembers,
  projects,
  publicationAuthors,
  publicationResearchActivities,
  publications,
  researchActivities,
  researchContracts,
  roleGroups,
  rolePermissions,
  rooms,
  scientists,
  sections,
  systemConfigurations,
  userRoleAssignments,
  users,
} from "@shared/schema";

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEMO_PASSWORD = "demo";
const DEMO_EMAIL_DOMAIN = "qbridge.demo";

/** `db` is typed loosely in server/db.ts; these keep the rows typed per table. */
async function insertRows<T extends PgTable>(
  table: T,
  rows: InferInsertModel<T>[],
): Promise<InferSelectModel<T>[]> {
  if (rows.length === 0) return [];
  return db.insert(table).values(rows).returning();
}

async function insertIgnoring<T extends PgTable>(
  table: T,
  rows: InferInsertModel<T>[],
  target: any,
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(table).values(rows).onConflictDoNothing({ target });
}

async function countRows(table: PgTable): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(table);
  return Number(row?.count ?? 0);
}

/** Timestamp columns take Date objects; a string throws before any SQL runs. */
const ts = (iso: string) => new Date(`${iso}T09:00:00Z`);

const slugOf = (role: string) => role.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const initialsOf = (first: string, last: string) => `${first[0]}${last[0]}`.toUpperCase();

/**
 * The starting permission matrix.
 *
 * Mirrors createDefaultPermissions() in client/src/hooks/usePermissions.tsx,
 * which the settings page applies when nothing is configured. It lives in a
 * React hook module, so it is restated here rather than imported; keep the
 * two in step.
 */
function defaultAccessLevel(role: string, navItem: string): AccessLevel {
  const isOfficeOrReviewer = navItem.includes("-office") || navItem.includes("-reviewer");
  let level: AccessLevel = "edit";

  if (role === "Investigator") {
    if (isOfficeOrReviewer) level = "hide";
    else if (navItem === "reports") level = "view";
  }
  if (role === RESEARCHER_ROLE) {
    if (isOfficeOrReviewer || navItem === "patents") level = "hide";
    else if (navItem === "reports") level = "view";
  }
  if (role === RESEARCH_OFFICER_ROLE) {
    if (isOfficeOrReviewer) level = "hide";
    else if (navItem === "scientists") level = "edit";
    else if (navItem === "reports" || navItem === "publications" || navItem === "patents") level = "view";
  }

  // Office dashboards belong to their office and to Management.
  if (navItem === "pmo-office") level = role === "PMO Officer" || role === "Management" ? "edit" : "hide";
  if (navItem === "research-office") level = role === RESEARCH_OFFICER_ROLE || role === "Management" ? "edit" : "hide";
  if (navItem === "management") level = role === "Management" ? "edit" : "hide";

  // Research Portfolio tops out at "create".
  if (navItem === "research-portfolio") {
    level =
      role === RESEARCHER_ROLE ||
      role === "Investigator" ||
      role === "Management" ||
      role === RESEARCH_OFFICER_ROLE
        ? "create"
        : "hide";
  }
  return level;
}

// ── Reset ─────────────────────────────────────────────────────────────────────

/**
 * Sample-data tables, wiped by --reset.
 *
 * Not on the list: `session` (never touched), and the reference tables the
 * migrations seed -- role_groups, grant_statuses, contract_types,
 * institutions, system_configurations, ownership_overrides -- which the seed
 * only adds to. users and scientists are wiped separately, see resetTables().
 */
const TRUNCATED_TABLES = [
  "user_role_assignments",
  "role_permissions",
  "publication_authors",
  "publication_research_activities",
  "manuscript_history",
  "publications",
  "patents",
  "irb_applications",
  "irb_board_members",
  "ibc_application_research_activities",
  "ibc_application_rooms",
  "ibc_applications",
  "ibc_board_members",
  "research_contracts",
  "data_management_plans",
  "certifications",
  "certification_modules",
  "grant_institution_collaborators",
  "grant_collaborating_institutions",
  "grant_co_investigators",
  "grant_research_activities",
  "grants",
  "journal_impact_factor_metrics",
  "journals",
  "project_members",
  "research_activities",
  // Forms filed against projects; they reference projects and scientists, so
  // they have to go in the same statement.
  "ra200_applications",
  "ra205a_applications",
  "projects",
  "programs",
  "rooms",
  "buildings",
  "sections",
  "departments",
  "branches",
];

async function resetTables(): Promise<void> {
  await db.transaction(async (tx: any) => {
    // The office reference lists carry "who added this" pointers at users.
    // Those rows stay; the pointer is cleared so the accounts can go.
    await tx.execute(sql`UPDATE institutions SET created_by_user_id = NULL WHERE created_by_user_id IS NOT NULL`);
    await tx.execute(sql`UPDATE contract_types SET created_by_user_id = NULL WHERE created_by_user_id IS NOT NULL`);
    await tx.execute(sql`UPDATE grant_statuses SET created_by_user_id = NULL WHERE created_by_user_id IS NOT NULL`);

    const list = TRUNCATED_TABLES.map((name) => sql.identifier(name));
    await tx.execute(sql`TRUNCATE TABLE ${sql.join(list, sql`, `)} RESTART IDENTITY`);

    // users is referenced by the reference tables above, and scientists by
    // users, so neither can be TRUNCATEd without CASCADE -- and CASCADE from
    // users would empty the institutions list. Deleted row by row instead,
    // with the sequences restarted so the result is the same.
    await tx.execute(sql`DELETE FROM users`);
    await tx.execute(sql`ALTER SEQUENCE users_id_seq RESTART WITH 1`);
    await tx.execute(sql`DELETE FROM scientists`);
    await tx.execute(sql`ALTER SEQUENCE scientists_id_seq RESTART WITH 1`);
  });
}

// ── Seed ──────────────────────────────────────────────────────────────────────

type ScientistRow = InferSelectModel<typeof scientists>;

interface PersonSpec {
  key: string;
  honorific: string;
  first: string;
  last: string;
  jobTitle: string;
  isInvestigator?: boolean;
  staffType?: "scientific" | "administrative";
  /** Which access role's demo account this person is behind, if any. */
  accountRole?: string;
}

async function seed(): Promise<void> {
  const storage = new DatabaseStorage();

  // ── Reference lists (added to, never replaced) ──
  await insertIgnoring(
    roleGroups,
    ACCESS_ROLES.map((name) => ({ name, description: "Default access-matrix role" })),
    roleGroups.name,
  );
  await insertIgnoring(
    grantStatuses,
    BUILT_IN_GRANT_STATUSES.map((status) => ({
      value: status.value,
      label: status.label,
      stage: status.stage,
      sortOrder: status.sortOrder,
      isBuiltIn: true,
    })),
    grantStatuses.value,
  );
  await insertIgnoring(
    contractTypes,
    CONTRACT_TYPES.map((name, index) => ({
      name,
      nameKey: referenceNameKey(name),
      sortOrder: index,
      isBuiltIn: true,
    })),
    contractTypes.nameKey,
  );
  const partnerInstitutions = [
    { name: "Hamad Medical Corporation", country: "Qatar" },
    { name: "Qatar University", country: "Qatar" },
    { name: "Weill Cornell Medicine - Qatar", country: "Qatar" },
    { name: "Great Ormond Street Hospital", country: "United Kingdom" },
  ];
  await insertIgnoring(
    institutions,
    partnerInstitutions.map((i) => ({ name: i.name, nameKey: institutionKey(i.name), country: i.country })),
    institutions.nameKey,
  );
  await insertIgnoring(
    systemConfigurations,
    [
      { key: "app_theme_name", value: "sidra", description: "Active institution theme (sidra | hbku | wcmq)", category: "appearance", isUserConfigurable: true },
      // A JSON null, not SQL NULL: drizzle would send the latter and the column is NOT NULL.
      { key: "app_institution_labels", value: sql`'null'::json`, description: "Custom tier labels per institution (JSON object)", category: "appearance", isUserConfigurable: true },
      { key: "app_section_visibility", value: {}, description: "Sidebar section rollout flags (JSON object, false = hidden)", category: "appearance", isUserConfigurable: true },
      { key: "color_mode_default", value: "light", description: "Global default color mode for users who have not set their own preference", category: "appearance", isUserConfigurable: true },
    ],
    systemConfigurations.key,
  );

  // ── Permission matrix: every (role, area) cell ──
  const groups: Array<{ id: number; name: string }> = await db
    .select({ id: roleGroups.id, name: roleGroups.name })
    .from(roleGroups);
  const groupIdByName = new Map(groups.map((g) => [g.name, g.id]));
  const permissionRows: InferInsertModel<typeof rolePermissions>[] = [];
  for (const role of ACCESS_ROLES) {
    const roleGroupId = groupIdByName.get(role);
    if (!roleGroupId) continue;
    for (const item of NAVIGATION_ITEMS) {
      permissionRows.push({ roleGroupId, navigationItem: item.id, accessLevel: defaultAccessLevel(role, item.id) });
    }
  }
  await insertIgnoring(rolePermissions, permissionRows, [rolePermissions.roleGroupId, rolePermissions.navigationItem]);

  // ── Organisation ──
  const [researchBranch, clinicalBranch, operationsBranch] = await insertRows(branches, [
    { name: "Research Branch", description: "Laboratory and translational research" },
    { name: "Clinical Branch", description: "Clinical departments running research" },
    { name: "Research Operations", description: "Offices supporting research" },
  ]);
  const [geneticsDept, pediatricsDept, adminDept] = await insertRows(departments, [
    { branchId: researchBranch.id, name: "Human Genetics", description: "Genomics of childhood disease" },
    { branchId: clinicalBranch.id, name: "Pediatric Medicine", description: "General and subspecialty pediatrics" },
    { branchId: operationsBranch.id, name: "Research Administration", description: "PMO, ethics, biosafety, grants and outcomes" },
  ]);
  const [genomicsLab, immunologyClinic, researchOffice] = await insertRows(sections, [
    { departmentId: geneticsDept.id, name: "Rare Disease Genomics Laboratory", type: "Laboratory", description: "Exome and genome sequencing of inherited disorders" },
    { departmentId: pediatricsDept.id, name: "Pediatric Immunology Clinic", type: "Clinic", description: "Primary immunodeficiency and allergy" },
    { departmentId: adminDept.id, name: "Research Office", type: "Office", description: "Grants, contracts and research governance" },
  ]);

  // ── People ──
  const people: PersonSpec[] = [
    { key: "investigator", honorific: "Dr.", first: "Demo", last: "Investigator", jobTitle: "Investigator", isInvestigator: true, accountRole: "Investigator" },
    { key: "physician", honorific: "Dr.", first: "Demo", last: "Physician", jobTitle: "Physician", isInvestigator: true, accountRole: "Physician" },
    { key: "researcher", honorific: "Dr.", first: "Demo", last: "Researcher", jobTitle: "Staff Scientist", accountRole: RESEARCHER_ROLE },
    { key: "labManager", honorific: "Ms.", first: "Demo", last: "Lab Manager", jobTitle: "Lab Manager", accountRole: "Lab Manager" },
    { key: "management", honorific: "Dr.", first: "Demo", last: "Management", jobTitle: "Management", accountRole: "Management" },
    { key: "irbOfficer", honorific: "Ms.", first: "Demo", last: "IRB Officer", jobTitle: "IRB Officer", staffType: "administrative", accountRole: "IRB Officer" },
    { key: "ibcOfficer", honorific: "Mr.", first: "Demo", last: "IBC Officer", jobTitle: "IBC Officer", staffType: "administrative", accountRole: "IBC Officer" },
    { key: "pmoOfficer", honorific: "Ms.", first: "Demo", last: "PMO Officer", jobTitle: "PMO Officer", staffType: "administrative", accountRole: "PMO Officer" },
    { key: "outcomeOfficer", honorific: "Mr.", first: "Demo", last: "Outcome Officer", jobTitle: "Outcome Officer", staffType: "administrative", accountRole: "Outcome Officer" },
    { key: "researchOfficer", honorific: "Ms.", first: "Demo", last: "Research Officer", jobTitle: RESEARCH_OFFICER_ROLE, staffType: "administrative", accountRole: RESEARCH_OFFICER_ROLE },
    { key: "itOfficer", honorific: "Mr.", first: "Demo", last: "IT Officer", jobTitle: "IT Officer", staffType: "administrative", accountRole: "IT Officer" },
    { key: "irbBoard", honorific: "Dr.", first: "Demo", last: "IRB Board Member", jobTitle: "IRB Board Member", accountRole: "IRB Board Member" },
    { key: "ibcBoard", honorific: "Dr.", first: "Demo", last: "IBC Board Member", jobTitle: "IBC Board Member", accountRole: "IBC Board Member" },
    { key: "admin", honorific: "Dr.", first: "Demo", last: "Admin", jobTitle: "Investigator", isInvestigator: true, accountRole: "admin" },
    { key: "superadmin", honorific: "Dr.", first: "Demo", last: "Superadmin", jobTitle: "Investigator", isInvestigator: true, accountRole: "superadmin" },
    // Colleagues with no sign-in, so lists are not made only of demo accounts.
    { key: "layla", honorific: "Dr.", first: "Layla", last: "Al-Mansoori", jobTitle: "Investigator", isInvestigator: true },
    { key: "omar", honorific: "Dr.", first: "Omar", last: "Haddad", jobTitle: "Postdoctoral Researcher" },
    { key: "noor", honorific: "Ms.", first: "Noor", last: "Al-Thani", jobTitle: "PhD Student" },
    { key: "fatima", honorific: "Dr.", first: "Fatima", last: "Rahimi", jobTitle: "Research Specialist" },
    { key: "karim", honorific: "Mr.", first: "Karim", last: "Saleh", jobTitle: "Research Assistant" },
  ];
  const sectionFor = (key: string) => {
    if (["physician", "fatima", "karim", "irbBoard"].includes(key)) return immunologyClinic;
    if (["irbOfficer", "ibcOfficer", "pmoOfficer", "outcomeOfficer", "researchOfficer", "itOfficer", "management"].includes(key)) return researchOffice;
    return genomicsLab;
  };
  const sectionDepartment = new Map([
    [genomicsLab.id, geneticsDept],
    [immunologyClinic.id, pediatricsDept],
    [researchOffice.id, adminDept],
  ]);
  const scientistRows = await insertRows(
    scientists,
    people.map((p, index) => {
      const section = sectionFor(p.key);
      const dept = sectionDepartment.get(section.id)!;
      const emailLocal = p.accountRole ? `demo.${slugOf(p.accountRole)}` : `${p.first}.${p.last}`.toLowerCase().replace(/[^a-z.]/g, "");
      return {
        honorificTitle: p.honorific,
        firstName: p.first,
        lastName: p.last,
        jobTitle: p.jobTitle,
        isInvestigator: p.isInvestigator ?? false,
        email: `${emailLocal}@${DEMO_EMAIL_DOMAIN}`,
        staffId: String(30001 + index),
        department: dept.name,
        departmentId: dept.id,
        sectionId: section.id,
        profileImageInitials: initialsOf(p.first, p.last),
        staffType: p.staffType ?? "scientific",
        bio: p.accountRole
          ? `Demo account holding the ${p.accountRole} role.`
          : `${p.jobTitle} in the ${section.name}.`,
      };
    }),
  );
  const person = new Map<string, ScientistRow>();
  people.forEach((p, index) => person.set(p.key, scientistRows[index]));
  const P = (key: string): ScientistRow => {
    const row = person.get(key);
    if (!row) throw new Error(`No seeded person "${key}"`);
    return row;
  };

  // Supervisors and heads, now that everybody has an id.
  const supervise = async (key: string, supervisorKey: string) =>
    db.update(scientists).set({ supervisorId: P(supervisorKey).id }).where(eq(scientists.id, P(key).id));
  for (const key of ["researcher", "labManager", "omar", "noor", "admin"]) await supervise(key, "investigator");
  for (const key of ["fatima", "karim", "irbBoard"]) await supervise(key, "physician");
  for (const key of ["irbOfficer", "ibcOfficer", "pmoOfficer", "outcomeOfficer", "researchOfficer", "itOfficer"]) await supervise(key, "management");
  for (const key of ["investigator", "physician", "layla", "ibcBoard"]) await supervise(key, "management");
  await db.update(branches).set({ headId: P("management").id }).where(eq(branches.id, researchBranch.id));
  await db.update(branches).set({ headId: P("physician").id }).where(eq(branches.id, clinicalBranch.id));
  await db.update(branches).set({ headId: P("management").id }).where(eq(branches.id, operationsBranch.id));
  await db.update(departments).set({ headId: P("layla").id }).where(eq(departments.id, geneticsDept.id));
  await db.update(departments).set({ headId: P("physician").id }).where(eq(departments.id, pediatricsDept.id));
  await db.update(departments).set({ headId: P("management").id }).where(eq(departments.id, adminDept.id));
  await db.update(sections).set({ headId: P("investigator").id }).where(eq(sections.id, genomicsLab.id));
  await db.update(sections).set({ headId: P("physician").id }).where(eq(sections.id, immunologyClinic.id));
  await db.update(sections).set({ headId: P("researchOfficer").id }).where(eq(sections.id, researchOffice.id));

  // ── Accounts: one per access role, plus admin and superadmin ──
  const accountRoles = [...ACCESS_ROLES, "admin", "superadmin"];
  const passwordHash = hashPassword(DEMO_PASSWORD);
  const userRows = await insertRows(
    users,
    accountRoles.map((role) => {
      const spec = people.find((p) => p.accountRole === role);
      if (!spec) throw new Error(`No person defined for the ${role} account`);
      const slug = slugOf(role);
      const label = role === "admin" ? "Admin" : role === "superadmin" ? "Superadmin" : role;
      return {
        username: `demo.${slug}`,
        password: passwordHash,
        name: `Demo ${label}`,
        email: `demo.${slug}@${DEMO_EMAIL_DOMAIN}`,
        role,
        authProvider: "demo" as const,
        scientistId: P(spec.key).id,
      };
    }),
  );
  const userByRole = new Map(userRows.map((u) => [u.role, u]));
  const superadminUser = userByRole.get("superadmin")!;
  // An administrator here also runs research: Investigator is held alongside.
  const investigatorGroupId = groupIdByName.get("Investigator")!;
  await insertRows(
    userRoleAssignments,
    ["admin", "superadmin"].map((role) => ({
      userId: userByRole.get(role)!.id,
      roleGroupId: investigatorGroupId,
      assignedBy: superadminUser.id,
    })),
  );

  // ── Programs, projects, SDRs ──
  const [rareDiseaseProgram, immunologyProgram] = await insertRows(programs, [
    {
      programId: "PRM-001",
      name: "Rare Disease Genomics Program",
      description: "Genomic diagnosis and mechanism of inherited disorders in Qatari children.",
      programDirectorId: P("investigator").id,
      researchCoLeadId: P("layla").id,
      clinicalCoLead1Id: P("physician").id,
    },
    {
      programId: "PRM-002",
      name: "Pediatric Immunology and Infection Program",
      description: "Primary immunodeficiency, vaccine response and childhood infection.",
      programDirectorId: P("physician").id,
      researchCoLeadId: P("investigator").id,
    },
  ]);
  const [metabolicProject, newbornProject, pidProject] = await insertRows(projects, [
    { projectId: "PRJ-001", programId: rareDiseaseProgram.id, name: "Genetic architecture of inherited metabolic disorders in Qatar", description: "Exome and genome sequencing of consanguineous families with metabolic disease.", principalInvestigatorId: P("investigator").id },
    { projectId: "PRJ-002", programId: rareDiseaseProgram.id, name: "Newborn genomic screening pilot", description: "Feasibility of rapid genome sequencing in the neonatal intensive care unit.", principalInvestigatorId: P("layla").id },
    { projectId: "PRJ-003", programId: immunologyProgram.id, name: "Primary immunodeficiency cohort", description: "Clinical and immunological characterisation of children with inborn errors of immunity.", principalInvestigatorId: P("physician").id },
  ]);
  const sdrRows = await insertRows(researchActivities, [
    { sdrNumber: "SDR-2023-001", projectId: metabolicProject.id, title: "Whole exome sequencing of 200 families with suspected metabolic disease", shortTitle: "Metabolic WES", description: "Trio exome sequencing with variant interpretation against the Qatar genome reference.", status: "active", startDate: ts("2023-02-01"), endDate: ts("2026-01-31"), budgetHolderId: P("investigator").id, sidraBranch: "Research", budgetSource: ["QNRF", "IRF"], objectives: "Reach a molecular diagnosis in at least 40% of enrolled families." },
    { sdrNumber: "SDR-2023-002", projectId: metabolicProject.id, title: "Functional validation of novel metabolic disease variants in cell models", shortTitle: "Variant Validation", description: "CRISPR-edited iPSC lines carrying candidate variants.", status: "active", startDate: ts("2023-09-01"), endDate: ts("2026-08-31"), budgetHolderId: P("investigator").id, sidraBranch: "Research", budgetSource: ["IRF"], objectives: "Establish pathogenicity for ten candidate variants." },
    { sdrNumber: "SDR-2024-003", projectId: newbornProject.id, title: "Rapid genome sequencing in the neonatal intensive care unit", shortTitle: "Rapid NICU Genomes", description: "Turnaround-time study of rapid genome sequencing for critically ill newborns.", status: "planning", startDate: ts("2025-01-15"), budgetHolderId: P("layla").id, sidraBranch: "Clinical", budgetSource: ["PI Budget"], objectives: "Report a result within seven days for 90% of cases." },
    { sdrNumber: "SDR-2022-004", projectId: pidProject.id, title: "Immune phenotyping of children with inborn errors of immunity", shortTitle: "PID Phenotyping", description: "Flow cytometry and cytokine profiling of a prospective PID cohort.", status: "active", startDate: ts("2022-06-01"), endDate: ts("2025-12-31"), budgetHolderId: P("physician").id, sidraBranch: "Clinical", budgetSource: ["QNRF"], objectives: "Define immune signatures that predict infection risk." },
    { sdrNumber: "SDR-2022-005", projectId: pidProject.id, title: "Vaccine responses in children on immunoglobulin replacement", shortTitle: "Vaccine Response", description: "Serological follow-up after routine vaccination.", status: "completed", startDate: ts("2022-03-01"), endDate: ts("2024-02-29"), budgetHolderId: P("physician").id, sidraBranch: "Clinical", budgetSource: ["IRF"], objectives: "Measure seroconversion at six and twelve months." },
  ]);
  const [sdrWes, sdrValidation, sdrNicu, sdrPid, sdrVaccine] = sdrRows;
  await insertRows(projectMembers, [
    { researchActivityId: sdrWes.id, scientistId: P("investigator").id, role: "Principal Investigator" },
    { researchActivityId: sdrWes.id, scientistId: P("researcher").id, role: "Lead Scientist" },
    { researchActivityId: sdrWes.id, scientistId: P("omar").id, role: "Team Member" },
    { researchActivityId: sdrWes.id, scientistId: P("noor").id, role: "Team Member" },
    { researchActivityId: sdrWes.id, scientistId: P("labManager").id, role: "Team Member" },
    { researchActivityId: sdrValidation.id, scientistId: P("investigator").id, role: "Principal Investigator" },
    { researchActivityId: sdrValidation.id, scientistId: P("omar").id, role: "Lead Scientist" },
    { researchActivityId: sdrValidation.id, scientistId: P("superadmin").id, role: "Team Member" },
    { researchActivityId: sdrNicu.id, scientistId: P("layla").id, role: "Principal Investigator" },
    { researchActivityId: sdrNicu.id, scientistId: P("researcher").id, role: "Team Member" },
    { researchActivityId: sdrNicu.id, scientistId: P("admin").id, role: "Team Member" },
    { researchActivityId: sdrPid.id, scientistId: P("physician").id, role: "Principal Investigator" },
    { researchActivityId: sdrPid.id, scientistId: P("fatima").id, role: "Lead Scientist" },
    { researchActivityId: sdrPid.id, scientistId: P("karim").id, role: "Team Member" },
    { researchActivityId: sdrPid.id, scientistId: P("researcher").id, role: "Team Member" },
    { researchActivityId: sdrVaccine.id, scientistId: P("physician").id, role: "Principal Investigator" },
    { researchActivityId: sdrVaccine.id, scientistId: P("fatima").id, role: "Team Member" },
  ]);

  // ── Grants ──
  const grantRows = await insertRows(grants, [
    {
      projectNumber: "NPRP14S-0401-210001", cycle: "NPRP14", programId: rareDiseaseProgram.id, lpiId: P("investigator").id, investigatorType: "Researcher",
      title: "Genomic diagnosis of inherited metabolic disorders in the Qatari population",
      requestedAmount: "850000.00", awardedAmount: "800000.00", submittedYear: 2022, awarded: true, awardedYear: 2023, runningTimeYears: 3, currentGrantYear: "2/3",
      status: "active", grantType: "Local", sourceCategory: "QNRF Grant", submittingInstitution: "Sidra Medicine", fundingAgency: "QNRF/QRDI", currency: "USD",
      startDate: "2023-04-01", endDate: "2026-03-31", durationMonths: 36, reportingIntervalMonths: 12,
      description: "Trio exome and genome sequencing of consanguineous families, with functional follow-up of novel variants.",
      createdByUserId: superadminUser.id,
    },
    {
      projectNumber: "IRF2024-012", cycle: "IRF2024", programId: immunologyProgram.id, lpiId: P("physician").id, investigatorType: "Clinician",
      title: "Immune signatures predicting infection in children with inborn errors of immunity",
      requestedAmount: "320000.00", awardedAmount: "300000.00", submittedYear: 2024, awarded: true, awardedYear: 2024, runningTimeYears: 2, currentGrantYear: "1/2",
      status: "awarded", grantType: "Internal", sourceCategory: "IRF Project", submittingInstitution: "Sidra Medicine", fundingAgency: "Sidra IRF", currency: "QAR",
      startDate: "2025-01-01", endDate: "2026-12-31", durationMonths: 24, reportingIntervalMonths: 6,
      description: "Prospective immune phenotyping to identify children at highest risk of serious infection.",
      createdByUserId: superadminUser.id,
    },
    {
      projectNumber: "NPRP15S-0220-250003", cycle: "NPRP15", programId: rareDiseaseProgram.id, lpiId: P("layla").id, investigatorType: "Researcher",
      title: "Rapid genome sequencing for critically ill newborns in Qatar",
      requestedAmount: "600000.00", submittedYear: 2025, awarded: false,
      status: "submitted", grantType: "Local", sourceCategory: "QNRF Grant", submittingInstitution: "Sidra Medicine", fundingAgency: "QNRF/QRDI", currency: "USD",
      durationMonths: 36,
      description: "A turnaround-time and clinical-utility study of rapid genome sequencing in the NICU.",
      createdByUserId: superadminUser.id,
    },
    {
      projectNumber: "SUB-GOSH-2022-07", cycle: "2022", programId: immunologyProgram.id, lpiId: P("physician").id, investigatorType: "Clinician",
      title: "International registry of vaccine responses in antibody deficiency",
      requestedAmount: "120000.00", awardedAmount: "120000.00", submittedYear: 2022, awarded: true, awardedYear: 2022, runningTimeYears: 2, currentGrantYear: "2/2",
      status: "completed", grantType: "International", sourceCategory: "Subaward Agreement", submittingInstitution: "Great Ormond Street Hospital", grantLpiName: "Prof. Eleanor Whitcombe", fundingAgency: "Wellcome Trust", currency: "USD",
      startDate: "2022-06-01", endDate: "2024-05-31", durationMonths: 24, reportingIntervalMonths: 12, subawardCompletedYear: 2024,
      description: "Sidra's contribution to a multi-site registry led from London.",
      createdByUserId: superadminUser.id,
    },
  ]);
  const [grantNprp, grantIrf, grantNprpNicu, grantSubaward] = grantRows;
  await insertRows(grantCoInvestigators, [
    { grantId: grantNprp.id, scientistId: P("researcher").id, role: "Co-Investigator" },
    { grantId: grantNprp.id, scientistId: P("physician").id, role: "Clinical Co-Investigator" },
    { grantId: grantNprp.id, scientistId: P("superadmin").id, role: "Co-Investigator" },
    { grantId: grantIrf.id, scientistId: P("fatima").id, role: "Co-Investigator" },
    { grantId: grantIrf.id, scientistId: P("investigator").id, role: "Co-Investigator" },
    { grantId: grantNprpNicu.id, scientistId: P("investigator").id, role: "Co-Investigator" },
    { grantId: grantSubaward.id, scientistId: P("fatima").id, role: "Statistician" },
  ]);
  const collaboratingRows = await insertRows(grantCollaboratingInstitutions, [
    { grantId: grantNprp.id, name: "Hamad Medical Corporation" },
    { grantId: grantNprp.id, name: "Qatar University" },
    { grantId: grantIrf.id, name: "Hamad Medical Corporation" },
    { grantId: grantNprpNicu.id, name: "Weill Cornell Medicine - Qatar" },
    { grantId: grantSubaward.id, name: "Great Ormond Street Hospital" },
  ]);
  await insertRows(grantInstitutionCollaborators, [
    { institutionId: collaboratingRows[0].id, name: "Dr. Hassan Al-Kuwari", role: "Co-Investigator" },
    { institutionId: collaboratingRows[1].id, name: "Dr. Maryam Al-Sulaiti", role: "Bioinformatics lead" },
    { institutionId: collaboratingRows[2].id, name: "Dr. Yousef Darwish", role: "Clinical Co-Investigator" },
    { institutionId: collaboratingRows[4].id, name: "Prof. Eleanor Whitcombe", role: "Lead PI" },
  ]);
  // Only awarded grants may link SDRs, and only SDRs under the grant's program.
  await insertRows(grantResearchActivities, [
    { grantId: grantNprp.id, researchActivityId: sdrWes.id, linkedDate: ts("2023-04-15") },
    { grantId: grantNprp.id, researchActivityId: sdrValidation.id, linkedDate: ts("2023-09-10") },
    { grantId: grantIrf.id, researchActivityId: sdrPid.id, linkedDate: ts("2025-01-20") },
    { grantId: grantSubaward.id, researchActivityId: sdrVaccine.id, linkedDate: ts("2022-06-15") },
  ]);

  // ── Journals and impact factors ──
  const journalRows = await insertRows(journals, [
    { journalName: "Journal of Pediatrics", abbreviatedJournal: "J Pediatr", publisher: "Elsevier", issn: "0022-3476", eissn: "1097-6833", field: "Pediatrics" },
    { journalName: "Frontiers in Immunology", abbreviatedJournal: "Front Immunol", publisher: "Frontiers Media", issn: "1664-3224", field: "Immunology" },
    { journalName: "Human Genetics", abbreviatedJournal: "Hum Genet", publisher: "Springer", issn: "0340-6717", eissn: "1432-1203", field: "Genetics & Heredity" },
  ]);
  const [jPediatrics, jImmunology, jHumanGenetics] = journalRows;
  await insertRows(journalImpactFactorMetrics, [
    { journalId: jPediatrics.id, year: 2023, impactFactor: "3.900", fiveYearJif: "4.600", jci: "1.320", quartile: "Q1", rank: 12, totalCites: 42000, citableItems: 610 },
    { journalId: jPediatrics.id, year: 2024, impactFactor: "3.700", fiveYearJif: "4.400", jci: "1.280", quartile: "Q1", rank: 14, totalCites: 41200, citableItems: 590 },
    { journalId: jImmunology.id, year: 2023, impactFactor: "5.700", fiveYearJif: "6.300", jci: "1.150", quartile: "Q1", rank: 38, totalCites: 118000, citableItems: 7900 },
    { journalId: jImmunology.id, year: 2024, impactFactor: "5.400", fiveYearJif: "6.000", jci: "1.100", quartile: "Q2", rank: 46, totalCites: 121000, citableItems: 7400 },
    { journalId: jHumanGenetics.id, year: 2023, impactFactor: "3.800", fiveYearJif: "4.900", jci: "1.010", quartile: "Q2", rank: 55, totalCites: 12500, citableItems: 210 },
    { journalId: jHumanGenetics.id, year: 2024, impactFactor: "4.100", fiveYearJif: "5.000", jci: "1.060", quartile: "Q2", rank: 51, totalCites: 12900, citableItems: 205 },
  ]);

  // ── Publications, one per workflow stage ──
  const authorLine = (...keys: string[]) =>
    keys.map((k) => `${P(k).lastName} ${P(k).firstName[0]}`).join(", ");
  type PubSpec = {
    title: string;
    status: string;
    sdr: (typeof sdrRows)[number];
    extraSdr?: (typeof sdrRows)[number];
    journal?: string;
    doi?: string;
    date?: string;
    type?: string;
    volume?: string;
    pages?: string;
    vetted?: boolean;
    prepublicationUrl?: string;
    prepublicationSite?: string;
    authors: Array<{ key: string; type: string }>;
  };
  const pubSpecs: PubSpec[] = [
    {
      title: "Diagnostic yield of trio exome sequencing in consanguineous Qatari families with metabolic disease", status: PUBLISHED_STATUS,
      sdr: sdrWes, extraSdr: sdrValidation, journal: jHumanGenetics.journalName, doi: "10.1000/demo.hg.2024.0187", date: "2024-09-12", type: "Journal Article", volume: "143", pages: "1187-1199", vetted: true,
      authors: [{ key: "researcher", type: "First Author" }, { key: "omar", type: "Contributing Author" }, { key: "noor", type: "Contributing Author" }, { key: "layla", type: "Second or Second Last Author" }, { key: "investigator", type: "Last Author, Corresponding Author" }],
    },
    {
      title: "Immune signatures of serious infection in children with inborn errors of immunity", status: PUBLISHED_FINAL_STATUS,
      sdr: sdrPid, journal: jImmunology.journalName, doi: "10.1000/demo.fimmu.2023.0921", date: "2023-11-03", type: "Journal Article", volume: "14", pages: "1220921", vetted: true,
      authors: [{ key: "fatima", type: "First Author" }, { key: "karim", type: "Contributing Author" }, { key: "researcher", type: "Contributing Author" }, { key: "physician", type: "Last Author, Corresponding Author" }],
    },
    {
      title: "Seroconversion after routine vaccination in children on immunoglobulin replacement", status: PUBLISHED_STATUS,
      sdr: sdrVaccine, journal: jPediatrics.journalName, doi: "10.1000/demo.jpeds.2024.0056", date: "2024-03-20", type: "Journal Article", volume: "266", pages: "113840", vetted: true,
      authors: [{ key: "physician", type: "First Author, Corresponding Author" }, { key: "fatima", type: "Contributing Author" }, { key: "superadmin", type: "Last Author" }],
    },
    {
      title: "A recurrent founder variant in a lysosomal storage gene in the Gulf population", status: "Accepted/In Press",
      sdr: sdrWes, journal: jHumanGenetics.journalName, date: "2025-08-01", type: "Journal Article", vetted: true,
      authors: [{ key: "omar", type: "First Author" }, { key: "researcher", type: "Contributing Author" }, { key: "investigator", type: "Last Author, Corresponding Author" }],
    },
    {
      title: "Edited stem cell models resolve variants of uncertain significance in metabolic disease", status: "Under review",
      sdr: sdrValidation, journal: jHumanGenetics.journalName, type: "Journal Article", vetted: true,
      authors: [{ key: "omar", type: "First Author" }, { key: "superadmin", type: "Contributing Author" }, { key: "investigator", type: "Last Author, Corresponding Author" }],
    },
    {
      title: "Flow cytometric reference ranges for lymphocyte subsets in Qatari children", status: "Submitted for review with pre-publication",
      sdr: sdrPid, journal: jImmunology.journalName, type: "Journal Article", vetted: true, prepublicationUrl: "https://www.medrxiv.org/content/10.1101/2025.06.01.25328001", prepublicationSite: "medRxiv",
      authors: [{ key: "fatima", type: "First Author" }, { key: "karim", type: "Contributing Author" }, { key: "physician", type: "Last Author, Corresponding Author" }],
    },
    {
      title: "Turnaround time of rapid genome sequencing in a Middle Eastern neonatal intensive care unit", status: IP_VETTED_STATUS,
      sdr: sdrNicu, type: "Journal Article", vetted: true,
      authors: [{ key: "layla", type: "First Author, Corresponding Author" }, { key: "researcher", type: "Contributing Author" }, { key: "admin", type: "Contributing Author" }],
    },
    {
      title: "Parental attitudes to newborn genomic screening in Qatar: a qualitative study", status: IP_VETTING_READY_STATUS,
      sdr: sdrNicu, type: "Journal Article",
      authors: [{ key: "noor", type: "First Author" }, { key: "layla", type: "Last Author, Corresponding Author" }],
    },
    {
      title: "Long-read sequencing of unsolved metabolic disease exomes", status: "Concept",
      sdr: sdrWes,
      authors: [{ key: "investigator", type: "First Author, Corresponding Author" }, { key: "omar", type: "Contributing Author" }],
    },
  ];
  let publicationCount = 0;
  for (const spec of pubSpecs) {
    const created = await storage.createPublicationWithHistory(
      {
        researchActivityId: spec.sdr.id,
        title: spec.title,
        authors: authorLine(...spec.authors.map((a) => a.key)),
        journal: spec.journal ?? null,
        volume: spec.volume ?? null,
        pages: spec.pages ?? null,
        doi: spec.doi ?? null,
        publicationDate: spec.date ? ts(spec.date) : null,
        publicationType: spec.type ?? null,
        status: spec.status,
        vettedForSubmissionByIpOffice: spec.vetted ?? false,
        prepublicationUrl: spec.prepublicationUrl ?? null,
        prepublicationSite: spec.prepublicationSite ?? null,
        abstract: `Demo abstract for "${spec.title}".`,
        createdByUserId: superadminUser.id,
      },
      {
        fromStatus: null,
        toStatus: spec.status,
        changedBy: P(spec.authors[0].key).id,
        changeReason: "Seeded demo record",
      },
    );
    publicationCount += 1;
    await insertRows(
      publicationAuthors,
      spec.authors.map((a, index) => ({
        publicationId: created.id,
        scientistId: P(a.key).id,
        authorshipType: a.type,
        authorPosition: index + 1,
        linkedByUserId: superadminUser.id,
        linkMethod: "manual",
      })),
    );
    if (spec.extraSdr) {
      await insertRows(publicationResearchActivities, [{ publicationId: created.id, researchActivityId: spec.extraSdr.id }]);
    }
  }

  // ── Patents ──
  await insertRows(patents, [
    { researchActivityId: sdrValidation.id, title: "Method for functional classification of metabolic gene variants using edited stem cell lines", inventors: `${P("investigator").firstName} ${P("investigator").lastName}, ${P("omar").firstName} ${P("omar").lastName}`, filingDate: ts("2024-05-14"), status: "Filed", patentNumber: "US 2024/0187654 A1", description: "Provisional application covering the variant classification workflow." },
    { researchActivityId: sdrPid.id, title: "Cytokine panel for predicting infection risk in antibody deficiency", inventors: `${P("physician").firstName} ${P("physician").lastName}, ${P("fatima").firstName} ${P("fatima").lastName}`, filingDate: ts("2022-09-30"), grantDate: ts("2025-02-18"), status: "Granted", patentNumber: "QA 2025/000412", description: "Granted Qatari patent on a twelve-analyte panel." },
  ]);

  // ── IRB ──
  await insertRows(irbApplications, [
    {
      researchActivityId: sdrPid.id, irbNumber: "IRB-2022-041", irbNetNumber: "1938522", title: "Immune phenotyping of children with inborn errors of immunity", shortTitle: "PID Phenotyping",
      principalInvestigatorId: P("physician").id, protocolType: "Expedited", isInterventional: false, submissionDate: ts("2022-04-11"), initialApprovalDate: "2022-05-30", expirationDate: "2026-05-29",
      status: "Active", workflowStatus: "approved", submissionType: "initial", version: 2, riskLevel: "minimal", vulnerablePopulations: ["children"], studyDesign: "observational",
      dataCollectionMethods: ["medical_records", "biological_samples"], expectedParticipants: 150, studyDuration: "48 months", fundingSource: "Sidra IRF",
      subjectEnrollmentReasons: ["Sample Collection", "Data Collection"], description: "Prospective cohort with annual blood sampling.",
    },
    {
      researchActivityId: sdrNicu.id, irbNumber: "IRB-2025-017", title: "Rapid genome sequencing in the neonatal intensive care unit", shortTitle: "Rapid NICU Genomes",
      principalInvestigatorId: P("layla").id, protocolType: "Full Board", isInterventional: true, submissionDate: ts("2025-06-02"),
      status: "Pending", workflowStatus: "under_review", submissionType: "initial", version: 1, riskLevel: "greater_than_minimal", vulnerablePopulations: ["children", "neonates"], studyDesign: "interventional",
      dataCollectionMethods: ["medical_records", "biological_samples"], expectedParticipants: 60, studyDuration: "24 months", fundingSource: "PI Budget",
      subjectEnrollmentReasons: ["Sample Collection"], description: "Awaiting full board review.",
    },
  ]);
  await insertRows(irbBoardMembers, [
    { scientistId: P("irbBoard").id, role: "chair", expertise: ["pediatrics", "research ethics"], appointmentDate: ts("2023-01-01"), termEndDate: ts("2026-12-31"), isActive: true },
    { scientistId: P("physician").id, role: "member", expertise: ["immunology", "clinical trials"], appointmentDate: ts("2024-01-01"), termEndDate: ts("2026-12-31"), isActive: true },
    { scientistId: P("layla").id, role: "deputy_chair", expertise: ["genomics", "consent"], appointmentDate: ts("2023-06-01"), termEndDate: ts("2026-05-31"), isActive: true },
  ]);

  // ── Facilities ──
  const [researchTower, clinicBuilding] = await insertRows(buildings, [
    { name: "Sidra Research Tower", address: "Al Luqta Street, Education City, Doha", description: "Wet and dry laboratories", totalFloors: 8, maxOccupancy: 600, emergencyContact: "+974 4003 0000", safetyNotes: "Laboratory floors 3-6 require badge access." },
    { name: "Outpatient Clinic Building", address: "Al Gharrafa Street, Doha", description: "Outpatient clinics and clinical research rooms", totalFloors: 4, maxOccupancy: 900, emergencyContact: "+974 4003 1111" },
  ]);
  // Room supervisors need the investigator designation; room managers a
  // Management, Staff, Post-doctoral or Research job title.
  const roomRows = await insertRows(rooms, [
    { buildingId: researchTower.id, roomNumber: "RT-3-101", floor: 3, roomType: "Laboratory", capacity: 12, area: "85", biosafetyLevel: "BSL-2", roomSupervisorId: P("investigator").id, roomManagerId: P("researcher").id, certifications: ["Biosafety Cabinet Class II"], availablePpe: ["Lab coat", "Nitrile gloves", "Safety glasses", "Face shield"], equipment: "Two class II biosafety cabinets, CO2 incubators, Illumina NovaSeq", accessRestrictions: "Badge access, IBC-approved staff only" },
    { buildingId: researchTower.id, roomNumber: "RT-3-102", floor: 3, roomType: "Cold Room", capacity: 2, area: "12", biosafetyLevel: "BSL-1", roomSupervisorId: P("investigator").id, roomManagerId: P("researcher").id, availablePpe: ["Lab coat", "Insulated gloves"], equipment: "-80 freezers, liquid nitrogen dewars" },
    { buildingId: researchTower.id, roomNumber: "RT-4-210", floor: 4, roomType: "Office", capacity: 8, area: "40", roomSupervisorId: P("layla").id, roomManagerId: P("omar").id, equipment: "Analysis workstations" },
    { buildingId: clinicBuilding.id, roomNumber: "OC-2-014", floor: 2, roomType: "Laboratory", capacity: 6, area: "45", biosafetyLevel: "BSL-2", roomSupervisorId: P("physician").id, roomManagerId: P("fatima").id, availablePpe: ["Lab coat", "Nitrile gloves", "Safety glasses"], equipment: "Flow cytometer, centrifuges" },
    { buildingId: clinicBuilding.id, roomNumber: "OC-2-015", floor: 2, roomType: "Other", capacity: 4, area: "20", roomSupervisorId: P("physician").id, roomManagerId: P("fatima").id, specialFeatures: "Clinical research sample reception" },
  ]);

  // ── IBC ──
  const ibcRows = await insertRows(ibcApplications, [
    {
      ibcNumber: "IBC-2023-008", cayuseProtocolNumber: "23-0117", title: "Generation and culture of CRISPR-edited iPSC lines carrying metabolic disease variants", shortTitle: "Edited iPSC Lines",
      principalInvestigatorId: P("investigator").id, biosafetyLevel: "BSL-2", riskGroupClassification: "Risk Group 2", recombinantSyntheticNucleicAcid: true, humanOrigin: true, humanMaterials: ["cell lines"],
      useOfHumanCellLines: true, useOfStemCells: true, cloningVectorConstruction: true, expressionInCulturedCells: true, recombinantDNA: true,
      exposureControlPlanCompliance: true, handWashingDevice: true, laundryMethod: ["in-house"],
      submissionDate: ts("2023-08-14"), vettedDate: ts("2023-08-28"), underReviewDate: ts("2023-09-04"), approvalDate: ts("2023-10-02"), expirationDate: "2026-10-01", lastReviewDate: "2025-09-15", nextReviewDate: "2026-09-15",
      status: "active", workflowStatus: "active", submissionType: "initial", version: 1, riskLevel: "moderate", requiresMonitoring: true, monitoringFrequency: "annually",
      description: "Lentiviral delivery of CRISPR-Cas9 to patient-derived iPSCs.", protocolSummary: "Transduction, selection and expansion of edited lines in a class II cabinet.",
    },
    {
      ibcNumber: "IBC-2025-021", title: "Handling of blood and serum from children with primary immunodeficiency", shortTitle: "PID Sample Handling",
      principalInvestigatorId: P("physician").id, biosafetyLevel: "BSL-2", riskGroupClassification: "Risk Group 2", humanOrigin: true, humanMaterials: ["blood", "serum"], materialsContainKnownPathogens: false,
      exposureControlPlanCompliance: true, handWashingDevice: true, laundryMethod: ["offsite vendor"],
      submissionDate: ts("2025-07-21"),
      status: "submitted", workflowStatus: "submitted", submissionType: "initial", version: 1, riskLevel: "low",
      description: "Processing and storage of clinical samples for immune phenotyping.",
    },
  ]);
  await insertRows(ibcApplicationResearchActivities, [
    { ibcApplicationId: ibcRows[0].id, researchActivityId: sdrValidation.id },
    { ibcApplicationId: ibcRows[1].id, researchActivityId: sdrPid.id },
  ]);
  await insertRows(ibcApplicationRooms, [
    { applicationId: ibcRows[0].id, roomId: roomRows[0].id },
    { applicationId: ibcRows[0].id, roomId: roomRows[1].id },
    { applicationId: ibcRows[1].id, roomId: roomRows[3].id },
  ]);
  await insertRows(ibcBoardMembers, [
    { scientistId: P("ibcBoard").id, role: "chair", expertise: ["biosafety", "microbiology"], biosafetyTraining: ["NIH Guidelines 2024", "BSL-2 practices"], appointmentDate: ts("2023-01-01"), termEndDate: ts("2026-12-31"), isActive: true },
    { scientistId: P("researcher").id, role: "member", expertise: ["cell culture", "recombinant DNA"], biosafetyTraining: ["BSL-2 practices"], appointmentDate: ts("2024-03-01"), termEndDate: ts("2027-02-28"), isActive: true },
  ]);

  // ── Contracts ──
  await insertRows(researchContracts, [
    {
      researchActivityId: sdrWes.id, contractNumber: "CTR-2023-014", title: "Collaboration agreement on exome sequencing of metabolic disease families", leadPIId: P("investigator").id,
      contractType: "Collaboration", status: "active", requestState: "approved", startDate: "2023-05-01", endDate: "2026-04-30", fundingSourceCategory: "QNRF",
      contractorName: "Hamad Medical Corporation", counterpartyContact: "Dr. Hassan Al-Kuwari, hkuwari@example.org", counterpartyCountry: "Qatar",
      internalCostSidra: 150000, internalCostCounterparty: 90000, moneyOut: 0, isPORelevant: false, contractValue: "240000.00", currency: "QAR",
      requestedByUserId: userByRole.get("Investigator")!.id, officeFormStatus: "complete", irbProtocol: "IRB-2022-041",
      description: "Referral of families and sharing of clinical phenotype data.",
    },
    {
      researchActivityId: sdrPid.id, contractNumber: "CTR-2025-031", title: "Material transfer agreement for cytokine panel reagents", leadPIId: P("physician").id,
      contractType: "Material Transfer", status: "submitted", requestState: "requested", fundingSourceCategory: "IRF Fund",
      contractorName: "Great Ormond Street Hospital", counterpartyContact: "research.contracts@example.org", counterpartyCountry: "United Kingdom",
      internalCostSidra: 8000, moneyOut: 0, isPORelevant: true, contractValue: "8000.00", currency: "USD",
      requestedByUserId: userByRole.get("Physician")!.id, initiationRequestedAt: ts("2025-08-05"), officeFormStatus: "incomplete",
      description: "Inbound transfer of validated antibody panels.",
    },
  ]);

  // ── Data management plans ──
  await insertRows(dataManagementPlans, [
    { researchActivityId: sdrWes.id, dmpNumber: "DMP-2023-001", title: "Data management plan for metabolic disease exome sequencing", description: "Covers raw sequencing data, variant calls and phenotype records.", dataCollectionMethods: "Illumina sequencing; REDCap phenotype forms", dataStoragePlan: "Raw FASTQ on the institutional research storage; variant calls in the genomics database", dataSharingPlan: "Aggregate variant frequencies deposited in a public archive after publication", retentionPeriod: "10 years after study close" },
    { researchActivityId: sdrPid.id, dmpNumber: "DMP-2022-004", title: "Data management plan for the PID phenotyping cohort", description: "Flow cytometry FCS files and cytokine measurements.", dataCollectionMethods: "Flow cytometry; multiplex cytokine assay", dataStoragePlan: "FCS files on the core facility server; clinical data in REDCap", dataSharingPlan: "De-identified data available on request", retentionPeriod: "7 years" },
  ]);

  // ── Certifications ──
  const moduleRows = await insertRows(certificationModules, [
    { name: "Human Subjects Research (CITI)", description: "Ethics of research involving human participants", isCore: true, expirationMonths: 36, isActive: true },
    { name: "Biosafety and Biosecurity", description: "Safe handling of biological materials", isCore: true, expirationMonths: 24, isActive: true },
    { name: "Good Clinical Practice", description: "ICH GCP for interventional studies", isCore: false, expirationMonths: 36, isActive: true },
  ]);
  const [humanSubjectsModule, biosafetyModule, gcpModule] = moduleRows;
  const uploader = P("irbOfficer").id;
  await insertRows(certifications, [
    { scientistId: P("investigator").id, moduleId: humanSubjectsModule.id, startDate: "2024-02-10", endDate: "2027-02-09", uploadedBy: uploader },
    { scientistId: P("investigator").id, moduleId: biosafetyModule.id, startDate: "2025-01-15", endDate: "2027-01-14", uploadedBy: uploader },
    { scientistId: P("researcher").id, moduleId: biosafetyModule.id, startDate: "2023-03-01", endDate: "2025-02-28", uploadedBy: uploader, notes: "Expired; renewal requested." },
    { scientistId: P("physician").id, moduleId: humanSubjectsModule.id, startDate: "2023-09-20", endDate: "2026-09-19", uploadedBy: uploader },
    { scientistId: P("physician").id, moduleId: gcpModule.id, startDate: "2024-06-01", endDate: "2027-05-31", uploadedBy: uploader },
    { scientistId: P("fatima").id, moduleId: humanSubjectsModule.id, startDate: "2024-11-05", endDate: "2027-11-04", uploadedBy: uploader },
    { scientistId: P("omar").id, moduleId: biosafetyModule.id, startDate: "2025-03-12", endDate: "2027-03-11", uploadedBy: uploader },
  ]);

  // ── Summary ──
  const counted: Array<[string, PgTable]> = [
    ["users", users], ["scientists", scientists], ["branches", branches], ["departments", departments], ["sections", sections],
    ["role_groups", roleGroups], ["role_permissions", rolePermissions], ["user_role_assignments", userRoleAssignments],
    ["programs", programs], ["projects", projects], ["research_activities", researchActivities], ["project_members", projectMembers],
    ["grants", grants], ["grant_co_investigators", grantCoInvestigators], ["grant_collaborating_institutions", grantCollaboratingInstitutions],
    ["grant_institution_collaborators", grantInstitutionCollaborators], ["grant_research_activities", grantResearchActivities],
    ["journals", journals], ["journal_impact_factor_metrics", journalImpactFactorMetrics],
    ["publications", publications], ["publication_authors", publicationAuthors], ["publication_research_activities", publicationResearchActivities], ["manuscript_history", manuscriptHistory],
    ["patents", patents], ["irb_applications", irbApplications], ["irb_board_members", irbBoardMembers],
    ["ibc_applications", ibcApplications], ["ibc_application_research_activities", ibcApplicationResearchActivities], ["ibc_application_rooms", ibcApplicationRooms], ["ibc_board_members", ibcBoardMembers],
    ["research_contracts", researchContracts], ["data_management_plans", dataManagementPlans],
    ["certification_modules", certificationModules], ["certifications", certifications],
    ["buildings", buildings], ["rooms", rooms],
    ["institutions", institutions], ["contract_types", contractTypes], ["grant_statuses", grantStatuses], ["system_configurations", systemConfigurations],
  ];
  console.log("\nSeeded demo data:");
  for (const [name, table] of counted) {
    console.log(`  ${name.padEnd(36)} ${String(await countRows(table)).padStart(5)}`);
  }
  console.log(`\nPublications written through DatabaseStorage: ${publicationCount}`);
  printAccounts(userRows.map((u) => ({ username: u.username, name: u.name, role: u.role })));
}

function printAccounts(rows: Array<{ username: string; name: string; role: string }>): void {
  console.log("\nDemo accounts:");
  for (const row of rows) {
    const secondary = row.role === "admin" || row.role === "superadmin" ? " (+ Investigator)" : "";
    console.log(`  ${row.username.padEnd(26)} ${row.name.padEnd(24)} ${row.role}${secondary}`);
  }
  console.log(`\nEvery demo account's password is "${DEMO_PASSWORD}".`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL must be set.");
    return 1;
  }
  const reset = process.argv.includes("--reset");

  const existing: Array<{ username: string; name: string; role: string }> = await db
    .select({ username: users.username, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.authProvider, "demo"))
    .orderBy(users.username);

  if (reset) {
    if (process.env.SEED_RESET_CONFIRM !== "yes") {
      console.error(
        "--reset wipes every table this seed writes, including all user accounts.\n" +
          "Refusing: set SEED_RESET_CONFIRM=yes to confirm.",
      );
      return 1;
    }
    console.log(`Resetting ${TRUNCATED_TABLES.length + 2} tables...`);
    await resetTables();
  } else if (existing.length > 0) {
    console.log(`Demo accounts already exist (${existing.length}); nothing written. Pass --reset to re-seed.`);
    printAccounts(existing);
    return 0;
  }

  await seed();
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("Seed failed:", error);
    // Publications go through DatabaseStorage, which opens its own transaction,
    // so the run cannot be one transaction: a failure part-way leaves what was
    // written so far, and the next plain run will see the accounts and skip.
    console.error("The seed is not atomic; re-run with --reset (and SEED_RESET_CONFIRM=yes) to start over.");
    process.exit(1);
  });
