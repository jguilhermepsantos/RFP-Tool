import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ThumbsUp, ThumbsDown, MessageSquare, Edit3, Check, X } from "lucide-react";

interface AnswerFeedback {
  id: string;
  rfpQuestionId: string;
  rating: 'good' | 'bad';
  feedbackText: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface AnswerFeedbackProps {
  questionId: string;
  projectId: string;
  documentId: string;
}

export default function AnswerFeedback({ questionId, projectId, documentId }: AnswerFeedbackProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [rating, setRating] = useState<'good' | 'bad' | null>(null);
  const [feedbackText, setFeedbackText] = useState("");

  // Fetch existing feedback
  const { data: feedbackData, isLoading } = useQuery({
    queryKey: [`/api/rfp-questions/${questionId}/feedback`],
    enabled: !!questionId
  });

  const feedback = feedbackData?.feedback as AnswerFeedback | undefined;

  // Create feedback mutation
  const createFeedbackMutation = useMutation({
    mutationFn: async (data: { rating: 'good' | 'bad'; feedbackText?: string }) => {
      return apiRequest(`/api/rfp-questions/${questionId}/feedback`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": user?.email || ""
        },
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Feedback submitted successfully",
      });
      queryClient.invalidateQueries({ 
        queryKey: [`/api/rfp-questions/${questionId}/feedback`] 
      });
      setIsEditing(false);
      setRating(null);
      setFeedbackText("");
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || "Failed to submit feedback",
      });
    }
  });

  // Update feedback mutation
  const updateFeedbackMutation = useMutation({
    mutationFn: async (data: { rating?: 'good' | 'bad'; feedbackText?: string }) => {
      return apiRequest(`/api/rfp-questions/${questionId}/feedback/${feedback?.id}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": user?.email || ""
        },
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Feedback updated successfully",
      });
      queryClient.invalidateQueries({ 
        queryKey: [`/api/rfp-questions/${questionId}/feedback`] 
      });
      setIsEditing(false);
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || "Failed to update feedback",
      });
    }
  });

  // Delete feedback mutation
  const deleteFeedbackMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/rfp-questions/${questionId}/feedback/${feedback?.id}`, {
        method: "DELETE"
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Feedback deleted successfully",
      });
      queryClient.invalidateQueries({ 
        queryKey: [`/api/rfp-questions/${questionId}/feedback`] 
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || "Failed to delete feedback",
      });
    }
  });

  const handleSubmitFeedback = () => {
    if (!rating) return;

    if (feedback) {
      // Update existing feedback
      updateFeedbackMutation.mutate({
        rating,
        feedbackText: feedbackText || undefined
      });
    } else {
      // Create new feedback
      createFeedbackMutation.mutate({
        rating,
        feedbackText: feedbackText || undefined
      });
    }
  };

  const handleStartEdit = () => {
    setIsEditing(true);
    setRating(feedback?.rating || null);
    setFeedbackText(feedback?.feedbackText || "");
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setRating(null);
    setFeedbackText("");
  };

  const getRatingBadge = (rating: 'good' | 'bad') => {
    return rating === 'good' ? (
      <Badge className="bg-green-100 text-green-800 border-green-200">
        <ThumbsUp className="w-3 h-3 mr-1" />
        Good
      </Badge>
    ) : (
      <Badge className="bg-red-100 text-red-800 border-red-200">
        <ThumbsDown className="w-3 h-3 mr-1" />
        Needs Improvement
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          AI Answer Feedback
          {feedback && getRatingBadge(feedback.rating)}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {feedback && !isEditing ? (
          // Display existing feedback
          <div className="space-y-3">
            {feedback.feedbackText && (
              <div className="p-3 bg-gray-50 rounded-md">
                <p className="text-sm text-gray-700">{feedback.feedbackText}</p>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleStartEdit}
                className="flex items-center gap-1"
              >
                <Edit3 className="w-3 h-3" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => deleteFeedbackMutation.mutate()}
                className="flex items-center gap-1 text-red-600 hover:text-red-700"
              >
                <X className="w-3 h-3" />
                Remove
              </Button>
            </div>
          </div>
        ) : (
          // Create/edit feedback form
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Rate this AI-generated answer:</p>
              <div className="flex gap-2">
                <Button
                  variant={rating === 'good' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRating('good')}
                  className="flex items-center gap-1"
                >
                  <ThumbsUp className="w-3 h-3" />
                  Good
                </Button>
                <Button
                  variant={rating === 'bad' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRating('bad')}
                  className="flex items-center gap-1"
                >
                  <ThumbsDown className="w-3 h-3" />
                  Needs Improvement
                </Button>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">
                Additional feedback (optional):
              </label>
              <Textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Share specific suggestions for improving this answer..."
                className="resize-none"
                rows={3}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSubmitFeedback}
                disabled={!rating || createFeedbackMutation.isPending || updateFeedbackMutation.isPending}
                size="sm"
                className="flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                {feedback ? 'Update' : 'Submit'} Feedback
              </Button>
              {(feedback || isEditing) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelEdit}
                  className="flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}