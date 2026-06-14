import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowLeft, ArrowRight, Users, Code, FlaskConical,
  Mail, Linkedin, Shield, FileText, Briefcase,
  Database, Building2, BookOpen
} from "lucide-react";
import type { TeamMember } from "@shared/schema";
import qbridgeLogo from "@assets/image_1767775219373.png";

const elementTypeIcons: Record<string, typeof Shield> = {
  project_management: Briefcase,
  irb: Shield,
  ibc: FlaskConical,
  grants: FileText,
  publications: BookOpen,
  contracts: FileText,
  facilities: Building2,
  data_management: Database
};

const elementTypeLabels: Record<string, string> = {
  project_management: "Project Management",
  irb: "IRB (Ethics Review)",
  ibc: "IBC (Biosafety)",
  grants: "Grants",
  publications: "Publications",
  contracts: "Contracts",
  facilities: "Facilities",
  data_management: "Data Management"
};

function getInitials(firstName: string, lastName: string): string {
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
}

function TeamMemberCard({ member, showElementType = true }: { member: TeamMember; showElementType?: boolean }) {
  const Icon = member.elementType ? elementTypeIcons[member.elementType] : Users;
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="relative"
      style={{ zIndex: isHovered ? 50 : 1 }}
    >
      <Card className="bg-slate-800 border-slate-700 h-full">
        <CardContent className="p-6">
          <div className="flex flex-col items-center text-center">
            <Avatar className="h-20 w-20 mb-3 ring-2 ring-teal-500/20">
              {member.photoUrl ? (
                <AvatarImage src={member.photoUrl} alt={`${member.firstName} ${member.lastName}`} />
              ) : null}
              <AvatarFallback className="bg-gradient-to-br from-teal-500 to-blue-500 text-white text-lg font-semibold">
                {getInitials(member.firstName, member.lastName)}
              </AvatarFallback>
            </Avatar>
            
            <h3 className="text-lg font-semibold text-white">
              {member.firstName} {member.lastName}
            </h3>
            
            {member.title && (
              <p className="text-sm text-slate-400 mb-2">{member.title}</p>
            )}
            
            {showElementType && member.elementType && (
              <Badge variant="outline" className="border-teal-500/30 text-teal-400 mb-2">
                <Icon className="h-3 w-3 mr-1" />
                {elementTypeLabels[member.elementType] || member.elementType}
              </Badge>
            )}
            
            {member.institution && (
              <p className="text-xs text-slate-500 dark:text-slate-400">{member.institution}</p>
            )}
            
            {(member.email || member.linkedInUrl) && (
              <div className="flex items-center gap-3 mt-3">
                {member.email && (
                  <a 
                    href={`mailto:${member.email}`}
                    className="text-slate-400 hover:text-teal-400 transition-colors"
                  >
                    <Mail className="h-4 w-4" />
                  </a>
                )}
                {member.linkedInUrl && (
                  <a 
                    href={member.linkedInUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-blue-400 transition-colors"
                  >
                    <Linkedin className="h-4 w-4" />
                  </a>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      {(member.bio || member.photoUrl) && (
        <motion.div
          initial={false}
          animate={{
            opacity: isHovered ? 1 : 0,
            scale: isHovered ? 1 : 0.95,
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          style={{ 
            pointerEvents: isHovered ? 'auto' : 'none',
          }}
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[520px] max-w-[95vw] bg-slate-800 border border-teal-500/40 rounded-xl shadow-2xl shadow-black/50 overflow-hidden"
        >
          {member.photoUrl && (
            <div className="w-full h-48 overflow-hidden">
              <img 
                src={member.photoUrl} 
                alt={`${member.firstName} ${member.lastName}`}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="p-5">
            <h3 className="text-xl font-bold text-white mb-1">
              {member.firstName} {member.lastName}
            </h3>
            {member.title && (
              <p className="text-sm text-teal-400 mb-2">{member.title}</p>
            )}
            {showElementType && member.elementType && (
              <Badge variant="outline" className="border-teal-500/30 text-teal-400 mb-3">
                <Icon className="h-3 w-3 mr-1" />
                {elementTypeLabels[member.elementType] || member.elementType}
              </Badge>
            )}
            {member.institution && (
              <p className="text-xs text-slate-400 mb-3">{member.institution}</p>
            )}
            {member.bio && (
              <p className="text-sm text-slate-300 leading-relaxed">{member.bio}</p>
            )}
            {(member.email || member.linkedInUrl) && (
              <div className="flex items-center gap-3 mt-4 pt-3 border-t border-slate-700">
                {member.email && (
                  <a 
                    href={`mailto:${member.email}`}
                    className="text-slate-400 hover:text-teal-400 transition-colors flex items-center gap-1.5 text-xs"
                  >
                    <Mail className="h-4 w-4" />
                    Email
                  </a>
                )}
                {member.linkedInUrl && (
                  <a 
                    href={member.linkedInUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-blue-400 transition-colors flex items-center gap-1.5 text-xs"
                  >
                    <Linkedin className="h-4 w-4" />
                    LinkedIn
                  </a>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function TeamSection({ 
  title, 
  subtitle, 
  icon: Icon, 
  members,
  isLoading,
  showElementType = true
}: { 
  title: string; 
  subtitle: string; 
  icon: typeof Users; 
  members: TeamMember[];
  isLoading: boolean;
  showElementType?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="mb-16">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-teal-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">{title}</h2>
            <p className="text-slate-400">{subtitle}</p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="bg-slate-800/80 border-slate-700">
              <CardContent className="p-6 flex flex-col items-center">
                <Skeleton className="h-24 w-24 rounded-full mb-4" />
                <Skeleton className="h-5 w-32 mb-2" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="mb-16">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-teal-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">{title}</h2>
            <p className="text-slate-400">{subtitle}</p>
          </div>
        </div>
        <Card className="bg-slate-800/50 border-slate-700/50 border-dashed">
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 text-slate-600 mx-auto mb-4 dark:text-slate-300" />
            <p className="text-slate-400">Team members will be added soon.</p>
            <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
              Use the Settings panel in the application to add team members.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mb-16">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-teal-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">{title}</h2>
          <p className="text-slate-400">{subtitle}</p>
        </div>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {members.map((member) => (
          <TeamMemberCard key={member.id} member={member} showElementType={showElementType} />
        ))}
      </div>
    </div>
  );
}

export default function TeamPage() {
  const { data: teamMembers = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ['/api/team-members'],
  });

  const leads = teamMembers.filter(m => m.categories?.includes('lead') && m.isActive);
  const testers = teamMembers.filter(m => m.categories?.includes('tester') && m.isActive);
  const developers = teamMembers.filter(m => m.categories?.includes('developer') && m.isActive);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-900/80 border-b border-slate-700/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-3">
              <img src={qbridgeLogo} alt="Q-BRIDGE" className="h-10 w-10" />
              <span className="text-xl font-bold text-white">Q-BRIDGE</span>
            </Link>
            <nav className="hidden md:flex items-center space-x-8">
              <Link href="/" className="text-slate-300 hover:text-white transition-colors">
                Home
              </Link>
              <Link href="/demo" className="text-slate-300 hover:text-white transition-colors">
                Demo
              </Link>
              <Link href="/app">
                <Button variant="default" className="bg-teal-600 hover:bg-teal-500">
                  Launch Platform
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Link href="/" className="inline-flex items-center text-slate-400 hover:text-white mb-8">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Link>

          <div className="text-center mb-16">
            <Badge variant="outline" className="border-teal-500/30 text-teal-400 mb-4">
              Our Team
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              The People Behind Q-BRIDGE
            </h1>
            <p className="text-xl text-slate-300 max-w-2xl mx-auto">
              A collaborative effort across Qatar's research institutions, 
              bringing together domain experts, researchers, and technologists.
            </p>
          </div>

          <TeamSection
            title="Element Leads"
            subtitle="Domain experts guiding each module's development"
            icon={Shield}
            members={leads}
            isLoading={isLoading}
          />

          <TeamSection
            title="Faculty Testers"
            subtitle="Researchers providing real-world feedback and validation"
            icon={FlaskConical}
            members={testers}
            isLoading={isLoading}
            showElementType={false}
          />

          <TeamSection
            title="Development Team"
            subtitle="The technical team building the platform"
            icon={Code}
            members={developers}
            isLoading={isLoading}
            showElementType={false}
          />
        </motion.div>
      </main>

      <footer className="border-t border-slate-700/50 py-8 px-6 mt-12">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <img src={qbridgeLogo} alt="Q-BRIDGE" className="h-8 w-8" />
            <span className="text-slate-400">Q-BRIDGE Team</span>
          </div>
          <div className="flex gap-6">
            <Link href="/" className="text-slate-400 hover:text-white transition-colors">Home</Link>
            <Link href="/demo" className="text-slate-400 hover:text-white transition-colors">Demo</Link>
            <Link href="/app" className="text-slate-400 hover:text-white transition-colors">Launch App</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
