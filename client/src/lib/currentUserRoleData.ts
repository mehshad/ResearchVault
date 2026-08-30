export interface DummyUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

// Role-emulation identities for development and demo testing. Keeping these
// values outside the context module prevents Vite Fast Refresh from replacing
// the context when only test-user data changes.
export const DUMMY_USERS: DummyUser[] = [
  { id: 1, name: "Dr. Sarah Chen", email: "s.chen@research.org", role: "Investigator" },
  { id: 2, name: "Dr. Michael Rodriguez", email: "m.rodriguez@research.org", role: "Staff Scientist" },
  { id: 3, name: "Dr. Emily Hassan", email: "e.hassan@research.org", role: "Physician" },
  { id: 4, name: "Dr. James Wilson", email: "j.wilson@research.org", role: "Staff Scientist" },
  { id: 5, name: "Lisa Thompson", email: "l.thompson@research.org", role: "Lab Manager" },
  { id: 6, name: "Dr. Alex Kumar", email: "a.kumar@research.org", role: "Postdoctoral Researcher" },
  { id: 7, name: "Maria Santos", email: "m.santos@research.org", role: "PhD Student" },
  { id: 8, name: "Q-BRIDGE Administrator", email: "qbridge.admin@research.org", role: "Management" },
  { id: 9, name: "Dr. Jennifer Park", email: "j.park@research.org", role: "IRB Board Member" },
  { id: 10, name: "Dr. Robert Kim", email: "r.kim@research.org", role: "IBC Board Member" },
  { id: 11, name: "Jessica Morgan", email: "j.morgan@research.org", role: "Outcome Officer" },
  { id: 12, name: "Sarah Chen (PMO)", email: "sarah.chen@research.org", role: "PMO Officer" },
  { id: 13, name: "Jennifer Park (IRB)", email: "jennifer.park@research.org", role: "IRB Officer" },
  { id: 14, name: "Lisa Wong (IBC)", email: "lisa.wong@research.org", role: "IBC Officer" },
  { id: 15, name: "Sarah Mitchell", email: "sarah.mitchell@example.com", role: "Research Officer" },
];

// Only exposed in the role selector when AUTH_MODE=demo.
export const SUPER_ADMIN_USER: DummyUser = {
  id: 99,
  name: "Super Admin",
  email: "superadmin@research.org",
  role: "superadmin",
};