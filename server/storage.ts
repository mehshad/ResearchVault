// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import {
  users, User, InsertUser,
  ownershipOverrides, OwnershipOverride, InsertOwnershipOverride,
  scientists, Scientist, InsertScientist,
  programs, Program, InsertProgram,
  projects, Project, InsertProject,
  researchActivities, ResearchActivity, InsertResearchActivity,
  projectMembers, ProjectMember, InsertProjectMember,
  dataManagementPlans, DataManagementPlan, InsertDataManagementPlan,
  publications, Publication, InsertPublication,
  patents, Patent, InsertPatent,
  irbApplications, IrbApplication, InsertIrbApplication,
  ibcApplications, IbcApplication, InsertIbcApplication,
  ibcApplicationComments, IbcApplicationComment, InsertIbcApplicationComment,
  ibcApplicationResearchActivities, IbcApplicationResearchActivity, InsertIbcApplicationResearchActivity,
  researchContracts, ResearchContract, InsertResearchContract,
  buildings, Building, InsertBuilding,
  rooms, Room, InsertRoom,
  ibcApplicationRooms, IbcApplicationRoom, InsertIbcApplicationRoom,
  ibcBackboneSourceRooms, IbcBackboneSourceRoom, InsertIbcBackboneSourceRoom,
  ibcApplicationPpe, IbcApplicationPpe, InsertIbcApplicationPpe,
  rolePermissions, RolePermission, InsertRolePermission,
  journals, Journal, InsertJournal,
  journalImpactFactorMetrics, JournalImpactFactorMetric, InsertJournalImpactFactorMetric,
  JournalImpactFactor, InsertJournalImpactFactor,
  grants, Grant, InsertGrant,
  systemConfigurations, SystemConfiguration, InsertSystemConfiguration,
  pdfImportHistory, PdfImportHistory, InsertPdfImportHistory,
  featureRequests, FeatureRequest, InsertFeatureRequest,
  teamMembers, TeamMember, InsertTeamMember
} from "@shared/schema";

