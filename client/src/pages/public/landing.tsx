import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Shield, Database, Users, FileCheck, Microscope,
  Building2, Globe, ArrowRight, ChevronRight,
  Lock, Zap, BarChart3, Network, LogOut
} from "lucide-react";
import qbridgeLogo from "@assets/image_1767775219373.png";
import { useAuth } from "@/hooks/useAuth";
import { LoginModal } from "@/components/LoginModal";
import { useState, useEffect } from "react";

const features = [
  {
    icon: Shield,
    title: "IRB & IBC Compliance",
    description: "Streamlined ethics review with comprehensive tracking for human subjects and biosafety protocols"
  },
  {
    icon: Database,
    title: "Research Data Governance",
    description: "Unified data management plans with institutional oversight and compliance monitoring"
  },
  {
    icon: Users,
    title: "Multi-Institutional Collaboration",
    description: "Seamless coordination across Qatar's leading research institutions"
  },
  {
    icon: FileCheck,
    title: "Grant & Contract Management",
    description: "End-to-end tracking of funding, agreements, and deliverables"
  },
  {
    icon: Microscope,
    title: "Publication & Patent Tracking",
    description: "Impact factor analysis and intellectual property management"
  },
  {
    icon: Building2,
    title: "Facility Management",
    description: "Laboratory and equipment tracking with biosafety compliance"
  }
];

