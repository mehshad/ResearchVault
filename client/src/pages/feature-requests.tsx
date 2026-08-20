import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MessageSquarePlus, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const categoryOptions = [
  { value: "ui", label: "User Interface" },
  { value: "backend", label: "Backend" },
  { value: "feature", label: "New Feature" },
  { value: "bugfix", label: "Bug Fix" },
  { value: "enhancement", label: "Enhancement" },
];

const priorityOptions = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

type RequestForm = {
  title: string;
  description: string;
  category: string;
  priority: string;
  tags: string;
  requestedBy: string;
};

const initialForm: RequestForm = {
  title: "",
  description: "",
  category: "feature",
  priority: "medium",
  tags: "",
  requestedBy: "",
};

export default function FeatureRequestsPage() {
  const { toast } = useToast();
  const [form, setForm] = useState<RequestForm>(initialForm);

  const createRequestMutation = useMutation({
    mutationFn: async (request: RequestForm) => {
      const response = await fetch("/api/feature-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: request.title,
          description: request.description,
          category: request.category,
          priority: request.priority,
          originalRequest: request.description,
          requestedBy: request.requestedBy.trim() || "Anonymous User",
          tags: request.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to submit the feature request.");
      }
      return payload;
    },
    onSuccess: () => {
      setForm(initialForm);
      toast({ title: "Feature request submitted" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not submit feature request",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim() || !form.description.trim()) {
      toast({
        title: "Add a title and description",
        variant: "destructive",
      });
      return;
    }
    createRequestMutation.mutate(form);
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <MessageSquarePlus className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Feature Request</h1>
          <p className="text-muted-foreground">
            Share an improvement or report a problem for the team to review.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Submit a request</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="feature-request-title">Title</Label>
              <Input
                id="feature-request-title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Briefly describe what you need"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feature-request-description">Description</Label>
              <Textarea
                id="feature-request-description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Tell us what would help and why."
                className="min-h-32"
                required
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="feature-request-category">Category</Label>
                <Select value={form.category} onValueChange={(category) => setForm({ ...form, category })}>
                  <SelectTrigger id="feature-request-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="feature-request-priority">Priority</Label>
                <Select value={form.priority} onValueChange={(priority) => setForm({ ...form, priority })}>
                  <SelectTrigger id="feature-request-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priorityOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feature-request-tags">Tags (optional)</Label>
              <Input
                id="feature-request-tags"
                value={form.tags}
                onChange={(event) => setForm({ ...form, tags: event.target.value })}
                placeholder="reporting, export, mobile"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feature-request-name">Your name (optional)</Label>
              <Input
                id="feature-request-name"
                value={form.requestedBy}
                onChange={(event) => setForm({ ...form, requestedBy: event.target.value })}
                placeholder="Leave blank to submit anonymously"
              />
            </div>

            <Button type="submit" disabled={createRequestMutation.isPending}>
              <Send className="mr-2 h-4 w-4" />
              {createRequestMutation.isPending ? "Submitting..." : "Submit request"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}