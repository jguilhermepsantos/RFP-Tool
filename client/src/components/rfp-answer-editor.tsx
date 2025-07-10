import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Pencil, Save, ChevronDown, ChevronRight, FileText, MessageSquare, User, UserPlus, UserX } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import AnswerFeedback from "./answer-feedback";

interface SourceChunk {
  chunkId: string;
  similarity: number;
  source: 'document' | 'rfp';
}

interface Answer {
  id: string;
  rfpQuestionId: string | null;
  complianceAnswer: string | null;
  generatedAnswer: string | null;
  sourceChunks?: SourceChunk[];
  averageSimilarity?: number;
  confidenceLevel?: 'low' | 'medium' | 'high';
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
  assignedTo: string | null;
  assignedUser: {
    id: string;
    email: string;
    name?: string;
  } | null;
  answer: Answer | null;
}

interface RfpAnswerEditorProps {
  question: Question;
  documentStatus: string;
  projectId: string;
  documentId: string;
  members: Array<{ id: string; email: string; name?: string; role: string }>;
  onAssign: (questionId: string, assignedTo: string) => void;
  onUnassign: (questionId: string) => void;
}

interface SourceChunkDisplayProps {
  chunk: SourceChunk;
  index: number;
}

function SourceChunkDisplay({ chunk, index }: SourceChunkDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const { data: chunkData, isLoading } = useQuery({
    queryKey: ['/api/chunks', chunk.chunkId],
    queryFn: () => fetch(`/api/chunks/${chunk.chunkId}`).then(res => res.json()),
    enabled: isExpanded
  });

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 0.7) return "bg-green-500";
    if (similarity >= 0.5) return "bg-yellow-500";
    return "bg-orange-500";
  };

  const getSimilarityLabel = (similarity: number) => {
    if (similarity >= 0.7) return "High";
    if (similarity >= 0.5) return "Medium";
    return "Low";
  };

  return (
    <div className="border rounded-lg p-3 bg-slate-50">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {chunk.source === 'rfp' ? (
            <MessageSquare className="h-4 w-4 text-blue-600" />
          ) : (
            <FileText className="h-4 w-4 text-green-600" />
          )}
          <span className="text-sm font-medium">
            Source {index + 1} ({chunk.source === 'rfp' ? 'RFP Document' : 'Knowledge Base'})
          </span>
          <Badge variant="outline" className="text-xs">
            <div className={`w-2 h-2 rounded-full ${getSimilarityColor(chunk.similarity)} mr-1`} />
            {getSimilarityLabel(chunk.similarity)} ({Math.round(chunk.similarity * 100)}%)
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-6 w-6 p-0"
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </Button>
      </div>
      

      
      {isExpanded && (
        <div className="mt-3 pt-3 border-t">
          {isLoading ? (
            <div className="text-sm text-gray-500">Loading content...</div>
          ) : chunkData?.content ? (
            <div className="text-sm text-gray-700 bg-white p-3 rounded border">
              <p className="whitespace-pre-line">{chunkData.content}</p>
            </div>
          ) : (
            <div className="text-sm text-gray-500">Content not available</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RfpAnswerEditor({ 
  question, 
  documentStatus, 
  projectId, 
  documentId,
  members,
  onAssign,
  onUnassign
}: RfpAnswerEditorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Fetch user details for the reviewer
  const { data: reviewerData } = useQuery({
    queryKey: [`/api/users/${question.answer?.lastReviewedBy}`],
    enabled: !!question.answer?.lastReviewedBy,
  });
  
  console.log("Reviewer data:", reviewerData);
  console.log("Last reviewed by:", question.answer?.lastReviewedBy);
  
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
  const [isSourcesOpen, setIsSourcesOpen] = useState(false);

  const handleSaveChanges = async () => {
    if (!question.answer?.id || !user?.id) return;
    
    setIsSaving(true);
    
    try {
      await apiRequest(`/api/rfp-answers/${question.answer.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          complianceAnswer,
          generatedAnswer,
          lastReviewedBy: user.id,
          lastReviewedAt: new Date().toISOString()
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

  // Helper functions for source chunks
  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 0.7) return "bg-green-500";
    if (similarity >= 0.5) return "bg-yellow-500";
    return "bg-orange-500";
  };

  const getSimilarityLabel = (similarity: number) => {
    if (similarity >= 0.7) return "High";
    if (similarity >= 0.5) return "Medium";
    return "Low";
  };

  // Helper functions for confidence levels
  const getConfidenceColor = (level: 'low' | 'medium' | 'high') => {
    switch (level) {
      case 'high': return "bg-green-100 text-green-800 border-green-300";
      case 'medium': return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case 'low': return "bg-red-100 text-red-800 border-red-300";
      default: return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  return (
    <Card className={isUnprocessed ? "border-amber-200" : ""}>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <span className="text-muted-foreground">{question.questionNumber}</span>
              {question.questionText}
            </CardTitle>
            <div className="flex flex-col gap-1 mt-2">
              {question.section && (
                <CardDescription>
                  Section: {question.section}
                </CardDescription>
              )}
              {/* Assignment display */}
              {question.assignedUser && (
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <User className="h-3 w-3" />
                  <span>Assigned to: {question.assignedUser.name || question.assignedUser.email}</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Right side buttons and badges */}
          <div className="flex flex-col items-end gap-2 ml-4">
            {/* Assignment controls - only show for unprocessed and under review statuses */}
            {(documentStatus === 'unprocessed' || documentStatus === 'under review') && (
              <div className="flex items-center gap-2">
                {question.assignedTo ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onUnassign(question.id)}
                      className="h-7 px-2"
                    >
                      <UserX className="h-3 w-3 mr-1" />
                      Unassign
                    </Button>
                    <Select value={question.assignedTo} onValueChange={(value) => onAssign(question.id, value)}>
                      <SelectTrigger className="h-7 w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {members.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.name || member.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <Select value="" onValueChange={(value) => onAssign(question.id, value)}>
                    <SelectTrigger className="h-7 w-32">
                      <SelectValue placeholder="Assign to..." />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name || member.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Confidence level badge */}
            {question.answer?.confidenceLevel && (
              <Badge variant="outline" className={getConfidenceColor(question.answer.confidenceLevel)}>
                {question.answer.confidenceLevel.toUpperCase()} SIMILARITY
                {question.answer.averageSimilarity && (
                  <span className="ml-1 text-xs">
                    ({Math.round(question.answer.averageSimilarity * 100)}%)
                  </span>
                )}
              </Badge>
            )}
            
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
              
              {/* Review information */}
              {question.answer.lastReviewedBy && question.answer.lastReviewedAt && (
                <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span>
                    Last reviewed by {reviewerData?.user?.email || question.answer.lastReviewedBy} on{' '}
                    {new Date(question.answer.lastReviewedAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              )}
            </div>

            {/* Source chunks section */}
            {question.answer.sourceChunks && question.answer.sourceChunks.length > 0 && (
              <div>
                <Collapsible open={isSourcesOpen} onOpenChange={setIsSourcesOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                      <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Source Information ({question.answer.sourceChunks.length} sources)
                      </h4>
                      {isSourcesOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 mt-3">
                    {question.answer.sourceChunks.map((chunk: SourceChunk, index: number) => (
                      <SourceChunkDisplay key={chunk.chunkId} chunk={chunk} index={index} />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}

            {/* Add feedback component for processed answers */}
            {question.answer && question.answer.generatedAnswer && (
              <AnswerFeedback 
                answerId={question.answer.id}
                projectId={projectId}
                documentId={documentId}
              />
            )}
          </div>
        ) : (
          <p className="italic text-muted-foreground">No answer available yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
