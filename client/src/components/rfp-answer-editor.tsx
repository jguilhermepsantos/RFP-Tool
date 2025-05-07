import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Pencil, Save } from "lucide-react";

interface Answer {
  id: string;
  rfpQuestionId: string | null;
  complianceAnswer: string | null;
  generatedAnswer: string | null;
  // finalAnswer removed as it doesn't exist in the database
  lastReviewedBy: string | null;
  lastReviewedAt: string | null;
}

interface Question {
  id: string;
  rfpDocumentId: string | null;
  questionNumber: string;
  questionText: string;
  section: string | null;
  answer: Answer | null;
}

interface RfpAnswerEditorProps {
  question: Question;
  documentStatus: string;
  projectId: string;
  documentId: string;
}

export default function RfpAnswerEditor({ 
  question, 
  documentStatus, 
  projectId, 
  documentId 
}: RfpAnswerEditorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  console.log("RfpAnswerEditor - Question:", question);
  console.log("RfpAnswerEditor - Answer:", question.answer);
  console.log("RfpAnswerEditor - Document Status:", documentStatus);
  
  const [complianceAnswer, setComplianceAnswer] = useState(
    question.answer?.complianceAnswer || ""
  );
  const [generatedAnswer, setGeneratedAnswer] = useState(
    question.answer?.generatedAnswer || ""
  );
  // Remove the final answer state since we no longer need it
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleSaveChanges = async () => {
    if (!question.answer?.id) return;
    
    setIsSaving(true);
    
    try {
      await apiRequest(`/api/rfp-answers/${question.answer.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          complianceAnswer,
          generatedAnswer
        })
      });
      
      toast({
        title: "Success",
        description: "Answer updated successfully",
      });
      
      // Refresh the data
      queryClient.invalidateQueries({ 
        queryKey: [`/api/projects/${projectId}/rfp-documents/${documentId}`] 
      });
      
      setIsDialogOpen(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || "Failed to update answer",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Allow editing when document is either 'processed' or 'under review'
  const isEditable = documentStatus === 'processed' || documentStatus === 'under review';
  const isReadOnly = documentStatus === 'done';
  const isUnprocessed = documentStatus === 'unprocessed';

  return (
    <Card className={isUnprocessed ? "border-amber-200" : ""}>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <span className="text-muted-foreground">{question.questionNumber}</span>
              {question.questionText}
            </CardTitle>
            {question.section && (
              <CardDescription>
                Section: {question.section}
              </CardDescription>
            )}
          </div>
          
          {/* Only show edit button for processed or under review documents */}
          {isEditable && !isReadOnly && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Pencil className="mr-2 h-3 w-3" />
                  Edit
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Edit Answer</DialogTitle>
                  <DialogDescription>
                    Question: {question.questionText}
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 my-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Compliance Answer</h4>
                    <Textarea
                      value={complianceAnswer}
                      onChange={(e) => setComplianceAnswer(e.target.value)}
                      placeholder="Enter compliance answer"
                      rows={3}
                    />
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium mb-2">Generated Answer</h4>
                    <Textarea
                      value={generatedAnswer}
                      onChange={(e) => setGeneratedAnswer(e.target.value)}
                      placeholder="Enter generated answer"
                      rows={6}
                    />
                  </div>
                  
                  {/* Final Answer field removed */}
                </div>
                
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveChanges} disabled={isSaving}>
                    <Save className="mr-2 h-4 w-4" />
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isUnprocessed ? (
          <div className="p-0">
            <p className="text-amber-100">
              {/* This question is waiting to be processed. Click the "Process Questions" button at the top to generate AI-assisted answers. */}
            </p>
          </div>
        ) : question.answer ? (
          <div className="space-y-4">
            {/* Compliance answer section */}
            <div>
              <h4 className="text-sm font-medium mb-2 text-blue-700">Compliance Answer</h4>
              <div className="p-4 bg-gray-50 rounded-md">
                {question.answer.complianceAnswer ? (
                  <p className="whitespace-pre-line">{question.answer.complianceAnswer}</p>
                ) : (
                  <p className="italic text-muted-foreground">No compliance answer provided yet.</p>
                )}
              </div>
            </div>
            
            {/* AI Generated answer section */}
            <div>
              <h4 className="text-sm font-medium mb-2 text-purple-700">AI Generated Answer</h4>
              <div className="p-4 bg-gray-50 rounded-md">
                {question.answer.generatedAnswer ? (
                  <p className="whitespace-pre-line">{question.answer.generatedAnswer}</p>
                ) : (
                  <p className="italic text-muted-foreground">No generated answer available yet.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="italic text-muted-foreground">No answer available yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
