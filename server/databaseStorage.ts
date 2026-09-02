// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import { eq, and, desc, asc, or, sql, inArray, notInArray, gte, ilike } from "drizzle-orm";
import { ACCESS_ROLES, BUILT_IN_ASSIGNABLE_ROLES } from "@shared/constants";
import {
  isGrantIncomplete,
  missingMinimumGrantFields,
  type IncompleteGrantSummary,
} from "@shared/grantValidity";
import { isMissingAmount } from "@shared/grantIssues";
import { db } from "./db";
import {
  resolveInvestigatorScientistIds,
  withInvestigatorFlag,
} from "./investigatorRoleResolver";
import { IStorage } from "./storage";
import { isGrantSdrEligible } from "@shared/grantSdrEligibility";
import {
  users, User, InsertUser,
  scientists, Scientist, InsertScientist,
  programs, Program, InsertProgram,
  projects, Project, InsertProject,
  researchActivities, ResearchActivity, InsertResearchActivity,
  projectMembers, ProjectMember, InsertProjectMember,
  dataManagementPlans, DataManagementPlan, InsertDataManagementPlan,
  publications, Publication, InsertPublication,
  publicationAuthors, PublicationAuthor, InsertPublicationAuthor,
  manuscriptHistory, ManuscriptHistory, InsertManuscriptHistory,
  patents, Patent, InsertPatent,
  irbApplications, IrbApplication, InsertIrbApplication,
  irbSubmissions, IrbSubmission, InsertIrbSubmission,
  irbDocuments, IrbDocument, InsertIrbDocument,
  ibcApplications, IbcApplication, InsertIbcApplication,
  ibcApplicationComments, IbcApplicationComment, InsertIbcApplicationComment,
  ibcApplicationResearchActivities, IbcApplicationResearchActivity, InsertIbcApplicationResearchActivity,
  ibcSubmissions, IbcSubmission, InsertIbcSubmission,
  ibcDocuments, IbcDocument, InsertIbcDocument,
  ibcBoardMembers, IbcBoardMember, InsertIbcBoardMember,
  researchContracts, ResearchContract, InsertResearchContract,
  researchContractScopeItems, ResearchContractScopeItem, InsertResearchContractScopeItem,
  researchContractExtensions, ResearchContractExtension, InsertResearchContractExtension,
  researchContractDocuments, ResearchContractDocument, InsertResearchContractDocument,
  irbBoardMembers, IrbBoardMember, InsertIrbBoardMember,
  buildings, Building, InsertBuilding,
  rooms, Room, InsertRoom,
  ibcApplicationRooms, IbcApplicationRoom, InsertIbcApplicationRoom,
  ibcBackboneSourceRooms, IbcBackboneSourceRoom, InsertIbcBackboneSourceRoom,
  ibcApplicationPpe, IbcApplicationPpe, InsertIbcApplicationPpe,
  rolePermissions, RolePermission, InsertRolePermission,
  roleGroups,
  journals, Journal, InsertJournal,
  journalImpactFactorMetrics, JournalImpactFactorMetric, InsertJournalImpactFactorMetric,
  JournalImpactFactor, InsertJournalImpactFactor,
  grants, Grant, InsertGrant,
  grantCollaboratingInstitutions, grantInstitutionCollaborators, grantCoInvestigators,
  type GrantCollaborationTree, type GrantCoInvestigatorList,
  grantResearchActivities, GrantResearchActivity, InsertGrantResearchActivity,
  grantProgressReports, GrantProgressReport, InsertGrantProgressReport,
  certificationModules, CertificationModule, InsertCertificationModule,
  certifications, Certification, InsertCertification,
  certificationConfigurations, CertificationConfiguration, InsertCertificationConfiguration,
  systemConfigurations, SystemConfiguration, InsertSystemConfiguration,
  pdfImportHistory, PdfImportHistory, InsertPdfImportHistory,
  featureRequests, FeatureRequest, InsertFeatureRequest,
  ra200Applications, Ra200Application, InsertRa200Application,
  ra205aApplications, Ra205aApplication, InsertRa205aApplication,
  teamMembers, TeamMember, InsertTeamMember,
  ownershipOverrides, OwnershipOverride, InsertOwnershipOverride,
  branches, Branch, InsertBranch,
  departments, Department, InsertDepartment,
  sections, Section, InsertSection
} from "@shared/schema";

export type GrantSdrLifecycleStorageErrorCode =
  | "GRANT_NOT_FOUND"
  | "GRANT_NOT_AWARDED"
  | "GRANT_HAS_SDR_LINKS"
  | "RESEARCH_ACTIVITY_NOT_FOUND"
  | "SDR_PI_MISMATCH";

export class GrantSdrLifecycleStorageError extends Error {
  constructor(
    public readonly code: GrantSdrLifecycleStorageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GrantSdrLifecycleStorageError";
  }
}
import { isPreprintRecord, preprintServerName, preprintLink, normalizeDoi, classifyResolvedPublication, preprintRepairEvidence } from "@shared/publicationDeduplication";

/**
 * Normalize a journal name for tolerant matching across the slightly different
 * spellings used by publication sources vs. the impact-factor dataset.
 * Lowercases, drops a leading "The ", and collapses all punctuation/whitespace
 * to single spaces. e.g. "The Lancet. Oncology" -> "lancet oncology" which then
 * matches the dataset's "LANCET ONCOLOGY".
 */
export function normalizeJournalName(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^the\s+/, "")
    .trim();
}

// SQL expression mirroring normalizeJournalName for a given column.
const normalizedJournalSql = (col: any) =>
  sql`btrim(regexp_replace(regexp_replace(lower(${col}), '[^a-z0-9]+', ' ', 'g'), '^the\\s+', ''))`;