const institutions = [
  { name: "Sidra Medicine", color: "#14b8a6" },
  { name: "Hamad Bin Khalifa University", color: "#0ea5e9" },
  { name: "Weill Cornell Medicine-Qatar", color: "#b91c1c" }
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

export default function LandingPage() {
  const { isAuthenticated, user, logout, authConfig } = useAuth();
  const [, navigate] = useLocation();
  const [loginOpen, setLoginOpen] = useState(false);

  // Open modal if redirected here with ?signin=true (e.g. from /login route)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('signin') === 'true' && !isAuthenticated) {
      setLoginOpen(true);
    }
  }, [isAuthenticated]);

  // If already authenticated and modal opens, redirect straight to dashboard
  const handleLaunchClick = () => {
    if (isAuthenticated) {
      navigate('/app');
    } else {
      setLoginOpen(true);
    }
  };

  const handleLoginSuccess = () => {
    setLoginOpen(false);
    navigate('/app');
  };

  const handleLogout = async () => {
    await logout();
    // logout() in useAuth navigates to '/' already; modal stays closed
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} onSuccess={handleLoginSuccess} />

      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-slate-900/80 border-b border-slate-700/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <img src={qbridgeLogo} alt="Q-BRIDGE" className="h-10 w-10" />
              <div>
                <span className="text-xl font-bold text-white">Q-BRIDGE</span>
                <span className="hidden md:inline text-sm text-slate-400 ml-2">Research Governance Ecosystem</span>
              </div>
            </div>
            <nav className="hidden md:flex items-center space-x-8">
              <Link href="/about" className="text-slate-300 hover:text-white transition-colors">About</Link>
              <Link href="/demo" className="text-slate-300 hover:text-white transition-colors">Demo</Link>
              <Link href="/team" className="text-slate-300 hover:text-white transition-colors">Team</Link>
              {isAuthenticated ? (
                <div className="flex items-center gap-4">
                  <span className="text-slate-300 text-sm">
                    Welcome, <span className="text-white font-medium">{user?.name}</span>
                  </span>
                  <Button variant="default" className="bg-teal-600 hover:bg-teal-500" onClick={() => navigate('/app')}>
                    Go to Dashboard
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white" onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-1" />
                    Sign out
                  </Button>
                </div>
              ) : (
                <Button variant="default" className="bg-teal-600 hover:bg-teal-500" onClick={handleLaunchClick}>
                  Launch Platform
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </nav>
            <div className="md:hidden">
              {isAuthenticated ? (
                <Button size="sm" className="bg-teal-600" onClick={() => navigate('/app')}>Dashboard</Button>
              ) : (
                <Button size="sm" className="bg-teal-600" onClick={handleLaunchClick}>Sign in</Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main>
        <section className="relative pt-32 pb-20 px-6 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <motion.div
              className="absolute top-20 left-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl"
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.5, 0.3]
              }}
              transition={{ duration: 8, repeat: Infinity }}
            />
            <motion.div
              className="absolute bottom-20 right-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl"
              animate={{ 
                scale: [1.2, 1, 1.2],
                opacity: [0.3, 0.5, 0.3]
              }}
              transition={{ duration: 10, repeat: Infinity }}
            />
          </div>

          <div className="max-w-5xl mx-auto text-center relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-sm mb-8">
                <Zap className="w-4 h-4 mr-2" />
                Transforming Research Administration in Qatar
              </div>
              
              <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
                Qatar Biomedical Research
                <br />
                <span className="bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">
                  Inter-Institutional Data & Governance
                </span>
                <br />
                Ecosystem
              </h1>
              
              <p className="text-xl text-slate-300 mb-10 max-w-3xl mx-auto leading-relaxed">
                A unified platform connecting Qatar's premier research institutions with comprehensive 
                governance, compliance tracking, and collaborative research management.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button size="lg" className="bg-teal-600 hover:bg-teal-500 text-lg px-8 py-6" onClick={handleLaunchClick}>
                  {isAuthenticated ? 'Go to Dashboard' : 'Launch Platform'}
                  <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
                <Link href="/demo">
                  <Button size="lg" className="bg-transparent border-2 border-slate-400 text-white hover:bg-slate-700 text-lg px-8 py-6">
                    Explore Demo
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="py-16 px-6 border-t border-slate-700/50">
          <div className="max-w-5xl mx-auto">
            <motion.div 
              className="text-center mb-12"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              <h2 className="text-2xl font-semibold text-white mb-4">Connecting Qatar's Research Leaders</h2>
              <div className="flex flex-wrap justify-center gap-8">
                {institutions.map((inst, i) => (
                  <motion.div
                    key={inst.name}
                    className="flex items-center space-x-2"
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: inst.color }}
                    />
                    <span className="text-slate-300">{inst.name}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        <section className="py-20 px-6 bg-slate-800/50">
          <div className="max-w-6xl mx-auto">
            <motion.div 
              className="text-center mb-16"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Comprehensive Research Governance
              </h2>
              <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                One platform to manage the complete research lifecycle from ethics approval to publication
              </p>
            </motion.div>

            <motion.div 
              className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              {features.map((feature) => (
                <motion.div key={feature.title} variants={itemVariants}>
                  <Card className="bg-slate-800/80 border-slate-700 h-full hover-elevate">
                    <CardContent className="p-6">
                      <div className="w-12 h-12 rounded-lg bg-teal-500/10 flex items-center justify-center mb-4">
                        <feature.icon className="h-6 w-6 text-teal-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                      <p className="text-slate-400">{feature.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        <section className="py-20 px-6">
          <div className="max-w-4xl mx-auto">
            <motion.div
              className="grid md:grid-cols-3 gap-8 text-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div>
                <div className="flex items-center justify-center mb-4">
                  <Lock className="h-8 w-8 text-teal-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Secure & Compliant</h3>
                <p className="text-slate-400">Built with institutional security standards and regulatory compliance</p>
              </div>
              <div>
                <div className="flex items-center justify-center mb-4">
                  <Network className="h-8 w-8 text-blue-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Interconnected</h3>
                <p className="text-slate-400">Seamless data flow between departments and institutions</p>
              </div>
              <div>
                <div className="flex items-center justify-center mb-4">
                  <BarChart3 className="h-8 w-8 text-purple-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Data-Driven</h3>
                <p className="text-slate-400">Real-time analytics and comprehensive reporting</p>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="py-20 px-6 bg-gradient-to-t from-teal-900/20 to-transparent">
          <div className="max-w-3xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
            >
              <Globe className="h-12 w-12 text-teal-400 mx-auto mb-6" />
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                Ready to Transform Research Management?
              </h2>
              <p className="text-lg text-slate-300 mb-8">
                Experience Q-BRIDGE and see how it can streamline your institution's research governance.
              </p>
              <Button size="lg" className="bg-teal-600 hover:bg-teal-500 text-lg px-10 py-6" onClick={handleLaunchClick}>
                {isAuthenticated ? 'Go to Dashboard' : 'Get Started'}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </motion.div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-700/50 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <img src={qbridgeLogo} alt="Q-BRIDGE" className="h-8 w-8" />
            <span className="text-slate-400">Q-BRIDGE Research Governance Platform</span>
          </div>
          <div className="text-slate-500 text-sm dark:text-slate-400">
            Qatar Biomedical Research Inter-Institutional Data & Governance Ecosystem
          </div>
        </div>
      </footer>
    </div>
  );
}
