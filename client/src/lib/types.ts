// Common types used across the application
import { 
  Scientist, Project, ProjectMember, DataManagementPlan, 
  Publication, Patent, IrbApplication, IbcApplication, ResearchContract 
} from "@shared/schema";

// Enhanced types with resolved references
export interface EnhancedProject extends Project {
  leadScientist?: {
    id: number;
    name: string;
    profileImageInitials?: string;
  };
  teamMembers?: EnhancedProjectMember[];
}

export interface EnhancedProjectMember extends ProjectMember {
  scientist?: {
    id: number;
    name: string;
    title?: string;
    profileImageInitials?: string;
  };
}

export interface EnhancedDataManagementPlan extends DataManagementPlan {
  project?: {
    id: number;
    title: string;
  };
}

export interface EnhancedPublication extends Publication {
  project?: {
    id: number;
    title: string;
  };
  researchActivity?: {
    id: number;
    sdrNumber: string;
    title: string;
  } | null;
}

export interface EnhancedPatent extends Patent {
  project?: {
    id: number;
    title: string;
  };
}

export interface EnhancedIrbApplication extends IrbApplication {
  project?: {
    id: number;
    title: string;
  };
  principalInvestigator?: {
    id: number;
    name: string;
    honorificTitle?: string;
    firstName?: string;
    lastName?: string;
    jobTitle?: string;
    email?: string;
    profileImageInitials?: string;
  };
  researchActivity?: {
    id: number;
    sdrNumber: string;
    title: string;
  } | null;
}

export interface EnhancedIbcApplication extends IbcApplication {
  principalInvestigator?: {
    id: number;
    name: string;
    honorificTitle?: string;
    firstName?: string;
    lastName?: string;
    jobTitle?: string;
    email?: string;
    profileImageInitials?: string;
  };
  researchActivities?: Array<{
    id: number;
    sdrNumber: string;
    title: string;
  }>;
}

export interface EnhancedResearchContract extends ResearchContract {
  project?: {
    id: number;
    title: string;
  };
  principalInvestigator?: {
    id: number;
    name: string;
    honorificTitle?: string;
    firstName?: string;
    lastName?: string;
    jobTitle?: string;
    email?: string;
    profileImageInitials?: string;
  };
  researchActivity?: {
    id: number;
    sdrNumber: string;
    title: string;
    status?: string;
  } | null;
}

// Dashboard types
export interface DashboardStats {
  activeResearchActivities: number;
  publications: number;
  patents: number;
}

export interface Deadline {
  id: number;
  title: string;
  description: string;
  dueDate: string | Date;
  projectId: number;
  type: string;
}

// Activity types for activity feed
export interface Activity {
  id: number;
  type: 'irb_submission' | 'project_approval' | 'publication_added' | 'staff_added' | string;
  title: string;
  description: string;
  date: string | Date;
  entity?: {
    id: number;
    type: string;
    title?: string;
  };
  user?: {
    id: number;
    name: string;
    profileImageInitials?: string;
  };
}
