import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, MessageSquare } from "lucide-react";
import NavHeader from "@/components/nav-header";
import { useAuth } from "@/lib/auth";

export default function ProvideFeedbackPage() {
  const [content, setContent] = useState("");
  const { toast } = useToast();
  const { user } = useAuth();

  const feedbackMutation = useMutation({
    mutationFn: (content: string) => {
      return apiRequest("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": user?.email || "",
        },
        body: JSON.stringify({ content }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Feedback submitted successfully",
        description: "Thank you for your feedback! We appreciate your input.",
      });
      setContent(""); // Clear the form
    },
    onError: (error: any) => {
      toast({
        title: "Error submitting feedback",
        description: error.message || "Please try again later",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!content.trim()) {
      toast({
        title: "Feedback required",
        description: "Please enter your feedback before submitting",
        variant: "destructive",
      });
      return;
    }

    feedbackMutation.mutate(content.trim());
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <NavHeader />
      
      <div className="container py-10">
        <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Provide Feedback</h1>
          <p className="text-muted-foreground">
            Help us improve the RFP Assistant Tool by sharing your thoughts, suggestions, 
            or reporting any issues you've encountered.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Share Your Feedback
            </CardTitle>
            <CardDescription>
              Your feedback is valuable to us. Please be as detailed as possible 
              to help us understand and improve the tool.
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Share your thoughts, suggestions, or report any issues you've encountered with the RFP Assistant Tool..."
                  className="min-h-32 resize-none"
                  disabled={feedbackMutation.isPending}
                />
                <p className="text-sm text-muted-foreground mt-2">
                  {content.length}/1000 characters
                </p>
              </div>
              
              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  disabled={feedbackMutation.isPending || !content.trim()}
                  className="min-w-32"
                >
                  {feedbackMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit Feedback"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="mt-8 p-4 bg-muted rounded-lg">
          <h3 className="font-semibold mb-2">What kind of feedback are we looking for?</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Feature requests or suggestions for improvement</li>
            <li>• Issues or bugs you've encountered</li>
            <li>• Usability feedback and user experience insights</li>
            <li>• Performance or speed-related concerns</li>
            <li>• Any other thoughts about the tool</li>
          </ul>
        </div>
        </div>
      </div>
    </div>
  );
}