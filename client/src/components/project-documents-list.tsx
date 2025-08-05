import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { File, Trash2, Download, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ProjectDocument {
  id: string;
  projectId: string;
  fileName: string;
  filePath: string;
  fileType: string;
  uploadedBy: string;
  uploadedAt: string;
  processedAt?: string;
  status: 'pending' | 'processed' | 'failed';
}

interface ProjectDocumentsListProps {
  projectId: string;
}

export default function ProjectDocumentsList({ projectId }: ProjectDocumentsListProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null);

  const { data: documents, isLoading, isError } = useQuery({
    queryKey: ['/api/projects', projectId, 'documents'],
    queryFn: () => fetch(`/api/projects/${projectId}/documents`, {
      headers: {
        'Authorization': user?.email || '',
      },
    }).then(res => res.json()),
    enabled: !!projectId && !!user?.email,
  });

  const handleDeleteDocument = async (documentId: string) => {
    try {
      setDeletingDoc(documentId);
      
      await apiRequest(`/projects/${projectId}/documents/${documentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': user?.email || '',
        },
      });

      toast({
        title: "Document deleted",
        description: "The document has been successfully deleted",
      });

      // Invalidate the documents query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'documents'] });

    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: "Delete failed",
        description: "Failed to delete the document",
        variant: "destructive",
      });
    } finally {
      setDeletingDoc(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'processed':
        return <Badge variant="default" className="bg-green-500">Processed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="secondary">Processing</Badge>;
    }
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('pdf')) {
      return <File className="h-5 w-5 text-red-500" />;
    } else if (fileType.includes('word') || fileType.includes('document')) {
      return <File className="h-5 w-5 text-blue-500" />;
    } else if (fileType.includes('text')) {
      return <File className="h-5 w-5 text-gray-500" />;
    }
    return <File className="h-5 w-5 text-gray-400" />;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Project Documents</CardTitle>
          <CardDescription>Context documents for this prospect</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center space-x-3 p-3 border rounded-lg">
              <Skeleton className="h-5 w-5" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Project Documents</CardTitle>
          <CardDescription>Context documents for this prospect</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <AlertCircle className="h-5 w-5 mr-2" />
            Failed to load documents
          </div>
        </CardContent>
      </Card>
    );
  }

  const documentList = documents?.documents || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project Documents</CardTitle>
        <CardDescription>
          Context documents for this prospect ({documentList.length} document{documentList.length !== 1 ? 's' : ''})
        </CardDescription>
      </CardHeader>
      <CardContent>
        {documentList.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <File className="h-8 w-8 mr-3" />
            <div className="text-center">
              <p className="font-medium">No documents uploaded yet</p>
              <p className="text-sm">Upload prospect-specific documents to get started</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {documentList.map((doc: ProjectDocument) => (
              <div
                key={doc.id}
                className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50"
              >
                {getFileIcon(doc.fileType)}
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.fileName}</p>
                  <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                    <span>
                      Uploaded {formatDistanceToNow(new Date(doc.uploadedAt))} ago
                    </span>
                    {doc.processedAt && (
                      <>
                        <span>•</span>
                        <span>
                          Processed {formatDistanceToNow(new Date(doc.processedAt))} ago
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {getStatusIcon(doc.status)}
                  {getStatusBadge(doc.status)}
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={deletingDoc === doc.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Document</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{doc.fileName}"? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="bg-red-500 hover:bg-red-600"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}