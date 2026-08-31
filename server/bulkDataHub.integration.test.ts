import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { eq, inArray } from "drizzle-orm";
import {
  grants,
  irbApplications,
  programs,
  projects,
  researchActivities,
  researchContracts,
  scientists,
  buildings,
  rooms,
  certificationModules,
  certifications,
  publications,
  publicationAuthors,
  manuscriptHistory,
  journals,
  journalImpactFactorMetrics,
  users,
  roleGroups,
  rolePermissions,
  userRoleAssignments,
} from "@shared/schema";
import { db } from "./db.js";
import { applySection, previewSection } from "./bulkDataHub.js";

const runIntegration = process.env.RUN_BULK_HUB_INTEGRATION === "1";
const integrationTest = runIntegration ? test : test.skip;

type SheetInput = {
  name: string;
  headers: string[];
  rows: unknown[][];
};

async function workbookBase64(sheets: SheetInput[]): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  for (const input of sheets) {
    const sheet = workbook.addWorksheet(input.name);
    sheet.addRow(input.headers);
    for (const row of input.rows) sheet.addRow(row);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer()).toString("base64");
}

function uniqueKey(label: string): string {
  return `BULK-HUB-${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

integrationTest("PMO workbooks apply parents before children and are idempotent", async (t) => {
  const programId = uniqueKey("PRM");
  const projectId = uniqueKey("PRJ");
  const sdrNumber = uniqueKey("SDR");

  t.after(async () => {
    await db.delete(researchActivities).where(eq(researchActivities.sdrNumber, sdrNumber));
    await db.delete(projects).where(eq(projects.projectId, projectId));
    await db.delete(programs).where(eq(programs.programId, programId));
  });

  const fileBase64 = await workbookBase64([
    {
      name: "Programs",
      headers: ["Program ID", "Name"],
      rows: [[programId, "Bulk Hub Integration Program"]],
    },
    {
      name: "Projects",
      headers: ["Project ID", "Program ID", "Name"],
      rows: [[projectId, programId, "Bulk Hub Integration Project"]],
    },
    {
      name: "Research Activities",
      headers: ["SDR Number", "Project ID", "Title", "Status"],
      rows: [[sdrNumber, projectId, "Bulk Hub Integration SDR", "planning"]],
    },
  ]);

  const preview = await previewSection("pmo-office", fileBase64, "pmo.xlsx");
  assert.equal(preview.canApply, true);
  assert.equal(preview.rows.filter((row) => row.action === "create").length, 3);

  const applied = await applySection(
    "pmo-office",
    fileBase64,
    "pmo.xlsx",
    preview.fingerprint,
  );
  assert.deepEqual(applied.counts.Programs, { created: 1, updated: 0, skipped: 0 });
  assert.deepEqual(applied.counts.Projects, { created: 1, updated: 0, skipped: 0 });
  assert.deepEqual(applied.counts["Research Activities"], { created: 1, updated: 0, skipped: 0 });

  const [program] = await db.select().from(programs).where(eq(programs.programId, programId));
  const [project] = await db.select().from(projects).where(eq(projects.projectId, projectId));
  const [activity] = await db.select().from(researchActivities).where(eq(researchActivities.sdrNumber, sdrNumber));
  assert.equal(project.programId, program.id);
  assert.equal(activity.projectId, project.id);

  const secondPreview = await previewSection("pmo-office", fileBase64, "pmo.xlsx");
  assert.equal(secondPreview.canApply, true);
  assert.equal(secondPreview.rows.every((row) => row.action === "skip"), true);
});

integrationTest("Research Office groups contracts and grants atomically and idempotently", async (t) => {
  const contractNumber = uniqueKey("CONTRACT");
  const projectNumber = uniqueKey("GRANT");
  t.after(async () => {
    await db.delete(researchContracts).where(eq(researchContracts.contractNumber, contractNumber));
    await db.delete(grants).where(eq(grants.projectNumber, projectNumber));
  });
  const file = await workbookBase64([
    {
      name: "Research Contracts",
      headers: ["Contract Number", "Title", "Status"],
      rows: [[contractNumber, "Grouped Contract", "submitted"]],
    },
    {
      name: "Grants",
      headers: ["Project Number", "Title", "Status", "Awarded (Yes/No)"],
      rows: [[projectNumber, "Grouped Grant", "submitted", "No"]],
    },
  ]);
  const preview = await previewSection("research-services", file, "research-data-management.xlsx");
  assert.equal(preview.canApply, true);
  await applySection("research-services", file, "research-data-management.xlsx", preview.fingerprint);
  assert.equal((await db.select().from(researchContracts).where(eq(researchContracts.contractNumber, contractNumber))).length, 1);
  assert.equal((await db.select().from(grants).where(eq(grants.projectNumber, projectNumber))).length, 1);
  assert.equal((await previewSection("research-services", file, "research-data-management.xlsx")).rows.every((row) => row.action === "skip"), true);
});

integrationTest("an invalid relationship prevents every write in the section", async (t) => {
  const programId = uniqueKey("NO-WRITE-PRM");
  const projectId = uniqueKey("NO-WRITE-PRJ");
  t.after(async () => {
    await db.delete(projects).where(eq(projects.projectId, projectId));
    await db.delete(programs).where(eq(programs.programId, programId));
  });

  const fileBase64 = await workbookBase64([
    {
      name: "Programs",
      headers: ["Program ID", "Name"],
      rows: [[programId, "Must Not Be Written"]],
    },
    {
      name: "Projects",
      headers: ["Project ID", "Program ID", "Name"],
      rows: [[projectId, `${programId}-MISSING`, "Invalid Child"]],
    },
  ]);

  const preview = await previewSection("pmo-office", fileBase64, "invalid.xlsx");
  assert.equal(preview.canApply, false);
  assert.equal(preview.rows.some((row) => row.action === "error"), true);
  await assert.rejects(
    applySection("pmo-office", fileBase64, "invalid.xlsx", preview.fingerprint),
    /row error/,
  );

  const written = await db.select().from(programs).where(eq(programs.programId, programId));
  assert.equal(written.length, 0);
});

integrationTest("apply rejects a preview after matching database state changes", async (t) => {
  const programId = uniqueKey("STALE-PRM");
  t.after(async () => {
    await db.delete(programs).where(eq(programs.programId, programId));
  });

  const fileBase64 = await workbookBase64([
    {
      name: "Programs",
      headers: ["Program ID", "Name"],
      rows: [[programId, "Previewed Name"]],
    },
  ]);
  const preview = await previewSection("pmo-office", fileBase64, "stale.xlsx");
  assert.equal(preview.canApply, true);

  await db.insert(programs).values({ programId, name: "External Change" });

  await assert.rejects(
    applySection("pmo-office", fileBase64, "stale.xlsx", preview.fingerprint),
    /Fingerprint mismatch/,
  );
  const [program] = await db.select().from(programs).where(eq(programs.programId, programId));
  assert.equal(program.name, "External Change");
});

integrationTest("same-workbook supervisors resolve after staff upserts", async (t) => {
  const suffix = uniqueKey("STAFF").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const managerEmail = `manager-${suffix}@example.invalid`;
  const reportEmail = `report-${suffix}@example.invalid`;
  t.after(async () => {
    await db.delete(scientists).where(inArray(scientists.email, [managerEmail, reportEmail]));
  });

  const fileBase64 = await workbookBase64([
    {
      name: "Scientists",
      headers: ["Email", "Honorific Title", "First Name", "Last Name", "Line Manager Email"],
      rows: [
        [reportEmail, "Dr", "Report", "Scientist", managerEmail],
        [managerEmail, "Dr", "Manager", "Scientist", ""],
      ],
    },
  ]);

  const preview = await previewSection(
    "research-management",
    fileBase64,
    "research-management.xlsx",
  );
  assert.equal(preview.canApply, true);
  assert.equal(preview.rows.filter((row) => row.action === "create").length, 2);

  await applySection(
    "research-management",
    fileBase64,
    "research-management.xlsx",
    preview.fingerprint,
  );

  const [manager] = await db.select().from(scientists).where(eq(scientists.email, managerEmail));
  const [report] = await db.select().from(scientists).where(eq(scientists.email, reportEmail));
  assert.equal(report.supervisorId, manager.id);
});

integrationTest("mixed-case business keys update the existing record without creating a duplicate", async (t) => {
  const uppercaseKey = uniqueKey("CASE-PRM").toUpperCase();
  const importedKey = uppercaseKey.toLowerCase();
  const [created] = await db
    .insert(programs)
    .values({ programId: uppercaseKey, name: "Original Name" })
    .returning({ id: programs.id });

  t.after(async () => {
    await db.delete(programs).where(eq(programs.id, created.id));
  });

  const fileBase64 = await workbookBase64([
    {
      name: "Programs",
      headers: ["Program ID", "Name"],
      rows: [[importedKey, "Updated Through Mixed Case"]],
    },
  ]);
  const preview = await previewSection("pmo-office", fileBase64, "mixed-case.xlsx");
  assert.equal(preview.rows[0].action, "update");

  await applySection("pmo-office", fileBase64, "mixed-case.xlsx", preview.fingerprint);

  const [updated] = await db.select().from(programs).where(eq(programs.id, created.id));
  assert.equal(updated.name, "Updated Through Mixed Case");
  const allMatching = await db.select().from(programs);
  assert.equal(
    allMatching.filter((row) => row.programId.toLowerCase() === importedKey).length,
    1,
  );
});

integrationTest("CLEAR nulls supported grant fields while blank cells stay unchanged", async (t) => {
  const projectNumber = uniqueKey("CLEAR-GRANT");
  const [created] = await db
    .insert(grants)
    .values({
      projectNumber,
      title: "Title Must Stay",
      status: "submitted",
      awarded: false,
      requestedAmount: "1250.00",
      awardedAmount: "1000.00",
      submittedYear: 2024,
      awardedYear: 2025,
      runningTimeYears: 2,
      startDate: "2025-01-01",
      endDate: "2026-01-01",
      reportingIntervalMonths: 6,
      collaborators: ["Example Collaborator"],
      description: "Clear me",
    })
    .returning({ id: grants.id });

  t.after(async () => {
    await db.delete(grants).where(eq(grants.id, created.id));
  });

  const fileBase64 = await workbookBase64([
    {
      name: "Grants",
      headers: [
        "Project Number",
        "Title",
        "Requested Amount",
        "Awarded Amount",
        "Submitted Year",
        "Awarded Year",
        "Running Time (Years)",
        "Start Date",
        "End Date",
        "Reporting Interval (Months)",
        "Collaborators",
        "Description",
      ],
      rows: [[
        projectNumber,
        "",
        "CLEAR",
        "CLEAR",
        "CLEAR",
        "CLEAR",
        "CLEAR",
        "CLEAR",
        "CLEAR",
        "CLEAR",
        "CLEAR",
        "CLEAR",
      ]],
    },
  ]);
  const preview = await previewSection(
    "research-services",
    fileBase64,
    "clear-grant.xlsx",
  );
  assert.equal(preview.canApply, true);
  assert.equal(preview.rows[0].action, "update");

  await applySection(
    "research-services",
    fileBase64,
    "clear-grant.xlsx",
    preview.fingerprint,
  );

  const [updated] = await db.select().from(grants).where(eq(grants.id, created.id));
  assert.equal(updated.title, "Title Must Stay");
  assert.equal(updated.requestedAmount, null);
  assert.equal(updated.awardedAmount, null);
  assert.equal(updated.submittedYear, null);
  assert.equal(updated.awardedYear, null);
  assert.equal(updated.runningTimeYears, null);
  assert.equal(updated.startDate, null);
  assert.equal(updated.endDate, null);
  assert.equal(updated.reportingIntervalMonths, null);
  assert.equal(updated.collaborators, null);
  assert.equal(updated.description, null);
});

integrationTest("repeat grant imports append unique list data and enrich the same record", async (t) => {
  const projectNumber = uniqueKey("ENRICH-GRANT");
  const [created] = await db
    .insert(grants)
    .values({
      projectNumber,
      title: "Existing grant title",
      status: "submitted",
      awarded: false,
      collaborators: ["Existing Institution"],
      coInvestigators: ["Dr. Existing Person"],
    })
    .returning({ id: grants.id });

  t.after(async () => {
    await db.delete(grants).where(eq(grants.id, created.id));
  });

  const fileBase64 = await workbookBase64([
    {
      name: "Grants",
      headers: [
        "Project Number",
        "Title",
        "Grant Source",
        "Source Record Key",
        "Submitting Institution",
        "Co-Investigators",
        "Duration (Months)",
        "Currency",
        "Collaborators",
      ],
      rows: [[
        projectNumber,
        "",
        "IRF Project",
        `IRF:${projectNumber}`,
        "Sidra Medicine",
        "Dr. Existing Person; Dr. New Person",
        "30",
        "QAR",
        "existing institution; New Institution",
      ]],
    },
  ]);

  const preview = await previewSection(
    "research-services",
    fileBase64,
    "enrich-grant.xlsx",
  );
  assert.equal(preview.canApply, true);
  assert.equal(preview.rows[0].action, "update");

  await applySection(
    "research-services",
    fileBase64,
    "enrich-grant.xlsx",
    preview.fingerprint,
  );

  const [updated] = await db.select().from(grants).where(eq(grants.id, created.id));
  assert.equal(updated.title, "Existing grant title");
  assert.equal(updated.sourceCategory, "IRF Project");
  assert.equal(updated.sourceRecordKey, `IRF:${projectNumber}`);
  assert.equal(updated.submittingInstitution, "Sidra Medicine");
  assert.equal(updated.durationMonths, 30);
  assert.equal(updated.currency, "QAR");
  assert.deepEqual(updated.coInvestigators, [
    "Dr. Existing Person",
    "Dr. New Person",
  ]);
  assert.deepEqual(updated.collaborators, [
    "Existing Institution",
    "New Institution",
  ]);

  const repeatedPreview = await previewSection(
    "research-services",
    fileBase64,
    "enrich-grant.xlsx",
  );
  assert.equal(repeatedPreview.rows[0].action, "skip");
  assert.equal(repeatedPreview.rows[0].reason, "No changes");
});

integrationTest("CLEAR on a required IRB principal investigator is rejected during preview", async (t) => {
  const suffix = uniqueKey("IRB-CLEAR").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const email = `${suffix}@example.invalid`;
  const irbNumber = uniqueKey("IRB");
  const [scientist] = await db
    .insert(scientists)
    .values({
      email,
      honorificTitle: "Dr",
      firstName: "IRB",
      lastName: "Investigator",
      staffType: "scientific",
    })
    .returning({ id: scientists.id });
  const [irb] = await db
    .insert(irbApplications)
    .values({
      irbNumber,
      title: "Existing IRB",
      principalInvestigatorId: scientist.id,
      status: "Active",
      workflowStatus: "draft",
    })
    .returning({ id: irbApplications.id });

  t.after(async () => {
    await db.delete(irbApplications).where(eq(irbApplications.id, irb.id));
    await db.delete(scientists).where(eq(scientists.id, scientist.id));
  });

  const fileBase64 = await workbookBase64([
    {
      name: "IRB Applications",
      headers: ["IRB Number", "PI Email"],
      rows: [[irbNumber, "CLEAR"]],
    },
  ]);
  const preview = await previewSection(
    "research-compliance",
    fileBase64,
    "invalid-irb-clear.xlsx",
  );
  assert.equal(preview.canApply, false);
  assert.equal(preview.rows[0].action, "error");
  assert.match(preview.rows[0].reason ?? "", /PI Email cannot be cleared/);
});

integrationTest("Facilities applies buildings before rooms, matches keys case-insensitively, and is idempotent", async (t) => {
  const buildingName = uniqueKey("BUILDING");
  const importedBuildingName = buildingName.toLowerCase();
  const roomNumber = uniqueKey("ROOM");
  const supervisorEmail = `${uniqueKey("ROOM-SUPERVISOR").toLowerCase()}@example.invalid`;
  t.after(async () => {
    const matchingBuildings = await db.select().from(buildings);
    const ids = matchingBuildings.filter((b) => b.name.toLowerCase() === importedBuildingName).map((b) => b.id);
    if (ids.length) {
      await db.delete(rooms).where(inArray(rooms.buildingId, ids));
      await db.delete(buildings).where(inArray(buildings.id, ids));
    }
    await db.delete(scientists).where(eq(scientists.email, supervisorEmail));
  });
  const fileBase64 = await workbookBase64([
    {
      name: "Rooms",
      headers: ["Building Name", "Room Number", "Floor", "Certifications", "Room Supervisor Email"],
      rows: [[importedBuildingName, roomNumber.toLowerCase(), "2", "BSL; Chemical", supervisorEmail.toUpperCase()]],
    },
    {
      name: "Buildings",
      headers: ["Building Name", "Address", "Total Floors"],
      rows: [[buildingName, "Integration Address", "4"]],
    },
    {
      name: "Scientists",
      headers: ["Email", "Honorific Title", "First Name", "Last Name", "Job Title"],
      rows: [[supervisorEmail, "Dr", "Room", "Supervisor", "Investigator"]],
    },
  ]);
  const preview = await previewSection("research-management", fileBase64, "facilities.xlsx");
  assert.equal(preview.canApply, true);
  await applySection("research-management", fileBase64, "facilities.xlsx", preview.fingerprint);
  const allBuildings = await db.select().from(buildings);
  const building = allBuildings.find((b) => b.name.toLowerCase() === importedBuildingName)!;
  const [room] = await db.select().from(rooms).where(eq(rooms.buildingId, building.id));
  assert.equal(room.roomNumber.toLowerCase(), roomNumber.toLowerCase());
  const [supervisor] = await db.select().from(scientists).where(eq(scientists.email, supervisorEmail));
  assert.equal(room.roomSupervisorId, supervisor.id);
  assert.deepEqual(room.certifications, ["BSL", "Chemical"]);
  const second = await previewSection("research-management", fileBase64, "facilities.xlsx");
  assert.equal(second.rows.every((row) => row.action === "skip"), true);
});

integrationTest("Facilities rejects duplicate composite room keys without writing the building", async (t) => {
  const buildingName = uniqueKey("INVALID-BUILDING");
  t.after(async () => {
    await db.delete(buildings).where(eq(buildings.name, buildingName));
  });
  const fileBase64 = await workbookBase64([
    { name: "Buildings", headers: ["Building Name"], rows: [[buildingName]] },
    {
      name: "Rooms",
      headers: ["Building Name", "Room Number"],
      rows: [[buildingName, "101"], [buildingName.toLowerCase(), "101"]],
    },
  ]);
  const preview = await previewSection("research-management", fileBase64, "invalid-facilities.xlsx");
  assert.equal(preview.canApply, false);
  await assert.rejects(applySection("research-management", fileBase64, "invalid-facilities.xlsx", preview.fingerprint), /row error/);
  assert.equal((await db.select().from(buildings).where(eq(buildings.name, buildingName))).length, 0);
});

integrationTest("Facilities rejects ineligible room supervisors and managers without any facility write", async (t) => {
  const suffix = uniqueKey("ROOM-ROLES").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const supervisorEmail = `invalid-supervisor-${suffix}@example.invalid`;
  const managerEmail = `invalid-manager-${suffix}@example.invalid`;
  const buildingNames = [uniqueKey("BAD-SUPERVISOR"), uniqueKey("BAD-MANAGER")];
  t.after(async () => {
    const facilityRows = await db.select().from(buildings);
    const ids = facilityRows.filter((b) => buildingNames.includes(b.name)).map((b) => b.id);
    if (ids.length) {
      await db.delete(rooms).where(inArray(rooms.buildingId, ids));
      await db.delete(buildings).where(inArray(buildings.id, ids));
    }
    await db.delete(scientists).where(inArray(scientists.email, [supervisorEmail, managerEmail]));
  });

  for (const [buildingName, roleHeader, email, jobTitle, expected] of [
    [buildingNames[0], "Room Supervisor Email", supervisorEmail, "Research Coordinator", /eligible Investigator designation/],
    [buildingNames[1], "Room Manager Email", managerEmail, "Investigator", /Management, Staff, Post-doctoral, or Research job title/],
  ] as const) {
    const file = await workbookBase64([
      {
        name: "Scientists",
        headers: ["Email", "Honorific Title", "First Name", "Last Name", "Job Title"],
        rows: [[email, "Dr", "Invalid", "Room Role", jobTitle]],
      },
      { name: "Buildings", headers: ["Building Name"], rows: [[buildingName]] },
      {
        name: "Rooms",
        headers: ["Building Name", "Room Number", roleHeader],
        rows: [[buildingName, "101", email]],
      },
    ]);
    const preview = await previewSection("research-management", file, "invalid-room-role.xlsx");
    assert.equal(preview.canApply, false);
    assert.match(preview.rows.find((row) => row.sheetName === "Rooms")?.reason ?? "", expected);
    await assert.rejects(
      applySection("research-management", file, "invalid-room-role.xlsx", preview.fingerprint),
      /row error/,
    );
    assert.equal((await db.select().from(buildings).where(eq(buildings.name, buildingName))).length, 0);
    assert.equal((await db.select().from(scientists).where(eq(scientists.email, email))).length, 0);
  }
});

integrationTest("Certification Matrix resolves same-workbook modules and supports nullable CLEAR", async (t) => {
  const suffix = uniqueKey("CERT").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const email = `${suffix}@example.invalid`;
  const actorEmail = `actor-${suffix}@example.invalid`;
  const moduleName = uniqueKey("MODULE");
  const startDate = "2025-01-01";
  const [actor] = await db.insert(scientists).values({
    email: actorEmail, honorificTitle: "Dr", firstName: "Applying", lastName: "Administrator", staffType: "administrative",
  }).returning({ id: scientists.id });
  t.after(async () => {
    const subjects = await db.select().from(scientists).where(eq(scientists.email, email));
    if (subjects.length) await db.delete(certifications).where(eq(certifications.scientistId, subjects[0].id));
    const modules = await db.select().from(certificationModules);
    const ids = modules.filter((m) => m.name.toLowerCase() === moduleName.toLowerCase()).map((m) => m.id);
    if (ids.length) await db.delete(certificationModules).where(inArray(certificationModules.id, ids));
    await db.delete(scientists).where(inArray(scientists.id, [...subjects.map((row) => row.id), actor.id]));
  });
  const createFile = await workbookBase64([
    {
      name: "Scientists",
      headers: ["Email", "Honorific Title", "First Name", "Last Name"],
      rows: [[email, "Dr", "Matrix", "Scientist"]],
    },
    {
      name: "Certifications",
      headers: ["Scientist Email", "Module Name", "Start Date", "End Date", "Notes"],
      rows: [[email.toUpperCase(), moduleName.toLowerCase(), startDate, "2026-01-01", "Clear me"]],
    },
    {
      name: "Certification Modules",
      headers: ["Module Name", "Is Core", "Expiration Months", "Is Active"],
      rows: [[moduleName, "Yes", "12", "Yes"]],
    },
  ]);
  const preview = await previewSection("research-management", createFile, "matrix.xlsx");
  assert.equal(preview.canApply, true);
  await assert.rejects(
    applySection("research-management", createFile, "matrix.xlsx", preview.fingerprint),
    /auditable applying user linked to a scientist/,
  );
  await applySection(
    "research-management",
    createFile,
    "matrix.xlsx",
    preview.fingerprint,
    { scientistId: actor.id, email: actorEmail },
  );
  const [scientist] = await db.select().from(scientists).where(eq(scientists.email, email));
  const [created] = await db.select().from(certifications).where(eq(certifications.scientistId, scientist.id));
  assert.equal(created.notes, "Clear me");
  assert.equal(created.uploadedBy, actor.id);
  assert.notEqual(created.uploadedBy, scientist.id);
  assert.equal((await previewSection("research-management", createFile, "matrix.xlsx")).rows.every((r) => r.action === "skip"), true);

  const clearFile = await workbookBase64([{
    name: "Certifications",
    headers: ["Scientist Email", "Module Name", "Start Date", "End Date", "Notes"],
    rows: [[email, moduleName.toUpperCase(), startDate, "", "CLEAR"]],
  }]);
  const clearPreview = await previewSection("research-management", clearFile, "matrix-clear.xlsx");
  assert.equal(clearPreview.canApply, true);
  await applySection("research-management", clearFile, "matrix-clear.xlsx", clearPreview.fingerprint);
  const [updated] = await db.select().from(certifications).where(eq(certifications.id, created.id));
  assert.equal(updated.endDate, "2026-01-01");
  assert.equal(updated.notes, null);
});

integrationTest("Research Output combined publication and JIF workbook is idempotent and updates without duplicates", async (t) => {
  const suffix = uniqueKey("OUTPUT").toLowerCase();
  const actorEmail = `${suffix}@example.invalid`;
  const doi = `10.9999/${suffix}`;
  const importedDoi = `HTTPS://DX.DOI.ORG/${doi.toUpperCase()}`;
  const journalName = `Journal ${suffix}`;
  const [actor] = await db.insert(scientists).values({
    email: actorEmail, honorificTitle: "Dr", firstName: "Output", lastName: "Actor", staffType: "administrative",
  }).returning({ id: scientists.id });
  const [actorUser] = await db.insert(users).values({
    username: suffix,
    password: "",
    name: "Output Actor",
    email: actorEmail,
    role: "admin",
    scientistId: actor.id,
  }).returning({ id: users.id });
  t.after(async () => {
    const pubs = await db.select().from(publications).where(eq(publications.doi, doi));
    if (pubs.length) {
      await db.delete(manuscriptHistory).where(inArray(manuscriptHistory.publicationId, pubs.map((row) => row.id)));
      await db.delete(publicationAuthors).where(inArray(publicationAuthors.publicationId, pubs.map((row) => row.id)));
      await db.delete(publications).where(inArray(publications.id, pubs.map((row) => row.id)));
    }
    const journalRows = await db.select().from(journals);
    const journalIds = journalRows.filter((row) => row.journalName.toLowerCase() === journalName.toLowerCase()).map((row) => row.id);
    if (journalIds.length) {
      await db.delete(journalImpactFactorMetrics).where(inArray(journalImpactFactorMetrics.journalId, journalIds));
      await db.delete(journals).where(inArray(journals.id, journalIds));
    }
    await db.delete(users).where(eq(users.id, actorUser.id));
    await db.delete(scientists).where(eq(scientists.id, actor.id));
  });
  const createFile = await workbookBase64([
    {
      name: "Publications",
      headers: ["Title", "DOI", "Journal", "Publication Date", "Abstract"],
      rows: [["Combined Publication", importedDoi, journalName, "2025-02-03", "Initial abstract"]],
    },
    {
      name: "Journal Impact Factors",
      headers: ["Journal Name", "Year", "Impact Factor", "Quartile", "Total Cites"],
      rows: [[journalName, "2025", "4.125", "Q2", "123"]],
    },
  ]);
  const preview = await previewSection("research-output", createFile, "combined-output.xlsx");
  assert.equal(preview.canApply, true);
  assert.equal(preview.rows.filter((row) => row.action === "create").length, 2);
  const applied = await applySection("research-output", createFile, "combined-output.xlsx", preview.fingerprint, {
    userId: actorUser.id, scientistId: actor.id, email: actorEmail,
  });
  assert.deepEqual(applied.counts.Publications, { created: 1, updated: 0, skipped: 0 });
  assert.deepEqual(applied.counts["Journal Impact Factors"], { created: 1, updated: 0, skipped: 0 });
  const [createdPublication] = await db.select().from(publications).where(eq(publications.doi, doi));
  assert.ok(createdPublication);
  assert.equal(createdPublication.doi, doi, "DOI URLs must be persisted in canonical lowercase form");
  assert.equal(createdPublication.createdByUserId, actorUser.id);
  const second = await previewSection("research-output", createFile, "combined-output.xlsx");
  assert.equal(second.rows.every((row) => row.action === "skip"), true);

  const updateFile = await workbookBase64([
    {
      name: "Publications",
      headers: ["Title", "DOI", "Abstract", "Volume"],
      rows: [["Combined Publication", `DOI: ${doi.toUpperCase()}`, "Updated abstract", "17"]],
    },
    {
      name: "Journal Impact Factors",
      headers: ["Journal Name", "Year", "Impact Factor", "Publisher"],
      rows: [[journalName.toUpperCase(), "2025", "5.250", "Updated Publisher"]],
    },
  ]);
  const updatePreview = await previewSection("research-output", updateFile, "combined-output-update.xlsx");
  assert.equal(updatePreview.rows.every((row) => row.action === "update"), true);
  await applySection("research-output", updateFile, "combined-output-update.xlsx", updatePreview.fingerprint);
  const pubRows = await db.select().from(publications).where(eq(publications.doi, doi));
  assert.equal(pubRows.length, 1);
  assert.equal(pubRows[0].abstract, "Updated abstract");
  assert.equal(pubRows[0].volume, "17");
  assert.equal(pubRows[0].doi, doi);
  assert.equal(pubRows[0].status, "Concept");
  assert.equal(pubRows[0].vettedForSubmissionByIpOffice, false);
  const allJournals = await db.select().from(journals);
  const matchingJournals = allJournals.filter((row) => row.journalName.toLowerCase() === journalName.toLowerCase());
  assert.equal(matchingJournals.length, 1);
  assert.equal(matchingJournals[0].publisher, "Updated Publisher");
  const metrics = await db.select().from(journalImpactFactorMetrics).where(eq(journalImpactFactorMetrics.journalId, matchingJournals[0].id));
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].impactFactor, "5.250");
  const postUpdatePreview = await previewSection("research-output", updateFile, "combined-output-update.xlsx");
  assert.equal(postUpdatePreview.rows.every((row) => row.action === "skip"), true);
});

