import { format } from "date-fns";
import { 
  FileText, 
  Send, 
  Eye, 
  CheckCircle, 
  Clock, 
  MessageCircle,
  XCircle,
  AlertTriangle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TimelineEntry {
  date: Date;
  type: 'status' | 'comment';
  element: React.ReactNode;
}

interface Comment {
  id: number;
  comment: string;
  commentType: 'office_comment' | 'reviewer_feedback' | 'pi_response' | 'status_change';
  authorName?: string;
  createdAt: string;
}

interface Application {
  createdAt?: string;
  submissionDate?: string;
  vettedDate?: string;
  underReviewDate?: string;
  approvalDate?: string;
  expirationDate?: string;
}

interface TimelineCommentsProps {
  application: Application;
  comments: Comment[];
  title?: string;
  showHeader?: boolean;
  includeStatusChanges?: boolean;
}

export default function TimelineComments({ 
  application, 
  comments, 
  title = "Timeline & Comments",
  showHeader = true,
  includeStatusChanges = false
}: TimelineCommentsProps) {
  
  const createTimelineEntries = (): TimelineEntry[] => {
    const timelineEntries: TimelineEntry[] = [];
    
    // Add status timeline events based on application dates
    if (application.createdAt) {
      timelineEntries.push({
        date: new Date(application.createdAt),
        type: 'status',
        element: (
          <div className="flex items-center space-x-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Draft Created</p>
              <p className="text-sm text-muted-foreground">Protocol saved as draft</p>
            </div>
          </div>
        )
      });
    }
    
    if (application.submissionDate) {
      timelineEntries.push({
        date: new Date(application.submissionDate),
        type: 'status',
        element: (
          <div className="flex items-center space-x-2">
            <Send className="h-4 w-4 text-blue-500" />
            <div>
              <p className="text-sm font-medium">Submitted</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Application submitted for review</p>
            </div>
          </div>
        )
      });
    }
    
    if (application.vettedDate) {
      timelineEntries.push({
        date: new Date(application.vettedDate),
        type: 'status',
        element: (
          <div className="flex items-center space-x-2">
            <Eye className="h-4 w-4 text-purple-500" />
            <div>
              <p className="text-sm font-medium">Vetted</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Initial review completed</p>
            </div>
          </div>
        )
      });
    }
    
    if (application.underReviewDate) {
      timelineEntries.push({
        date: new Date(application.underReviewDate),
        type: 'status',
        element: (
          <div className="flex items-center space-x-2">
            <Eye className="h-4 w-4 text-yellow-500" />
            <div>
              <p className="text-sm font-medium">Under Review</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Assigned to board members</p>
            </div>
          </div>
        )
      });
    }
    
    if (application.approvalDate) {
      timelineEntries.push({
        date: new Date(application.approvalDate),
        type: 'status',
        element: (
          <div className="flex items-center space-x-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-sm font-medium">Approved</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Protocol approved for implementation</p>
            </div>
          </div>
        )
      });
    }
    
    if (application.expirationDate) {
      timelineEntries.push({
        date: new Date(application.expirationDate),
        type: 'status',
        element: (
          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-orange-500" />
            <div>
              <p className="text-sm font-medium">Expires</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Protocol expiration date</p>
            </div>
          </div>
        )
      });
    }
    
    // Add comments from the separate comments table
    if (comments && comments.length > 0) {
      comments.forEach((comment: Comment) => {
        // status_change comments are normally redundant with the date-derived status
        // events above, but for a complete printed/audit record we render every
        // recorded transition (e.g. triage_complete, revisions_requested, resubmitted)
        // that the fixed date fields cannot capture.
        if (comment.commentType === 'status_change') {
          if (!includeStatusChanges) {
            return;
          }
          timelineEntries.push({
            date: new Date(comment.createdAt),
            type: 'status',
            element: (
              <div className="flex items-start space-x-2">
                <AlertTriangle className="h-4 w-4 text-slate-500 mt-0.5 dark:text-slate-400" />
                <div>
                  <p className="text-sm font-medium">Status Change</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{comment.comment}</p>
                  {comment.authorName && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">{comment.authorName}</p>
                  )}
                </div>
              </div>
            )
          });
          return;
        }
        
        const commentDate = new Date(comment.createdAt);
        let bgClass = 'bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800';
        let iconClass = 'text-amber-600 dark:text-amber-400';
        let titleClass = 'text-amber-800 dark:text-amber-300';
        let textClass = 'text-amber-700 dark:text-amber-300';
        let authorClass = 'text-amber-600 dark:text-amber-400';
        let commentTitle = 'Comment';
        
        // Style based on comment type
        switch (comment.commentType) {
          case 'office_comment':
            bgClass = 'bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800';
            iconClass = 'text-amber-600 dark:text-amber-400';
            titleClass = 'text-amber-800 dark:text-amber-300';
            textClass = 'text-amber-700 dark:text-amber-300';
            authorClass = 'text-amber-600 dark:text-amber-400';
            commentTitle = 'Office Comment';
            break;
          case 'reviewer_feedback':
            bgClass = 'bg-orange-50 border-orange-200 dark:bg-orange-950 dark:border-orange-800';
            iconClass = 'text-orange-600 dark:text-orange-400';
            titleClass = 'text-orange-800 dark:text-orange-300';
            textClass = 'text-orange-700 dark:text-orange-300';
            authorClass = 'text-orange-600 dark:text-orange-400';
            commentTitle = 'Reviewer Feedback';
            break;
          case 'pi_response':
            bgClass = 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800';
            iconClass = 'text-blue-600 dark:text-blue-400';
            titleClass = 'text-blue-800 dark:text-blue-300';
            textClass = 'text-blue-700 dark:text-blue-300';
            authorClass = 'text-blue-600 dark:text-blue-400';
            commentTitle = 'PI Response';
            break;
          default:
            bgClass = 'bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-700';
            iconClass = 'text-gray-600 dark:text-gray-300';
            titleClass = 'text-gray-800 dark:text-gray-200';
            textClass = 'text-gray-700 dark:text-gray-300';
            authorClass = 'text-gray-600 dark:text-gray-300';
            commentTitle = 'Comment';
        }
        
        timelineEntries.push({
          date: commentDate,
          type: 'comment',
          element: (
            <div className={`p-3 ${bgClass} border rounded-lg`}>
              <div className="flex items-start gap-2">
                <MessageCircle className={`h-4 w-4 ${iconClass} mt-0.5`} />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className={`text-sm font-medium ${titleClass}`}>{commentTitle}</h4>
                    <span className={`text-xs ${authorClass}`}>
                      {comment.authorName || 'Unknown'}
                    </span>
                  </div>
                  <p className={`text-sm ${textClass}`}>{comment.comment}</p>
                </div>
              </div>
            </div>
          )
        });
      });
    }
    
    // Sort all entries chronologically
    timelineEntries.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    return timelineEntries;
  };

  const timelineEntries = createTimelineEntries();

  const TimelineContent = () => (
    <div className="space-y-3">
      {timelineEntries.map((entry, index) => (
        <div key={`timeline-${entry.type}-${index}`} className="relative">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 text-xs text-gray-400 w-20 dark:text-gray-500">
              {format(entry.date, 'MMM d, HH:mm')}
            </div>
            <div className="flex-1">
              {entry.element}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  if (!showHeader) {
    return <TimelineContent />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <TimelineContent />
      </CardContent>
    </Card>
  );
}