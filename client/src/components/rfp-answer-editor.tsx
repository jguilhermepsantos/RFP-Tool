import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Pencil, Save } from "lucide-react";

interface Answer {
  id: string;
  rfpQuestionId?: string | null;
  rfp_question_id?: string | null;
  rfpDocumentId?: string | null;
  rfp_document_id?: string | null;
  complianceAnswer?: string | null;
  compliance_answer?: string | null;
  generatedAnswer?: string | null;
  generated_answer?: string | null;
  finalAnswer?: string | null;
  final_answer?: string | null;
  lastReviewedBy?: string | null;
  last_reviewed_by?: string | null;
  lastReviewedAt?: string | null;
  last_reviewed_at?: string | null;
  question_text?: string;
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
  
  // Add debug logging to see the actual answer object structure
  console.log(`Question ${question.id} answer:`, question.answer);
  
  // Handle both camelCase and snake_case formats from the API
  const [complianceAnswer, setComplianceAnswer] = useState(
    question.answer?.complianceAnswer || question.answer?.compliance_answer || ""
  );
  const [generatedAnswer, setGeneratedAnswer] = useState(
    question.answer?.generatedAnswer || question.answer?.generated_answer || ""
  );
  const [finalAnswer, setFinalAnswer] = useState(
    question.answer?.finalAnswer || question.answer?.final_answer || ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleSaveChanges = async () => {
    if (!question.answer?.id) return;
    
    setIsSaving(true);
    
    try {
      await apiRequest("PATCH", `/api/rfp-answers/${question.answer.id}`, {
        complianceAnswer,
        generatedAnswer,
        finalAnswer
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

  const isEditable = documentStatus === 'processed' || documentStatus === 'reviewed';

  return (
    <Card>
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
          
          {isEditable && (
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
                  
                  <div>
                    <h4 className="text-sm font-medium mb-2">Final Answer</h4>
                    <Textarea
                      value={finalAnswer}
                      onChange={(e) => setFinalAnswer(e.target.value)}
                      placeholder="Enter final answer"
                      rows={6}
                    />
                  </div>
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
        {question.answer ? (
          <Tabs defaultValue="generated">
            <TabsList className="mb-4">
              <TabsTrigger value="compliance">Compliance</TabsTrigger>
              <TabsTrigger value="generated">AI Generated</TabsTrigger>
              {(question.answer.finalAnswer || question.answer.final_answer) && (
                <TabsTrigger value="final">Final Answer</TabsTrigger>
              )}
            </TabsList>
            
            <TabsContent value="compliance" className="p-4 bg-gray-50 rounded-md">
              {(question.answer.complianceAnswer || question.answer.compliance_answer) ? (
                <p className="whitespace-pre-line">{question.answer.complianceAnswer || question.answer.compliance_answer}</p>
              ) : (
                <p className="italic text-muted-foreground">No compliance answer provided yet.</p>
              )}
            </TabsContent>
            
            <TabsContent value="generated" className="p-4 bg-gray-50 rounded-md">
              {(question.answer.generatedAnswer || question.answer.generated_answer) ? (
                <p className="whitespace-pre-line">{question.answer.generatedAnswer || question.answer.generated_answer}</p>
              ) : (
                <p className="italic text-muted-foreground">No generated answer available yet.</p>
              )}
            </TabsContent>
            
            {(question.answer.finalAnswer || question.answer.final_answer) && (
              <TabsContent value="final" className="p-4 bg-gray-50 rounded-md">
                <p className="whitespace-pre-line">{question.answer.finalAnswer || question.answer.final_answer}</p>
              </TabsContent>
            )}
          </Tabs>
        ) : (
          <p className="italic text-muted-foreground">No answer available yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