integrationTest("Publications match explicit ID, normalized DOI, and PMID while unknown ID blocks all writes", async (t) => {
  const suffix = uniqueKey("PUB-MATCH").toLowerCase();
  const [byId, byDoi, byPmid] = await db.insert(publications).values([
    { title: "Match by ID", doi: `10.8000/${suffix}-id`, pmid: `ID-CONSISTENT-${suffix}`, status: "Concept" },
    { title: "Match by DOI", doi: `10.8000/${suffix}-doi`, pmid: `CONSISTENT-${suffix}`, status: "Concept" },
    { title: "Match by PMID", pmid: `PMID-${suffix}`, status: "Concept" },
  ]).returning();
  t.after(async () => {
    await db.delete(manuscriptHistory).where(inArray(manuscriptHistory.publicationId, [byId.id, byDoi.id, byPmid.id]));
    await db.delete(publicationAuthors).where(inArray(publicationAuthors.publicationId, [byId.id, byDoi.id, byPmid.id]));
    await db.delete(publications).where(inArray(publications.id, [byId.id, byDoi.id, byPmid.id]));
  });
  const file = await workbookBase64([{
    name: "Publications",
    headers: ["Publication ID", "Title", "DOI", "PMID", "Abstract"],
    rows: [
      [byId.id, "", `HTTPS://DOI.ORG/${byId.doi!.toUpperCase()}`, byId.pmid!.toLowerCase(), "ID update"],
      ["", "Match by DOI", `HTTPS://DOI.ORG/10.8000/${suffix}-doi`, `consistent-${suffix}`, "DOI and PMID update"],
      ["", "Match by PMID", "", `pmid-${suffix}`, "PMID update"],
    ],
  }]);
  const preview = await previewSection("research-output", file, "publication-matches.xlsx");
  assert.equal(preview.canApply, true);
  assert.equal(preview.rows.every((row) => row.action === "update"), true);
  await applySection("research-output", file, "publication-matches.xlsx", preview.fingerprint);
  assert.equal((await db.select().from(publications).where(eq(publications.id, byId.id)))[0].abstract, "ID update");
  assert.equal((await db.select().from(publications).where(eq(publications.id, byDoi.id)))[0].abstract, "DOI and PMID update");
  assert.equal((await db.select().from(publications).where(eq(publications.id, byPmid.id)))[0].abstract, "PMID update");

  const newlyAssignedDoi = `10.8000/${suffix}-newly-assigned`;
  const assignNewKey = await workbookBase64([{
    name: "Publications",
    headers: ["Publication ID", "DOI", "Abstract"],
    rows: [[byId.id, `DOI: ${newlyAssignedDoi.toUpperCase()}`, "Unclaimed DOI update"]],
  }]);
  const assignPreview = await previewSection("research-output", assignNewKey, "publication-new-key.xlsx");
  assert.equal(assignPreview.canApply, true);
  assert.equal(assignPreview.rows[0].action, "update");
  await applySection("research-output", assignNewKey, "publication-new-key.xlsx", assignPreview.fingerprint);
  const [withNewKey] = await db.select().from(publications).where(eq(publications.id, byId.id));
  assert.equal(withNewKey.doi, newlyAssignedDoi);
  assert.equal(withNewKey.abstract, "Unclaimed DOI update");

  const explicitIdConflict = await workbookBase64([{
    name: "Publications",
    headers: ["Publication ID", "DOI", "PMID", "Abstract"],
    rows: [
      [byId.id, byDoi.doi, byPmid.pmid, "Conflicting explicit-ID update"],
      [byDoi.id, "", "", "Other workbook row must remain unchanged"],
    ],
  }]);
  const explicitConflictPreview = await previewSection("research-output", explicitIdConflict, "publication-id-key-conflict.xlsx");
  assert.equal(explicitConflictPreview.canApply, false);
  assert.equal(explicitConflictPreview.rows[0].action, "error");
  assert.match(explicitConflictPreview.rows[0].reason ?? "", /keys conflict with Publication ID/);
  assert.equal(explicitConflictPreview.rows[1].action, "update");
  await assert.rejects(
    applySection("research-output", explicitIdConflict, "publication-id-key-conflict.xlsx", explicitConflictPreview.fingerprint),
    /row error/,
  );
  assert.equal((await db.select().from(publications).where(eq(publications.id, byId.id)))[0].abstract, "Unclaimed DOI update");
  assert.equal((await db.select().from(publications).where(eq(publications.id, byDoi.id)))[0].abstract, "DOI and PMID update");
  assert.equal((await db.select().from(publications).where(eq(publications.id, byPmid.id)))[0].abstract, "PMID update");

  const conflictingKeys = await workbookBase64([{
    name: "Publications",
    headers: ["Publication ID", "Title", "DOI", "PMID", "Abstract"],
    rows: [
      ["", "Conflicting Natural Keys", byDoi.doi, byPmid.pmid, "Must not update either match"],
      [byId.id, "", "", "", "Other workbook row must also remain unchanged"],
    ],
  }]);
  const conflictPreview = await previewSection("research-output", conflictingKeys, "publication-key-conflict.xlsx");
  assert.equal(conflictPreview.canApply, false);
  assert.equal(conflictPreview.rows[0].action, "error");
  assert.match(conflictPreview.rows[0].reason ?? "", /keys resolve to different existing publications/);
  assert.equal(conflictPreview.rows[1].action, "update");
  await assert.rejects(
    applySection("research-output", conflictingKeys, "publication-key-conflict.xlsx", conflictPreview.fingerprint),
    /row error/,
  );
  assert.equal((await db.select().from(publications).where(eq(publications.id, byDoi.id)))[0].abstract, "DOI and PMID update");
  assert.equal((await db.select().from(publications).where(eq(publications.id, byPmid.id)))[0].abstract, "PMID update");
  assert.equal((await db.select().from(publications).where(eq(publications.id, byId.id)))[0].abstract, "Unclaimed DOI update");

  const noWriteDoi = `10.8000/${suffix}-must-not-write`;
  const invalid = await workbookBase64([{
    name: "Publications",
    headers: ["Publication ID", "Title", "DOI"],
    rows: [[2_000_000_000, "Unknown ID", noWriteDoi]],
  }]);
  const invalidPreview = await previewSection("research-output", invalid, "unknown-publication-id.xlsx");
  assert.equal(invalidPreview.canApply, false);
  assert.match(invalidPreview.rows[0].reason ?? "", /Publication ID .* was not found/);
  await assert.rejects(
    applySection("research-output", invalid, "unknown-publication-id.xlsx", invalidPreview.fingerprint),
    /row error/,
  );
  assert.equal((await db.select().from(publications).where(eq(publications.doi, noWriteDoi))).length, 0);
});

