import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Send, XCircle, FileText, Loader2 } from "lucide-react";

interface StatusActionsProps {
  applicationId: number;
  currentStatus: string;
  onStatusChange?: () => void;
}

export default function StatusActions({ applicationId, currentStatus, onStatusChange }: StatusActionsProps) {
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [comments, setComments] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateStatusMutation = useMutation({
    mutationFn: async ({ status, comments }: { status: string; comments?: string }) => {
      const now = new Date().toISOString();
      const response = await fetch(`/api/irb-applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowStatus: status,
          ...(status === 'submitted' && { submissionDate: now }),
          ...(status === 'draft' && { submissionDate: null }), // Clear submission date when withdrawing
          ...(comments && { 
            reviewComments: JSON.stringify({
              [now]: {
                action: status === 'submitted' ? 'submit' : 'withdraw',
                comments: comments,
                userId: 'current_user' // In a real app, this would come from auth context
              }
            })
          })
        }),
      });
      if (!response.ok) throw new Error('Failed to update status');
      return response.json();
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/irb-applications/${applicationId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/irb-applications'] });
      
      const messages = {
        submitted: "IRB application submitted successfully",
        draft: "IRB application withdrawn and saved as draft"
      };
      
      toast({ 
        title: "Success", 
        description: messages[status as keyof typeof messages] || "Status updated"
      });
      
      setShowSubmitDialog(false);
      setShowWithdrawDialog(false);
      setComments("");
      onStatusChange?.();
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to update application status", 
        variant: "destructive" 
      });
    },
  });

  const handleSubmit = () => {
    updateStatusMutation.mutate({ status: 'submitted', comments });
  };

  const handleWithdraw = () => {
    updateStatusMutation.mutate({ status: 'draft', comments });
  };

  const canSubmit = currentStatus === 'draft' || currentStatus === 'ready_for_pi';
  const canWithdraw = currentStatus === 'submitted' || currentStatus === 'under_review';

  return (
    <div className="flex gap-2">
      {canSubmit && (
        <Button 
          onClick={() => setShowSubmitDialog(true)}
          disabled={updateStatusMutation.isPending}
        >
          <Send className="h-4 w-4 mr-2" />
          Submit for Review
        </Button>
      )}
      
      {canWithdraw && (
        <Button 
          variant="outline"
          onClick={() => setShowWithdrawDialog(true)}
          disabled={updateStatusMutation.isPending}
        >
          <XCircle className="h-4 w-4 mr-2" />
          Withdraw
        </Button>
      )}

      {/* Submit Dialog */}
      <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Submit IRB Application
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you ready to submit this IRB application for review? Once submitted, 
              the IRB office will begin their review process.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4">
            <label className="text-sm font-medium">Submission Notes (Optional)</label>
            <Textarea
              placeholder="Add any notes for the IRB review team..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="mt-2"
              rows={3}
            />
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleSubmit}
              disabled={updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit Application
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Withdraw Dialog */}
      <AlertDialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Withdraw IRB Application
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will withdraw your application from review and return it to draft status. 
              You can make changes and resubmit later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4">
            <label className="text-sm font-medium">Reason for Withdrawal</label>
            <Textarea
              placeholder="Please explain why you're withdrawing this application..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="mt-2"
              rows={3}
              required
            />
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleWithdraw}
              disabled={updateStatusMutation.isPending || !comments.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {updateStatusMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Withdraw Application
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}