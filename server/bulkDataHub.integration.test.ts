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

integrationTest("Research Data Management groups contracts and grants atomically and idempotently", async (t) => {
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