integrationTest("Publication scalar updates link and CLEAR SDR without changing authorship, history, or workflow state", async (t) => {
  const suffix = uniqueKey("PUB-SDR").toLowerCase();
  const sdrNumber = uniqueKey("PUB-SDR-LINK");
  const authorEmail = `${suffix}@example.invalid`;
  const [author] = await db.insert(scientists).values({
    email: authorEmail, honorificTitle: "Dr", firstName: "Linked", lastName: "Author", staffType: "scientific",
  }).returning();
  const [activity] = await db.insert(researchActivities).values({
    sdrNumber, title: "Publication SDR", status: "active",
  }).returning();
  const [publication] = await db.insert(publications).values({
    title: "Preserved Publication",
    doi: `10.7000/${suffix}`,
    status: "Complete Draft",
    vettedForSubmissionByIpOffice: true,
    alternateDois: [`10.7000/${suffix}-alternate`],
    abstract: "Before",
  }).returning();
  const [authorLink] = await db.insert(publicationAuthors).values({
    publicationId: publication.id,
    scientistId: author.id,
    authorshipType: "First Author",
    authorPosition: 1,
    linkMethod: "manual",
  }).returning();
  const [history] = await db.insert(manuscriptHistory).values({
    publicationId: publication.id,
    fromStatus: "Concept",
    toStatus: "Complete Draft",
    changedBy: author.id,
    changeReason: "Fixture history",
  }).returning();
  t.after(async () => {
    await db.delete(publicationAuthors).where(eq(publicationAuthors.id, authorLink.id));
    await db.delete(manuscriptHistory).where(eq(manuscriptHistory.publicationId, publication.id));
    await db.delete(publications).where(eq(publications.id, publication.id));
    await db.delete(researchActivities).where(eq(researchActivities.id, activity.id));
    await db.delete(scientists).where(eq(scientists.id, author.id));
  });
  const linkFile = await workbookBase64([{
    name: "Publications",
    headers: ["Publication ID", "SDR Number", "Abstract"],
    rows: [[publication.id, sdrNumber.toLowerCase(), "After"]],
  }]);
  const linkPreview = await previewSection("research-output", linkFile, "publication-sdr.xlsx");
  assert.equal(linkPreview.rows[0].action, "update");
  await applySection("research-output", linkFile, "publication-sdr.xlsx", linkPreview.fingerprint);
  let [updated] = await db.select().from(publications).where(eq(publications.id, publication.id));
  assert.equal(updated.researchActivityId, activity.id);
  assert.equal(updated.abstract, "After");
  assert.equal(updated.status, "Complete Draft");
  assert.equal(updated.vettedForSubmissionByIpOffice, true);
  assert.deepEqual(updated.alternateDois, [`10.7000/${suffix}-alternate`]);
  assert.equal((await db.select().from(publicationAuthors).where(eq(publicationAuthors.publicationId, publication.id))).length, 1);
  const historiesAfterLink = await db.select().from(manuscriptHistory).where(eq(manuscriptHistory.publicationId, publication.id));
  assert.equal(historiesAfterLink.length, 1);
  assert.equal(historiesAfterLink[0].id, history.id);

  const clearFile = await workbookBase64([{
    name: "Publications",
    headers: ["Publication ID", "SDR Number", "Abstract"],
    rows: [[publication.id, "CLEAR", ""]],
  }]);
  const clearPreview = await previewSection("research-output", clearFile, "publication-sdr-clear.xlsx");
  assert.equal(clearPreview.rows[0].action, "update");
  await applySection("research-output", clearFile, "publication-sdr-clear.xlsx", clearPreview.fingerprint);
  [updated] = await db.select().from(publications).where(eq(publications.id, publication.id));
  assert.equal(updated.researchActivityId, null);
  assert.equal(updated.abstract, "After");
  assert.equal(updated.status, "Complete Draft");
  assert.equal((await db.select().from(publicationAuthors).where(eq(publicationAuthors.publicationId, publication.id))).length, 1);
  assert.equal((await db.select().from(manuscriptHistory).where(eq(manuscriptHistory.publicationId, publication.id))).length, 1);
});