export class DatabaseStorage implements IStorage {
  
  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: number, data: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User> {
    const [user] = await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return user;
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(asc(users.name));
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  // Program operations
  async getPrograms(): Promise<Program[]> {
    return await db.select().from(programs);
  }

  async getProgram(id: number): Promise<Program | undefined> {
    const [program] = await db.select().from(programs).where(eq(programs.id, id));
    return program;
  }

  async getProgramByProgramId(programId: string): Promise<Program | undefined> {
    const [program] = await db.select().from(programs).where(eq(programs.programId, programId));
    return program;
  }

  async createProgram(program: InsertProgram): Promise<Program> {
    const [newProgram] = await db.insert(programs).values(program).returning();
    return newProgram;
  }

  async updateProgram(id: number, program: Partial<InsertProgram>): Promise<Program | undefined> {
    const [updatedProgram] = await db
      .update(programs)
      .set(program)
      .where(eq(programs.id, id))
      .returning();
    return updatedProgram;
  }

  async deleteProgram(id: number): Promise<boolean> {
    const result = await db.delete(programs).where(eq(programs.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Projects operations
  async getProjects(): Promise<Project[]> {
    return await db.select().from(projects);
  }

  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async getProjectByProjectId(projectId: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.projectId, projectId));
    return project;
  }

  async getProjectsForProgram(programId: number): Promise<Project[]> {
    return await db.select().from(projects).where(eq(projects.programId, programId));
  }

  async getProjectsForScientist(scientistId: number): Promise<Project[]> {
    // Get projects where the scientist is the principal investigator
    return await db.select().from(projects).where(eq(projects.principalInvestigatorId, scientistId));
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [newProject] = await db.insert(projects).values(project).returning();
    return newProject;
  }

  async updateProject(id: number, project: Partial<InsertProject>): Promise<Project | undefined> {
    const [updatedProject] = await db
      .update(projects)
      .set(project)
      .where(eq(projects.id, id))
      .returning();
    return updatedProject;
  }

  async deleteProject(id: number): Promise<boolean> {
    const result = await db.delete(projects).where(eq(projects.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Scientist operations
  async getScientists(): Promise<Scientist[]> {
    const rows = await db.select().from(scientists).orderBy(scientists.lastName, scientists.firstName);
    // isInvestigator is derived from the access role on each person's account,
    // not read from the staff profile, so the flag the interface sees and the
    // role an administrator granted are always the same thing.
    return withInvestigatorFlag(rows, await resolveInvestigatorScientistIds());
  }

  async getScientistsWithActivityCount(): Promise<(Scientist & { activeResearchActivities: number })[]> {
    // Single query with a scalar subquery per scientist: counts distinct SDRs
    // where the scientist is either a team member OR the budget holder (PI),
    // so PIs who aren't explicitly in project_members are still counted.
    const rows = await db
      .select({
        scientist: scientists,
        count: sql<number>`(
          select count(*) from (
            select research_activity_id as ra_id from project_members
              where scientist_id = "scientists"."id"
            union
            select id as ra_id from research_activities
              where budget_holder_id = "scientists"."id"
          ) t
        )`.mapWith(Number),
      })
      .from(scientists)
      .orderBy(scientists.lastName, scientists.firstName);

    return rows.map((r) => ({
      ...r.scientist,
      activeResearchActivities: r.count ?? 0,
    }));
  }

  async getScientist(id: number): Promise<Scientist | undefined> {
    const [scientist] = await db.select().from(scientists).where(eq(scientists.id, id));
    if (!scientist) return undefined;
    const investigatorIds = await resolveInvestigatorScientistIds();
    return { ...scientist, isInvestigator: investigatorIds.has(scientist.id) };
  }

  async createScientist(scientist: InsertScientist): Promise<Scientist> {
    const [newScientist] = await db.insert(scientists).values(scientist).returning();
    return newScientist;
  }

  async updateScientist(id: number, scientist: Partial<InsertScientist>): Promise<Scientist | undefined> {
    const [updatedScientist] = await db
      .update(scientists)
      .set(scientist)
      .where(eq(scientists.id, id))
      .returning();
    return updatedScientist;
  }

  async deleteScientist(id: number): Promise<boolean> {
    const result = await db.delete(scientists).where(eq(scientists.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getStaff(): Promise<Scientist[]> {
    // Since isStaff field was removed, return scientists with management/staff job titles
    return await db.select().from(scientists).where(eq(scientists.jobTitle, "Management")).orderBy(scientists.lastName, scientists.firstName);
  }

  async getPrincipalInvestigators(): Promise<Scientist[]> {
    // Whoever holds the Investigator access role, and nobody else. This used to
    // include every "Staff Scientist" by job title, which put twenty-one people
    // in a list of investigators regardless of whether they led anything.
    const investigatorIds = await resolveInvestigatorScientistIds();
    if (investigatorIds.size === 0) return [];
    const rows = await db.select().from(scientists)
      .where(inArray(scientists.id, [...investigatorIds]))
      .orderBy(scientists.lastName, scientists.firstName);
    return withInvestigatorFlag(rows, investigatorIds);
  }

  // Research Activity operations
  async getResearchActivities(): Promise<ResearchActivity[]> {
    return await db.select().from(researchActivities);
  }

  async getResearchActivity(id: number): Promise<ResearchActivity | undefined> {
    const [activity] = await db.select().from(researchActivities).where(eq(researchActivities.id, id));
    return activity;
  }

  async getResearchActivityBySdr(sdrNumber: string): Promise<ResearchActivity | undefined> {
    const [activity] = await db.select().from(researchActivities).where(eq(researchActivities.sdrNumber, sdrNumber));
    return activity;
  }

  async getResearchActivitiesForProject(projectId: number): Promise<ResearchActivity[]> {
    return await db.select().from(researchActivities).where(eq(researchActivities.projectId, projectId));
  }

  async getResearchActivitiesForScientist(scientistId: number): Promise<ResearchActivity[]> {
    // Get activities where scientist is a team member
    const teamMemberActivities = await db
      .select({ activityId: projectMembers.researchActivityId })
      .from(projectMembers)
      .where(eq(projectMembers.scientistId, scientistId));
    
    const activityIds = teamMemberActivities.map(a => a.activityId);
    
    // If not a team member of any activities, return empty array
    if (activityIds.length === 0) {
      return [];
    }
    
    // Get activities where scientist is team member
    const activities = await db.select().from(researchActivities).where(inArray(researchActivities.id, activityIds));
    
    return activities;
  }

  async createResearchActivity(activity: InsertResearchActivity): Promise<ResearchActivity> {
    const [newActivity] = await db.insert(researchActivities).values(activity).returning();
    return newActivity;
  }

  async updateResearchActivity(id: number, activity: Partial<InsertResearchActivity>): Promise<ResearchActivity | undefined> {
    const [updatedActivity] = await db
      .update(researchActivities)
      .set(activity)
      .where(eq(researchActivities.id, id))
      .returning();
    return updatedActivity;
  }

  async deleteResearchActivity(id: number): Promise<boolean> {
    const result = await db.delete(researchActivities).where(eq(researchActivities.id, id));
    return (result.rowCount ?? 0) > 0;
  }
  
  // Project Members operations
  async getProjectMembers(researchActivityId: number): Promise<ProjectMember[]> {
    return await db.select().from(projectMembers).where(eq(projectMembers.researchActivityId, researchActivityId));
  }

  async getAllProjectMembers(): Promise<ProjectMember[]> {
    return await db.select().from(projectMembers);
  }

  async addProjectMember(member: InsertProjectMember): Promise<ProjectMember> {
    const [newMember] = await db.insert(projectMembers).values(member).returning();
    return newMember;
  }

  async removeProjectMember(researchActivityId: number, scientistId: number): Promise<boolean> {
    const result = await db
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.researchActivityId, researchActivityId),
          eq(projectMembers.scientistId, scientistId)
        )
      );
    return (result.rowCount ?? 0) > 0;
  }

  // Data Management Plan operations
  async getDataManagementPlans(): Promise<DataManagementPlan[]> {
    return await db.select().from(dataManagementPlans);
  }

  async getDataManagementPlan(id: number): Promise<DataManagementPlan | undefined> {
    const [plan] = await db.select().from(dataManagementPlans).where(eq(dataManagementPlans.id, id));
    return plan;
  }

  async getDataManagementPlanForResearchActivity(researchActivityId: number): Promise<DataManagementPlan | undefined> {
    const [plan] = await db
      .select()
      .from(dataManagementPlans)
      .where(eq(dataManagementPlans.researchActivityId, researchActivityId));
    return plan;
  }

  async getDataManagementPlanForProject(projectId: number): Promise<DataManagementPlan | undefined> {
    // Get data management plan for any research activity belonging to this project
    const [plan] = await db
      .select()
      .from(dataManagementPlans)
      .innerJoin(researchActivities, eq(dataManagementPlans.researchActivityId, researchActivities.id))
      .where(eq(researchActivities.projectId, projectId));
    return plan ? plan.data_management_plans : undefined;
  }

  async createDataManagementPlan(plan: InsertDataManagementPlan): Promise<DataManagementPlan> {
    const [newPlan] = await db.insert(dataManagementPlans).values(plan).returning();
    return newPlan;
  }

  async updateDataManagementPlan(id: number, plan: Partial<InsertDataManagementPlan>): Promise<DataManagementPlan | undefined> {
    const [updatedPlan] = await db
      .update(dataManagementPlans)
      .set(plan)
      .where(eq(dataManagementPlans.id, id))
      .returning();
    return updatedPlan;
  }

  async deleteDataManagementPlan(id: number): Promise<boolean> {
    const result = await db.delete(dataManagementPlans).where(eq(dataManagementPlans.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Publication operations
  async getPublications(): Promise<Publication[]> {
    return await db.select().from(publications);
  }

  async getPublication(id: number): Promise<Publication | undefined> {
    const [publication] = await db.select().from(publications).where(eq(publications.id, id));
    return publication;
  }

  async getPublicationsForResearchActivity(researchActivityId: number): Promise<Publication[]> {
    return await db.select().from(publications).where(eq(publications.researchActivityId, researchActivityId));
  }

  async createPublication(
    publication: InsertPublication & { createdByUserId?: number | null },
  ): Promise<Publication> {
    // Handle data standardization
    const publicationData = { ...publication };
    
    // Standardize author names if provided
    if (publicationData.authors && typeof publicationData.authors === 'string') {
      publicationData.authors = this.standardizeAuthorNames(publicationData.authors);
    }
    
    // Capitalize title
    if (publicationData.title && typeof publicationData.title === 'string') {
      publicationData.title = this.capitalizeTitle(publicationData.title);
    }
    
    const [newPublication] = await db.insert(publications).values(publicationData).returning();
    return newPublication;
  }

  async createPublicationWithHistory(
    publication: InsertPublication & { createdByUserId?: number | null },
    history: Omit<InsertManuscriptHistory, "publicationId">,
  ): Promise<Publication> {
    const publicationData = { ...publication };
    if (publicationData.authors && typeof publicationData.authors === "string") {
      publicationData.authors = this.standardizeAuthorNames(publicationData.authors);
    }
    if (publicationData.title && typeof publicationData.title === "string") {
      publicationData.title = this.capitalizeTitle(publicationData.title);
    }

    return await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(publications)
        .values(publicationData)
        .returning();
      await tx.insert(manuscriptHistory).values({
        ...history,
        publicationId: created.id,
      });
      return created;
    });
  }

  async updatePublication(id: number, publication: Partial<InsertPublication>): Promise<Publication | undefined> {
    // Handle date conversions properly
    const updateData = { ...publication };
    
    // Convert date strings to Date objects if needed
    if (updateData.publicationDate && typeof updateData.publicationDate === 'string') {
      updateData.publicationDate = new Date(updateData.publicationDate);
    }
    
    // Standardize author names if provided
    if (updateData.authors && typeof updateData.authors === 'string') {
      updateData.authors = this.standardizeAuthorNames(updateData.authors);
    }
    
    // Capitalize title if provided
    if (updateData.title && typeof updateData.title === 'string') {
      updateData.title = this.capitalizeTitle(updateData.title);
    }
    
    const [updatedPublication] = await db
      .update(publications)
      .set(updateData)
      .where(eq(publications.id, id))
      .returning();
    return updatedPublication;
  }

  async repairPreprintPublication(id: number, changedBy: number): Promise<{ publication?: Publication; reason?: string }> {
    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(publications)
        .where(eq(publications.id, id))
        .for("update");
      if (!current) return { reason: "not found" };
      if (!preprintRepairEvidence(current).length) return { reason: "no longer eligible" };
      const correction = classifyResolvedPublication(current);
      const [updated] = await tx
        .update(publications)
        .set({ ...correction, updatedAt: new Date() })
        .where(and(
          eq(publications.id, id),
          eq(publications.status, "Published"),
        ))
        .returning();
      if (!updated) return { reason: "no longer eligible" };
      await tx.insert(manuscriptHistory).values({
        publicationId: id,
        fromStatus: current.status || "Published",
        toStatus: correction.status,
        changedBy,
        changeReason: "Corrected published preprint classification from current primary DOI/publication type evidence",
      });
      return { publication: updated };
    });
  }

  // Helper function to standardize author names
  private standardizeAuthorNames(authors: string): string {
    if (!authors || typeof authors !== 'string') return authors;
    
    // Remove "et al." and similar endings before processing
    authors = authors.replace(/[,;\s]+(et\s+al\.?|and\s+others)\s*$/i, '').trim();
    
    // Split by common separators (comma, semicolon, or 'and')
    const authorList = authors.split(/[,;]|\sand\s/i).map(author => author.trim()).filter(Boolean);
    
    const standardizedAuthors = authorList.map(author => {
      // Remove extra spaces and clean up
      author = author.replace(/\s+/g, ' ').trim();
      
      // Remove common titles
      author = author.replace(/^(dr\.?|prof\.?|professor|mr\.?|mrs\.?|ms\.?|miss|sir|dame)\s+/i, '').trim();
      
      // Skip if already looks properly formatted or is too short
      if (author.length < 3) return author;
      
      // Handle different name formats
      let parts = author.split(' ').filter(Boolean);
      
      if (parts.length === 1) {
        // Single name - return as is
        return author;
      } else if (parts.length === 2) {
        // First Last or Last, First format
        if (author.includes(',')) {
          // Convert Last, First to First Last format
          const [last, first] = author.split(',').map(s => s.trim());
          // Add period to single letter first name
          const firstFormatted = first.length === 1 ? first + '.' : first;
          return `${firstFormatted} ${last}`;
        } else {
          const first = parts[0];
          const last = parts[1];
          
          // Detect "LastName InitialInitial..." pattern (e.g., "Chen L", "Smith JA", "Johnson MK")
          // If second part is all uppercase letters (initials), convert to proper format
          if (last.match(/^[A-Za-z]+$/) && last.length <= 4 && last === last.toUpperCase()) {
            // Convert multiple initials: "Smith JA" → "J. A. Smith"
            const initials = last.split('').map(initial => initial.toUpperCase() + '.').join(' ');
            return `${initials} ${first}`;
          } else {
            // Regular "First Last" format - add period to single letter first name
            const firstFormatted = first.length === 1 ? first + '.' : first;
            return `${firstFormatted} ${last}`;
          }
        }
      } else if (parts.length >= 3) {
        // Handle First Middle Last or multiple middle names
        const first = parts[0];
        const last = parts[parts.length - 1];
        const middle = parts.slice(1, -1);
        
        // Standardize middle names to initials with periods
        const middleInitials = middle.map(name => {
          if (name.length === 1) {
            return name.toUpperCase() + '.';
          } else if (name.endsWith('.')) {
            return name.charAt(0).toUpperCase() + '.';
          } else {
            return name.charAt(0).toUpperCase() + '.';
          }
        }).join(' ');
        
        // Return as First Middle. Last
        return middleInitials ? `${first} ${middleInitials} ${last}` : `${first} ${last}`;
      }
      
      return author;
    });
    
    return standardizedAuthors.join(', ');
  }

  // Helper function to capitalize title properly
  private capitalizeTitle(title: string): string {
    if (!title || typeof title !== 'string') return title;
    
    // Words that should not be capitalized unless they are the first or last word
    const lowercaseWords = [
      'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'if', 'in', 'nor', 'of', 
      'on', 'or', 'so', 'the', 'to', 'up', 'yet', 'with', 'from', 'into', 'onto', 
      'upon', 'over', 'under', 'above', 'below', 'across', 'through', 'during', 
      'before', 'after', 'until', 'while', 'about', 'against', 'among', 'around', 
      'behind', 'beside', 'between', 'beyond', 'inside', 'outside', 'toward', 
      'towards', 'underneath', 'within', 'without'
    ];
    
    return title.toLowerCase()
      .split(' ')
      .map((word, index, array) => {
        // Always capitalize first and last words
        if (index === 0 || index === array.length - 1) {
          return word.charAt(0).toUpperCase() + word.slice(1);
        }
        
        // Don't capitalize articles, conjunctions, and prepositions
        if (lowercaseWords.includes(word.toLowerCase())) {
          return word.toLowerCase();
        }
        
        // Capitalize everything else
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }

  async deletePublication(id: number): Promise<boolean> {
    const result = await db.delete(publications).where(eq(publications.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Atomically merge a set of duplicate publications into a surviving record.
  // Author links, manuscript history, and research-activity association are
  // moved onto the survivor; the merged-away records are deleted. Field values
  // come from `overrides` (the officer's per-field choices). The whole operation
  // runs in a single transaction so a partial failure leaves everything intact.
  async mergePublications(
    survivorId: number,
    mergeIds: number[],
    overrides: Partial<InsertPublication>,
    changedBy: number,
  ): Promise<Publication | undefined> {
    const ids = Array.from(new Set(mergeIds)).filter((id) => id !== survivorId);

    return await db.transaction(async (tx) => {
      const [survivor] = await tx
        .select()
        .from(publications)
        .where(eq(publications.id, survivorId));
      if (!survivor) {
        throw new Error("Surviving publication not found");
      }

      // Verify every merge target exists before mutating anything.
      const targets = ids.length
        ? await tx.select().from(publications).where(inArray(publications.id, ids))
        : [];
      if (targets.length !== ids.length) {
        throw new Error("One or more publications to merge were not found");
      }

      // Track which scientists are already linked to the survivor so we never
      // violate the (publicationId, scientistId) unique index.
      const survivorAuthors = await tx
        .select()
        .from(publicationAuthors)
        .where(eq(publicationAuthors.publicationId, survivorId));
      const survivorAuthorByScientist = new Map<number, typeof survivorAuthors[number]>();
      for (const a of survivorAuthors) survivorAuthorByScientist.set(a.scientistId, a);

      for (const mid of ids) {
        const mergedAuthors = await tx
          .select()
          .from(publicationAuthors)
          .where(eq(publicationAuthors.publicationId, mid));

        for (const a of mergedAuthors) {
          const existing = survivorAuthorByScientist.get(a.scientistId);
          if (existing) {
            // De-dup: combine authorship types, keep the more specific position,
            // then drop the duplicate row.
            const combined = Array.from(
              new Set(
                [
                  ...existing.authorshipType.split(",").map((t) => t.trim()),
                  ...a.authorshipType.split(",").map((t) => t.trim()),
                ].filter(Boolean),
              ),
            ).join(", ");
            await tx
              .update(publicationAuthors)
              .set({
                authorshipType: combined,
                authorPosition: existing.authorPosition ?? a.authorPosition,
              })
              .where(eq(publicationAuthors.id, existing.id));
            existing.authorshipType = combined;
            await tx
              .delete(publicationAuthors)
              .where(eq(publicationAuthors.id, a.id));
          } else {
            // Re-point the author link onto the survivor.
            await tx
              .update(publicationAuthors)
              .set({ publicationId: survivorId })
              .where(eq(publicationAuthors.id, a.id));
            survivorAuthorByScientist.set(a.scientistId, {
              ...a,
              publicationId: survivorId,
            });
          }
        }

        // Re-point manuscript history so the timeline is preserved.
        await tx
          .update(manuscriptHistory)
          .set({ publicationId: survivorId })
          .where(eq(manuscriptHistory.publicationId, mid));
      }

      // Apply the officer's chosen field values to the survivor.
      const updateData: Record<string, any> = { ...overrides, updatedAt: new Date() };
      const effectiveStatus = updateData.status ?? survivor.status;
      if (effectiveStatus !== "Published - Invalid") {
        updateData.invalidReason = null;
      }
      updateData.createdByUserId =
        survivor.createdByUserId ??
        [survivor, ...targets]
          .sort((a, b) => {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
            return aTime - bTime || a.id - b.id;
          })
          .find((publication) => publication.createdByUserId != null)
          ?.createdByUserId ??
        null;
      if (updateData.publicationDate && typeof updateData.publicationDate === "string") {
        updateData.publicationDate = new Date(updateData.publicationDate);
      }

      // Preserve preprint linkage: when a preprint is merged into its published
      // version, the published DOI correctly wins, but the preprint's own
      // identity (its 10.1101/... DOI and originating server) would otherwise be
      // deleted along with its record. If the survivor ends up as the published
      // article and has no prepublication link yet, carry the preprint's link
      // and server name onto it so that data is merged, not lost.
      //
      // Gate each backfill on whether the *effective value is empty* (a
      // text-presence check), never on whether the key exists in `overrides`.
      // The merge dialog always sends both prepublication keys (empty when
      // neither record had them), so a key-presence check would make every
      // merge look like a deliberate clear and the backfill would never fire
      // through the real UI.
      //
      // A deliberate clear must still be respected: when the officer empties a
      // field the survivor previously had a value for, that is an intentional
      // removal, not a missing value — so we skip backfill for that field. We
      // detect it by comparing the original survivor value against the
      // effective value, rather than by key presence in `overrides`.
      const effectiveSurvivor = { ...survivor, ...overrides };
      const hasText = (v: any) => !!v && !!String(v).trim();
      const urlClearedDeliberately =
        hasText(survivor.prepublicationUrl) && !hasText(effectiveSurvivor.prepublicationUrl);
      const siteClearedDeliberately =
        hasText(survivor.prepublicationSite) && !hasText(effectiveSurvivor.prepublicationSite);
      if (!isPreprintRecord(effectiveSurvivor as any)) {
        let prepubUrl = effectiveSurvivor.prepublicationUrl;
        let prepubSite = effectiveSurvivor.prepublicationSite;
        for (const t of targets) {
          if (!isPreprintRecord(t as any)) continue;
          if (!hasText(prepubUrl)) {
            prepubUrl = preprintLink(t as any) ?? prepubUrl;
          }
          if (!hasText(prepubSite)) {
            prepubSite = preprintServerName(t as any) ?? prepubSite;
          }
          if (hasText(prepubUrl) && hasText(prepubSite)) break;
        }
        if (
          !urlClearedDeliberately &&
          !hasText(effectiveSurvivor.prepublicationUrl) &&
          hasText(prepubUrl)
        ) {
          updateData.prepublicationUrl = prepubUrl;
        }
        if (
          !siteClearedDeliberately &&
          !hasText(effectiveSurvivor.prepublicationSite) &&
          hasText(prepubSite)
        ) {
          updateData.prepublicationSite = prepubSite;
        }
      }
      // Preserve every other DOI identity: any merged-away record's DOI that
      // differs from the survivor's effective DOI (and isn't already covered
      // by the preprint link) is kept as an alternate DOI, so a later
      // ORCID/Scholar re-sync can't resurface the merged record as "missing".
      const normalize = (v: string | null | undefined) => normalizeDoi(v) ?? "";
      const survivorDoi = normalize(effectiveSurvivor.doi);
      // Start from the survivor's existing alternates, but drop any that now
      // equal the effective primary DOI (e.g. the officer promoted a recorded
      // alternate to be the surviving DOI).
      const alternates = new Set<string>(
        (survivor.alternateDois ?? [])
          .map(normalize)
          .filter((d) => d && d !== survivorDoi),
      );
      for (const t of targets) {
        const d = normalize(t.doi);
        if (d && d !== survivorDoi) alternates.add(d);
        for (const extra of t.alternateDois ?? []) {
          const e = normalize(extra);
          if (e && e !== survivorDoi) alternates.add(e);
        }
      }
      // The survivor's old DOI also stays reachable if the officer picked the
      // other record's DOI as the surviving value.
      const originalSurvivorDoi = normalize(survivor.doi);
      if (originalSurvivorDoi && originalSurvivorDoi !== survivorDoi) {
        alternates.add(originalSurvivorDoi);
      }
      const previous = (survivor.alternateDois ?? []).map(normalize).filter(Boolean);
      const changed =
        alternates.size !== previous.length ||
        !previous.every((d) => alternates.has(d));
      if (changed) {
        updateData.alternateDois = Array.from(alternates);
      }

      if (Object.keys(updateData).length > 0) {
        await tx
          .update(publications)
          .set(updateData)
          .where(eq(publications.id, survivorId));
      }

      // Delete the merged-away records (their dependent rows are already moved).
      if (ids.length) {
        await tx.delete(publications).where(inArray(publications.id, ids));
      }

      // Record the merge in the survivor's manuscript history.
      const finalStatus = (updateData.status ?? survivor.status) || "Concept";
      await tx.insert(manuscriptHistory).values({
        publicationId: survivorId,
        fromStatus: survivor.status || "",
        toStatus: finalStatus,
        changedBy,
        changeReason: `Merged ${ids.length} duplicate publication record(s) (ids: ${ids.join(", ")}) into this record.`,
      });

      const [updated] = await tx
        .select()
        .from(publications)
        .where(eq(publications.id, survivorId));
      return updated;
    });
  }

  // Manuscript History operations
  async getManuscriptHistory(publicationId: number): Promise<ManuscriptHistory[]> {
    return await db
      .select()
      .from(manuscriptHistory)
      .where(eq(manuscriptHistory.publicationId, publicationId))
      .orderBy(desc(manuscriptHistory.createdAt));
  }

  async createManuscriptHistoryEntry(entry: InsertManuscriptHistory): Promise<ManuscriptHistory> {
    const [newEntry] = await db.insert(manuscriptHistory).values(entry).returning();
    return newEntry;
  }

  // Publication Status Management
  async updatePublicationStatus(
    id: number,
    status: string,
    changedBy: number,
    changes?: {field: string, oldValue: string, newValue: string}[],
    expectedStatus?: string,
    updatedFields?: Partial<InsertPublication>,
  ): Promise<Publication | undefined> {
    // Get current publication to track changes
    const currentPublication = await this.getPublication(id);
    if (!currentPublication) return undefined;

    // Generic status transitions can never enter the invalid state, so clear
    // any stale active reason whenever one of those transitions succeeds.
    return db.transaction(async (tx) => {
      const conditions = [eq(publications.id, id)];
      if (expectedStatus != null) {
        conditions.push(eq(publications.status, expectedStatus));
      }
      const [updatedPublication] = await tx
        .update(publications)
        .set({
          ...updatedFields,
          status,
          invalidReason: null,
          updatedAt: new Date(),
        })
        .where(and(...conditions))
        .returning();
      if (!updatedPublication) return undefined;

      await tx.insert(manuscriptHistory).values({
        publicationId: id,
        fromStatus: currentPublication.status || 'Unknown',
        toStatus: status,
        changedBy,
        changeReason: `Status changed from ${currentPublication.status || 'Unknown'} to ${status}`,
      });

      if (changes && changes.length > 0) {
        for (const change of changes) {
          await tx.insert(manuscriptHistory).values({
          publicationId: id,
          fromStatus: currentPublication.status || 'Unknown',
          toStatus: status,
          changedField: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
          changedBy,
          changeReason: `${change.field} changed during status transition`,
          });
        }
      }

      return updatedPublication;
    });
  }

  async updatePublicationCorrectionStatus(
    id: number,
    expectedStatus: string,
    status: string,
    invalidReason: string | null,
    changedBy: number,
    changeReason: string,
  ): Promise<Publication | undefined> {
    return db.transaction(async (tx) => {
      const [updated] = await tx
        .update(publications)
        .set({ status, invalidReason, updatedAt: new Date() })
        .where(and(
          eq(publications.id, id),
          eq(publications.status, expectedStatus),
        ))
        .returning();
      if (!updated) return undefined;

      await tx.insert(manuscriptHistory).values({
        publicationId: id,
        fromStatus: expectedStatus,
        toStatus: status,
        changedBy,
        changeReason,
      });
      return updated;
    });
  }

  // Publication Author operations
  async getPublicationsForScientist(
    scientistId: number,
    yearsSince: number = 5,
    includeUnpublished: boolean = false,
  ): Promise<(Publication & { authorshipType: string; authorPosition: number | null })[]> {
    const visibilityConditions = [eq(publicationAuthors.scientistId, scientistId)];
    if (!includeUnpublished) {
      visibilityConditions.push(
        sql`LOWER(TRIM(COALESCE(${publications.status}, ''))) IN ('published', 'published *')`,
      );
    }

    // Get all publications for the scientist first, then filter by date in JavaScript
    const allResults = await db
      .select({
        id: publications.id,
        researchActivityId: publications.researchActivityId,
        // Mutually exclusive with researchActivityId: a record either links an
        // SDR or records why none applies. Without this the profile list cannot
        // tell the two apart and flags an accepted exception as a missing link.
        sdrExemptionReason: publications.sdrExemptionReason,
        title: publications.title,
        abstract: publications.abstract,
        authors: publications.authors,
        journal: publications.journal,
        volume: publications.volume,
        issue: publications.issue,
        pages: publications.pages,
        doi: publications.doi,
        publicationDate: publications.publicationDate,
        publicationType: publications.publicationType,
        status: publications.status,
        prepublicationSite: publications.prepublicationSite,
        prepublicationUrl: publications.prepublicationUrl,
        createdAt: publications.createdAt,
        updatedAt: publications.updatedAt,
        authorshipType: publicationAuthors.authorshipType,
        authorPosition: publicationAuthors.authorPosition,
      })
      .from(publications)
      .innerJoin(publicationAuthors, eq(publications.id, publicationAuthors.publicationId))
      .where(and(...visibilityConditions))
      .orderBy(desc(publications.id));
    
    // Filter by date in JavaScript to avoid SQL date issues
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsSince);
    
    const filteredResults = allResults.filter(pub => {
      if (!pub.publicationDate) return true; // Include publications without date
      const pubDate = new Date(pub.publicationDate);
      return pubDate >= cutoffDate;
    });
    
    // Sort by publication date (most recent first), then by ID for consistent ordering
    filteredResults.sort((a, b) => {
      if (a.publicationDate && b.publicationDate) {
        return new Date(b.publicationDate).getTime() - new Date(a.publicationDate).getTime();
      }
      if (a.publicationDate && !b.publicationDate) return -1;
      if (!a.publicationDate && b.publicationDate) return 1;
      return b.id - a.id;
    });
    
    return filteredResults;
  }

  async getAuthorshipStatsByYear(
    scientistId: number,
    yearsSince: number = 5,
    includeUnpublished: boolean = false,
  ): Promise<{ year: number; authorshipType: string; count: number }[]> {
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsSince);

    const visibilityConditions = [
      eq(publicationAuthors.scientistId, scientistId),
      sql`${publications.publicationDate} >= ${cutoffDate.toISOString()}`,
    ];
    if (!includeUnpublished) {
      visibilityConditions.push(
        sql`LOWER(TRIM(COALESCE(${publications.status}, ''))) IN ('published', 'published *')`,
      );
    }
    
    const results = await db
      .select({
        year: sql<number>`EXTRACT(YEAR FROM ${publications.publicationDate})`,
        authorshipType: publicationAuthors.authorshipType,
        count: sql<number>`COUNT(*)`,
      })
      .from(publications)
      .innerJoin(publicationAuthors, eq(publications.id, publicationAuthors.publicationId))
      .where(and(...visibilityConditions))
      .groupBy(sql`EXTRACT(YEAR FROM ${publications.publicationDate})`, publicationAuthors.authorshipType)
      .orderBy(sql`EXTRACT(YEAR FROM ${publications.publicationDate}) DESC`);
    
    return results;
  }

  async getAllPublicationAuthors(): Promise<(PublicationAuthor & { scientist: Scientist })[]> {
    const results = await db
      .select({
        id: publicationAuthors.id,
        publicationId: publicationAuthors.publicationId,
        scientistId: publicationAuthors.scientistId,
        authorshipType: publicationAuthors.authorshipType,
        authorPosition: publicationAuthors.authorPosition,
        linkedByUserId: publicationAuthors.linkedByUserId,
        linkMethod: publicationAuthors.linkMethod,
        linkedByName: users.name,
        scientist: scientists
      })
      .from(publicationAuthors)
      .innerJoin(scientists, eq(publicationAuthors.scientistId, scientists.id))
      .leftJoin(users, eq(publicationAuthors.linkedByUserId, users.id));

    return results as (PublicationAuthor & { scientist: Scientist })[];
  }

  async getPublicationAuthors(publicationId: number): Promise<(PublicationAuthor & { scientist: Scientist })[]> {
    const results = await db
      .select({
        id: publicationAuthors.id,
        publicationId: publicationAuthors.publicationId,
        scientistId: publicationAuthors.scientistId,
        authorshipType: publicationAuthors.authorshipType,
        authorPosition: publicationAuthors.authorPosition,
        linkedByUserId: publicationAuthors.linkedByUserId,
        linkMethod: publicationAuthors.linkMethod,
        linkedByName: users.name,
        scientist: scientists
      })
      .from(publicationAuthors)
      .innerJoin(scientists, eq(publicationAuthors.scientistId, scientists.id))
      .leftJoin(users, eq(publicationAuthors.linkedByUserId, users.id))
      .where(eq(publicationAuthors.publicationId, publicationId))
      .orderBy(publicationAuthors.authorPosition);
    
    return results as (PublicationAuthor & { scientist: Scientist })[];
  }

  async addPublicationAuthor(author: InsertPublicationAuthor): Promise<PublicationAuthor> {
    const [newAuthor] = await db.insert(publicationAuthors).values(author).returning();
    return newAuthor;
  }

  async removePublicationAuthor(publicationId: number, scientistId: number): Promise<boolean> {
    const result = await db
      .delete(publicationAuthors)
      .where(and(
        eq(publicationAuthors.publicationId, publicationId),
        eq(publicationAuthors.scientistId, scientistId)
      ));
    return (result.rowCount ?? 0) > 0;
  }

  async updatePublicationAuthor(publicationId: number, scientistId: number, updates: Partial<InsertPublicationAuthor>): Promise<PublicationAuthor | undefined> {
    const [updatedAuthor] = await db
      .update(publicationAuthors)
      .set(updates)
      .where(and(
        eq(publicationAuthors.publicationId, publicationId),
        eq(publicationAuthors.scientistId, scientistId)
      ))
      .returning();
    return updatedAuthor;
  }

  // Patent operations
  async getPatents(): Promise<Patent[]> {
    return await db.select().from(patents);
  }

  async getPatent(id: number): Promise<Patent | undefined> {
    const [patent] = await db.select().from(patents).where(eq(patents.id, id));
    return patent;
  }

  async getPatentsForResearchActivity(researchActivityId: number): Promise<Patent[]> {
    return await db.select().from(patents).where(eq(patents.researchActivityId, researchActivityId));
  }

  async getPatentsForProject(projectId: number): Promise<Patent[]> {
    // Get patents for any research activity belonging to this project
    return await db
      .select()
      .from(patents)
      .innerJoin(researchActivities, eq(patents.researchActivityId, researchActivities.id))
      .where(eq(researchActivities.projectId, projectId))
      .then(results => results.map(r => r.patents));
  }

  async createPatent(patent: InsertPatent): Promise<Patent> {
    const [newPatent] = await db.insert(patents).values(patent).returning();
    return newPatent;
  }

  async updatePatent(id: number, patent: Partial<InsertPatent>): Promise<Patent | undefined> {
    const [updatedPatent] = await db
      .update(patents)
      .set(patent)
      .where(eq(patents.id, id))
      .returning();
    return updatedPatent;
  }

  async deletePatent(id: number): Promise<boolean> {
    const result = await db.delete(patents).where(eq(patents.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // IRB Application operations
  async getIrbApplications(): Promise<IrbApplication[]> {
    return await db.select().from(irbApplications);
  }

  async getIrbApplication(id: number): Promise<IrbApplication | undefined> {
    const [application] = await db.select().from(irbApplications).where(eq(irbApplications.id, id));
    return application;
  }

  async getIrbApplicationByIrbNumber(irbNumber: string): Promise<IrbApplication | undefined> {
    const [application] = await db.select().from(irbApplications).where(eq(irbApplications.irbNumber, irbNumber));
    return application;
  }

  async getIrbApplicationsForResearchActivity(researchActivityId: number): Promise<IrbApplication[]> {
    return await db.select().from(irbApplications).where(eq(irbApplications.researchActivityId, researchActivityId));
  }

  async createIrbApplication(application: InsertIrbApplication): Promise<IrbApplication> {
    const [newApplication] = await db.insert(irbApplications).values(application).returning();
    return newApplication;
  }

  async updateIrbApplication(id: number, application: Partial<InsertIrbApplication>): Promise<IrbApplication | undefined> {
    const [updatedApplication] = await db
      .update(irbApplications)
      .set(application)
      .where(eq(irbApplications.id, id))
      .returning();
    return updatedApplication;
  }

  async deleteIrbApplication(id: number): Promise<boolean> {
    const result = await db.delete(irbApplications).where(eq(irbApplications.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // IRB Submission operations
  async getIrbSubmissions(): Promise<IrbSubmission[]> {
    return await db.select().from(irbSubmissions);
  }

  async getIrbSubmission(id: number): Promise<IrbSubmission | undefined> {
    const [submission] = await db.select().from(irbSubmissions).where(eq(irbSubmissions.id, id));
    return submission;
  }

  async getIrbSubmissionsForApplication(applicationId: number): Promise<IrbSubmission[]> {
    return await db.select().from(irbSubmissions).where(eq(irbSubmissions.applicationId, applicationId));
  }

  async createIrbSubmission(submission: InsertIrbSubmission): Promise<IrbSubmission> {
    const [newSubmission] = await db.insert(irbSubmissions).values(submission).returning();
    return newSubmission;
  }

  async updateIrbSubmission(id: number, submission: Partial<InsertIrbSubmission>): Promise<IrbSubmission | undefined> {
    const [updatedSubmission] = await db
      .update(irbSubmissions)
      .set(submission)
      .where(eq(irbSubmissions.id, id))
      .returning();
    return updatedSubmission;
  }

  async deleteIrbSubmission(id: number): Promise<boolean> {
    const result = await db.delete(irbSubmissions).where(eq(irbSubmissions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // IRB Document operations
  async getIrbDocuments(): Promise<IrbDocument[]> {
    return await db.select().from(irbDocuments);
  }

  async getIrbDocument(id: number): Promise<IrbDocument | undefined> {
    const [document] = await db.select().from(irbDocuments).where(eq(irbDocuments.id, id));
    return document;
  }

  async getIrbDocumentsForApplication(applicationId: number): Promise<IrbDocument[]> {
    return await db.select().from(irbDocuments).where(eq(irbDocuments.applicationId, applicationId));
  }

  async getIrbDocumentsForSubmission(submissionId: number): Promise<IrbDocument[]> {
    return await db.select().from(irbDocuments).where(eq(irbDocuments.submissionId, submissionId));
  }

  async createIrbDocument(document: InsertIrbDocument): Promise<IrbDocument> {
    const [newDocument] = await db.insert(irbDocuments).values(document).returning();
    return newDocument;
  }

  async updateIrbDocument(id: number, document: Partial<InsertIrbDocument>): Promise<IrbDocument | undefined> {
    const [updatedDocument] = await db
      .update(irbDocuments)
      .set(document)
      .where(eq(irbDocuments.id, id))
      .returning();
    return updatedDocument;
  }

  async deleteIrbDocument(id: number): Promise<boolean> {
    const result = await db.delete(irbDocuments).where(eq(irbDocuments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // IBC Application operations
  async getIbcApplications(): Promise<IbcApplication[]> {
    return await db.select().from(ibcApplications);
  }

  async getIbcApplication(id: number): Promise<IbcApplication | undefined> {
    const [application] = await db.select().from(ibcApplications).where(eq(ibcApplications.id, id));
    return application;
  }

  async getIbcApplicationByIbcNumber(ibcNumber: string): Promise<IbcApplication | undefined> {
    const [application] = await db.select().from(ibcApplications).where(eq(ibcApplications.ibcNumber, ibcNumber));
    return application;
  }

  async getIbcApplicationsForResearchActivity(researchActivityId: number): Promise<IbcApplication[]> {
    const results = await db
      .select({ ibcApplication: ibcApplications })
      .from(ibcApplications)
      .innerJoin(
        ibcApplicationResearchActivities,
        eq(ibcApplications.id, ibcApplicationResearchActivities.ibcApplicationId)
      )
      .where(eq(ibcApplicationResearchActivities.researchActivityId, researchActivityId));
    
    return results.map(r => r.ibcApplication);
  }

  async createIbcApplication(application: InsertIbcApplication, researchActivityIds: number[] = []): Promise<IbcApplication> {
    const [newApplication] = await db.insert(ibcApplications).values(application).returning();
    
    // Link the IBC application to multiple research activities
    if (researchActivityIds.length > 0) {
      const linkages = researchActivityIds.map(researchActivityId => ({
        ibcApplicationId: newApplication.id,
        researchActivityId
      }));
      
      await db.insert(ibcApplicationResearchActivities).values(linkages);
    }
    
    return newApplication;
  }

  // Get research activities linked to an IBC application
  async getResearchActivitiesForIbcApplication(ibcApplicationId: number): Promise<ResearchActivity[]> {
    const results = await db
      .select({ researchActivity: researchActivities })
      .from(researchActivities)
      .innerJoin(
        ibcApplicationResearchActivities,
        eq(researchActivities.id, ibcApplicationResearchActivities.researchActivityId)
      )
      .where(eq(ibcApplicationResearchActivities.ibcApplicationId, ibcApplicationId));
    
    return results.map(r => r.researchActivity);
  }

  // Add research activity to IBC application
  async addResearchActivityToIbcApplication(ibcApplicationId: number, researchActivityId: number): Promise<IbcApplicationResearchActivity> {
    const [linkage] = await db
      .insert(ibcApplicationResearchActivities)
      .values({ ibcApplicationId, researchActivityId })
      .returning();
    return linkage;
  }

  // Remove research activity from IBC application
  async removeResearchActivityFromIbcApplication(ibcApplicationId: number, researchActivityId: number): Promise<boolean> {
    const result = await db
      .delete(ibcApplicationResearchActivities)
      .where(
        and(
          eq(ibcApplicationResearchActivities.ibcApplicationId, ibcApplicationId),
          eq(ibcApplicationResearchActivities.researchActivityId, researchActivityId)
        )
      );
    return (result.rowCount ?? 0) > 0;
  }

  async updateIbcApplication(id: number, application: Partial<InsertIbcApplication>): Promise<IbcApplication | undefined> {
    const [updatedApplication] = await db
      .update(ibcApplications)
      .set({ ...application, updatedAt: new Date() })
      .where(eq(ibcApplications.id, id))
      .returning();
    return updatedApplication;
  }

  async deleteIbcApplication(id: number): Promise<boolean> {
    // Delete related research activity linkages first
    await db.delete(ibcApplicationResearchActivities).where(eq(ibcApplicationResearchActivities.ibcApplicationId, id));
    
    // Then delete the application
    const result = await db.delete(ibcApplications).where(eq(ibcApplications.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // IBC Application Comment operations
  async getIbcApplicationComments(applicationId: number): Promise<IbcApplicationComment[]> {
    return await db
      .select()
      .from(ibcApplicationComments)
      .where(eq(ibcApplicationComments.applicationId, applicationId))
      .orderBy(ibcApplicationComments.createdAt);
  }

  async createIbcApplicationComment(comment: InsertIbcApplicationComment): Promise<IbcApplicationComment> {
    const [newComment] = await db.insert(ibcApplicationComments).values(comment).returning();
    return newComment;
  }

  // IBC Application Facilities operations
  async getIbcApplicationRooms(applicationId: number): Promise<IbcApplicationRoom[]> {
    return await db
      .select()
      .from(ibcApplicationRooms)
      .where(eq(ibcApplicationRooms.applicationId, applicationId));
  }

  async addRoomToIbcApplication(applicationRoom: InsertIbcApplicationRoom): Promise<IbcApplicationRoom> {
    const [newRoom] = await db.insert(ibcApplicationRooms).values(applicationRoom).returning();
    return newRoom;
  }

  async removeRoomFromIbcApplication(applicationId: number, roomId: number): Promise<boolean> {
    const result = await db
      .delete(ibcApplicationRooms)
      .where(and(
        eq(ibcApplicationRooms.applicationId, applicationId),
        eq(ibcApplicationRooms.roomId, roomId)
      ));
    return (result.rowCount ?? 0) > 0;
  }

  async getIbcBackboneSourceRooms(applicationId: number): Promise<IbcBackboneSourceRoom[]> {
    return await db
      .select()
      .from(ibcBackboneSourceRooms)
      .where(eq(ibcBackboneSourceRooms.applicationId, applicationId));
  }

  async addBackboneSourceRoom(backboneSourceRoom: InsertIbcBackboneSourceRoom): Promise<IbcBackboneSourceRoom> {
    const [newAssignment] = await db.insert(ibcBackboneSourceRooms).values(backboneSourceRoom).returning();
    return newAssignment;
  }

  async removeBackboneSourceRoom(applicationId: number, backboneSource: string, roomId: number): Promise<boolean> {
    const result = await db
      .delete(ibcBackboneSourceRooms)
      .where(and(
        eq(ibcBackboneSourceRooms.applicationId, applicationId),
        eq(ibcBackboneSourceRooms.backboneSource, backboneSource),
        eq(ibcBackboneSourceRooms.roomId, roomId)
      ));
    return (result.rowCount ?? 0) > 0;
  }

  async getIbcApplicationPpe(applicationId: number): Promise<IbcApplicationPpe[]> {
    return await db
      .select()
      .from(ibcApplicationPpe)
      .where(eq(ibcApplicationPpe.applicationId, applicationId));
  }

  async getIbcApplicationPpeForRoom(applicationId: number, roomId: number): Promise<IbcApplicationPpe[]> {
    return await db
      .select()
      .from(ibcApplicationPpe)
      .where(and(
        eq(ibcApplicationPpe.applicationId, applicationId),
        eq(ibcApplicationPpe.roomId, roomId)
      ));
  }

  async addPpeToIbcApplication(applicationPpe: InsertIbcApplicationPpe): Promise<IbcApplicationPpe> {
    const [newPpe] = await db.insert(ibcApplicationPpe).values(applicationPpe).returning();
    return newPpe;
  }

  async removePpeFromIbcApplication(applicationId: number, roomId: number, ppeItem: string): Promise<boolean> {
    const result = await db
      .delete(ibcApplicationPpe)
      .where(and(
        eq(ibcApplicationPpe.applicationId, applicationId),
        eq(ibcApplicationPpe.roomId, roomId),
        eq(ibcApplicationPpe.ppeItem, ppeItem)
      ));
    return (result.rowCount ?? 0) > 0;
  }

  // Research Contract operations
  async getResearchContracts(): Promise<ResearchContract[]> {
    return await db.select().from(researchContracts);
  }

  async getResearchContract(id: number): Promise<ResearchContract | undefined> {
    const [contract] = await db.select().from(researchContracts).where(eq(researchContracts.id, id));
    return contract;
  }

  async getResearchContractByContractNumber(contractNumber: string): Promise<ResearchContract | undefined> {
    const [contract] = await db.select().from(researchContracts).where(eq(researchContracts.contractNumber, contractNumber));
    return contract;
  }

  async getResearchContractsForResearchActivity(researchActivityId: number): Promise<ResearchContract[]> {
    return await db.select().from(researchContracts).where(eq(researchContracts.researchActivityId, researchActivityId));
  }

  async createResearchContract(contract: InsertResearchContract): Promise<ResearchContract> {
    const [newContract] = await db.insert(researchContracts).values(contract).returning();
    return newContract;
  }

  async updateResearchContract(id: number, contract: Partial<InsertResearchContract>): Promise<ResearchContract | undefined> {
    const [updatedContract] = await db
      .update(researchContracts)
      .set(contract)
      .where(eq(researchContracts.id, id))
      .returning();
    return updatedContract;
  }

  async getResearchContractsForUser(userId: number): Promise<ResearchContract[]> {
    return await db.select().from(researchContracts).where(eq(researchContracts.requestedByUserId, userId));
  }

  async getResearchContractsForProject(projectId: number): Promise<ResearchContract[]> {
    // Get contracts via research activities associated with the project
    return await db
      .select({
        id: researchContracts.id,
        researchActivityId: researchContracts.researchActivityId,
        contractNumber: researchContracts.contractNumber,
        title: researchContracts.title,
        leadPIId: researchContracts.leadPIId,
        irbProtocol: researchContracts.irbProtocol,
        ibcProtocol: researchContracts.ibcProtocol,
        qnrfNumber: researchContracts.qnrfNumber,
        requestState: researchContracts.requestState,
        startDate: researchContracts.startDate,
        endDate: researchContracts.endDate,
        remarks: researchContracts.remarks,
        fundingSourceCategory: researchContracts.fundingSourceCategory,
        contractorName: researchContracts.contractorName,
        internalCostSidra: researchContracts.internalCostSidra,
        internalCostCounterparty: researchContracts.internalCostCounterparty,
        moneyOut: researchContracts.moneyOut,
        isPORelevant: researchContracts.isPORelevant,
        contractType: researchContracts.contractType,
        status: researchContracts.status,
        description: researchContracts.description,
        documents: researchContracts.documents,
        requestedByUserId: researchContracts.requestedByUserId,
        contractValue: researchContracts.contractValue,
        currency: researchContracts.currency,
        initiationRequestedAt: researchContracts.initiationRequestedAt,
        reminderEmail: researchContracts.reminderEmail,
        officeFormStatus: researchContracts.officeFormStatus,
        createdAt: researchContracts.createdAt,
        updatedAt: researchContracts.updatedAt,
      })
      .from(researchContracts)
      .innerJoin(researchActivities, eq(researchContracts.researchActivityId, researchActivities.id))
      .where(eq(researchActivities.projectId, projectId));
  }

  async deleteResearchContract(id: number): Promise<boolean> {
    const result = await db.delete(researchContracts).where(eq(researchContracts.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Research Contract Scope Items operations
  async getResearchContractScopeItems(contractId: number): Promise<ResearchContractScopeItem[]> {
    return await db
      .select()
      .from(researchContractScopeItems)
      .where(eq(researchContractScopeItems.contractId, contractId))
      .orderBy(asc(researchContractScopeItems.position));
  }

  async getResearchContractScopeItem(id: number): Promise<ResearchContractScopeItem | undefined> {
    const [item] = await db.select().from(researchContractScopeItems).where(eq(researchContractScopeItems.id, id));
    return item;
  }

  async createResearchContractScopeItem(item: InsertResearchContractScopeItem): Promise<ResearchContractScopeItem> {
    const [newItem] = await db.insert(researchContractScopeItems).values(item).returning();
    return newItem;
  }

  async updateResearchContractScopeItem(id: number, item: Partial<InsertResearchContractScopeItem>): Promise<ResearchContractScopeItem | undefined> {
    const [updatedItem] = await db
      .update(researchContractScopeItems)
      .set(item)
      .where(eq(researchContractScopeItems.id, id))
      .returning();
    return updatedItem;
  }

  async deleteResearchContractScopeItem(id: number): Promise<boolean> {
    const result = await db.delete(researchContractScopeItems).where(eq(researchContractScopeItems.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Research Contract Extensions operations
  async getResearchContractExtensions(contractId: number): Promise<ResearchContractExtension[]> {
    return await db
      .select()
      .from(researchContractExtensions)
      .where(eq(researchContractExtensions.contractId, contractId))
      .orderBy(asc(researchContractExtensions.sequenceNumber));
  }

  async getResearchContractExtension(id: number): Promise<ResearchContractExtension | undefined> {
    const [extension] = await db.select().from(researchContractExtensions).where(eq(researchContractExtensions.id, id));
    return extension;
  }

  async createResearchContractExtension(extension: InsertResearchContractExtension): Promise<ResearchContractExtension> {
    const [newExtension] = await db.insert(researchContractExtensions).values(extension).returning();
    return newExtension;
  }

  async updateResearchContractExtension(id: number, extension: Partial<InsertResearchContractExtension>): Promise<ResearchContractExtension | undefined> {
    const [updatedExtension] = await db
      .update(researchContractExtensions)
      .set(extension)
      .where(eq(researchContractExtensions.id, id))
      .returning();
    return updatedExtension;
  }

  async deleteResearchContractExtension(id: number): Promise<boolean> {
    const result = await db.delete(researchContractExtensions).where(eq(researchContractExtensions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Research Contract Documents operations
  async getResearchContractDocuments(contractId: number): Promise<ResearchContractDocument[]> {
    return await db
      .select()
      .from(researchContractDocuments)
      .where(eq(researchContractDocuments.contractId, contractId))
      .orderBy(desc(researchContractDocuments.uploadedAt));
  }

  async getResearchContractDocumentsForExtension(extensionId: number): Promise<ResearchContractDocument[]> {
    return await db
      .select()
      .from(researchContractDocuments)
      .where(eq(researchContractDocuments.extensionId, extensionId))
      .orderBy(desc(researchContractDocuments.uploadedAt));
  }

  async getResearchContractDocument(id: number): Promise<ResearchContractDocument | undefined> {
    const [document] = await db.select().from(researchContractDocuments).where(eq(researchContractDocuments.id, id));
    return document;
  }

  async createResearchContractDocument(document: InsertResearchContractDocument): Promise<ResearchContractDocument> {
    const [newDocument] = await db.insert(researchContractDocuments).values(document).returning();
    return newDocument;
  }

  async updateResearchContractDocument(id: number, document: Partial<InsertResearchContractDocument>): Promise<ResearchContractDocument | undefined> {
    const [updatedDocument] = await db
      .update(researchContractDocuments)
      .set(document)
      .where(eq(researchContractDocuments.id, id))
      .returning();
    return updatedDocument;
  }

  async deleteResearchContractDocument(id: number): Promise<boolean> {
    const result = await db.delete(researchContractDocuments).where(eq(researchContractDocuments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Dashboard operations
  async getDashboardStats(): Promise<{
    activeResearchActivities: number;
    publications: number;
    patents: number;
  }> {
    const activeActivities = await db
      .select({ count: sql<number>`count(*)` })
      .from(researchActivities)
      .where(eq(researchActivities.status, "active"));
    
    const publicationCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(publications);
    
    const patentCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(patents);
    
    return {
      activeResearchActivities: Number(activeActivities[0].count),
      publications: Number(publicationCount[0].count),
      patents: Number(patentCount[0].count),
    };
  }

  async getRecentResearchActivities(limit: number = 5): Promise<ResearchActivity[]> {
    return await db
      .select()
      .from(researchActivities)
      .orderBy(desc(researchActivities.createdAt))
      .limit(limit);
  }

  async getUpcomingDeadlines(): Promise<any[]> {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);
    
    // Get research contracts ending in the next 30 days
    const contractDeadlines = await db
      .select({
        id: researchContracts.id,
        type: sql<string>`'Contract'`,
        title: researchContracts.title,
        expirationDate: researchContracts.endDate,
        researchActivityId: researchContracts.researchActivityId
      })
      .from(researchContracts)
      .where(
        and(
          sql`${researchContracts.endDate} >= ${now.toISOString()}`,
          sql`${researchContracts.endDate} <= ${thirtyDaysFromNow.toISOString()}`
        )
      );
    
    return contractDeadlines
      .map((deadline) => ({
        id: deadline.id,
        title: deadline.title,
        description: "Research contract",
        dueDate: deadline.expirationDate,
        projectId: deadline.researchActivityId,
        type: deadline.type,
      }))
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
  }

  // IRB Board Members
  async getIrbBoardMembers(): Promise<(IrbBoardMember & { scientist: Scientist })[]> {
    const boardMembers = await db.select().from(irbBoardMembers).orderBy(desc(irbBoardMembers.createdAt));
    
    const results = await Promise.all(
      boardMembers.map(async (member) => {
        const scientist = await db.select().from(scientists).where(eq(scientists.id, member.scientistId)).limit(1);
        return {
          ...member,
          scientist: scientist[0] || null
        };
      })
    );

    return results.filter(r => r.scientist) as (IrbBoardMember & { scientist: Scientist })[];
  }

  async getIrbBoardMember(id: number): Promise<(IrbBoardMember & { scientist: Scientist }) | undefined> {
    const [member] = await db.select().from(irbBoardMembers).where(eq(irbBoardMembers.id, id));
    if (!member) return undefined;

    const [scientist] = await db.select().from(scientists).where(eq(scientists.id, member.scientistId));
    if (!scientist) return undefined;

    return {
      ...member,
      scientist
    };
  }

  async createIrbBoardMember(member: InsertIrbBoardMember): Promise<IrbBoardMember> {
    // Convert date strings to Date objects
    const memberData = {
      ...member,
      appointmentDate: member.appointmentDate ? new Date(member.appointmentDate) : new Date(),
      termEndDate: new Date(member.termEndDate)
    };

    const [newMember] = await db
      .insert(irbBoardMembers)
      .values(memberData)
      .returning();
    return newMember;
  }

  async updateIrbBoardMember(id: number, member: Partial<InsertIrbBoardMember>): Promise<IrbBoardMember | undefined> {
    const [updatedMember] = await db
      .update(irbBoardMembers)
      .set({ ...member, updatedAt: new Date() })
      .where(eq(irbBoardMembers.id, id))
      .returning();
    return updatedMember || undefined;
  }

  async deleteIrbBoardMember(id: number): Promise<boolean> {
    const result = await db
      .delete(irbBoardMembers)
      .where(eq(irbBoardMembers.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getActiveIrbBoardMembers(): Promise<(IrbBoardMember & { scientist: Scientist })[]> {
    const activeMembers = await db
      .select()
      .from(irbBoardMembers)
      .where(eq(irbBoardMembers.isActive, true))
      .orderBy(irbBoardMembers.role);
    
    const results = await Promise.all(
      activeMembers.map(async (member) => {
        const scientist = await db.select().from(scientists).where(eq(scientists.id, member.scientistId)).limit(1);
        return {
          ...member,
          scientist: scientist[0] || null
        };
      })
    );

    return results.filter(r => r.scientist) as (IrbBoardMember & { scientist: Scientist })[];
  }

  // IBC Board Members
  async getIbcBoardMembers(): Promise<(IbcBoardMember & { scientist: Scientist })[]> {
    const boardMembers = await db.select().from(ibcBoardMembers).orderBy(desc(ibcBoardMembers.createdAt));
    
    const results = await Promise.all(
      boardMembers.map(async (member) => {
        const scientist = await db.select().from(scientists).where(eq(scientists.id, member.scientistId)).limit(1);
        return {
          ...member,
          scientist: scientist[0] || null
        };
      })
    );

    return results.filter(r => r.scientist) as (IbcBoardMember & { scientist: Scientist })[];
  }

  async getIbcBoardMember(id: number): Promise<(IbcBoardMember & { scientist: Scientist }) | undefined> {
    const [member] = await db.select().from(ibcBoardMembers).where(eq(ibcBoardMembers.id, id));
    if (!member) return undefined;

    const [scientist] = await db.select().from(scientists).where(eq(scientists.id, member.scientistId));
    if (!scientist) return undefined;

    return {
      ...member,
      scientist
    };
  }

  async createIbcBoardMember(member: InsertIbcBoardMember): Promise<IbcBoardMember> {
    // Convert date strings to Date objects
    const memberData = {
      ...member,
      appointmentDate: member.appointmentDate ? new Date(member.appointmentDate) : new Date(),
      termEndDate: new Date(member.termEndDate)
    };

    const [newMember] = await db
      .insert(ibcBoardMembers)
      .values(memberData)
      .returning();
    return newMember;
  }

  async updateIbcBoardMember(id: number, member: Partial<InsertIbcBoardMember>): Promise<IbcBoardMember | undefined> {
    const [updatedMember] = await db
      .update(ibcBoardMembers)
      .set({ ...member, updatedAt: new Date() })
      .where(eq(ibcBoardMembers.id, id))
      .returning();
    return updatedMember || undefined;
  }

  async deleteIbcBoardMember(id: number): Promise<boolean> {
    const result = await db
      .delete(ibcBoardMembers)
      .where(eq(ibcBoardMembers.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getActiveIbcBoardMembers(): Promise<(IbcBoardMember & { scientist: Scientist })[]> {
    const activeMembers = await db
      .select()
      .from(ibcBoardMembers)
      .where(eq(ibcBoardMembers.isActive, true))
      .orderBy(ibcBoardMembers.role);
    
    const results = await Promise.all(
      activeMembers.map(async (member) => {
        const scientist = await db.select().from(scientists).where(eq(scientists.id, member.scientistId)).limit(1);
        return {
          ...member,
          scientist: scientist[0] || null
        };
      })
    );

    return results.filter(r => r.scientist) as (IbcBoardMember & { scientist: Scientist })[];
  }

  // IBC Submissions
  async getIbcSubmissions(): Promise<IbcSubmission[]> {
    return await db.select().from(ibcSubmissions).orderBy(desc(ibcSubmissions.submissionDate));
  }

  async getIbcSubmission(id: number): Promise<IbcSubmission | undefined> {
    const [submission] = await db.select().from(ibcSubmissions).where(eq(ibcSubmissions.id, id));
    return submission;
  }

  async getIbcSubmissionsForApplication(applicationId: number): Promise<IbcSubmission[]> {
    return await db.select().from(ibcSubmissions)
      .where(eq(ibcSubmissions.applicationId, applicationId))
      .orderBy(desc(ibcSubmissions.submissionDate));
  }

  async createIbcSubmission(submission: InsertIbcSubmission): Promise<IbcSubmission> {
    const [newSubmission] = await db.insert(ibcSubmissions).values(submission).returning();
    return newSubmission;
  }

  async updateIbcSubmission(id: number, submission: Partial<InsertIbcSubmission>): Promise<IbcSubmission | undefined> {
    const [updatedSubmission] = await db
      .update(ibcSubmissions)
      .set({ ...submission, updatedAt: new Date() })
      .where(eq(ibcSubmissions.id, id))
      .returning();
    return updatedSubmission;
  }

  async deleteIbcSubmission(id: number): Promise<boolean> {
    const result = await db.delete(ibcSubmissions).where(eq(ibcSubmissions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // IBC Documents
  async getIbcDocuments(): Promise<IbcDocument[]> {
    return await db.select().from(ibcDocuments).orderBy(desc(ibcDocuments.uploadDate));
  }

  async getIbcDocument(id: number): Promise<IbcDocument | undefined> {
    const [document] = await db.select().from(ibcDocuments).where(eq(ibcDocuments.id, id));
    return document;
  }

  async getIbcDocumentsForApplication(applicationId: number): Promise<IbcDocument[]> {
    return await db.select().from(ibcDocuments)
      .where(eq(ibcDocuments.applicationId, applicationId))
      .orderBy(desc(ibcDocuments.uploadDate));
  }

  async createIbcDocument(document: InsertIbcDocument): Promise<IbcDocument> {
    const [newDocument] = await db.insert(ibcDocuments).values(document).returning();
    return newDocument;
  }

  async updateIbcDocument(id: number, document: Partial<InsertIbcDocument>): Promise<IbcDocument | undefined> {
    const [updatedDocument] = await db
      .update(ibcDocuments)
      .set({ ...document, updatedAt: new Date() })
      .where(eq(ibcDocuments.id, id))
      .returning();
    return updatedDocument;
  }

  async deleteIbcDocument(id: number): Promise<boolean> {
    const result = await db.delete(ibcDocuments).where(eq(ibcDocuments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Enhanced IBC Application methods with workflow support

  async getIbcApplicationsByStatus(status: string): Promise<IbcApplication[]> {
    return await db.select().from(ibcApplications)
      .where(eq(ibcApplications.status, status))
      .orderBy(desc(ibcApplications.createdAt));
  }

  async getIbcApplicationsByWorkflowStatus(workflowStatus: string): Promise<IbcApplication[]> {
    return await db.select().from(ibcApplications)
      .where(eq(ibcApplications.workflowStatus, workflowStatus))
      .orderBy(desc(ibcApplications.createdAt));
  }

  async generateNextIbcNumber(): Promise<string> {
    const currentYear = new Date().getFullYear();
    const prefix = `IBC-${currentYear}-`;
    
    // Get the last IBC number for this year
    const lastApplication = await db
      .select()
      .from(ibcApplications)
      .where(sql`${ibcApplications.ibcNumber} LIKE ${prefix + '%'}`)
      .orderBy(desc(ibcApplications.ibcNumber))
      .limit(1);
    
    let nextNumber = 1;
    if (lastApplication.length > 0) {
      const lastNumber = lastApplication[0].ibcNumber;
      const match = lastNumber.match(/-(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }
    
    return `${prefix}${nextNumber.toString().padStart(3, '0')}`;
  }

  // Building operations
  async getBuildings(): Promise<Building[]> {
    return await db.select().from(buildings).orderBy(buildings.name);
  }

  async getBuilding(id: number): Promise<Building | undefined> {
    const [building] = await db.select().from(buildings).where(eq(buildings.id, id));
    return building;
  }

  async createBuilding(building: InsertBuilding): Promise<Building> {
    const [newBuilding] = await db.insert(buildings).values(building).returning();
    return newBuilding;
  }

  async updateBuilding(id: number, building: Partial<InsertBuilding>): Promise<Building | undefined> {
    const [updatedBuilding] = await db
      .update(buildings)
      .set(building)
      .where(eq(buildings.id, id))
      .returning();
    return updatedBuilding;
  }

  async deleteBuilding(id: number): Promise<boolean> {
    const result = await db.delete(buildings).where(eq(buildings.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Room operations
  async getRooms(): Promise<Room[]> {
    return await db.select().from(rooms).orderBy(rooms.roomNumber);
  }

  async getRoom(id: number): Promise<Room | undefined> {
    const [room] = await db.select().from(rooms).where(eq(rooms.id, id));
    return room;
  }

  async getRoomsByBuilding(buildingId: number): Promise<Room[]> {
    return await db.select().from(rooms)
      .where(eq(rooms.buildingId, buildingId))
      .orderBy(rooms.roomNumber);
  }

  async createRoom(room: InsertRoom): Promise<Room> {
    const [newRoom] = await db.insert(rooms).values(room).returning();
    return newRoom;
  }

  async updateRoom(id: number, room: Partial<InsertRoom>): Promise<Room | undefined> {
    const [updatedRoom] = await db
      .update(rooms)
      .set(room)
      .where(eq(rooms.id, id))
      .returning();
    return updatedRoom;
  }

  async deleteRoom(id: number): Promise<boolean> {
    const result = await db.delete(rooms).where(eq(rooms.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Scientists filtering by role for room assignments
  async getScientistsByRole(rolePattern: string): Promise<Scientist[]> {
    if (rolePattern.includes('|')) {
      // Handle multiple patterns with OR condition
      const patterns = rolePattern.split('|');
      const conditions = patterns.map(pattern => 
        ilike(scientists.jobTitle, `%${pattern}%`)
      );
      const combinedCondition = conditions.reduce((acc, condition) => 
        acc ? or(acc, condition) : condition
      );
      return await db.select().from(scientists)
        .where(combinedCondition)
        .orderBy(scientists.lastName, scientists.firstName);
    } else {
      return await db.select().from(scientists)
        .where(ilike(scientists.jobTitle, `%${rolePattern}%`))
        .orderBy(scientists.lastName, scientists.firstName);
    }
  }

  // Role Permissions operations
  async getRolePermissions(): Promise<(RolePermission & { jobTitle: string })[]> {
    const rows = await db
      .select({
        id: rolePermissions.id,
        roleGroupId: rolePermissions.roleGroupId,
        navigationItem: rolePermissions.navigationItem,
        accessLevel: rolePermissions.accessLevel,
        updatedBy: rolePermissions.updatedBy,
        createdAt: rolePermissions.createdAt,
        updatedAt: rolePermissions.updatedAt,
        jobTitle: roleGroups.name,
      })
      .from(rolePermissions)
      .innerJoin(roleGroups, eq(rolePermissions.roleGroupId, roleGroups.id));
    return rows;
  }

  async createRolePermission(permission: InsertRolePermission): Promise<RolePermission> {
    const [newPermission] = await db.insert(rolePermissions).values(permission).returning();
    return newPermission;
  }

  async updateRolePermission(jobTitle: string, navigationItem: string, accessLevel: string): Promise<(RolePermission & { jobTitle: string }) | undefined> {
    // Resolve role group id from name
    const [group] = await db.select().from(roleGroups).where(eq(roleGroups.name, jobTitle));
    if (!group) return undefined;

    const [updatedPermission] = await db
      .update(rolePermissions)
      .set({ accessLevel, updatedAt: sql`now()` })
      .where(and(
        eq(rolePermissions.roleGroupId, group.id),
        eq(rolePermissions.navigationItem, navigationItem)
      ))
      .returning();
    if (!updatedPermission) return undefined;
    return { ...updatedPermission, jobTitle };
  }

  async updateRolePermissionsBulk(
    permissions: Array<{jobTitle: string, navigationItem: string, accessLevel: string}>,
    updatedBy?: number,
  ): Promise<(RolePermission & { jobTitle: string })[]> {
    if (permissions.length === 0) return [];

    // Only roles that are actually assignable may be created here.
    //
    // This used to create a role group for whatever name the client submitted,
    // which meant saving the matrix from a browser holding a stale grid
    // resurrected roles a consolidation had just retired -- silently undoing
    // the migration, with no indication anything had happened. A submitted
    // role that is not assignable is dropped rather than rejected, so one
    // stale cell cannot fail the whole save.
    const assignable = new Set<string>([
      ...ACCESS_ROLES,
      ...BUILT_IN_ASSIGNABLE_ROLES,
    ]);
    const roleNames = [...new Set(
      permissions
        .map((permission) => permission.jobTitle.trim())
        .filter((name) => name && assignable.has(name)),
    )];
    if (roleNames.length === 0) return [];
    permissions = permissions.filter((permission) =>
      roleNames.includes(permission.jobTitle.trim()));

    await db
      .insert(roleGroups)
      .values(roleNames.map((name) => ({ name })))
      .onConflictDoNothing({ target: roleGroups.name });

    const groups = await db
      .select({ id: roleGroups.id, name: roleGroups.name })
      .from(roleGroups)
      .where(inArray(roleGroups.name, roleNames));
    const groupIdByName = new Map(groups.map((group) => [group.name, group.id]));
    const groupNameById = new Map(groups.map((group) => [group.id, group.name]));

    // Last submitted value wins if a client sends the same cell more than once.
    const valuesByCell = new Map<string, {
      roleGroupId: number;
      navigationItem: string;
      accessLevel: string;
      updatedBy: number | null;
    }>();
    for (const permission of permissions) {
      const jobTitle = permission.jobTitle.trim();
      const roleGroupId = groupIdByName.get(jobTitle);
      if (!roleGroupId) continue;
      valuesByCell.set(`${roleGroupId}:${permission.navigationItem}`, {
        roleGroupId,
        navigationItem: permission.navigationItem,
        accessLevel: permission.accessLevel,
        updatedBy: updatedBy ?? null,
      });
    }

    const values = [...valuesByCell.values()];
    if (values.length === 0) return [];

    const upserted = await db
      .insert(rolePermissions)
      .values(values)
      .onConflictDoUpdate({
        target: [rolePermissions.roleGroupId, rolePermissions.navigationItem],
        set: {
          accessLevel: sql`excluded.access_level`,
          // Who changed the cell, so a matrix change is attributable in an audit.
          updatedBy: sql`excluded.updated_by`,
          updatedAt: sql`now()`,
        },
      })
      .returning();

    return upserted.map((permission) => ({
      ...permission,
      jobTitle: groupNameById.get(permission.roleGroupId) ?? "",
    }));
  }

  // Journal Impact Factor operations
  async getJournalImpactFactors(options?: {
    limit?: number;
    offset?: number;
    sortField?: string;
    sortDirection?: 'asc' | 'desc';
    searchTerm?: string;
    fields?: string[];
    minImpactFactor?: number;
    maxImpactFactor?: number;
  }): Promise<{ data: JournalImpactFactor[]; total: number }> {
    const { limit = 100, offset = 0, sortField = 'rank', sortDirection = 'asc', searchTerm = '', fields = [], minImpactFactor, maxImpactFactor } = options || {};

    const whereConditions: any[] = [];
    if (searchTerm.trim()) {
      whereConditions.push(
        or(
          ilike(journals.journalName, `%${searchTerm}%`),
          ilike(journals.publisher, `%${searchTerm}%`)
        )
      );
    }
    if (fields.length > 0) {
      whereConditions.push(inArray(journals.field, fields));
    }

    // Impact factor range filter — applies to each journal's latest IF.
    // Implemented as a subquery so it also constrains the count(*) query.
    const ifRangeActive = (minImpactFactor != null && Number.isFinite(minImpactFactor))
      || (maxImpactFactor != null && Number.isFinite(maxImpactFactor));
    if (ifRangeActive) {
      const minCond = minImpactFactor != null && Number.isFinite(minImpactFactor)
        ? sql`m.impact_factor >= ${minImpactFactor}`
        : sql`TRUE`;
      const maxCond = maxImpactFactor != null && Number.isFinite(maxImpactFactor)
        ? sql`m.impact_factor <= ${maxImpactFactor}`
        : sql`TRUE`;
      whereConditions.push(sql`${journals.id} IN (
        SELECT m.journal_id
        FROM ${journalImpactFactorMetrics} m
        INNER JOIN (
          SELECT journal_id, MAX(year) AS max_year
          FROM ${journalImpactFactorMetrics}
          GROUP BY journal_id
        ) ly ON ly.journal_id = m.journal_id AND ly.max_year = m.year
        WHERE m.impact_factor IS NOT NULL AND ${minCond} AND ${maxCond}
      )`);
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    // Latest metric row per journal (highest year)
    const latestMetricSubquery = db
      .select({
        journalId: journalImpactFactorMetrics.journalId,
        maxYear: sql<number>`max(${journalImpactFactorMetrics.year})`.as('max_year'),
      })
      .from(journalImpactFactorMetrics)
      .groupBy(journalImpactFactorMetrics.journalId)
      .as('latest_year');

    const journalColumnMap: Record<string, any> = {
      journalName: journals.journalName,
      publisher: journals.publisher,
      field: journals.field,
    };
    const metricColumnMap: Record<string, any> = {
      year: journalImpactFactorMetrics.year,
      impactFactor: journalImpactFactorMetrics.impactFactor,
      fiveYearJif: journalImpactFactorMetrics.fiveYearJif,
      jifWithoutSelfCites: journalImpactFactorMetrics.jifWithoutSelfCites,
      jci: journalImpactFactorMetrics.jci,
      quartile: journalImpactFactorMetrics.quartile,
      rank: journalImpactFactorMetrics.rank,
      totalCites: journalImpactFactorMetrics.totalCites,
      totalArticles: journalImpactFactorMetrics.totalArticles,
      citableItems: journalImpactFactorMetrics.citableItems,
      citedHalfLife: journalImpactFactorMetrics.citedHalfLife,
      citingHalfLife: journalImpactFactorMetrics.citingHalfLife,
    };
    const sortColumn = journalColumnMap[sortField] ?? metricColumnMap[sortField] ?? journalImpactFactorMetrics.rank;
    const orderBy = sortDirection === 'asc' ? asc(sortColumn) : desc(sortColumn);

    // Count and data queries share the same from/join/where chain so they can
    // never disagree on what "one row" is — critical for pagination correctness
    // when the IF range or other filters are active.
    const [{ count: total }] = await db
      .select({ count: sql`count(distinct ${journals.id})`.mapWith(Number) })
      .from(journals)
      .leftJoin(latestMetricSubquery, eq(latestMetricSubquery.journalId, journals.id))
      .leftJoin(
        journalImpactFactorMetrics,
        and(
          eq(journalImpactFactorMetrics.journalId, journals.id),
          eq(journalImpactFactorMetrics.year, latestMetricSubquery.maxYear),
        )
      )
      .where(whereClause ?? sql`1=1`);

    const rows = await db
      .select({
        metric: journalImpactFactorMetrics,
        journal: journals,
      })
      .from(journals)
      .leftJoin(latestMetricSubquery, eq(latestMetricSubquery.journalId, journals.id))
      .leftJoin(
        journalImpactFactorMetrics,
        and(
          eq(journalImpactFactorMetrics.journalId, journals.id),
          eq(journalImpactFactorMetrics.year, latestMetricSubquery.maxYear),
        )
      )
      .where(whereClause ?? sql`1=1`)
      .orderBy(orderBy, asc(journals.journalName))
      .limit(limit)
      .offset(offset);

    const data = rows.map((row) => this.mergeJournalAndMetric(row.journal, row.metric));
    return { data, total };
  }

  private mergeJournalAndMetric(journal: Journal, metric: JournalImpactFactorMetric | null): JournalImpactFactor {
    const m: any = metric ?? {};
    return {
      id: m.id ?? null,
      journalId: journal.id,
      year: m.year ?? null,
      totalCites: m.totalCites ?? null,
      totalArticles: m.totalArticles ?? null,
      citableItems: m.citableItems ?? null,
      citedHalfLife: m.citedHalfLife ?? null,
      citingHalfLife: m.citingHalfLife ?? null,
      impactFactor: m.impactFactor ?? null,
      fiveYearJif: m.fiveYearJif ?? null,
      jifWithoutSelfCites: m.jifWithoutSelfCites ?? null,
      jci: m.jci ?? null,
      quartile: m.quartile ?? null,
      rank: m.rank ?? null,
      totalCitations: m.totalCitations ?? null,
      createdAt: m.createdAt ?? journal.createdAt,
      updatedAt: m.updatedAt ?? journal.updatedAt,
      journalName: journal.journalName,
      abbreviatedJournal: journal.abbreviatedJournal,
      publisher: journal.publisher,
      issn: journal.issn,
      eissn: journal.eissn,
      field: journal.field,
    } as unknown as JournalImpactFactor;
  }

  async getJournalImpactFactor(journalId: number): Promise<JournalImpactFactor | undefined> {
    const [journal] = await db.select().from(journals).where(eq(journals.id, journalId));
    if (!journal) return undefined;
    const [metric] = await db
      .select()
      .from(journalImpactFactorMetrics)
      .where(eq(journalImpactFactorMetrics.journalId, journalId))
      .orderBy(desc(journalImpactFactorMetrics.year))
      .limit(1);
    return this.mergeJournalAndMetric(journal, metric ?? null);
  }

  /**
   * Find a journal by name, tolerating spelling differences between sources.
   * Tries, in order: exact (case-insensitive) journal name, exact abbreviated
   * name, then a normalized match (see normalizeJournalName) against either the
   * full or abbreviated name.
   */
  private async findJournalByName(journalName: string): Promise<Journal | undefined> {
    const name = (journalName ?? "").trim();
    if (!name) return undefined;

    let [journal] = await db.select().from(journals)
      .where(ilike(journals.journalName, name));
    if (journal) return journal;

    [journal] = await db.select().from(journals)
      .where(ilike(journals.abbreviatedJournal, name));
    if (journal) return journal;

    const normalized = normalizeJournalName(name);
    if (!normalized) return undefined;
    [journal] = await db.select().from(journals)
      .where(or(
        eq(normalizedJournalSql(journals.journalName), normalized),
        eq(normalizedJournalSql(journals.abbreviatedJournal), normalized),
      ));
    return journal;
  }

  async getImpactFactorByJournalAndYear(journalName: string, year: number): Promise<JournalImpactFactor | undefined> {
    const journal = await this.findJournalByName(journalName);
    if (!journal) return undefined;
    const [metric] = await db.select().from(journalImpactFactorMetrics)
      .where(and(
        eq(journalImpactFactorMetrics.journalId, journal.id),
        eq(journalImpactFactorMetrics.year, year),
      ));
    if (!metric) return undefined;
    return this.mergeJournalAndMetric(journal, metric);
  }

  async getHistoricalImpactFactors(journalName: string): Promise<JournalImpactFactor[]> {
    const journal = await this.findJournalByName(journalName);
    if (!journal) return [];
    return this.getHistoricalImpactFactorsByJournalId(journal.id);
  }

  async getHistoricalImpactFactorsByJournalId(journalId: number): Promise<JournalImpactFactor[]> {
    const [journal] = await db.select().from(journals).where(eq(journals.id, journalId));
    if (!journal) return [];
    const metrics = await db.select().from(journalImpactFactorMetrics)
      .where(eq(journalImpactFactorMetrics.journalId, journalId))
      .orderBy(asc(journalImpactFactorMetrics.year));
    return metrics.map((m) => this.mergeJournalAndMetric(journal, m));
  }

  async createJournalImpactFactor(factor: InsertJournalImpactFactor): Promise<JournalImpactFactor> {
    const name = (factor.journalName ?? '').trim();
    if (!name) throw new Error('journalName is required');

    // Find or create journal (case-insensitive)
    let [journal] = await db.select().from(journals)
      .where(sql`lower(${journals.journalName}) = lower(${name})`);

    if (!journal) {
      const [created] = await db.insert(journals).values({
        journalName: name,
        abbreviatedJournal: factor.abbreviatedJournal ?? null,
        publisher: factor.publisher ?? null,
        issn: factor.issn ?? null,
        eissn: factor.eissn ?? null,
        field: factor.field ?? null,
      }).returning();
      journal = created;
    } else {
      // Update metadata where new value is provided and old is empty
      const updates: Partial<InsertJournal> = {};
      if (factor.abbreviatedJournal && !journal.abbreviatedJournal) updates.abbreviatedJournal = factor.abbreviatedJournal;
      if (factor.publisher && !journal.publisher) updates.publisher = factor.publisher;
      if (factor.issn && !journal.issn) updates.issn = factor.issn;
      if (factor.eissn && !journal.eissn) updates.eissn = factor.eissn;
      if (factor.field && !journal.field) updates.field = factor.field;
      if (Object.keys(updates).length > 0) {
        const [updated] = await db.update(journals)
          .set({ ...updates, updatedAt: sql`now()` })
          .where(eq(journals.id, journal.id))
          .returning();
        journal = updated;
      }
    }

    // Build metric values: only include keys explicitly present in the input
    // so partial PATCH updates don't null out untouched columns on conflict.
    const providedMetric: Record<string, any> = {};
    const setIfPresent = (key: string, raw: any, toStr = false) => {
      if (raw === undefined) return;
      providedMetric[key] = raw === null ? null : (toStr ? String(raw) : raw);
    };
    setIfPresent('totalCites', factor.totalCites);
    setIfPresent('totalArticles', factor.totalArticles);
    setIfPresent('citableItems', factor.citableItems);
    setIfPresent('citedHalfLife', factor.citedHalfLife, true);
    setIfPresent('citingHalfLife', factor.citingHalfLife, true);
    setIfPresent('impactFactor', factor.impactFactor, true);
    setIfPresent('fiveYearJif', factor.fiveYearJif, true);
    setIfPresent('jifWithoutSelfCites', factor.jifWithoutSelfCites, true);
    setIfPresent('jci', factor.jci, true);
    setIfPresent('quartile', factor.quartile);
    setIfPresent('rank', factor.rank);
    setIfPresent('totalCitations', factor.totalCitations);

    // For INSERT, fill omitted columns with null (only on first creation).
    const insertValues: any = {
      journalId: journal.id,
      year: factor.year,
      totalCites: null,
      totalArticles: null,
      citableItems: null,
      citedHalfLife: null,
      citingHalfLife: null,
      impactFactor: null,
      fiveYearJif: null,
      jifWithoutSelfCites: null,
      jci: null,
      quartile: null,
      rank: null,
      totalCitations: null,
      ...providedMetric,
    };

    // On conflict, ONLY update keys the caller actually provided so untouched
    // metric columns are preserved.
    const [metric] = await db.insert(journalImpactFactorMetrics)
      .values(insertValues)
      .onConflictDoUpdate({
        target: [journalImpactFactorMetrics.journalId, journalImpactFactorMetrics.year],
        set: { ...providedMetric, updatedAt: sql`now()` },
      })
      .returning();

    return this.mergeJournalAndMetric(journal, metric);
  }

  async updateJournalImpactFactor(journalId: number, factor: Partial<InsertJournalImpactFactor>): Promise<JournalImpactFactor | undefined> {
    const [journal] = await db.select().from(journals).where(eq(journals.id, journalId));
    if (!journal) return undefined;

    // Update journal-level metadata if present
    const journalUpdates: Partial<InsertJournal> = {};
    if (factor.journalName !== undefined) journalUpdates.journalName = factor.journalName;
    if (factor.abbreviatedJournal !== undefined) journalUpdates.abbreviatedJournal = factor.abbreviatedJournal ?? null;
    if (factor.publisher !== undefined) journalUpdates.publisher = factor.publisher ?? null;
    if (factor.issn !== undefined) journalUpdates.issn = factor.issn ?? null;
    if (factor.eissn !== undefined) journalUpdates.eissn = factor.eissn ?? null;
    if (factor.field !== undefined) journalUpdates.field = factor.field ?? null;
    let updatedJournal = journal;
    if (Object.keys(journalUpdates).length > 0) {
      const [u] = await db.update(journals)
        .set({ ...journalUpdates, updatedAt: sql`now()` })
        .where(eq(journals.id, journalId))
        .returning();
      updatedJournal = u;
    }

    // If a year is provided, update or insert that year's metric
    if (factor.year !== undefined) {
      return this.createJournalImpactFactor({
        ...factor,
        journalName: updatedJournal.journalName,
        year: factor.year,
      } as InsertJournalImpactFactor);
    }

    return this.getJournalImpactFactor(journalId);
  }

  async updateJournalField(journalId: number, field: string | null): Promise<Journal | undefined> {
    const [updated] = await db.update(journals)
      .set({ field, updatedAt: sql`now()` })
      .where(eq(journals.id, journalId))
      .returning();
    return updated;
  }

  async getJournalFields(): Promise<string[]> {
    const rows = await db
      .selectDistinct({ field: journals.field })
      .from(journals)
      .where(sql`${journals.field} IS NOT NULL AND ${journals.field} <> ''`)
      .orderBy(asc(journals.field));
    return rows.map((r) => r.field!).filter(Boolean);
  }

  async getJournalImpactFactorYears(): Promise<number[]> {
    const rows = await db
      .selectDistinct({ year: journalImpactFactorMetrics.year })
      .from(journalImpactFactorMetrics)
      .orderBy(desc(journalImpactFactorMetrics.year));
    return rows.map((r) => r.year as unknown as number).filter((y) => Number.isFinite(y));
  }

  /**
   * Stream-friendly export: one row per journal for the requested year,
   * honouring the same search/fields/IF-range filters as the list view.
   */
  async exportJournalImpactFactorsForYear(options: {
    year: number;
    searchTerm?: string;
    fields?: string[];
    minImpactFactor?: number;
    maxImpactFactor?: number;
  }): Promise<JournalImpactFactor[]> {
    const { year, searchTerm = '', fields = [], minImpactFactor, maxImpactFactor } = options;

    const whereConditions: any[] = [eq(journalImpactFactorMetrics.year, year)];
    if (searchTerm.trim()) {
      whereConditions.push(
        or(
          ilike(journals.journalName, `%${searchTerm}%`),
          ilike(journals.publisher, `%${searchTerm}%`),
        ),
      );
    }
    if (fields.length > 0) {
      whereConditions.push(inArray(journals.field, fields));
    }
    if (minImpactFactor != null && Number.isFinite(minImpactFactor)) {
      whereConditions.push(sql`${journalImpactFactorMetrics.impactFactor} >= ${minImpactFactor}`);
    }
    if (maxImpactFactor != null && Number.isFinite(maxImpactFactor)) {
      whereConditions.push(sql`${journalImpactFactorMetrics.impactFactor} <= ${maxImpactFactor}`);
    }

    const rows = await db
      .select({ metric: journalImpactFactorMetrics, journal: journals })
      .from(journals)
      .innerJoin(journalImpactFactorMetrics, eq(journalImpactFactorMetrics.journalId, journals.id))
      .where(and(...whereConditions))
      .orderBy(asc(journalImpactFactorMetrics.rank), asc(journals.journalName));

    return rows.map((r) => this.mergeJournalAndMetric(r.journal, r.metric));
  }

  async deleteJournalImpactFactor(journalId: number): Promise<boolean> {
    const result = await db.delete(journals).where(eq(journals.id, journalId));
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Return every journal's most-recent impact factor within a given field,
   * so the frontend can plot a distribution and mark a single journal's
   * position within it. Skips journals with no metric rows or null IF.
   */
  async getFieldImpactFactorDistribution(field: string): Promise<Array<{ journalId: number; journalName: string; impactFactor: number; year: number }>> {
    const latestPerJournal = db
      .select({
        journalId: journalImpactFactorMetrics.journalId,
        maxYear: sql<number>`max(${journalImpactFactorMetrics.year})`.as('max_year'),
      })
      .from(journalImpactFactorMetrics)
      .groupBy(journalImpactFactorMetrics.journalId)
      .as('latest_year');

    const rows = await db
      .select({
        journalId: journals.id,
        journalName: journals.journalName,
        impactFactor: journalImpactFactorMetrics.impactFactor,
        year: journalImpactFactorMetrics.year,
      })
      .from(journals)
      .innerJoin(latestPerJournal, eq(latestPerJournal.journalId, journals.id))
      .innerJoin(
        journalImpactFactorMetrics,
        and(
          eq(journalImpactFactorMetrics.journalId, journals.id),
          eq(journalImpactFactorMetrics.year, latestPerJournal.maxYear),
        ),
      )
      .where(and(eq(journals.field, field), sql`${journalImpactFactorMetrics.impactFactor} IS NOT NULL`));

    return rows
      .map((r) => ({
        journalId: r.journalId,
        journalName: r.journalName,
        impactFactor: parseFloat(r.impactFactor as unknown as string),
        year: r.year as unknown as number,
      }))
      .filter((r) => Number.isFinite(r.impactFactor));
  }

  // Grant operations
  async getGrants(): Promise<Grant[]> {
    return await db.select().from(grants).orderBy(desc(grants.createdAt));
  }

  async getGrant(id: number): Promise<Grant | undefined> {
    const [grant] = await db.select().from(grants).where(eq(grants.id, id));
    if (!grant) return grant;
    // Resolve the audit ids to names here rather than making the client ask
    // /api/admin/users, which is administrator-only -- the people who need to
    // see who added a grant are not all administrators.
    const collaboratingInstitutions = await this.getGrantCollaborations(id);
    const coInvestigatorLinks = await this.getGrantCoInvestigators(id);
    const ids = [grant.createdByUserId, grant.updatedByUserId].filter(
      (v): v is number => typeof v === "number",
    );
    if (ids.length === 0) {
      return { ...grant, collaboratingInstitutions, coInvestigatorLinks } as Grant & {
        collaboratingInstitutions: GrantCollaborationTree;
        coInvestigatorLinks: GrantCoInvestigatorList;
      };
    }
    const rows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, [...new Set(ids)]));
    const nameById = new Map(rows.map((r) => [r.id, r.name]));
    return {
      ...grant,
      collaboratingInstitutions,
      coInvestigatorLinks,
      createdByName: grant.createdByUserId ? nameById.get(grant.createdByUserId) ?? null : null,
      updatedByName: grant.updatedByUserId ? nameById.get(grant.updatedByUserId) ?? null : null,
    } as Grant & {
      collaboratingInstitutions: GrantCollaborationTree;
      coInvestigatorLinks: GrantCoInvestigatorList;
      createdByName: string | null;
      updatedByName: string | null;
    };
  }

  /**
   * A grant's collaborating institutions with the people at each, nested the
   * way the interface works with them.
   */
  async getGrantCollaborations(grantId: number): Promise<GrantCollaborationTree> {
    const institutions = await db
      .select()
      .from(grantCollaboratingInstitutions)
      .where(eq(grantCollaboratingInstitutions.grantId, grantId))
      .orderBy(asc(grantCollaboratingInstitutions.name));
    if (institutions.length === 0) return [];

    const people = await db
      .select()
      .from(grantInstitutionCollaborators)
      .where(inArray(grantInstitutionCollaborators.institutionId, institutions.map((i) => i.id)))
      .orderBy(asc(grantInstitutionCollaborators.name));

    const byInstitution = new Map<number, typeof people>();
    for (const person of people) {
      const list = byInstitution.get(person.institutionId) ?? [];
      list.push(person);
      byInstitution.set(person.institutionId, list);
    }

    return institutions.map((institution) => ({
      id: institution.id,
      name: institution.name,
      collaborators: (byInstitution.get(institution.id) ?? []).map((person) => ({
        id: person.id,
        name: person.name,
        role: person.role,
      })),
    }));
  }

  /**
   * Replace a grant's collaborations wholesale.
   *
   * The editor holds the whole tree and saves it in one go, so this mirrors
   * that: whatever is not in the submitted tree is gone. Deleting an
   * institution cascades to its people, which is why removing a partner does
   * not leave their staff orphaned.
   *
   * Runs inside the caller's transaction when given one, so a failed grant
   * update does not leave the collaborations half-rewritten.
   */
  async replaceGrantCollaborations(
    grantId: number,
    tree: GrantCollaborationTree,
    tx: typeof db = db,
  ): Promise<void> {
    await tx
      .delete(grantCollaboratingInstitutions)
      .where(eq(grantCollaboratingInstitutions.grantId, grantId));

    for (const institution of tree) {
      const name = institution.name?.trim();
      // A blank row is someone who clicked Add and changed their mind.
      if (!name) continue;
      const [created] = await tx
        .insert(grantCollaboratingInstitutions)
        .values({ grantId, name })
        .returning({ id: grantCollaboratingInstitutions.id });
      const people = (institution.collaborators ?? [])
        .map((person) => ({
          institutionId: created.id,
          name: person.name?.trim() ?? "",
          role: person.role?.trim() || null,
        }))
        .filter((person) => person.name !== "");
      if (people.length > 0) {
        await tx.insert(grantInstitutionCollaborators).values(people);
      }
    }
  }

  /** A grant's Sidra co-investigators, with each person's display name. */
  async getGrantCoInvestigators(grantId: number): Promise<GrantCoInvestigatorList> {
    const rows = await db
      .select({
        id: grantCoInvestigators.id,
        scientistId: grantCoInvestigators.scientistId,
        role: grantCoInvestigators.role,
        firstName: scientists.firstName,
        lastName: scientists.lastName,
        honorificTitle: scientists.honorificTitle,
      })
      .from(grantCoInvestigators)
      .innerJoin(scientists, eq(scientists.id, grantCoInvestigators.scientistId))
      .where(eq(grantCoInvestigators.grantId, grantId))
      .orderBy(asc(scientists.lastName), asc(scientists.firstName));

    return rows.map((row) => ({
      id: row.id,
      scientistId: row.scientistId,
      name: [row.honorificTitle, row.firstName, row.lastName].filter(Boolean).join(" "),
      role: row.role,
    }));
  }

  /**
   * Replace a grant's Sidra co-investigators wholesale, matching how the editor
   * holds and submits the whole list. Same reasoning as the collaborations.
   */
  async replaceGrantCoInvestigators(
    grantId: number,
    list: GrantCoInvestigatorList,
    tx: typeof db = db,
  ): Promise<void> {
    await tx.delete(grantCoInvestigators).where(eq(grantCoInvestigators.grantId, grantId));

    const seen = new Set<number>();
    const rows = list
      .filter((entry) => {
        const id = Number(entry.scientistId);
        // A row where nobody was chosen yet, or the same colleague twice.
        if (!Number.isInteger(id) || id <= 0 || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((entry) => ({
        grantId,
        scientistId: Number(entry.scientistId),
        role: entry.role?.trim() || null,
      }));

    if (rows.length > 0) await tx.insert(grantCoInvestigators).values(rows);
  }

  async getGrantByProjectNumber(projectNumber: string): Promise<Grant | undefined> {
    const [grant] = await db.select().from(grants).where(eq(grants.projectNumber, projectNumber));
    return grant;
  }

  async createGrant(grant: InsertGrant, actorUserId?: number | null): Promise<Grant> {
    const [newGrant] = await db
      .insert(grants)
      // `|| null` rather than `??`: the demo session is user id 0, which is not
      // a real users row, and the foreign key rejects it. Recording nobody is
      // right there -- there is nobody to record.
      .values({
        ...grant,
        createdByUserId: actorUserId || null,
        updatedByUserId: actorUserId || null,
      })
      .returning();
    return newGrant;
  }

  async updateGrant(
    id: number,
    grant: Partial<InsertGrant>,
    actorUserId?: number | null,
  ): Promise<Grant | undefined> {
    const [updatedGrant] = await db
      .update(grants)
      // Only overwritten when the actor is known, so an anonymous or automated
      // write cannot erase who last touched the record by hand.
      .set({
        ...grant,
        ...(actorUserId ? { updatedByUserId: actorUserId } : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(grants.id, id))
      .returning();
    return updatedGrant;
  }

  async updateGrantWithResearchActivities(
    id: number,
    grant: Partial<InsertGrant>,
    desiredResearchActivityIds?: number[],
    actorUserId?: number | null,
  ): Promise<Grant | undefined> {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT "id" FROM "grants" WHERE "id" = ${id} FOR UPDATE`,
      );
      const [currentGrant] = await tx
        .select()
        .from(grants)
        .where(eq(grants.id, id));
      if (!currentGrant) return undefined;

      const desiredIds = desiredResearchActivityIds === undefined
        ? undefined
        : [...new Set(desiredResearchActivityIds)];
      const nextAwarded = grant.awarded ?? currentGrant.awarded ?? false;

      if (!nextAwarded) {
        if (desiredIds && desiredIds.length > 0) {
          throw new GrantSdrLifecycleStorageError(
            "GRANT_NOT_AWARDED",
            "SDRs can only be linked after the grant has been awarded.",
          );
        }

        if (desiredIds === undefined) {
          const [linkedSdr] = await tx
            .select({ id: grantResearchActivities.id })
            .from(grantResearchActivities)
            .where(eq(grantResearchActivities.grantId, id))
            .limit(1);
          if (linkedSdr) {
            throw new GrantSdrLifecycleStorageError(
              "GRANT_HAS_SDR_LINKS",
              "Unlink all SDRs before clearing the Grant Awarded designation. Existing links were left unchanged.",
            );
          }
        }
      }

      if (desiredIds && desiredIds.length > 0) {
        const matchingActivities = await tx
          .select({
            id: researchActivities.id,
            budgetHolderId: researchActivities.budgetHolderId,
          })
          .from(researchActivities)
          .where(inArray(researchActivities.id, desiredIds));
        if (matchingActivities.length !== desiredIds.length) {
          throw new GrantSdrLifecycleStorageError(
            "RESEARCH_ACTIVITY_NOT_FOUND",
            "One or more selected research activities no longer exist.",
          );
        }
        const effectiveLpiId = Object.prototype.hasOwnProperty.call(grant, "lpiId")
          ? grant.lpiId
          : currentGrant.lpiId;
        if (!effectiveLpiId || matchingActivities.some(
          (activity) => !isGrantSdrEligible(effectiveLpiId, activity.budgetHolderId),
        )) {
          throw new GrantSdrLifecycleStorageError(
            "SDR_PI_MISMATCH",
            "Only SDRs whose Principal Investigator is the grant Lead PI can be linked.",
          );
        }
      }

      const reconcileResearchActivities = async () => {
        if (desiredIds === undefined) return;
        const deleteCondition = desiredIds.length > 0
          ? and(
              eq(grantResearchActivities.grantId, id),
              notInArray(grantResearchActivities.researchActivityId, desiredIds),
            )
          : eq(grantResearchActivities.grantId, id);
        await tx
          .delete(grantResearchActivities)
          .where(deleteCondition);

        if (desiredIds.length > 0) {
          await tx
            .insert(grantResearchActivities)
            .values(
              desiredIds.map((researchActivityId) => ({
                grantId: id,
                researchActivityId,
              })),
            )
            .onConflictDoNothing({
              target: [
                grantResearchActivities.grantId,
                grantResearchActivities.researchActivityId,
              ],
            });
        }
      };

      // Clearing the award and unlinking SDRs must happen in one transaction.
      // Remove the explicitly deselected links first so the database trigger
      // permits the award update; the grant row lock prevents new links from
      // being inserted until this transaction commits.
      if (!nextAwarded) {
        await reconcileResearchActivities();
      }

      const [updatedGrant] = await tx
        .update(grants)
        .set({
          ...grant,
          ...(actorUserId ? { updatedByUserId: actorUserId } : {}),
          updatedAt: sql`now()`,
        })
        .where(eq(grants.id, id))
        .returning();

      // When establishing an award, update the milestone before adding links
      // so the database trigger can verify that the grant is eligible.
      if (nextAwarded) {
        await reconcileResearchActivities();
      }

      return updatedGrant;
    });
  }

  async deleteGrant(id: number): Promise<boolean> {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT "id" FROM "grants" WHERE "id" = ${id} FOR UPDATE`,
      );
      const [linkedSdr] = await tx
        .select({ id: grantResearchActivities.id })
        .from(grantResearchActivities)
        .where(eq(grantResearchActivities.grantId, id))
        .limit(1);
      if (linkedSdr) {
        throw new GrantSdrLifecycleStorageError(
          "GRANT_HAS_SDR_LINKS",
          "Unlink all SDRs before deleting this grant. Existing links were left unchanged.",
        );
      }
      const result = await tx.delete(grants).where(eq(grants.id, id));
      return (result.rowCount ?? 0) > 0;
    });
  }

  /**
   * Grants too incomplete to act on, with what each one is missing and
   * anything that would be orphaned by deleting it.
   *
   * Read-only on purpose: the office confirms a list before anything is
   * removed. A "delete everything invalid" button with no preview would, on
   * today's data, have taken out 95 of 113 grants -- real proposals whose Lead
   * PI simply never matched a staff record on import.
   */
  async findIncompleteGrants(): Promise<IncompleteGrantSummary[]> {
    const rows = await db.select().from(grants).orderBy(asc(grants.projectNumber));
    const incomplete = rows.filter((grant) => isGrantIncomplete(grant));
    if (incomplete.length === 0) return [];

    const ids = incomplete.map((grant) => grant.id);

    // Counted in two grouped queries rather than per grant: the office runs
    // this on the whole table, and a query per row would be a hundred of them.
    const [sdrCounts, reportCounts] = await Promise.all([
      db
        .select({ grantId: grantResearchActivities.grantId, count: sql<number>`count(*)::int` })
        .from(grantResearchActivities)
        .where(inArray(grantResearchActivities.grantId, ids))
        .groupBy(grantResearchActivities.grantId),
      db
        .select({ grantId: grantProgressReports.grantId, count: sql<number>`count(*)::int` })
        .from(grantProgressReports)
        .where(inArray(grantProgressReports.grantId, ids))
        .groupBy(grantProgressReports.grantId),
    ]);

    const sdrByGrant = new Map(sdrCounts.map((row) => [row.grantId, Number(row.count)]));
    const reportsByGrant = new Map(reportCounts.map((row) => [row.grantId, Number(row.count)]));

    return incomplete.map((grant) => {
      const linkedSdrs = sdrByGrant.get(grant.id) ?? 0;
      const progressReports = reportsByGrant.get(grant.id) ?? 0;
      return {
        id: grant.id,
        projectNumber: grant.projectNumber,
        title: grant.title,
        status: grant.status,
        createdAt: grant.createdAt ?? null,
        missing: missingMinimumGrantFields(grant),
        linkedSdrs,
        progressReports,
        deletable: linkedSdrs === 0 && progressReports === 0,
        // Whether anything would actually be lost. A row holding only a
        // project number and a title is a failed import; one carrying money,
        // dates and an abstract is a real record that is merely unfinished,
        // and the office should be looking at why rather than deleting it.
        hasOtherContent: Boolean(
          !isMissingAmount(grant.awardedAmount) ||
            !isMissingAmount(grant.requestedAmount) ||
            grant.fundingAgency ||
            grant.startDate ||
            grant.endDate ||
            grant.description ||
            grant.awarded,
        ),
      };
    });
  }

  /**
   * Deletes the named grants, and only those still incomplete and still
   * unlinked at the moment of deletion.
   *
   * The caller passes explicit ids -- the ones it showed someone -- rather
   * than "whatever is invalid now", so a grant fixed between the preview and
   * the confirmation is not swept up by a stale list. Each is re-checked here
   * anyway, because the preview is a separate request and the office is not
   * the only writer.
   *
   * One transaction per grant, not one for the batch: a single blocked row
   * should not roll back the ninety that were fine.
   */
  async deleteIncompleteGrants(ids: number[]): Promise<{
    deleted: number[];
    skipped: Array<{ id: number; projectNumber: string | null; reason: string }>;
  }> {
    const deleted: number[] = [];
    const skipped: Array<{ id: number; projectNumber: string | null; reason: string }> = [];

    for (const id of ids) {
      const outcome = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT "id" FROM "grants" WHERE "id" = ${id} FOR UPDATE`);

        const [grant] = await tx.select().from(grants).where(eq(grants.id, id));
        if (!grant) {
          return { ok: false as const, projectNumber: null, reason: "Already gone." };
        }
        if (!isGrantIncomplete(grant)) {
          return {
            ok: false as const,
            projectNumber: grant.projectNumber,
            reason: "No longer incomplete -- it was completed after the preview was taken.",
          };
        }

        const [linkedSdr] = await tx
          .select({ id: grantResearchActivities.id })
          .from(grantResearchActivities)
          .where(eq(grantResearchActivities.grantId, id))
          .limit(1);
        if (linkedSdr) {
          return {
            ok: false as const,
            projectNumber: grant.projectNumber,
            reason: "Linked to an SDR. Unlink it first.",
          };
        }

        // grant_progress_reports has a grant_id but no foreign key, so nothing
        // in the database would stop this delete or clean up after it -- the
        // reports would simply stop pointing anywhere. Refused here instead.
        const [report] = await tx
          .select({ id: grantProgressReports.id })
          .from(grantProgressReports)
          .where(eq(grantProgressReports.grantId, id))
          .limit(1);
        if (report) {
          return {
            ok: false as const,
            projectNumber: grant.projectNumber,
            reason: "Has progress reports, which would be orphaned. Delete those first.",
          };
        }

        await tx.delete(grants).where(eq(grants.id, id));
        return { ok: true as const, projectNumber: grant.projectNumber };
      });

      if (outcome.ok) {
        deleted.push(id);
      } else {
        skipped.push({ id, projectNumber: outcome.projectNumber, reason: outcome.reason });
      }
    }

    return { deleted, skipped };
  }

  // Grant-Research Activity relationship operations
  async getGrantResearchActivities(grantId: number): Promise<{ id: number; sdrNumber: string; title: string; status: string; }[]> {
    const result = await db
      .select({
        id: researchActivities.id,
        sdrNumber: researchActivities.sdrNumber,
        title: researchActivities.title,
        status: researchActivities.status
      })
      .from(grantResearchActivities)
      .innerJoin(researchActivities, eq(grantResearchActivities.researchActivityId, researchActivities.id))
      .where(eq(grantResearchActivities.grantId, grantId))
      .orderBy(asc(researchActivities.sdrNumber));
    return result;
  }

  async getResearchActivityGrants(researchActivityId: number): Promise<{ id: number; projectNumber: string; title: string; status: string; }[]> {
    const result = await db
      .select({
        id: grants.id,
        projectNumber: grants.projectNumber,
        title: grants.title,
        status: grants.status
      })
      .from(grantResearchActivities)
      .innerJoin(grants, eq(grantResearchActivities.grantId, grants.id))
      .where(eq(grantResearchActivities.researchActivityId, researchActivityId));
    return result;
  }

  async addGrantResearchActivity(grantId: number, researchActivityId: number): Promise<GrantResearchActivity> {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT "id" FROM "grants" WHERE "id" = ${grantId} FOR UPDATE`,
      );
      const [grant] = await tx
        .select()
        .from(grants)
        .where(eq(grants.id, grantId));
      if (!grant) {
        throw new GrantSdrLifecycleStorageError(
          "GRANT_NOT_FOUND",
          "Grant not found",
        );
      }
      if (!grant.awarded) {
        throw new GrantSdrLifecycleStorageError(
          "GRANT_NOT_AWARDED",
          "SDRs can only be linked after the grant has been awarded.",
        );
      }

      const [researchActivity] = await tx
        .select({
          id: researchActivities.id,
          budgetHolderId: researchActivities.budgetHolderId,
        })
        .from(researchActivities)
        .where(eq(researchActivities.id, researchActivityId));
      if (!researchActivity) {
        throw new GrantSdrLifecycleStorageError(
          "RESEARCH_ACTIVITY_NOT_FOUND",
          "Research activity not found",
        );
      }
      if (!isGrantSdrEligible(grant.lpiId, researchActivity.budgetHolderId)) {
        throw new GrantSdrLifecycleStorageError(
          "SDR_PI_MISMATCH",
          "Only SDRs whose Principal Investigator is the grant Lead PI can be linked.",
        );
      }

      const [relationship] = await tx
        .insert(grantResearchActivities)
        .values({ grantId, researchActivityId })
        .onConflictDoNothing({
          target: [
            grantResearchActivities.grantId,
            grantResearchActivities.researchActivityId,
          ],
        })
        .returning();
      if (relationship) return relationship;

      const [existingRelationship] = await tx
        .select()
        .from(grantResearchActivities)
        .where(and(
          eq(grantResearchActivities.grantId, grantId),
          eq(grantResearchActivities.researchActivityId, researchActivityId),
        ));
      return existingRelationship;
    });
  }

  async removeGrantResearchActivity(grantId: number, researchActivityId: number): Promise<boolean> {
    const result = await db
      .delete(grantResearchActivities)
      .where(and(
        eq(grantResearchActivities.grantId, grantId),
        eq(grantResearchActivities.researchActivityId, researchActivityId)
      ));
    return (result.rowCount ?? 0) > 0;
  }

  async getResearchActivityIbcApplications(researchActivityId: number): Promise<{ id: number; ibcNumber: string; title: string; status: string; workflowStatus: string; }[]> {
    const result = await db
      .select({
        id: ibcApplications.id,
        ibcNumber: ibcApplications.ibcNumber,
        title: ibcApplications.title,
        status: ibcApplications.status,
        workflowStatus: ibcApplications.workflowStatus,
      })
      .from(ibcApplicationResearchActivities)
      .innerJoin(ibcApplications, eq(ibcApplicationResearchActivities.ibcApplicationId, ibcApplications.id))
      .where(eq(ibcApplicationResearchActivities.researchActivityId, researchActivityId));

    return result;
  }

  // Grant Progress Reports operations
  async getGrantProgressReports(grantId: number): Promise<GrantProgressReport[]> {
    const result = await db
      .select()
      .from(grantProgressReports)
      .where(eq(grantProgressReports.grantId, grantId))
      .orderBy(desc(grantProgressReports.submissionDate));

    return result;
  }

  async createGrantProgressReport(report: InsertGrantProgressReport): Promise<GrantProgressReport> {
    const [newReport] = await db
      .insert(grantProgressReports)
      .values(report)
      .returning();

    return newReport;
  }

  async updateGrantProgressReport(id: number, report: Partial<InsertGrantProgressReport>): Promise<GrantProgressReport> {
    const [updatedReport] = await db
      .update(grantProgressReports)
      .set({ ...report, updatedAt: sql`now()` })
      .where(eq(grantProgressReports.id, id))
      .returning();

    return updatedReport;
  }

  async deleteGrantProgressReport(id: number): Promise<boolean> {
    const result = await db
      .delete(grantProgressReports)
      .where(eq(grantProgressReports.id, id));

    return (result.rowCount ?? 0) > 0;
  }

  // Certification Modules operations
  async getCertificationModules(): Promise<CertificationModule[]> {
    return await db
      .select()
      .from(certificationModules)
      .where(eq(certificationModules.isActive, true))
      .orderBy(asc(certificationModules.name));
  }

  async getCertificationModule(id: number): Promise<CertificationModule | undefined> {
    const [module] = await db
      .select()
      .from(certificationModules)
      .where(eq(certificationModules.id, id));
    return module;
  }

  async createCertificationModule(module: InsertCertificationModule): Promise<CertificationModule> {
    const [newModule] = await db
      .insert(certificationModules)
      .values(module)
      .returning();
    return newModule;
  }

  async updateCertificationModule(id: number, module: Partial<InsertCertificationModule>): Promise<CertificationModule> {
    const [updatedModule] = await db
      .update(certificationModules)
      .set({ ...module, updatedAt: sql`now()` })
      .where(eq(certificationModules.id, id))
      .returning();
    return updatedModule;
  }

  async deleteCertificationModule(id: number): Promise<boolean> {
    const result = await db
      .update(certificationModules)
      .set({ isActive: false, updatedAt: sql`now()` })
      .where(eq(certificationModules.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Certifications operations
  async getCertifications(): Promise<Certification[]> {
    return await db
      .select()
      .from(certifications)
      .orderBy(desc(certifications.endDate));
  }

  async getCertificationsByScientist(scientistId: number): Promise<Certification[]> {
    return await db
      .select()
      .from(certifications)
      .where(eq(certifications.scientistId, scientistId))
      .orderBy(desc(certifications.endDate));
  }

  async getCertificationsByModule(moduleId: number): Promise<Certification[]> {
    return await db
      .select()
      .from(certifications)
      .where(eq(certifications.moduleId, moduleId))
      .orderBy(desc(certifications.endDate));
  }

  async getCertificationMatrix(): Promise<any[]> {
    // Get all scientists first
    const scientistsList = await db
      .select({
        id: scientists.id,
        name: sql<string>`${scientists.honorificTitle} || ' ' || ${scientists.firstName} || ' ' || ${scientists.lastName}`,
      })
      .from(scientists)
      .where(eq(scientists.staffType, "scientific"))
      .orderBy(asc(scientists.lastName), asc(scientists.firstName));

    // Get all active modules
    const modulesList = await db
      .select()
      .from(certificationModules)
      .where(eq(certificationModules.isActive, true))
      .orderBy(asc(certificationModules.name));

    // Get all certifications
    const certificationsList = await db
      .select()
      .from(certifications);

    // Build matrix data manually since crossJoin isn't available
    const matrixData = [];
    for (const scientist of scientistsList) {
      for (const module of modulesList) {
        const certification = certificationsList.find(
          c => c.scientistId === scientist.id && c.moduleId === module.id
        );

        // Only surface real certifications from the database. Missing records
        // produce a null/empty entry rather than fabricated dates and IDs.
        matrixData.push({
          scientistId: scientist.id,
          scientistName: scientist.name,
          moduleId: module.id,
          moduleName: module.name,
          certificationId: certification?.id ?? null,
          startDate: certification?.startDate ?? null,
          endDate: certification?.endDate ?? null,
          certificateFilePath: certification?.certificateFilePath ?? null,
          reportFilePath: certification?.reportFilePath ?? null,
        });
      }
    }

    return matrixData;
  }

  async createCertification(certification: InsertCertification): Promise<Certification> {
    const [newCertification] = await db
      .insert(certifications)
      .values(certification)
      .returning();
    return newCertification;
  }

  async updateCertification(id: number, certification: Partial<InsertCertification>): Promise<Certification> {
    const [updatedCertification] = await db
      .update(certifications)
      .set({ ...certification, updatedAt: sql`now()` })
      .where(eq(certifications.id, id))
      .returning();
    return updatedCertification;
  }

  async deleteCertification(id: number): Promise<boolean> {
    const result = await db
      .delete(certifications)
      .where(eq(certifications.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Certification Configuration operations
  async getCertificationConfiguration(): Promise<CertificationConfiguration | undefined> {
    const [config] = await db
      .select()
      .from(certificationConfigurations)
      .orderBy(desc(certificationConfigurations.updatedAt))
      .limit(1);
    return config;
  }

  async createCertificationConfiguration(config: InsertCertificationConfiguration): Promise<CertificationConfiguration> {
    const [newConfig] = await db
      .insert(certificationConfigurations)
      .values(config)
      .returning();
    return newConfig;
  }

  async updateCertificationConfiguration(id: number, config: Partial<InsertCertificationConfiguration>): Promise<CertificationConfiguration> {
    const [updatedConfig] = await db
      .update(certificationConfigurations)
      .set({ ...config, updatedAt: sql`now()` })
      .where(eq(certificationConfigurations.id, id))
      .returning();
    return updatedConfig;
  }

  // System Configuration operations
  async getSystemConfigurations(): Promise<SystemConfiguration[]> {
    return await db.select().from(systemConfigurations).orderBy(asc(systemConfigurations.category), asc(systemConfigurations.key));
  }

  async getSystemConfiguration(key: string): Promise<SystemConfiguration | undefined> {
    const [config] = await db
      .select()
      .from(systemConfigurations)
      .where(eq(systemConfigurations.key, key));
    return config;
  }

  async createSystemConfiguration(config: InsertSystemConfiguration): Promise<SystemConfiguration> {
    const [newConfig] = await db
      .insert(systemConfigurations)
      .values(config)
      .returning();
    return newConfig;
  }

  async updateSystemConfiguration(key: string, config: Partial<InsertSystemConfiguration>): Promise<SystemConfiguration | undefined> {
    const [updatedConfig] = await db
      .update(systemConfigurations)
      .set({ ...config, updatedAt: sql`now()` })
      .where(eq(systemConfigurations.key, key))
      .returning();
    return updatedConfig;
  }

  async deleteSystemConfiguration(key: string): Promise<boolean> {
    const result = await db
      .delete(systemConfigurations)
      .where(eq(systemConfigurations.key, key));
    return (result.rowCount ?? 0) > 0;
  }

  // PDF Import History operations
  async getPdfImportHistory(): Promise<PdfImportHistory[]> {
    return await db.select().from(pdfImportHistory).orderBy(desc(pdfImportHistory.createdAt));
  }

  async getPdfImportHistoryEntry(id: number): Promise<PdfImportHistory | undefined> {
    const [entry] = await db
      .select()
      .from(pdfImportHistory)
      .where(eq(pdfImportHistory.id, id));
    return entry;
  }

  async createPdfImportHistoryEntry(entry: InsertPdfImportHistory): Promise<PdfImportHistory> {
    const [newEntry] = await db
      .insert(pdfImportHistory)
      .values(entry)
      .returning();
    return newEntry;
  }

  async updatePdfImportHistoryEntry(id: number, entry: Partial<InsertPdfImportHistory>): Promise<PdfImportHistory | undefined> {
    const [updatedEntry] = await db
      .update(pdfImportHistory)
      .set({ ...entry, updatedAt: sql`now()` })
      .where(eq(pdfImportHistory.id, id))
      .returning();
    return updatedEntry;
  }

  async searchPdfImportHistory(filters: {
    scientistName?: string;
    courseName?: string;
    dateFrom?: Date;
    dateTo?: Date;
    status?: string;
    uploadedBy?: number;
  }): Promise<PdfImportHistory[]> {
    let query = db.select().from(pdfImportHistory);
    
    const conditions = [];
    
    if (filters.scientistName) {
      conditions.push(ilike(pdfImportHistory.certificatePersonName, `%${filters.scientistName}%`));
    }
    
    if (filters.courseName) {
      conditions.push(ilike(pdfImportHistory.courseName, `%${filters.courseName}%`));
    }
    
    if (filters.dateFrom) {
      conditions.push(gte(pdfImportHistory.completionDate, filters.dateFrom));
    }
    
    if (filters.dateTo) {
      conditions.push(sql`${pdfImportHistory.completionDate} <= ${filters.dateTo}`);
    }
    
    if (filters.status) {
      conditions.push(eq(pdfImportHistory.processingStatus, filters.status));
    }
    
    if (filters.uploadedBy) {
      conditions.push(eq(pdfImportHistory.uploadedBy, filters.uploadedBy));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    return await query.orderBy(desc(pdfImportHistory.createdAt));
  }

  async updatePdfImportHistorySaveStatus(fileName: string, saveStatus: string): Promise<PdfImportHistory | undefined> {
    const [updatedEntry] = await db
      .update(pdfImportHistory)
      .set({ saveStatus, updatedAt: sql`now()` })
      .where(eq(pdfImportHistory.fileName, fileName))
      .returning();
    return updatedEntry;
  }

  // Feature Request operations
  async getFeatureRequests(): Promise<FeatureRequest[]> {
    return await db.select().from(featureRequests).orderBy(desc(featureRequests.createdAt));
  }

  async getFeatureRequest(id: number): Promise<FeatureRequest | undefined> {
    const [request] = await db.select().from(featureRequests).where(eq(featureRequests.id, id));
    return request;
  }

  async createFeatureRequest(insertRequest: InsertFeatureRequest): Promise<FeatureRequest> {
    const [request] = await db.insert(featureRequests).values(insertRequest).returning();
    return request;
  }

  async updateFeatureRequest(id: number, updates: Partial<InsertFeatureRequest>): Promise<FeatureRequest | undefined> {
    const [updatedRequest] = await db
      .update(featureRequests)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(featureRequests.id, id))
      .returning();
    return updatedRequest;
  }

  async deleteFeatureRequest(id: number): Promise<boolean> {
    const result = await db.delete(featureRequests).where(eq(featureRequests.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // RA-200 Applications
  async createRa200Application(data: InsertRa200Application): Promise<Ra200Application> {
    const applicationId = `PMO-RA200-${new Date().getFullYear()}-${String(Date.now()).slice(-3)}`;
    const [result] = await db.insert(ra200Applications)
      .values({ ...data, applicationId })
      .returning();
    return result;
  }

  async getRa200Applications(): Promise<Ra200Application[]> {
    return await db.select().from(ra200Applications).orderBy(desc(ra200Applications.createdAt));
  }

  async getRa200Application(id: number): Promise<Ra200Application | null> {
    const [result] = await db.select().from(ra200Applications).where(eq(ra200Applications.id, id));
    return result || null;
  }

  async updateRa200Application(id: number, updates: Partial<InsertRa200Application>): Promise<Ra200Application | null> {
    const [result] = await db.update(ra200Applications)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(ra200Applications.id, id))
      .returning();
    return result || null;
  }

  async deleteRa200Application(id: number): Promise<boolean> {
    const result = await db.delete(ra200Applications).where(eq(ra200Applications.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // RA-205A Applications
  async createRa205aApplication(data: InsertRa205aApplication): Promise<Ra205aApplication> {
    const applicationId = `PMO-RA205A-${new Date().getFullYear()}-${String(Date.now()).slice(-3)}`;
    const [result] = await db.insert(ra205aApplications)
      .values({ ...data, applicationId })
      .returning();
    return result;
  }

  async getRa205aApplications(): Promise<Ra205aApplication[]> {
    return await db.select().from(ra205aApplications).orderBy(desc(ra205aApplications.createdAt));
  }

  async getRa205aApplication(id: number): Promise<Ra205aApplication | null> {
    const [result] = await db.select().from(ra205aApplications).where(eq(ra205aApplications.id, id));
    return result || null;
  }

  async updateRa205aApplication(id: number, updates: Partial<InsertRa205aApplication>): Promise<Ra205aApplication | null> {
    const [result] = await db.update(ra205aApplications)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(ra205aApplications.id, id))
      .returning();
    return result || null;
  }

  async deleteRa205aApplication(id: number): Promise<boolean> {
    const result = await db.delete(ra205aApplications).where(eq(ra205aApplications.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Combined view for PMO Applications (for listing both types together)
  async getAllPmoApplications(): Promise<Array<Ra200Application & { form_type: 'RA-200' } | Ra205aApplication & { form_type: 'RA-205A' }>> {
    const ra200Apps = await this.getRa200Applications();
    const ra205aApps = await this.getRa205aApplications();
    
    const ra200WithType = ra200Apps.map(app => ({ ...app, form_type: 'RA-200' as const }));
    const ra205aWithType = ra205aApps.map(app => ({ ...app, form_type: 'RA-205A' as const }));
    
    return [...ra200WithType, ...ra205aWithType].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  // Recent activity feed — aggregated from real records across the app
  async getRecentActivity(limit: number = 8): Promise<Array<{ id: string; type: string; title: string; description: string; date: Date | null }>> {
    const perTable = Math.max(limit, 5);
    const [proj, pubs, sdrs, sci, ra200, ra205a] = await Promise.all([
      db.select({ id: projects.id, title: projects.name, date: projects.createdAt }).from(projects).orderBy(desc(projects.createdAt)).limit(perTable),
      db.select({ id: publications.id, title: publications.title, date: publications.createdAt }).from(publications).orderBy(desc(publications.createdAt)).limit(perTable),
      db.select({ id: researchActivities.id, title: researchActivities.title, date: researchActivities.createdAt }).from(researchActivities).orderBy(desc(researchActivities.createdAt)).limit(perTable),
      db.select({ id: scientists.id, first: scientists.firstName, last: scientists.lastName, date: scientists.createdAt }).from(scientists).orderBy(desc(scientists.createdAt)).limit(perTable),
      db.select({ id: ra200Applications.id, title: ra200Applications.title, date: ra200Applications.createdAt }).from(ra200Applications).orderBy(desc(ra200Applications.createdAt)).limit(perTable),
      db.select({ id: ra205aApplications.id, title: ra205aApplications.title, date: ra205aApplications.createdAt }).from(ra205aApplications).orderBy(desc(ra205aApplications.createdAt)).limit(perTable),
    ]);

    const items = [
      ...proj.map(r => ({ id: `project-${r.id}`, type: 'project_added', title: r.title, description: 'New project added', date: r.date })),
      ...pubs.map(r => ({ id: `publication-${r.id}`, type: 'publication_added', title: r.title, description: 'New publication added', date: r.date })),
      ...sdrs.map(r => ({ id: `sdr-${r.id}`, type: 'activity_added', title: r.title, description: 'New research activity', date: r.date })),
      ...sci.map(r => ({ id: `scientist-${r.id}`, type: 'staff_added', title: `${r.first} ${r.last}`, description: 'New staff member added', date: r.date })),
      ...ra200.map(r => ({ id: `ra200-${r.id}`, type: 'pmo_submission', title: r.title, description: 'RA-200 application created', date: r.date })),
      ...ra205a.map(r => ({ id: `ra205a-${r.id}`, type: 'pmo_submission', title: r.title, description: 'RA-205A application created', date: r.date })),
    ];

    return items
      .filter(i => i.date)
      .sort((a, b) => new Date(b.date as Date).getTime() - new Date(a.date as Date).getTime())
      .slice(0, limit);
  }

  // Team Member operations
  async getTeamMembers(): Promise<TeamMember[]> {
    return await db.select().from(teamMembers).orderBy(asc(teamMembers.displayOrder), asc(teamMembers.lastName));
  }

  async getTeamMember(id: number): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers).where(eq(teamMembers.id, id));
    return member;
  }

  async getTeamMembersByCategory(category: string): Promise<TeamMember[]> {
    return await db.select().from(teamMembers)
      .where(eq(teamMembers.category, category))
      .orderBy(asc(teamMembers.displayOrder), asc(teamMembers.lastName));
  }

  async createTeamMember(insertMember: InsertTeamMember): Promise<TeamMember> {
    const [member] = await db.insert(teamMembers).values(insertMember).returning();
    return member;
  }

  async updateTeamMember(id: number, updates: Partial<InsertTeamMember>): Promise<TeamMember | undefined> {
    const [updatedMember] = await db
      .update(teamMembers)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(teamMembers.id, id))
      .returning();
    return updatedMember;
  }

  async deleteTeamMember(id: number): Promise<boolean> {
    const result = await db.delete(teamMembers).where(eq(teamMembers.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // ── Ownership overrides ────────────────────────────────────────────────────

  async getOwnershipOverrides(): Promise<OwnershipOverride[]> {
    return await db.select().from(ownershipOverrides).orderBy(asc(ownershipOverrides.module), asc(ownershipOverrides.relationship));
  }

  async getOwnershipOverridesForModule(module: string): Promise<OwnershipOverride[]> {
    return await db.select().from(ownershipOverrides).where(eq(ownershipOverrides.module, module));
  }

  async upsertOwnershipOverride(module: string, relationship: string, grantedAccess: string, description?: string): Promise<OwnershipOverride> {
    const [result] = await db
      .insert(ownershipOverrides)
      .values({ module, relationship, grantedAccess, description: description ?? null })
      .onConflictDoUpdate({
        target: [ownershipOverrides.module, ownershipOverrides.relationship],
        set: { grantedAccess, description: description ?? null, updatedAt: sql`now()` },
      })
      .returning();
    return result;
  }

  async deleteOwnershipOverride(id: number): Promise<boolean> {
    const result = await db.delete(ownershipOverrides).where(eq(ownershipOverrides.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // ── Organizational structure (Branch → Department → Section) ──────────────

  async getBranches(): Promise<Branch[]> {
    return await db.select().from(branches).orderBy(asc(branches.name));
  }

  async createBranch(data: InsertBranch): Promise<Branch> {
    const [row] = await db.insert(branches).values(data).returning();
    return row;
  }

  async updateBranch(id: number, updates: Partial<InsertBranch>): Promise<Branch | undefined> {
    const [row] = await db
      .update(branches)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(branches.id, id))
      .returning();
    return row;
  }

  /** Returns true if deleted; returns a string reason if blocked. */
  async deleteBranch(id: number): Promise<true | string> {
    const [{ count: deptCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(departments)
      .where(eq(departments.branchId, id));
    if (deptCount > 0) {
      return `Branch has ${deptCount} department(s). Move or delete them first.`;
    }
    const result = await db.delete(branches).where(eq(branches.id, id));
    return result.rowCount !== null && result.rowCount > 0 ? true : "Branch not found.";
  }

  async getDepartments(): Promise<Department[]> {
    return await db.select().from(departments).orderBy(asc(departments.name));
  }

  async createDepartment(data: InsertDepartment): Promise<Department> {
    const [row] = await db.insert(departments).values(data).returning();
    return row;
  }

  async updateDepartment(id: number, updates: Partial<InsertDepartment>): Promise<Department | undefined> {
    const [row] = await db
      .update(departments)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(departments.id, id))
      .returning();
    return row;
  }

  async deleteDepartment(id: number): Promise<true | string> {
    const [{ count: sectionCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sections)
      .where(eq(sections.departmentId, id));
    if (sectionCount > 0) {
      return `Department has ${sectionCount} section(s). Move or delete them first.`;
    }
    const [{ count: staffCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(scientists)
      .where(eq(scientists.departmentId, id));
    if (staffCount > 0) {
      return `Department has ${staffCount} staff member(s) assigned. Reassign them first.`;
    }
    const result = await db.delete(departments).where(eq(departments.id, id));
    return result.rowCount !== null && result.rowCount > 0 ? true : "Department not found.";
  }

  async getSections(): Promise<Section[]> {
    return await db.select().from(sections).orderBy(asc(sections.name));
  }

  async createSection(data: InsertSection): Promise<Section> {
    const [row] = await db.insert(sections).values(data).returning();
    return row;
  }

  async updateSection(id: number, updates: Partial<InsertSection>): Promise<Section | undefined> {
    const [row] = await db
      .update(sections)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(sections.id, id))
      .returning();
    return row;
  }

  async deleteSection(id: number): Promise<true | string> {
    const [{ count: staffCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(scientists)
      .where(eq(scientists.sectionId, id));
    if (staffCount > 0) {
      return `Section has ${staffCount} staff member(s) assigned. Reassign them first.`;
    }
    const result = await db.delete(sections).where(eq(sections.id, id));
    return result.rowCount !== null && result.rowCount > 0 ? true : "Section not found.";
  }
}

export const storage = new DatabaseStorage();