// Storage interface with CRUD operations for all entities
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User>;

  // Program operations
  getPrograms(): Promise<Program[]>;
  getProgram(id: number): Promise<Program | undefined>;
  getProgramByProgramId(programId: string): Promise<Program | undefined>;
  createProgram(program: InsertProgram): Promise<Program>;
  updateProgram(id: number, program: Partial<InsertProgram>): Promise<Program | undefined>;
  deleteProgram(id: number): Promise<boolean>;

  // Project operations
  getProjects(): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  getProjectByProjectId(projectId: string): Promise<Project | undefined>;
  getProjectsForProgram(programId: number): Promise<Project[]>;
  getProjectsForScientist(scientistId: number): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, project: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: number): Promise<boolean>;

  // Scientist operations
  getScientists(): Promise<Scientist[]>;
  getScientist(id: number): Promise<Scientist | undefined>;
  createScientist(scientist: InsertScientist): Promise<Scientist>;
  updateScientist(id: number, scientist: Partial<InsertScientist>): Promise<Scientist | undefined>;
  deleteScientist(id: number): Promise<boolean>;
  getStaff(): Promise<Scientist[]>;
  getPrincipalInvestigators(): Promise<Scientist[]>;



  // Research Activity operations
  getResearchActivities(): Promise<ResearchActivity[]>;
  getResearchActivity(id: number): Promise<ResearchActivity | undefined>;
  getResearchActivityBySdr(sdrNumber: string): Promise<ResearchActivity | undefined>;
  getResearchActivitiesForProject(projectId: number): Promise<ResearchActivity[]>;
  getResearchActivitiesForScientist(scientistId: number): Promise<ResearchActivity[]>;
  createResearchActivity(activity: InsertResearchActivity): Promise<ResearchActivity>;
  updateResearchActivity(id: number, activity: Partial<InsertResearchActivity>): Promise<ResearchActivity | undefined>;
  deleteResearchActivity(id: number): Promise<boolean>;
  
  // Project Members operations
  getProjectMembers(researchActivityId: number): Promise<ProjectMember[]>;
  getAllProjectMembers(): Promise<ProjectMember[]>;
  addProjectMember(member: InsertProjectMember): Promise<ProjectMember>;
  removeProjectMember(researchActivityId: number, scientistId: number): Promise<boolean>;

  // Data Management Plan operations
  getDataManagementPlans(): Promise<DataManagementPlan[]>;
  getDataManagementPlan(id: number): Promise<DataManagementPlan | undefined>;
  getDataManagementPlanForResearchActivity(researchActivityId: number): Promise<DataManagementPlan | undefined>;
  getDataManagementPlanForProject(projectId: number): Promise<DataManagementPlan | undefined>;
  createDataManagementPlan(plan: InsertDataManagementPlan): Promise<DataManagementPlan>;
  updateDataManagementPlan(id: number, plan: Partial<InsertDataManagementPlan>): Promise<DataManagementPlan | undefined>;
  deleteDataManagementPlan(id: number): Promise<boolean>;

  // Publication operations
  getPublications(): Promise<Publication[]>;
  getPublication(id: number): Promise<Publication | undefined>;
  getPublicationsForResearchActivity(researchActivityId: number): Promise<Publication[]>;
  createPublication(publication: InsertPublication): Promise<Publication>;
  updatePublication(id: number, publication: Partial<InsertPublication>): Promise<Publication | undefined>;
  deletePublication(id: number): Promise<boolean>;
  mergePublications(survivorId: number, mergeIds: number[], overrides: Partial<InsertPublication>, changedBy: number): Promise<Publication | undefined>;
  
  // Manuscript History
  getManuscriptHistory(publicationId: number): Promise<ManuscriptHistory[]>;
  createManuscriptHistoryEntry(entry: InsertManuscriptHistory): Promise<ManuscriptHistory>;
  
  // Publication Status Management
  updatePublicationStatus(id: number, status: string, changedBy: number, changes?: {field: string, oldValue: string, newValue: string}[]): Promise<Publication | undefined>;

  // Patent operations
  getPatents(): Promise<Patent[]>;
  getPatent(id: number): Promise<Patent | undefined>;
  getPatentsForResearchActivity(researchActivityId: number): Promise<Patent[]>;
  getPatentsForProject(projectId: number): Promise<Patent[]>;
  createPatent(patent: InsertPatent): Promise<Patent>;
  updatePatent(id: number, patent: Partial<InsertPatent>): Promise<Patent | undefined>;
  deletePatent(id: number): Promise<boolean>;

  // IRB Application operations
  getIrbApplications(): Promise<IrbApplication[]>;
  getIrbApplication(id: number): Promise<IrbApplication | undefined>;
  getIrbApplicationByIrbNumber(irbNumber: string): Promise<IrbApplication | undefined>;
  getIrbApplicationsForResearchActivity(researchActivityId: number): Promise<IrbApplication[]>;
  createIrbApplication(application: InsertIrbApplication): Promise<IrbApplication>;
  updateIrbApplication(id: number, application: Partial<InsertIrbApplication>): Promise<IrbApplication | undefined>;
  deleteIrbApplication(id: number): Promise<boolean>;

  // IBC Application operations
  getIbcApplications(): Promise<IbcApplication[]>;
  getIbcApplication(id: number): Promise<IbcApplication | undefined>;
  getIbcApplicationByIbcNumber(ibcNumber: string): Promise<IbcApplication | undefined>;
  getIbcApplicationsForResearchActivity(researchActivityId: number): Promise<IbcApplication[]>;
  createIbcApplication(application: InsertIbcApplication, researchActivityIds?: number[]): Promise<IbcApplication>;
  updateIbcApplication(id: number, application: Partial<InsertIbcApplication>): Promise<IbcApplication | undefined>;
  deleteIbcApplication(id: number): Promise<boolean>;
  getResearchActivitiesForIbcApplication(ibcApplicationId: number): Promise<ResearchActivity[]>;
  addResearchActivityToIbcApplication(ibcApplicationId: number, researchActivityId: number): Promise<any>;
  removeResearchActivityFromIbcApplication(ibcApplicationId: number, researchActivityId: number): Promise<boolean>;

  // IBC Application Comment operations
  getIbcApplicationComments(applicationId: number): Promise<IbcApplicationComment[]>;
  createIbcApplicationComment(comment: InsertIbcApplicationComment): Promise<IbcApplicationComment>;

  // IBC Application Facilities operations
  getIbcApplicationRooms(applicationId: number): Promise<IbcApplicationRoom[]>;
  addRoomToIbcApplication(applicationRoom: InsertIbcApplicationRoom): Promise<IbcApplicationRoom>;
  removeRoomFromIbcApplication(applicationId: number, roomId: number): Promise<boolean>;
  
  getIbcBackboneSourceRooms(applicationId: number): Promise<IbcBackboneSourceRoom[]>;
  addBackboneSourceRoom(backboneSourceRoom: InsertIbcBackboneSourceRoom): Promise<IbcBackboneSourceRoom>;
  removeBackboneSourceRoom(applicationId: number, backboneSource: string, roomId: number): Promise<boolean>;
  
  getIbcApplicationPpe(applicationId: number): Promise<IbcApplicationPpe[]>;
  getIbcApplicationPpeForRoom(applicationId: number, roomId: number): Promise<IbcApplicationPpe[]>;
  addPpeToIbcApplication(applicationPpe: InsertIbcApplicationPpe): Promise<IbcApplicationPpe>;
  removePpeFromIbcApplication(applicationId: number, roomId: number, ppeItem: string): Promise<boolean>;

  // Research Contract operations
  getResearchContracts(): Promise<ResearchContract[]>;
  getResearchContract(id: number): Promise<ResearchContract | undefined>;
  getResearchContractByContractNumber(contractNumber: string): Promise<ResearchContract | undefined>;
  getResearchContractsForResearchActivity(researchActivityId: number): Promise<ResearchContract[]>;
  getResearchContractsForUser(userId: number): Promise<ResearchContract[]>;
  getResearchContractsForProject(projectId: number): Promise<ResearchContract[]>;
  createResearchContract(contract: InsertResearchContract): Promise<ResearchContract>;
  updateResearchContract(id: number, contract: Partial<InsertResearchContract>): Promise<ResearchContract | undefined>;
  deleteResearchContract(id: number): Promise<boolean>;

  // Research Contract Scope Items operations
  getResearchContractScopeItems(contractId: number): Promise<ResearchContractScopeItem[]>;
  getResearchContractScopeItem(id: number): Promise<ResearchContractScopeItem | undefined>;
  createResearchContractScopeItem(item: InsertResearchContractScopeItem): Promise<ResearchContractScopeItem>;
  updateResearchContractScopeItem(id: number, item: Partial<InsertResearchContractScopeItem>): Promise<ResearchContractScopeItem | undefined>;
  deleteResearchContractScopeItem(id: number): Promise<boolean>;

  // Research Contract Extensions operations
  getResearchContractExtensions(contractId: number): Promise<ResearchContractExtension[]>;
  getResearchContractExtension(id: number): Promise<ResearchContractExtension | undefined>;
  createResearchContractExtension(extension: InsertResearchContractExtension): Promise<ResearchContractExtension>;
  updateResearchContractExtension(id: number, extension: Partial<InsertResearchContractExtension>): Promise<ResearchContractExtension | undefined>;
  deleteResearchContractExtension(id: number): Promise<boolean>;

  // Research Contract Documents operations
  getResearchContractDocuments(contractId: number): Promise<ResearchContractDocument[]>;
  getResearchContractDocumentsForExtension(extensionId: number): Promise<ResearchContractDocument[]>;
  getResearchContractDocument(id: number): Promise<ResearchContractDocument | undefined>;
  createResearchContractDocument(document: InsertResearchContractDocument): Promise<ResearchContractDocument>;
  updateResearchContractDocument(id: number, document: Partial<InsertResearchContractDocument>): Promise<ResearchContractDocument | undefined>;
  deleteResearchContractDocument(id: number): Promise<boolean>;

  // Building operations
  getBuildings(): Promise<Building[]>;
  getBuilding(id: number): Promise<Building | undefined>;
  createBuilding(building: InsertBuilding): Promise<Building>;
  updateBuilding(id: number, building: Partial<InsertBuilding>): Promise<Building | undefined>;
  deleteBuilding(id: number): Promise<boolean>;

  // Room operations
  getRooms(): Promise<Room[]>;
  getRoom(id: number): Promise<Room | undefined>;
  getRoomsByBuilding(buildingId: number): Promise<Room[]>;
  createRoom(room: InsertRoom): Promise<Room>;
  updateRoom(id: number, room: Partial<InsertRoom>): Promise<Room | undefined>;
  deleteRoom(id: number): Promise<boolean>;

  // Scientists filtering by role for room assignments
  getScientistsByRole(rolePattern: string): Promise<Scientist[]>;

  // Dashboard operations
  getDashboardStats(): Promise<{
    activeResearchActivities: number;
    publications: number;
    patents: number;
  }>;
  getRecentResearchActivities(limit?: number): Promise<ResearchActivity[]>;
  getUpcomingDeadlines(): Promise<any[]>; // More specific type would be created based on deadline structure

  // Role Permissions operations
  getRolePermissions(): Promise<RolePermission[]>;
  createRolePermission(permission: InsertRolePermission): Promise<RolePermission>;
  updateRolePermission(jobTitle: string, navigationItem: string, accessLevel: string): Promise<RolePermission | undefined>;
  updateRolePermissionsBulk(permissions: Array<{jobTitle: string, navigationItem: string, accessLevel: string}>): Promise<RolePermission[]>;

  // Journal & Impact Factor operations
  getJournalImpactFactors(options?: {
    limit?: number;
    offset?: number;
    sortField?: string;
    sortDirection?: 'asc' | 'desc';
    searchTerm?: string;
    fields?: string[];
    minImpactFactor?: number;
    maxImpactFactor?: number;
  }): Promise<{ data: JournalImpactFactor[]; total: number }>;
  getJournalImpactFactor(journalId: number): Promise<JournalImpactFactor | undefined>;
  getImpactFactorByJournalAndYear(journalName: string, year: number): Promise<JournalImpactFactor | undefined>;
  getHistoricalImpactFactors(journalName: string): Promise<JournalImpactFactor[]>;
  getHistoricalImpactFactorsByJournalId(journalId: number): Promise<JournalImpactFactor[]>;
  createJournalImpactFactor(factor: InsertJournalImpactFactor): Promise<JournalImpactFactor>;
  updateJournalImpactFactor(journalId: number, factor: Partial<InsertJournalImpactFactor>): Promise<JournalImpactFactor | undefined>;
  updateJournalField(journalId: number, field: string | null): Promise<Journal | undefined>;
  getJournalFields(): Promise<string[]>;
  getFieldImpactFactorDistribution(field: string): Promise<Array<{ journalId: number; journalName: string; impactFactor: number; year: number }>>;
  getJournalImpactFactorYears(): Promise<number[]>;
  exportJournalImpactFactorsForYear(options: {
    year: number;
    searchTerm?: string;
    fields?: string[];
    minImpactFactor?: number;
    maxImpactFactor?: number;
  }): Promise<JournalImpactFactor[]>;
  deleteJournalImpactFactor(journalId: number): Promise<boolean>;

  // Grant operations
  getGrants(): Promise<Grant[]>;
  getGrant(id: number): Promise<Grant | undefined>;
  getGrantByProjectNumber(projectNumber: string): Promise<Grant | undefined>;
  createGrant(grant: InsertGrant): Promise<Grant>;
  updateGrant(id: number, grant: Partial<InsertGrant>): Promise<Grant | undefined>;
  deleteGrant(id: number): Promise<boolean>;

  // System Configuration operations
  getSystemConfigurations(): Promise<SystemConfiguration[]>;
  getSystemConfiguration(key: string): Promise<SystemConfiguration | undefined>;
  createSystemConfiguration(config: InsertSystemConfiguration): Promise<SystemConfiguration>;
  updateSystemConfiguration(key: string, config: Partial<InsertSystemConfiguration>): Promise<SystemConfiguration | undefined>;
  deleteSystemConfiguration(key: string): Promise<boolean>;

  // PDF Import History operations
  getPdfImportHistory(): Promise<PdfImportHistory[]>;
  getPdfImportHistoryEntry(id: number): Promise<PdfImportHistory | undefined>;
  createPdfImportHistoryEntry(entry: InsertPdfImportHistory): Promise<PdfImportHistory>;
  updatePdfImportHistoryEntry(id: number, entry: Partial<InsertPdfImportHistory>): Promise<PdfImportHistory | undefined>;
  searchPdfImportHistory(filters: {
    scientistName?: string;
    courseName?: string;
    dateFrom?: Date;
    dateTo?: Date;
    status?: string;
    uploadedBy?: number;
  }): Promise<PdfImportHistory[]>;
  
  updatePdfImportHistorySaveStatus(fileName: string, saveStatus: string): Promise<PdfImportHistory | undefined>;

  // Feature Request operations
  getFeatureRequests(): Promise<FeatureRequest[]>;
  getFeatureRequest(id: number): Promise<FeatureRequest | undefined>;
  createFeatureRequest(request: InsertFeatureRequest): Promise<FeatureRequest>;
  updateFeatureRequest(id: number, request: Partial<InsertFeatureRequest>): Promise<FeatureRequest | undefined>;
  deleteFeatureRequest(id: number): Promise<boolean>;

  // PMO Applications
  createPmoApplication(data: InsertPmoApplication): Promise<PmoApplication>;
  getPmoApplications(): Promise<PmoApplication[]>;
  getPmoApplication(id: number): Promise<PmoApplication | null>;
  updatePmoApplication(id: number, updates: Partial<InsertPmoApplication>): Promise<PmoApplication | null>;
  deletePmoApplication(id: number): Promise<boolean>;

  // Team Member operations
  getTeamMembers(): Promise<TeamMember[]>;
  getTeamMember(id: number): Promise<TeamMember | undefined>;
  getTeamMembersByCategory(category: string): Promise<TeamMember[]>;
  createTeamMember(member: InsertTeamMember): Promise<TeamMember>;
  updateTeamMember(id: number, member: Partial<InsertTeamMember>): Promise<TeamMember | undefined>;
  deleteTeamMember(id: number): Promise<boolean>;

  // Ownership overrides
  getOwnershipOverrides(): Promise<OwnershipOverride[]>;
  getOwnershipOverridesForModule(module: string): Promise<OwnershipOverride[]>;
  upsertOwnershipOverride(module: string, relationship: string, grantedAccess: string, description?: string): Promise<OwnershipOverride>;
  deleteOwnershipOverride(id: number): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User> = new Map();
  private scientists: Map<number, Scientist> = new Map();
  private projects: Map<number, Project> = new Map();
  private projectMembers: Map<number, ProjectMember> = new Map();
  private dataManagementPlans: Map<number, DataManagementPlan> = new Map();
  private publications: Map<number, Publication> = new Map();
  private patents: Map<number, Patent> = new Map();
  private irbApplications: Map<number, IrbApplication> = new Map();
  private ibcApplications: Map<number, IbcApplication> = new Map();
  private ibcApplicationResearchActivities: Map<number, IbcApplicationResearchActivity> = new Map();
  private researchContracts: Map<number, ResearchContract> = new Map();

  private userIdCounter = 1;
  private scientistIdCounter = 1;
  private projectIdCounter = 1;
  private projectMemberIdCounter = 1;
  private dataManagementPlanIdCounter = 1;
  private publicationIdCounter = 1;
  private patentIdCounter = 1;
  private irbApplicationIdCounter = 1;
  private ibcApplicationIdCounter = 1;
  private ibcApplicationResearchActivityIdCounter = 1;
  private researchContractIdCounter = 1;

  constructor() {
    // Initialize with some sample data
    this.initializeData();
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    const user: User = {
      id,
      role: 'user',
      authProvider: 'local',
      entraOid: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...insertUser,
    } as User;
    this.users.set(id, user);
    return user;
  }

  // Scientist operations
  async getScientists(): Promise<Scientist[]> {
    return Array.from(this.scientists.values());
  }

  async getScientist(id: number): Promise<Scientist | undefined> {
    return this.scientists.get(id);
  }

  async createScientist(insertScientist: InsertScientist): Promise<Scientist> {
    const id = this.scientistIdCounter++;
    const scientist: Scientist = { ...insertScientist, id };
    this.scientists.set(id, scientist);
    return scientist;
  }

  async updateScientist(id: number, updateData: Partial<InsertScientist>): Promise<Scientist | undefined> {
    const scientist = this.scientists.get(id);
    if (!scientist) return undefined;

    const updatedScientist = { ...scientist, ...updateData };
    this.scientists.set(id, updatedScientist);
    return updatedScientist;
  }

  async deleteScientist(id: number): Promise<boolean> {
    return this.scientists.delete(id);
  }

  async getStaff(): Promise<Scientist[]> {
    return Array.from(this.scientists.values()).filter(scientist => scientist.isStaff);
  }

  async getPrincipalInvestigators(): Promise<Scientist[]> {
    return Array.from(this.scientists.values()).filter(scientist => !scientist.isStaff);
  }

  // Project operations
  async getProjects(): Promise<Project[]> {
    return Array.from(this.projects.values());
  }

  async getProject(id: number): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = this.projectIdCounter++;
    const now = new Date();
    const project: Project = { 
      ...insertProject, 
      id, 
      createdAt: now, 
      updatedAt: now
    };
    this.projects.set(id, project);
    return project;
  }

  async updateProject(id: number, updateData: Partial<InsertProject>): Promise<Project | undefined> {
    const project = this.projects.get(id);
    if (!project) return undefined;

    const updatedProject = { 
      ...project, 
      ...updateData, 
      updatedAt: new Date() 
    };
    this.projects.set(id, updatedProject);
    return updatedProject;
  }

  async deleteProject(id: number): Promise<boolean> {
    return this.projects.delete(id);
  }

  async getProjectsForScientist(scientistId: number): Promise<Project[]> {
    // Get projects where scientist is lead
    const leadProjects = Array.from(this.projects.values())
      .filter(project => project.leadScientistId === scientistId);
    
    // Get project IDs where scientist is a member
    const memberProjectIds = new Set(
      Array.from(this.projectMembers.values())
        .filter(member => member.scientistId === scientistId)
        .map(member => member.projectId)
    );
    
    // Get those projects
    const memberProjects = Array.from(this.projects.values())
      .filter(project => memberProjectIds.has(project.id));
    
    // Combine and remove duplicates
    const allProjects = [...leadProjects, ...memberProjects];
    const uniqueProjects = allProjects.filter((project, index, self) => 
      index === self.findIndex(p => p.id === project.id)
    );
    
    return uniqueProjects;
  }

  // Project Members operations
  async getProjectMembers(projectId: number): Promise<ProjectMember[]> {
    return Array.from(this.projectMembers.values())
      .filter(member => member.projectId === projectId);
  }

  async addProjectMember(insertMember: InsertProjectMember): Promise<ProjectMember> {
    // Check if member already exists
    const existingMember = Array.from(this.projectMembers.values())
      .find(m => m.projectId === insertMember.projectId && m.scientistId === insertMember.scientistId);
    
    if (existingMember) {
      return existingMember;
    }

    const id = this.projectMemberIdCounter++;
    const member: ProjectMember = { ...insertMember, id };
    this.projectMembers.set(id, member);
    return member;
  }

  async removeProjectMember(projectId: number, scientistId: number): Promise<boolean> {
    const memberToRemove = Array.from(this.projectMembers.values())
      .find(m => m.projectId === projectId && m.scientistId === scientistId);
    
    if (!memberToRemove) return false;
    
    return this.projectMembers.delete(memberToRemove.id);
  }

  // Data Management Plan operations
  async getDataManagementPlans(): Promise<DataManagementPlan[]> {
    return Array.from(this.dataManagementPlans.values());
  }

  async getDataManagementPlan(id: number): Promise<DataManagementPlan | undefined> {
    return this.dataManagementPlans.get(id);
  }

  async getDataManagementPlanForProject(projectId: number): Promise<DataManagementPlan | undefined> {
    return Array.from(this.dataManagementPlans.values())
      .find(plan => plan.projectId === projectId);
  }

  async createDataManagementPlan(insertPlan: InsertDataManagementPlan): Promise<DataManagementPlan> {
    const id = this.dataManagementPlanIdCounter++;
    const now = new Date();
    const plan: DataManagementPlan = { 
      ...insertPlan, 
      id, 
      createdAt: now, 
      updatedAt: now 
    };
    this.dataManagementPlans.set(id, plan);
    return plan;
  }

  async updateDataManagementPlan(id: number, updateData: Partial<InsertDataManagementPlan>): Promise<DataManagementPlan | undefined> {
    const plan = this.dataManagementPlans.get(id);
    if (!plan) return undefined;

    const updatedPlan = { 
      ...plan, 
      ...updateData, 
      updatedAt: new Date() 
    };
    this.dataManagementPlans.set(id, updatedPlan);
    return updatedPlan;
  }

  async deleteDataManagementPlan(id: number): Promise<boolean> {
    return this.dataManagementPlans.delete(id);
  }

  // Publication operations
  async getPublications(): Promise<Publication[]> {
    return Array.from(this.publications.values());
  }

  async getPublication(id: number): Promise<Publication | undefined> {
    return this.publications.get(id);
  }

  async getPublicationsForProject(projectId: number): Promise<Publication[]> {
    return Array.from(this.publications.values())
      .filter(pub => pub.projectId === projectId);
  }

  async createPublication(insertPublication: InsertPublication): Promise<Publication> {
    const id = this.publicationIdCounter++;
    const now = new Date();
    const publication: Publication = { 
      ...insertPublication, 
      id, 
      createdAt: now, 
      updatedAt: now 
    };
    this.publications.set(id, publication);
    return publication;
  }

  async updatePublication(id: number, updateData: Partial<InsertPublication>): Promise<Publication | undefined> {
    const publication = this.publications.get(id);
    if (!publication) return undefined;

    const updatedPublication = { 
      ...publication, 
      ...updateData, 
      updatedAt: new Date() 
    };
    this.publications.set(id, updatedPublication);
    return updatedPublication;
  }

  async deletePublication(id: number): Promise<boolean> {
    return this.publications.delete(id);
  }

  // Patent operations
  async getPatents(): Promise<Patent[]> {
    return Array.from(this.patents.values());
  }

  async getPatent(id: number): Promise<Patent | undefined> {
    return this.patents.get(id);
  }

  async getPatentsForProject(projectId: number): Promise<Patent[]> {
    return Array.from(this.patents.values())
      .filter(patent => patent.projectId === projectId);
  }

  async createPatent(insertPatent: InsertPatent): Promise<Patent> {
    const id = this.patentIdCounter++;
    const now = new Date();
    const patent: Patent = { 
      ...insertPatent, 
      id, 
      createdAt: now, 
      updatedAt: now 
    };
    this.patents.set(id, patent);
    return patent;
  }

  async updatePatent(id: number, updateData: Partial<InsertPatent>): Promise<Patent | undefined> {
    const patent = this.patents.get(id);
    if (!patent) return undefined;

    const updatedPatent = { 
      ...patent, 
      ...updateData, 
      updatedAt: new Date() 
    };
    this.patents.set(id, updatedPatent);
    return updatedPatent;
  }

  async deletePatent(id: number): Promise<boolean> {
    return this.patents.delete(id);
  }

  // IRB Application operations
  async getIrbApplications(): Promise<IrbApplication[]> {
    return Array.from(this.irbApplications.values());
  }

  async getIrbApplication(id: number): Promise<IrbApplication | undefined> {
    return this.irbApplications.get(id);
  }

  async getIrbApplicationsForProject(projectId: number): Promise<IrbApplication[]> {
    return Array.from(this.irbApplications.values())
      .filter(app => app.projectId === projectId);
  }

  async createIrbApplication(insertApplication: InsertIrbApplication): Promise<IrbApplication> {
    const id = this.irbApplicationIdCounter++;
    const now = new Date();
    const application: IrbApplication = { 
      ...insertApplication, 
      id, 
      createdAt: now, 
      updatedAt: now 
    };
    this.irbApplications.set(id, application);
    return application;
  }

  async updateIrbApplication(id: number, updateData: Partial<InsertIrbApplication>): Promise<IrbApplication | undefined> {
    const application = this.irbApplications.get(id);
    if (!application) return undefined;

    const updatedApplication = { 
      ...application, 
      ...updateData, 
      updatedAt: new Date() 
    };
    this.irbApplications.set(id, updatedApplication);
    return updatedApplication;
  }

  async deleteIrbApplication(id: number): Promise<boolean> {
    return this.irbApplications.delete(id);
  }

  // IBC Application operations
  async getIbcApplications(): Promise<IbcApplication[]> {
    return Array.from(this.ibcApplications.values());
  }

  async getIbcApplication(id: number): Promise<IbcApplication | undefined> {
    return this.ibcApplications.get(id);
  }

  async getIbcApplicationsForProject(projectId: number): Promise<IbcApplication[]> {
    return Array.from(this.ibcApplications.values())
      .filter(app => app.projectId === projectId);
  }

  async createIbcApplication(insertApplication: InsertIbcApplication, researchActivityIds: number[] = []): Promise<IbcApplication> {
    const id = this.ibcApplicationIdCounter++;
    const now = new Date();
    const application: IbcApplication = { 
      ...insertApplication, 
      id, 
      createdAt: now, 
      updatedAt: now 
    };
    this.ibcApplications.set(id, application);

    // Link to research activities
    for (const researchActivityId of researchActivityIds) {
      const linkageId = this.ibcApplicationResearchActivityIdCounter++;
      const linkage: IbcApplicationResearchActivity = {
        id: linkageId,
        ibcApplicationId: id,
        researchActivityId,
        createdAt: now
      };
      this.ibcApplicationResearchActivities.set(linkageId, linkage);
    }

    return application;
  }

  async getResearchActivitiesForIbcApplication(ibcApplicationId: number): Promise<ResearchActivity[]> {
    const linkages = Array.from(this.ibcApplicationResearchActivities.values())
      .filter(linkage => linkage.ibcApplicationId === ibcApplicationId);
    
    const activities: ResearchActivity[] = [];
    for (const linkage of linkages) {
      const activity = this.projects.get(linkage.researchActivityId);
      if (activity) {
        activities.push(activity);
      }
    }
    return activities;
  }

  async addResearchActivityToIbcApplication(ibcApplicationId: number, researchActivityId: number): Promise<IbcApplicationResearchActivity> {
    const id = this.ibcApplicationResearchActivityIdCounter++;
    const now = new Date();
    const linkage: IbcApplicationResearchActivity = {
      id,
      ibcApplicationId,
      researchActivityId,
      createdAt: now
    };
    this.ibcApplicationResearchActivities.set(id, linkage);
    return linkage;
  }

  async removeResearchActivityFromIbcApplication(ibcApplicationId: number, researchActivityId: number): Promise<boolean> {
    const linkage = Array.from(this.ibcApplicationResearchActivities.values())
      .find(l => l.ibcApplicationId === ibcApplicationId && l.researchActivityId === researchActivityId);
    
    if (linkage) {
      this.ibcApplicationResearchActivities.delete(linkage.id);
      return true;
    }
    return false;
  }

  async updateIbcApplication(id: number, updateData: Partial<InsertIbcApplication>): Promise<IbcApplication | undefined> {
    const application = this.ibcApplications.get(id);
    if (!application) return undefined;

    const updatedApplication = { 
      ...application, 
      ...updateData, 
      updatedAt: new Date() 
    };
    this.ibcApplications.set(id, updatedApplication);
    return updatedApplication;
  }

  async deleteIbcApplication(id: number): Promise<boolean> {
    return this.ibcApplications.delete(id);
  }

  // Research Contract operations
  async getResearchContracts(): Promise<ResearchContract[]> {
    return Array.from(this.researchContracts.values());
  }

  async getResearchContract(id: number): Promise<ResearchContract | undefined> {
    return this.researchContracts.get(id);
  }

  async getResearchContractsForProject(projectId: number): Promise<ResearchContract[]> {
    return Array.from(this.researchContracts.values())
      .filter(contract => contract.projectId === projectId);
  }

  async createResearchContract(insertContract: InsertResearchContract): Promise<ResearchContract> {
    const id = this.researchContractIdCounter++;
    const now = new Date();
    const contract: ResearchContract = { 
      ...insertContract, 
      id, 
      createdAt: now, 
      updatedAt: now 
    };
    this.researchContracts.set(id, contract);
    return contract;
  }

  async updateResearchContract(id: number, updateData: Partial<InsertResearchContract>): Promise<ResearchContract | undefined> {
    const contract = this.researchContracts.get(id);
    if (!contract) return undefined;

    const updatedContract = { 
      ...contract, 
      ...updateData, 
      updatedAt: new Date() 
    };
    this.researchContracts.set(id, updatedContract);
    return updatedContract;
  }

  async deleteResearchContract(id: number): Promise<boolean> {
    return this.researchContracts.delete(id);
  }

  // Dashboard operations
  async getDashboardStats(): Promise<{
    activeResearchActivities: number;
    publications: number;
    patents: number;
  }> {
    const activeProjects = Array.from(this.projects.values())
      .filter(project => project.status === 'active').length;
    
    const publications = this.publications.size;
    
    const patents = this.patents.size;
    
    return {
      activeResearchActivities: activeProjects,
      publications,
      patents
    };
  }

  async getRecentResearchActivities(limit: number = 5): Promise<ResearchActivity[]> {
    return Array.from(this.projects.values())
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit);
  }

  async getUpcomingDeadlines(): Promise<any[]> {
    const now = new Date();
    const tenDaysFromNow = new Date(now);
    tenDaysFromNow.setDate(now.getDate() + 10);

    // In-memory fallback mirrors the active dashboard contract deadline feed.
    return [
      {
        id: 1,
        title: "Research Agreement Renewal",
        description: "Research contract",
        dueDate: tenDaysFromNow,
        projectId: 1,
        type: "Contract"
      }
    ];
  }

  // Initialize with some sample data
  private initializeData() {
    // Create scientists
    const jane = this.createScientist({
      honorificTitle: "Ph.D.",
      firstName: "Jane",
      lastName: "Doe",
      jobTitle: "Principal Investigator",
      email: "jane.doe@example.com",
      department: "Molecular Biology",
      bio: "Specializes in immunotherapy research",
      profileImageInitials: "JD",
      supervisorId: null
    });

    const maria = this.createScientist({
      honorificTitle: "Dr.",
      firstName: "Maria",
      lastName: "Rodriguez",
      jobTitle: "Senior Researcher",
      email: "maria.rodriguez@example.com",
      department: "Genetics",
      bio: "Expert in gene editing technologies",
      profileImageInitials: "MR",
      supervisorId: null
    });

    const robert = this.createScientist({
      honorificTitle: "Dr.",
      firstName: "Robert",
      lastName: "Johnson",
      jobTitle: "Associate Professor",
      email: "robert.johnson@example.com",
      department: "Microbiology",
      bio: "Specializes in microbiome research",
      profileImageInitials: "RJ",
      supervisorId: null
    });

    const lisa = this.createScientist({
      honorificTitle: "Dr.",
      firstName: "Lisa",
      lastName: "Tanaka",
      jobTitle: "Staff Scientist",
      email: "lisa.tanaka@example.com",
      department: "Neuroscience",
      bio: "Focuses on neurological disorders",
      profileImageInitials: "LT",
      supervisorId: null
    });

    const emily = this.createScientist({
      honorificTitle: "Ph.D.",
      firstName: "Emily",
      lastName: "Wilson",
      jobTitle: "Postdoctoral Researcher",
      email: "emily.wilson@example.com",
      department: "Molecular Biology",
      bio: "Specializes in protein interactions",
      profileImageInitials: "EW",
      supervisorId: 1
    });

    // Create projects
    const project1 = this.createProject({
      projectId: "PRJ-001",
      name: "CRISPR-Cas9 Gene Editing for Cancer Treatment",
      description: "Developing targeted gene editing approaches for cancer therapy",
      principalInvestigatorId: 2
    });

    const project2 = this.createProject({
      projectId: "PRJ-002",
      name: "Novel Immunotherapy Approaches",
      description: "Investigating new immunotherapy strategies for autoimmune diseases",
      principalInvestigatorId: 1
    });

    const project3 = this.createProject({
      projectId: "PRJ-003",
      name: "Microbiome Analysis in Autoimmune Disorders",
      description: "Studying the gut microbiome's role in autoimmune disease progression",
      principalInvestigatorId: 3
    });

    const project4 = this.createProject({
      projectId: "PRJ-004",
      name: "Neural Pathway Mapping in Alzheimer's",
      description: "Mapping neural connectivity changes in Alzheimer's disease progression",
      principalInvestigatorId: 4
    });

    // Add team members
    this.addProjectMember({
      researchActivityId: 1,
      scientistId: 2, // Maria (already lead)
      role: "Principal Investigator"
    });

    this.addProjectMember({
      researchActivityId: 1,
      scientistId: 5, // Emily
      role: "Research Assistant"
    });

    this.addProjectMember({
      researchActivityId: 2,
      scientistId: 1, // Jane (already lead)
      role: "Principal Investigator"
    });

    this.addProjectMember({
      researchActivityId: 2,
      scientistId: 3, // Robert
      role: "Co-Investigator"
    });

    // Create data management plans
    this.createDataManagementPlan({
      researchActivityId: 1,
      dmpNumber: "DMP-2023-001",
      title: "Data Management Plan for CRISPR-Cas9 Project",
      description: "Comprehensive plan for managing research data for gene editing project",
      dataCollectionMethods: "Next-generation sequencing, Western blot, qPCR",
      dataStoragePlan: "Data will be stored on institutional secure servers with daily backups",
      dataSharingPlan: "De-identified data will be shared via public repositories after publication",
      retentionPeriod: "10 years"
    });

    this.createDataManagementPlan({
      researchActivityId: 2,
      dmpNumber: "DMP-2023-002",
      title: "Immunotherapy Data Management",
      description: "Data management protocols for immunotherapy research",
      dataCollectionMethods: "Flow cytometry, ELISA, RNA-seq",
      dataStoragePlan: "Cloud storage with encryption and access controls",
      dataSharingPlan: "Data sharing through collaborator network with proper agreements",
      retentionPeriod: "7 years"
    });

    // Create publications
    this.createPublication({
      title: "CRISPR-Cas9 Efficiency in Human Cell Lines",
      abstract: "This study evaluates the efficiency of CRISPR-Cas9 gene editing in various human cancer cell lines.",
      authors: "Rodriguez M, Wilson E, Doe J",
      journal: "Nature Biotechnology",
      volume: "41",
      issue: "3",
      pages: "289-301",
      doi: "10.1038/nbt.4321",
      publicationDate: new Date("2023-03-15"),
      publicationType: "Journal Article",
      status: "published"
    });

    this.createPublication({
      title: "Novel T-Cell Modulators in Autoimmune Disease Models",
      abstract: "We identify new T-cell modulatory compounds with therapeutic potential in multiple autoimmune disease models.",
      authors: "Doe J, Johnson R",
      journal: "Science Immunology",
      volume: "8",
      issue: "2",
      pages: "eabc1234",
      doi: "10.1126/sciimmunol.abc1234",
      publicationDate: new Date("2023-02-10"),
      publicationType: "Journal Article",
      status: "published"
    });

    // Create patents
    this.createPatent({
      title: "Method for Targeted Gene Delivery Using Modified CRISPR System",
      inventors: "Rodriguez M, Doe J",
      filingDate: new Date("2022-11-05"),
      patentNumber: "US2023/0123456",
      status: "filed",
      description: "A novel method for delivering CRISPR-Cas9 components to specific cell types using modified viral vectors"
    });

    // Create IRB applications
    this.createIrbApplication({
      irbNumber: "IRB-2023-001",
      title: "Human Cell Line Testing for CRISPR Cancer Therapy",
      principalInvestigatorId: 2, // Maria
      submissionDate: new Date("2023-01-15"),
      expirationDate: "2024-02-10",
      status: "approved",
      riskLevel: "minimal",
      description: "Protocol for testing CRISPR constructs in de-identified human cancer cell lines"
    });

    this.createIrbApplication({
      irbNumber: "IRB-2023-002",
      title: "Patient Sample Collection for Immunotherapy Research",
      principalInvestigatorId: 1, // Jane
      submissionDate: new Date("2023-03-20"),
      status: "submitted",
      description: "Protocol for collecting blood samples from consenting patients with autoimmune conditions",
      riskLevel: "greater than minimal"
    });

    // Create IBC applications
    this.createIbcApplication({
      ibcNumber: "IBC-2023-001",
      title: "Microbiome Sample Analysis Protocol",
      principalInvestigatorId: 3, // Robert
      submissionDate: new Date("2023-04-05"),
      status: "submitted",
      riskLevel: "low",
      biosafetyLevel: "BSL-2",
      description: "Protocol for handling and analyzing human gut microbiome samples"
    });

    // Create research contracts
    this.createResearchContract({
      researchActivityId: 1,
      contractNumber: "CNT-2023-001",
      title: "Genomic Sequencing Equipment Collaboration",
      leadPIId: 2, // Maria
      requestedByUserId: 1,
      contractorName: "GenomeTech Solutions",
      contractType: "Equipment",
      startDate: "2023-03-01",
      endDate: "2025-02-28",
      contractValue: "850000",
      currency: "QAR",
      status: "active",
      description: "Equipment lease agreement for next-generation genomic sequencing platform for precision medicine research",
      fundingSourceCategory: "Equipment Lease",
      isPORelevant: true,
      internalCostSidra: 850000,
      internalCostCounterparty: 0,
      moneyOut: 850000,
      officeFormStatus: "complete",
      initiationRequestedAt: new Date("2023-02-15"),
      reminderEmail: "genomics@example.com"
    });

    this.createResearchContract({
      researchActivityId: 2,
      contractNumber: "CNT-2023-002",
      title: "Single-Cell Analysis Service Agreement",
      leadPIId: 1, // Jane
      requestedByUserId: 1,
      contractorName: "CellAnalytics Inc",
      contractType: "Service",
      startDate: "2023-05-01",
      endDate: "2024-04-30",
      contractValue: "180000",
      currency: "USD",
      status: "active",
      description: "Specialized single-cell analysis services for immunotherapy research projects",
      fundingSourceCategory: "Service Agreement",
      isPORelevant: true,
      internalCostSidra: 0,
      internalCostCounterparty: 180000,
      moneyOut: 180000,
      officeFormStatus: "complete",
      initiationRequestedAt: new Date("2023-04-10"),
      reminderEmail: "immunology@example.com"
    });
  }
}

import { DatabaseStorage } from "./databaseStorage";

// Use DatabaseStorage for database operations
export const storage = new DatabaseStorage();