integrationTest("sealed Published star publications skip while another valid publication update applies", async (t) => {
  const suffix = uniqueKey("PUB-SEALED").toLowerCase();
  const [sealed, editable] = await db.insert(publications).values([
    { title: "Sealed Publication", doi: `10.6000/${suffix}-sealed`, abstract: "Sealed original", status: "Published *" },
    { title: "Editable Publication", doi: `10.6000/${suffix}-editable`, abstract: "Editable original", status: "Concept" },
  ]).returning();
  t.after(async () => {
    await db.delete(manuscriptHistory).where(inArray(manuscriptHistory.publicationId, [sealed.id, editable.id]));
    await db.delete(publicationAuthors).where(inArray(publicationAuthors.publicationId, [sealed.id, editable.id]));
    await db.delete(publications).where(inArray(publications.id, [sealed.id, editable.id]));
  });
  const file = await workbookBase64([{
    name: "Publications",
    headers: ["Publication ID", "Abstract"],
    rows: [[sealed.id, "Must not apply"], [editable.id, "Valid update"]],
  }]);
  const preview = await previewSection("research-output", file, "sealed-publication.xlsx");
  assert.equal(preview.canApply, true);
  assert.equal(preview.rows[0].action, "skip");
  assert.match(preview.rows[0].reason ?? "", /sealed \(Published \*\)/);
  assert.equal(preview.rows[1].action, "update");
  const result = await applySection("research-output", file, "sealed-publication.xlsx", preview.fingerprint);
  assert.deepEqual(result.counts.Publications, { created: 0, updated: 1, skipped: 1 });
  assert.equal((await db.select().from(publications).where(eq(publications.id, sealed.id)))[0].abstract, "Sealed original");
  assert.equal((await db.select().from(publications).where(eq(publications.id, editable.id)))[0].abstract, "Valid update");
});

