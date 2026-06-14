import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, ExternalLink, AlertTriangle } from "lucide-react";

export default function IrbDocumentTemplates() {
  const documentTemplates = [
    {
      id: "irb-400",
      title: "IRB-400 Informed Consent Form",
      version: "V2.1 - August 2023",
      description: "Standard template for informed consent forms in English. Must be completed for all studies involving human subjects.",
      category: "Required",
      downloadUrl: "/templates/IRB-400-Informed-Consent-Form-English-V2.1.docx",
      fillable: true
    },
    {
      id: "irb-413",
      title: "IRB-413 Clinical Research Protocol Template",
      version: "V2.0 - October 2023",
      description: "Comprehensive protocol template for clinical research studies. Includes all required sections for IRB review.",
      category: "Required",
      downloadUrl: "/templates/IRB-413-Clinical-Research-Protocol-Template-V2.0.docx",
      fillable: true
    },
    {
      id: "irb-412",
      title: "IRB-412 Closure Report Form",
      version: "V4.1 - February 2023",
      description: "Form to be submitted when requesting closure of a research study and providing final report to IRB.",
      category: "Study Lifecycle",
      downloadUrl: "/templates/IRB-412-Closure-Report-Form-V4.1.docx",
      fillable: true
    },
    {
      id: "irb-417",
      title: "IRB-417 Serious Adverse Event Report Form",
      version: "V1.2 - February 2023",
      description: "Report form for serious adverse events that occur during the study. Must be submitted within one week.",
      category: "Safety Reporting",
      downloadUrl: "/templates/IRB-417-Serious-Adverse-Events-Form-V1.2.docx",
      fillable: true
    },
    {
      id: "reliance-protocol",
      title: "Reliance Protocol Template",
      version: "V1.0",
      description: "Template for multi-site studies where Sidra IRB serves as the reviewing IRB for external sites.",
      category: "Multi-site Studies",
      downloadUrl: "/templates/Reliance-ProtocolTemplate-v1.docx",
      fillable: true
    }
  ];

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "Required":
        return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
      case "Study Lifecycle":
        return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
      case "Safety Reporting":
        return "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300";
      case "Multi-site Studies":
        return "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">IRB Document Templates</h1>
        <p className="text-muted-foreground">
          A preview of the IRB forms that will be available for download once the IRB Office uploads the official files.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 dark:bg-amber-950 dark:border-amber-800" data-testid="banner-templates-unavailable">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 dark:text-amber-400" />
          <div>
            <h3 className="font-medium text-amber-900 dark:text-amber-200">Sample list — templates not yet available</h3>
            <ul className="text-sm text-amber-800 mt-1 space-y-1 dark:text-amber-300">
              <li>• The forms below are <strong>placeholders</strong> showing which templates are planned.</li>
              <li>• The actual files have not been uploaded yet, so downloads are disabled.</li>
              <li>• Contact the IRB office at irb@sidra.org to request the current forms.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {documentTemplates.map((template) => (
          <Card key={template.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{template.title}</CardTitle>
                  <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">{template.version}</p>
                </div>
                <Badge 
                  variant="outline" 
                  className={getCategoryColor(template.category)}
                >
                  {template.category}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4 dark:text-gray-300">
                {template.description}
              </p>
              
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  disabled
                  title="The template file has not been uploaded yet"
                  data-testid={`button-download-${template.id}`}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Not yet available
                </Button>
              </div>

              <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                <span className="inline-flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Sample entry — file not uploaded yet
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Additional Resources</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b">
              <div>
                <h4 className="font-medium">IRB Submission Checklist</h4>
                <p className="text-sm text-gray-600 dark:text-gray-300">Complete checklist for IRB submissions</p>
              </div>
              <Button variant="outline" size="sm" disabled title="Not yet available">
                <Download className="h-4 w-4 mr-2" />
                Not yet available
              </Button>
            </div>
            
            <div className="flex items-center justify-between py-2 border-b">
              <div>
                <h4 className="font-medium">IRB Policies & Procedures</h4>
                <p className="text-sm text-gray-600 dark:text-gray-300">Complete policy document (POL-O-IRB)</p>
              </div>
              <Button variant="outline" size="sm" disabled title="Not yet available">
                <ExternalLink className="h-4 w-4 mr-2" />
                Not yet available
              </Button>
            </div>
            
            <div className="flex items-center justify-between py-2">
              <div>
                <h4 className="font-medium">Training Requirements</h4>
                <p className="text-sm text-gray-600 dark:text-gray-300">CITI Training modules for research personnel</p>
              </div>
              <Button variant="outline" size="sm" disabled title="Not yet available">
                <ExternalLink className="h-4 w-4 mr-2" />
                Not yet available
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}