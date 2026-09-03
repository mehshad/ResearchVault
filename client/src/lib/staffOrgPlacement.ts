/**
 * Where a staff member sits in the organisation, for display.
 *
 * A staff record can say this three ways, and they disagree in practice:
 *
 *  - `sectionId`, the lab/office/core they belong to;
 *  - `departmentId`, the department;
 *  - `department`, free text kept from before the structured org existed.
 *
 * Of sixty-five staff records, fifty-seven carry a section, sixty a department
 * and only sixteen the free text -- so a profile reading the free text alone
 * named no department for most people, which is exactly what it did.
 *
 * The structured link wins because it is the one the org chart, the section
 * heads and the department heads are all built from. A section implies its
 * department, so a record with a section but no department id still resolves
 * one rather than falling back to text that may be years stale. The free text
 * is last, for the records that have nothing else.
 */

export interface PlacementDepartment {
  id: number;
  name: string;
}

export interface PlacementSection {
  id: number;
  name: string;
  type?: string | null;
  departmentId: number;
}

export interface PlacementStaff {
  departmentId?: number | null;
  sectionId?: number | null;
  /** Legacy free-text department. */
  department?: string | null;
}

export interface OrgPlacement {
  /** Name to show, from whichever source answered. Null when nothing does. */
  departmentName: string | null;
  section: PlacementSection | null;
}

export function resolveOrgPlacement(
  staff: PlacementStaff,
  departments: readonly PlacementDepartment[],
  sections: readonly PlacementSection[],
): OrgPlacement {
  const section = sections.find((entry) => entry.id === staff.sectionId) ?? null;

  const department =
    departments.find((entry) => entry.id === staff.departmentId) ??
    (section ? departments.find((entry) => entry.id === section.departmentId) : undefined) ??
    null;

  // Trimmed, because a record holding only spaces is not a department name and
  // would otherwise render as an empty line under a "Department:" label.
  const legacy = staff.department?.trim();

  return {
    departmentName: department?.name ?? (legacy ? legacy : null),
    section,
  };
}