integrationTest("JIF mixed-case journals keep distinct years, support metric CLEAR, and reject invalid rows atomically", async (t) => {
  const suffix = uniqueKey("JIF").toLowerCase();
  const journalName = `Mixed Case Journal ${suffix}`;
  const invalidJournalName = `Must Not Write Journal ${suffix}`;
  const [journal] = await db.insert(journals).values({
    journalName,
    publisher: "Original Publisher",
  }).returning();
  const [metric2024] = await db.insert(journalImpactFactorMetrics).values({
    journalId: journal.id,
    year: 2024,
    impactFactor: "3.500",
    fiveYearJif: "4.250",
    totalCites: 99,
  }).returning();
  t.after(async () => {
    const allJournals = await db.select().from(journals);
    const ids = allJournals
      .filter((row) => [journalName.toLowerCase(), invalidJournalName.toLowerCase()].includes(row.journalName.toLowerCase()))
      .map((row) => row.id);
    if (ids.length) {
      await db.delete(journalImpactFactorMetrics).where(inArray(journalImpactFactorMetrics.journalId, ids));
      await db.delete(journals).where(inArray(journals.id, ids));
    }
  });
  const file = await workbookBase64([{
    name: "Journal Impact Factors",
    headers: ["Journal Name", "Year", "Impact Factor", "Five Year JIF", "Total Cites", "Quartile"],
    rows: [
      [journalName.toUpperCase(), "2024", "CLEAR", "", "CLEAR", "Q1"],
      [journalName.toLowerCase(), "2025", "6.125", "7.250", "150", "Q2"],
    ],
  }]);
  const preview = await previewSection("research-output", file, "jif-years-clear.xlsx");
  assert.equal(preview.canApply, true);
  assert.deepEqual(preview.rows.map((row) => row.action), ["update", "create"]);
  await applySection("research-output", file, "jif-years-clear.xlsx", preview.fingerprint);
  const matchingJournals = (await db.select().from(journals))
    .filter((row) => row.journalName.toLowerCase() === journalName.toLowerCase());
  assert.equal(matchingJournals.length, 1);
  const metrics = await db.select().from(journalImpactFactorMetrics)
    .where(eq(journalImpactFactorMetrics.journalId, journal.id));
  assert.equal(metrics.length, 2);
  const updated2024 = metrics.find((row) => row.year === 2024)!;
  const created2025 = metrics.find((row) => row.year === 2025)!;
  assert.equal(updated2024.id, metric2024.id);
  assert.equal(updated2024.impactFactor, null);
  assert.equal(updated2024.totalCites, null);
  assert.equal(updated2024.fiveYearJif, "4.250");
  assert.equal(updated2024.quartile, "Q1");
  assert.equal(created2025.impactFactor, "6.125");
  assert.equal(created2025.totalCites, 150);

  const invalidFile = await workbookBase64([{
    name: "Journal Impact Factors",
    headers: ["Journal Name", "Year", "Impact Factor"],
    rows: [
      [invalidJournalName, "2026", "2.500"],
      [journalName, "2025.5", "not-a-number"],
    ],
  }]);
  const invalidPreview = await previewSection("research-output", invalidFile, "jif-invalid-atomic.xlsx");
  assert.equal(invalidPreview.canApply, false);
  assert.equal(invalidPreview.rows[0].action, "create");
  assert.equal(invalidPreview.rows[1].action, "error");
  assert.match(invalidPreview.rows[1].reason ?? "", /Year: must be a whole number/);
  assert.match(invalidPreview.rows[1].reason ?? "", /Impact Factor: must be a non-negative decimal/);
  await assert.rejects(
    applySection("research-output", invalidFile, "jif-invalid-atomic.xlsx", invalidPreview.fingerprint),
    /row error/,
  );
  assert.equal(
    (await db.select().from(journals)).filter((row) => row.journalName.toLowerCase() === invalidJournalName.toLowerCase()).length,
    0,
  );
  assert.equal(
    (await db.select().from(journalImpactFactorMetrics).where(eq(journalImpactFactorMetrics.journalId, journal.id))).length,
    2,
  );
});

