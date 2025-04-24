import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import NavHeader from "@/components/nav-header";
import RfpAnswerEditor from "@/components/rfp-answer-editor";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle, PlayCircle, ChevronRight } from "lucide-react";

interface RfpDocumentProps {
  projectId: string;
  documentId: string;
}

export default function RfpDocument({ projectId, documentId }: RfpDocumentProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

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
      section: string | null;
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
  const questionsWithAnswers = data?.questionsWithAnswers || [];

  const handleProcessDocument = async () => {
    try {
      await apiRequest("POST", `/api/projects/${projectId}/rfp-documents/${documentId}/process`, {});
      
      toast({
        title: "Success",
        description: "Document processed successfully",
      });
      
      // Refresh the data
      queryClient.invalidateQueries({ 
        queryKey: [`/api/projects/${projectId}/rfp-documents/${documentId}`] 
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || "Failed to process document",
      });
    }
  };

  const updateDocumentStatus = async (status: string) => {
    try {
      await apiRequest("PATCH", `/api/projects/${projectId}/rfp-documents/${documentId}/status`, {
        status
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

  const getActionButton = (status: string) => {
    switch (status) {
      case "unprocessed":
        return (
          <Button onClick={handleProcessDocument}>
            <PlayCircle className="mr-2 h-4 w-4" />
            Process Questions
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
                  {document.isPastRfp && (
                    <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
                      Past RFP
                    </Badge>
                  )}
                </div>
              </div>
              
              {getActionButton(document.status)}
            </div>
            
            {questionsWithAnswers.length === 0 ? (
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
            ) : (
              <div className="space-y-6">
                {document.status === 'unprocessed' ? (
                  <>
                    <Card className="bg-amber-50 border-amber-200 mb-4">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-amber-700 text-base">Ready for Processing</CardTitle>
                        <CardDescription>
                          These questions are ready to be processed. Click the "Process Questions" button to generate AI-assisted answers.
                        </CardDescription>
                      </CardHeader>
                    </Card>
                    <div className="space-y-6">
                      {questionsWithAnswers.map((item: DocumentResponse['questionsWithAnswers'][0]) => (
                        <RfpAnswerEditor 
                          key={item.id}
                          question={item}
                          documentStatus={document.status}
                          projectId={projectId}
                          documentId={documentId}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="space-y-6">
                    {questionsWithAnswers.map((item: DocumentResponse['questionsWithAnswers'][0]) => (
                      <RfpAnswerEditor 
                        key={item.id}
                        question={item}
                        documentStatus={document.status}
                        projectId={projectId}
                        documentId={documentId}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
