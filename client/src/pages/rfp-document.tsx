import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import NavHeader from "@/components/nav-header";
import RfpAnswerEditor from "@/components/rfp-answer-editor";
import HierarchicalSectionComponent from "@/components/hierarchical-section";
import ProgressModal from "@/components/progress-modal";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { organizeQuestionsHierarchically, calculateHierarchicalProgress, HierarchicalQuestion } from "@/utils/hierarchical-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle, PlayCircle, ChevronRight, Filter, Loader2, User, UserPlus, UserX, FolderOpen } from "lucide-react";

interface RfpDocumentProps {
  projectId: string;
  documentId: string;
}

export default function RfpDocument({ projectId, documentId }: RfpDocumentProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isDownloading, setIsDownloading] = useState(false);
  const [confidenceFilter, setConfidenceFilter] = useState<string>("all");
  const [assignmentFilter, setAssignmentFilter] = useState<string>("all");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"hierarchical" | "flat">("hierarchical");

  interface ProjectResponse {
    project: {
      id: string;
      name: string;
      description: string | null;
      createdAt: string;
    };
  }

  interface DocumentResponse {
    document: {
      id: string;
      name: string;
      status: string;
      isPastRfp: boolean;
      createdAt: string;
      projectId: string;
    };
    questionsWithAnswers: Array<{
      id: string;
      rfpDocumentId: string | null;
      questionNumber: string;
      questionText: string;
      requirementId: string | null;
      section: string | null;
      subsection: string | null;
      assignedTo: string | null;
      assignedUser: {
        id: string;
        email: string;
        name?: string;
      } | null;
      createdAt: string;
      answer: {
        id: string;
        rfpQuestionId: string | null;
        complianceAnswer: string | null;
        generatedAnswer: string | null;
        lastReviewedBy: string | null;
        lastReviewedAt: string | null;
      } | null;
    }>;
  }

  // Get project details
  const { data: projectData, isLoading: projectLoading } = useQuery<ProjectResponse>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !!projectId,
  });

  // Get document details
  const { data, isLoading, isError, error } = useQuery<DocumentResponse>({
    queryKey: [`/api/projects/${projectId}/rfp-documents/${documentId}`],
    enabled: !!projectId && !!documentId,
  });

  // Get project members for assignment
  const { data: membersData } = useQuery<{ members: Array<{ id: string; email: string; name?: string; role: string }> }>({
    queryKey: [`/api/projects/${projectId}/members`],
    enabled: !!projectId,
  });

  // Section assignments are now handled directly in the rfp_questions table
  // No need for separate section assignments query

  useEffect(() => {
    if (isError && error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || "Failed to load document",
      });
      // Redirect to project details if document not found
      setLocation(`/projects/${projectId}`);
    }
  }, [isError, error, toast, setLocation, projectId]);

  const project = projectData?.project;
  const document = data?.document;
  
  // Sort and filter the questions - maintain stable order by sortOrder (creation time)
  const allQuestionsWithAnswers = [...(data?.questionsWithAnswers || [])].sort((a, b) => {
    // Use sortOrder if available (backend provides this based on created_at), otherwise fallback to creation time
    if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
      return a.sortOrder - b.sortOrder;
    }
    
    // Fallback to creation time comparison
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateA - dateB;
  });

  // Apply confidence level and assignment filters
  const questionsWithAnswers = allQuestionsWithAnswers.filter((item) => {
    // Apply confidence filter
    if (confidenceFilter !== "all" && item.answer?.confidenceLevel !== confidenceFilter) {
      return false;
    }
    
    // Apply assignment filter
    if (assignmentFilter === "assigned-to-me" && item.assignedTo !== user?.id) {
      return false;
    }
    if (assignmentFilter === "assigned" && !item.assignedTo) {
      return false;
    }
    if (assignmentFilter === "unassigned" && item.assignedTo) {
      return false;
    }
    
    return true;
  });

  const handleProcessDocument = () => {
    if (isProcessing) return; // Prevent multiple clicks
    setIsProcessing(true);
    setProgressModalOpen(true);
  };

  const startProcessing = async () => {
    try {
      await apiRequest(`/api/projects/${projectId}/rfp-documents/${documentId}/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      
      toast({
        title: "Success",
        description: "Questions processed successfully! AI-generated answers are now available.",
      });
      
      // Refresh the data
      queryClient.invalidateQueries({ 
        queryKey: [`/api/projects/${projectId}/rfp-documents/${documentId}`] 
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Processing Failed",
        description: (error as Error).message || "Failed to process questions. Please try again.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const assignQuestion = async (questionId: string, assignedTo: string) => {
    try {
      await apiRequest(`/api/rfp-questions/${questionId}/assign`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ assignedTo }),
      });
      
      // Refresh the data
      queryClient.invalidateQueries({ 
        queryKey: [`/api/projects/${projectId}/rfp-documents/${documentId}`] 
      });
      
      toast({
        title: "Success",
        description: "Question assigned successfully",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to assign question",
      });
    }
  };

  const unassignQuestion = async (questionId: string) => {
    try {
      await apiRequest(`/api/rfp-questions/${questionId}/unassign`, {
        method: "PUT",
      });
      
      // Refresh the data
      queryClient.invalidateQueries({ 
        queryKey: [`/api/projects/${projectId}/rfp-documents/${documentId}`] 
      });
      
      toast({
        title: "Success",
        description: "Question unassigned successfully",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to unassign question",
      });
    }
  };

  const assignSection = async (section: string, subsection: string | null, assignedTo: string) => {
    try {
      await apiRequest(`/api/rfp-documents/${documentId}/assign-section`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ section, subsection, assignedTo }),
      });
      
      // Refresh the data
      queryClient.invalidateQueries({ 
        queryKey: [`/api/projects/${projectId}/rfp-documents/${documentId}`] 
      });
      
      const label = subsection ? `${section} > ${subsection}` : section;
      toast({
        title: "Success",
        description: `${label} assigned successfully`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to assign section",
      });
    }
  };

  const unassignSection = async (section: string, subsection: string | null) => {
    try {
      await apiRequest(`/api/rfp-documents/${documentId}/unassign-section`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ section, subsection }),
      });
      
      // Refresh the data
      queryClient.invalidateQueries({ 
        queryKey: [`/api/projects/${projectId}/rfp-documents/${documentId}`] 
      });
      
      const label = subsection ? `${section} > ${subsection}` : section;
      toast({
        title: "Success",
        description: `${label} unassigned successfully`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to unassign section",
      });
    }
  };

  const updateDocumentStatus = async (status: string) => {
    try {
      await apiRequest(`/api/projects/${projectId}/rfp-documents/${documentId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          status
        })
      });
      
      toast({
        title: "Success",
        description: `Document marked as ${status}`,
      });
      
      // Refresh the data
      queryClient.invalidateQueries({ 
        queryKey: [`/api/projects/${projectId}/rfp-documents/${documentId}`] 
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || `Failed to update document status`,
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "unprocessed":
        return <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">Unprocessed</Badge>;
      case "processed":
        return <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">Processed</Badge>;
      case "under review":
        return <Badge variant="outline" className="bg-purple-50 text-purple-600 border-purple-200">Under Review</Badge>;
      case "reviewed": // Kept for backward compatibility
        return <Badge variant="outline" className="bg-purple-50 text-purple-600 border-purple-200">Under Review</Badge>;
      case "done":
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200">Done</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleDownloadCsv = async () => {
    if (!documentId) return;
    
    try {
      setIsDownloading(true);
      
      // Get the CSV data from the API
      const response = await fetch(`/api/projects/${projectId}/rfp-documents/${documentId}/export-csv`);
      
      if (!response.ok) {
        throw new Error(`Error downloading CSV: ${response.statusText}`);
      }
      
      // Get the CSV content as text
      const csvContent = await response.text();
      
      // Create a blob and download link
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      // Create a temporary link to trigger the download
      const link = window.document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${document?.name || 'rfp_export'}_answers.csv`);
      window.document.body.appendChild(link);
      link.click();
      
      // Clean up
      window.document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Success",
        description: "CSV file downloaded successfully",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || "Failed to download CSV file",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const getActionButton = (status: string) => {
    switch (status) {
      case "unprocessed":
        return (
          <Button 
            onClick={handleProcessDocument}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="mr-2 h-4 w-4" />
            )}
            {isProcessing ? "Processing Questions..." : "Process Questions"}
          </Button>
        );
      case "processed":
        return (
          <Button onClick={() => updateDocumentStatus("under review")}>
            <CheckCircle className="mr-2 h-4 w-4" />
            Mark as Under Review
          </Button>
        );
      case "under review":
      case "reviewed": // Kept for backward compatibility
        return (
          <Button onClick={() => updateDocumentStatus("done")}>
            <CheckCircle className="mr-2 h-4 w-4" />
            Mark as Done
          </Button>
        );
      case "done":
        return (
          <Button variant="outline" onClick={handleDownloadCsv}>
            <svg xmlns="http://www.w3.org/2000/svg" className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download CSV
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <NavHeader />
      
      <main className="container mx-auto py-6 px-4">
        {/* Breadcrumb navigation */}
        <div className="mb-4">
          <nav className="flex" aria-label="Breadcrumb">
            <ol className="inline-flex items-center space-x-1 md:space-x-3">
              <li className="inline-flex items-center">
                <Link href="/projects" className="inline-flex items-center text-sm font-medium text-gray-700 hover:text-blue-600">
                  Projects
                </Link>
              </li>
              <li>
                <div className="flex items-center">
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                  <Link 
                    href={`/projects/${projectId}`} 
                    className="ml-1 text-sm font-medium text-gray-700 hover:text-blue-600 md:ml-2"
                  >
                    {projectLoading ? '...' : project?.name || 'Project'}
                  </Link>
                </div>
              </li>
              <li aria-current="page">
                <div className="flex items-center">
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                  <span className="ml-1 text-sm font-medium text-gray-500 md:ml-2">
                    {isLoading ? '...' : document?.name || 'RFP Document'}
                  </span>
                </div>
              </li>
            </ol>
          </nav>
        </div>

        {isLoading ? (
          <>
            <div className="mb-6 flex justify-between items-center">
              <div>
                <Skeleton className="h-8 w-64 mb-2" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-10 w-32" />
            </div>
            
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-1/4 mb-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          </>
        ) : document ? (
          <>
            <div className="mb-6 flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold">{document.name}</h1>
                <div className="flex items-center gap-2 mt-1">
                  {getStatusBadge(document.status)}
                  <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200 text-xs">
                    {questionsWithAnswers.length} Question{questionsWithAnswers.length !== 1 ? 's' : ''}
                  </Badge>
                  {document.isPastRfp && (
                    <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
                      Past RFP
                    </Badge>
                  )}
                </div>
              </div>
              
              {getActionButton(document.status)}
            </div>
            
            {/* Filters and View Toggle - Always visible when there are questions in the document */}
            {allQuestionsWithAnswers.length > 0 && (
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border">
                  <Filter className="h-4 w-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">Filters:</span>
                  
                  {/* View Mode Toggle */}
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">View:</span>
                    <Select value={viewMode} onValueChange={(value: "hierarchical" | "flat") => setViewMode(value)}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hierarchical">Hierarchical</SelectItem>
                        <SelectItem value="flat">Flat List</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Assignment Filter */}
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">Assignment:</span>
                    <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="All questions" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Questions</SelectItem>
                        <SelectItem value="assigned-to-me">Assigned to Me</SelectItem>
                        <SelectItem value="assigned">Assigned</SelectItem>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Confidence Level Filter - Only show for processed documents with answers */}
                  {document.status !== 'unprocessed' && allQuestionsWithAnswers.some(item => item.answer?.confidenceLevel) && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Confidence:</span>
                      <Select value={confidenceFilter} onValueChange={setConfidenceFilter}>
                        <SelectTrigger className="w-[160px]">
                          <SelectValue placeholder="All answers" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Answers</SelectItem>
                          <SelectItem value="low">Low Similarity</SelectItem>
                          <SelectItem value="medium">Medium Similarity</SelectItem>
                          <SelectItem value="high">High Similarity</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
                  <span className="text-xs text-gray-500 ml-auto">
                    Showing {questionsWithAnswers.length} of {allQuestionsWithAnswers.length} questions
                  </span>
                </div>
            )}
            
            {/* Content Area */}
            {allQuestionsWithAnswers.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <AlertCircle className="mr-2 h-5 w-5 text-amber-500" />
                    No Questions Available
                  </CardTitle>
                  <CardDescription>
                    {document.status === 'unprocessed' 
                      ? 'No questions found for this document. Please check the uploaded file.'
                      : document.status === 'done'
                        ? 'This document has been marked as done but no questions were found.'
                        : 'No questions found in this document.'}
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : questionsWithAnswers.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <AlertCircle className="mr-2 h-5 w-5 text-amber-500" />
                    No Questions Match Current Filters
                  </CardTitle>
                  <CardDescription>
                    Try adjusting your filters to see more questions. You can use the filters above to change your view.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <div className="space-y-6">
                {(() => {
                  // Organize questions hierarchically
                  const hierarchicalQuestions: HierarchicalQuestion[] = questionsWithAnswers.map(q => ({
                    ...q,
                    rfpDocumentId: q.rfpDocumentId,
                    questionText: q.questionText,
                    requirementId: q.requirementId,
                    section: q.section,
                    subsection: q.subsection,
                    assignedTo: q.assignedTo,
                    assignedUser: q.assignedUser,
                    createdAt: q.createdAt,
                    answer: q.answer
                  }));

                  const hierarchicalStructure = organizeQuestionsHierarchically(
                    hierarchicalQuestions,
                    membersData?.members || []
                  );

                  return (
                    <>
                      {document.status === 'unprocessed' && (
                        <>
                          {isProcessing ? (
                            <Card className="bg-blue-50 border-blue-200 mb-4">
                              <CardHeader className="pb-2">
                                <CardTitle className="text-blue-700 text-base flex items-center">
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Processing Questions
                                </CardTitle>
                                <CardDescription>
                                  AI is analyzing the questions and generating answers. This may take a few minutes depending on the number of questions.
                                </CardDescription>
                              </CardHeader>
                            </Card>
                          ) : (
                            <Card className="bg-amber-50 border-amber-200 mb-4">
                              <CardHeader className="pb-2">
                                <CardTitle className="text-amber-700 text-base">Ready for Processing</CardTitle>
                                <CardDescription>
                                  These questions are ready to be processed. Click the "Process Questions" button to generate AI-assisted answers.
                                </CardDescription>
                              </CardHeader>
                            </Card>
                          )}
                        </>
                      )}
                      
                      {viewMode === 'hierarchical' ? (
                        <div className="space-y-6">
                          {/* Hierarchical Sections */}
                          {hierarchicalStructure.sections.map((section) => (
                            <HierarchicalSectionComponent
                              key={section.section}
                              section={section}
                              documentStatus={document.status}
                              projectId={projectId}
                              documentId={documentId}
                              members={membersData?.members || []}
                              onAssignQuestion={assignQuestion}
                              onUnassignQuestion={unassignQuestion}
                              onAssignSection={assignSection}
                              onUnassignSection={unassignSection}
                            />
                          ))}

                          {/* Unorganized Questions */}
                          {hierarchicalStructure.unorganizedQuestions.length > 0 && (
                            <Card>
                              <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                  <AlertCircle className="h-5 w-5 text-amber-500" />
                                  Unorganized Questions
                                </CardTitle>
                                <CardDescription>
                                  Questions without section organization
                                </CardDescription>
                              </CardHeader>
                              <CardContent>
                                <div className="space-y-4">
                                  {hierarchicalStructure.unorganizedQuestions.map((question) => (
                                    <RfpAnswerEditor 
                                      key={question.id}
                                      question={question}
                                      documentStatus={document.status}
                                      projectId={projectId}
                                      documentId={documentId}
                                      members={membersData?.members || []}
                                      onAssign={assignQuestion}
                                      onUnassign={unassignQuestion}
                                    />
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {questionsWithAnswers.map((item: DocumentResponse['questionsWithAnswers'][0]) => (
                            <RfpAnswerEditor 
                              key={item.id}
                              question={item}
                              documentStatus={document.status}
                              projectId={projectId}
                              documentId={documentId}
                              members={membersData?.members || []}
                              onAssign={assignQuestion}
                              onUnassign={unassignQuestion}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </>
        ) : null}
      </main>
      
      {/* Progress Modal */}
      <ProgressModal
        isOpen={progressModalOpen}
        onClose={() => setProgressModalOpen(false)}
        documentId={documentId}
        documentName={document?.name}
        onStartProcessing={startProcessing}
      />
    </div>
  );
}