// ---- Access control -------------------------------------------------------

integrationTest("access configuration round-trips through a wipe", async (t) => {
  const roleName = uniqueKey("ROLE");
  const username = uniqueKey("USER").toLowerCase();
  const secondRole = uniqueKey("ROLE2");

  t.after(async () => {
    await db.delete(users).where(eq(users.username, username));
    await db.delete(roleGroups).where(inArray(roleGroups.name, [roleName, secondRole]));
  });

  const fileBase64 = await workbookBase64([
    {
      name: "Access Roles",
      headers: ["Role Name", "Description"],
      rows: [[roleName, "Round-trip role"], [secondRole, "Second role"]],
    },
    {
      name: "Role Permissions",
      headers: ["Role Name", "Navigation Item", "Access Level"],
      rows: [
        [roleName, "publications", "edit"],
        [roleName, "grants", "view"],
        [secondRole, "publications", "hide"],
      ],
    },
    {
      name: "User Accounts",
      headers: ["Username", "Full Name", "Email", "Primary Access Role", "Auth Provider"],
      rows: [[username, "Round Trip", `${username}@example.invalid`, roleName, "oidc"]],
    },
    {
      name: "User Roles",
      headers: ["Username", "Role Name"],
      rows: [[username, secondRole]],
    },
  ]);

  const preview = await previewSection("access-control", fileBase64, "access.xlsx");
  assert.equal(preview.canApply, true, preview.rows.find((r) => r.action === "error")?.reason);

  const applied = await applySection(
    "access-control", fileBase64, "access.xlsx", preview.fingerprint,
  );
  assert.deepEqual(applied.counts["Access Roles"], { created: 2, updated: 0, skipped: 0 });
  assert.deepEqual(applied.counts["Role Permissions"], { created: 3, updated: 0, skipped: 0 });
  assert.deepEqual(applied.counts["User Accounts"], { created: 1, updated: 0, skipped: 0 });
  assert.deepEqual(applied.counts["User Roles"], { created: 1, updated: 0, skipped: 0 });

  const [created] = await db.select().from(users).where(eq(users.username, username));
  assert.equal(created.role, roleName);
  assert.equal(created.authProvider, "oidc");
  // The archive carries no credential, so an imported account gets the same
  // empty password SSO provisioning writes — one no hash can ever match.
  assert.equal(created.password, "");

  const [role] = await db.select().from(roleGroups).where(eq(roleGroups.name, roleName));
  const permissions = await db
    .select()
    .from(rolePermissions)
    .where(eq(rolePermissions.roleGroupId, role.id));
  assert.equal(permissions.length, 2);
  assert.equal(
    permissions.find((p) => p.navigationItem === "publications")?.accessLevel,
    "edit",
  );

  const assignments = await db
    .select()
    .from(userRoleAssignments)
    .where(eq(userRoleAssignments.userId, created.id));
  assert.equal(assignments.length, 1, "the secondary role was restored");

  // Replaying the same archive must change nothing. Restores get re-run.
  const second = await previewSection("access-control", fileBase64, "access.xlsx");
  const ownRows = second.rows.filter((row) =>
    row.key === roleName || row.key === secondRole || row.key === username
    || row.key.startsWith(`${roleName} + `) || row.key.startsWith(`${secondRole} + `)
    || row.key.startsWith(`${username} + `));
  assert.equal(ownRows.length > 0, true);
  assert.equal(
    ownRows.every((row) => row.action === "skip"),
    true,
    "a replayed archive reports no changes",
  );
});

