import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Rocket, CheckCircle2, AlertCircle, Clock,
  Shield, Users, FileText, Microscope, Building2,
  BarChart3, Database, BookOpen, Award, Briefcase,
  Play, ArrowRight
} from "lucide-react";
import qbridgeLogo from "@assets/image_1767775219373.png";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

const implementedFeatures = [
  {
    category: "Research Management",
    icon: Microscope,
    items: [
      "Programs, Projects & Research Activities (3-tier hierarchy)",
      "Team assignment with roles (PI, Lead Scientist, etc.)",
      "Multi-institution support (Sidra, HBKU, WCM-Q)",
      "Customizable terminology per institution"
    ]
  },
  {
    category: "Ethics & Compliance",
    icon: Shield,
    items: [
      "IRB Applications with full submission workflow",
      "IBC Applications with NIH Guidelines compliance",
      "Board member management and assignment",
      "Reviewer portal with recommendation system",
      "Status tracking and timeline history"
    ]
  },
  {
    category: "Personnel & Facilities",
    icon: Users,
    items: [
      "Scientist profiles with external links (ORCID, LinkedIn)",
      "Organizational hierarchy with line managers",
      "Building and room management",
      "Biosafety level tracking"
    ]
  },
  {
    category: "Research Outputs",
    icon: BookOpen,
    items: [
      "Publication tracking with JCR impact factors",
      "28,000+ journal database with metrics",
      "Patent management with status workflow",
      "Author attribution and affiliation"
    ]
  },
  {
    category: "Funding & Contracts",
    icon: Briefcase,
    items: [
      "Grant proposal tracking",
      "Research contract management",
      "Budget source assignment",
      "Multi-party collaboration agreements"
    ]
  },
  {
    category: "Administration",
    icon: Building2,
    items: [
      "Role-based access testing",
      "Institution theme switching",
      "Configurable labels and abbreviations",
      "Dashboard with real-time statistics"
    ]
  }
];

const limitations = [
  {
    title: "Authentication",
    description: "Role switching is for demonstration only. No real user authentication or SSO integration.",
    icon: AlertCircle
  },
  {
    title: "Global Search",
    description: "The header search bar is a placeholder. Entity-specific search is available.",
    icon: Clock
  },
  {
    title: "File Uploads",
    description: "Document upload functionality is limited. Full attachment system pending.",
    icon: Clock
  },
  {
    title: "Email Notifications",
    description: "No automated email system. Workflow transitions are recorded but not emailed.",
    icon: Clock
  },
  {
    title: "Audit Trail",
    description: "Limited change logging. Full audit history feature in development.",
    icon: Clock
  },
  {
    title: "Reports Module",
    description: "Basic structure only. Advanced analytics and export features pending.",
    icon: Clock
  }
];

// Demo port — matches the DEMO_PORT env var (default 8080).
// When this page is served by the production app (non-demo mode),
// the Launch button redirects directly to the demo instance.
const DEMO_PORT = (window as any).__DEMO_PORT__ ?? '8080';
const DEMO_ORIGIN = `${window.location.protocol}//${window.location.hostname}:${DEMO_PORT}`;

export default function DemoPage() {
  const { authConfig, loading } = useAuth();
  const [, navigate] = useLocation();
  const isDemo = authConfig.mode === 'demo';

  // If the production app is serving this page, always redirect to the demo
  // instance as soon as the auth config is known — regardless of login state.
  // (Wouter handles /demo client-side so nginx's redirect never fires here.)
  useEffect(() => {
    if (!isDemo && !loading) {
      window.location.replace(`${DEMO_ORIGIN}/app`);
    }
  }, [isDemo, loading]);

  const handleLaunch = () => {
    if (isDemo) {
      // Already inside the demo instance — go straight to dashboard.
      navigate('/app');
    } else {
      // Production app: always send to the demo instance.
      window.location.href = `${DEMO_ORIGIN}/app`;
    }
  };

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
              <Link href="/team" className="text-slate-300 hover:text-white transition-colors">
                Team
              </Link>
              <Button variant="default" className="bg-teal-600 hover:bg-teal-500" onClick={handleLaunch}>
                  Launch Platform
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
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

          <div className="text-center mb-12">
            <Badge variant="outline" className="border-teal-500/30 text-teal-400 mb-4">
              Demo Environment
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Experience Q-BRIDGE
            </h1>
            <p className="text-xl text-slate-300 max-w-2xl mx-auto">
              This demonstration showcases the platform's current capabilities. 
              Explore freely - all data is for testing purposes only.
            </p>
          </div>

          <motion.div 
            className="flex justify-center mb-16"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Button size="lg" className="bg-teal-600 hover:bg-teal-500 text-xl px-12 py-8 shadow-lg shadow-teal-500/20" onClick={handleLaunch}>
                <Play className="mr-3 h-6 w-6" />
                {isDemo ? 'Launch Demo Application' : 'Launch Demo'}
                <Rocket className="ml-3 h-6 w-6" />
              </Button>
          </motion.div>

          <div className="mb-16">
            <div className="flex items-center gap-3 mb-8">
              <CheckCircle2 className="h-6 w-6 text-green-400" />
              <h2 className="text-2xl font-bold text-white">What's Working</h2>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {implementedFeatures.map((feature, index) => (
                <motion.div
                  key={feature.category}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index }}
                >
                  <Card className="bg-slate-800/80 border-slate-700 h-full">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                          <feature.icon className="h-5 w-5 text-green-400" />
                        </div>
                        <CardTitle className="text-lg text-white">{feature.category}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {feature.items.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                            <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="mb-16">
            <div className="flex items-center gap-3 mb-8">
              <Clock className="h-6 w-6 text-amber-400" />
              <h2 className="text-2xl font-bold text-white">Current Limitations</h2>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {limitations.map((item, index) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * index }}
                >
                  <Card className="bg-slate-800/50 border-slate-700/50">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                          <item.icon className="h-4 w-4 text-amber-400" />
                        </div>
                        <div>
                          <h3 className="font-medium text-white mb-1">{item.title}</h3>
                          <p className="text-sm text-slate-400">{item.description}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.div
            className="bg-gradient-to-r from-teal-900/30 to-blue-900/30 rounded-2xl p-8 border border-teal-500/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Ready to Explore?</h3>
                <p className="text-slate-300">
                  The demo includes sample data across all modules. Switch between different roles 
                  using the sidebar dropdown to experience different user perspectives.
                </p>
              </div>
              <Button size="lg" className="bg-teal-600 hover:bg-teal-500 whitespace-nowrap" onClick={handleLaunch}>
                  <Rocket className="mr-2 h-5 w-5" />
                  {isDemo ? 'Launch Demo' : 'Launch Demo'}
                </Button>
            </div>
          </motion.div>
        </motion.div>
      </main>

      <footer className="border-t border-slate-700/50 py-8 px-6 mt-12">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <img src={qbridgeLogo} alt="Q-BRIDGE" className="h-8 w-8" />
            <span className="text-slate-400">Q-BRIDGE Demo</span>
          </div>
          <div className="flex gap-6">
            <Link href="/" className="text-slate-400 hover:text-white transition-colors">Home</Link>
            <Link href="/team" className="text-slate-400 hover:text-white transition-colors">Team</Link>
            <button onClick={handleLaunch} className="text-slate-400 hover:text-white transition-colors">Launch App</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
