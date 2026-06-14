import { Link } from "wouter";
import { 
  PlusCircle, Upload, ClipboardList, Handshake, FileText
} from "lucide-react";

interface QuickLinkProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
}

function QuickLink({ icon, title, description, href }: QuickLinkProps) {
  return (
    <Link 
      href={href}
      className="flex flex-col items-center justify-center text-center p-4 border border-neutral-100 rounded-md hover:border-primary-300 hover:bg-primary-50 transition-colors"
    >
      <div className="h-12 w-12 rounded-full bg-primary-100 flex items-center justify-center text-primary-500 mb-2">
        {icon}
      </div>
      <p className="font-medium text-foreground text-sm">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </Link>
  );
}

export default function QuickLinks() {
  const links = [
    {
      icon: <PlusCircle className="h-5 w-5" />,
      title: "Create Project",
      description: "New research initiative",
      href: "/projects/create"
    },
    {
      icon: <FileText className="h-5 w-5" />,
      title: "Create Activity",
      description: "New SDR record",
      href: "/research-activities/create"
    },
    {
      icon: <Upload className="h-5 w-5" />,
      title: "Add Publication",
      description: "Research publication",
      href: "/publications/create"
    },
    {
      icon: <ClipboardList className="h-5 w-5" />,
      title: "IRB Application",
      description: "Ethics approval",
      href: "/irb/create"
    },
    {
      icon: <Handshake className="h-5 w-5" />,
      title: "Contracts",
      description: "Manage agreements",
      href: "/contracts"
    }
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm dark:bg-card">
      <div className="p-4 border-b border-neutral-100">
        <h2 className="font-medium text-lg">Quick Links</h2>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {links.map((link, index) => (
            <QuickLink
              key={index}
              icon={link.icon}
              title={link.title}
              description={link.description}
              href={link.href}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