integrationTest("an import cannot grant superadmin", async (t) => {
  const username = uniqueKey("ESCALATE").toLowerCase();
  t.after(async () => {
    await db.delete(users).where(eq(users.username, username));
  });

  // superadmin is derived from SUPER_ADMIN_EMAIL at login. An account that does
  // not already hold it must not acquire it from a spreadsheet cell, or the
  // importer becomes an escalation path from admin to superadmin.
  const fileBase64 = await workbookBase64([
    {
      name: "User Accounts",
      headers: ["Username", "Full Name", "Email", "Primary Access Role"],
      rows: [[username, "Would Be Root", `${username}@example.invalid`, "superadmin"]],
    },
  ]);

  const preview = await previewSection("access-control", fileBase64, "access.xlsx");
  assert.equal(preview.canApply, true, "the row restores rather than failing the archive");

  await applySection("access-control", fileBase64, "access.xlsx", preview.fingerprint);
  const [created] = await db.select().from(users).where(eq(users.username, username));
  assert.equal(
    created.role,
    "user",
    "an account that did not already hold superadmin falls back to the restricted role",
  );
});

integrationTest("an import cannot grant superadmin as a secondary role", async (t) => {
  const username = uniqueKey("ESCALATE2").toLowerCase();
  t.after(async () => {
    await db.delete(users).where(eq(users.username, username));
    await db.delete(roleGroups).where(eq(roleGroups.name, "superadmin"));
  });

  // isAdministrator() reads every slot a person holds, so a secondary role
  // named superadmin is not inert the way the role group itself is.
  const fileBase64 = await workbookBase64([
    {
      name: "Access Roles",
      headers: ["Role Name", "Description"],
      rows: [["superadmin", "Inert on its own"]],
    },
    {
      name: "User Accounts",
      headers: ["Username", "Full Name", "Email", "Primary Access Role"],
      rows: [[username, "Would Be Root", `${username}@example.invalid`, "admin"]],
    },
    {
      name: "User Roles",
      headers: ["Username", "Role Name"],
      rows: [[username, "superadmin"]],
    },
  ]);

  const preview = await previewSection("access-control", fileBase64, "access.xlsx");
  const link = preview.rows.find((row) => row.sheetName === "User Roles");
  assert.equal(link?.action, "error");
  assert.match(String(link?.reason), /superadmin cannot be granted as a secondary role/);
  assert.equal(preview.canApply, false);
});

integrationTest("an unknown access level is rejected, an unknown area is kept", async (t) => {
  const roleName = uniqueKey("LEVELS");
  t.after(async () => {
    await db.delete(roleGroups).where(eq(roleGroups.name, roleName));
  });

  const fileBase64 = await workbookBase64([
    {
      name: "Access Roles",
      headers: ["Role Name"],
      rows: [[roleName]],
    },
    {
      name: "Role Permissions",
      headers: ["Role Name", "Navigation Item", "Access Level"],
      rows: [
        [roleName, "publications", "sudo"],
        // The database already holds areas NAVIGATION_ITEMS no longer lists. A
        // backup that refuses to restore what is really there is not a backup,
        // and an unrecognised area is inert: nothing reads it.
        [roleName, "retired-area", "view"],
      ],
    },
  ]);

  const preview = await previewSection("access-control", fileBase64, "access.xlsx");
  const bad = preview.rows.find((row) => row.key.includes("publications"));
  const retired = preview.rows.find((row) => row.key.includes("retired-area"));
  assert.equal(bad?.action, "error");
  assert.match(String(bad?.reason), /Access Level/);
  assert.equal(retired?.action, "create", "an unrecognised navigation area still restores");
});
