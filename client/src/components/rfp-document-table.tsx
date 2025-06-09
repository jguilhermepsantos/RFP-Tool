import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { formatDistanceToNow } from "date-fns";
import { File, PlayCircle, CheckCircle } from "lucide-react";
import ProgressModal from "@/components/progress-modal";

interface RfpDocument {
  id: string;
  projectId: string;
  name: string;
  status: string;
  createdAt?: string;
  isPastRfp: boolean;
}

interface RfpDocumentTableProps {
  projectId: string;
  documents: RfpDocument[];
  isEditable: boolean;
}

export default function RfpDocumentTable({ projectId, documents, isEditable }: RfpDocumentTableProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [processingDocId, setProcessingDocId] = useState<string | null>(null);
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [currentProcessingDoc, setCurrentProcessingDoc] = useState<RfpDocument | null>(null);

  const handleProcessDocument = async (documentId: string) => {
    if (!user) return;
    
    const document = documents.find(doc => doc.id === documentId);
    if (!document) return;
    
    setProcessingDocId(documentId);
    setCurrentProcessingDoc(document);
    setProgressModalOpen(true);
    
    // Add a small delay to ensure the modal opens and WebSocket connects
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      await apiRequest(`/api/projects/${projectId}/rfp-documents/${documentId}/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      
      toast({
        title: "Success",
        description: "Document processed successfully",
      });
      
      // Refresh the document list
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || "Failed to process document",
      });
    } finally {
      setProcessingDocId(null);
    }
  };

  const handleUpdateStatus = async (documentId: string, status: string) => {
    if (!user) return;
    
    setProcessingDocId(documentId);
    
    try {
      await apiRequest(`/api/projects/${projectId}/rfp-documents/${documentId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status })
      });
      
      toast({
        title: "Success",
        description: `Document status updated to ${status}`,
      });
      
      // Refresh the document list
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || "Failed to update document status",
      });
    } finally {
      setProcessingDocId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "unprocessed":
        return <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">Unprocessed</Badge>;
      case "processed":
        return <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">Processed</Badge>;
      case "reviewed":
        return <Badge variant="outline" className="bg-purple-50 text-purple-600 border-purple-200">Reviewed</Badge>;
      case "done":
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200">Done</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleDownloadCsv = async (documentId: string, documentName: string) => {
    if (!user) return;
    
    try {
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
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${documentName.replace(/\.[^/.]+$/, '')}_export.csv`);
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      document.body.removeChild(link);
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
    }
  };

  const getActionButton = (document: RfpDocument) => {
    const { id, status, name } = document;
    
    if (!isEditable) return null;
    
    const isProcessing = processingDocId === id;
    
    switch (status) {
      case "unprocessed":
        return (
          <Button 
            size="sm" 
            onClick={() => handleProcessDocument(id)}
            disabled={isProcessing}
          >
            <PlayCircle className="mr-2 h-4 w-4" />
            {isProcessing ? "Processing Questions..." : "Process Questions"}
          </Button>
        );
      case "processed":
        return (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                size="sm" 
                variant="outline"
                disabled={isProcessing}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Review Answers
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Mark document as reviewed?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action will change the document status to "reviewed".
                  Are you sure you want to continue?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleUpdateStatus(id, "reviewed")}>
                  Confirm
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      case "reviewed":
        return (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                size="sm" 
                variant="outline"
                disabled={isProcessing}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Mark as Done
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Mark document as done?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action will finalize the document and make it read-only.
                  Are you sure you want to continue?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleUpdateStatus(id, "done")}>
                  Confirm
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      case "done":
        return (
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => handleDownloadCsv(id, name)}
          >
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

  if (documents.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center">
        <File className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
        <h3 className="text-lg font-medium mb-2">No RFP Documents</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Upload your first RFP document to start the response process.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((document) => (
              <TableRow key={document.id}>
                <TableCell className="font-medium">
                  <Link href={`/projects/${projectId}/rfp-documents/${document.id}`}>
                    <a className="text-primary hover:underline flex items-center">
                      <File className="mr-2 h-4 w-4" />
                      {document.name}
                    </a>
                  </Link>
                </TableCell>
                <TableCell>{getStatusBadge(document.status)}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {document.createdAt ? formatDistanceToNow(new Date(document.createdAt), { addSuffix: true }) : 'N/A'}
                </TableCell>
                <TableCell>
                  {document.isPastRfp ? (
                    <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
                      Past RFP
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                      Current
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {getActionButton(document)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      {/* Progress Modal */}
      <ProgressModal
        isOpen={progressModalOpen}
        onClose={() => setProgressModalOpen(false)}
        documentId={currentProcessingDoc?.id || ''}
        documentName={currentProcessingDoc?.name}
      />
    </>
  );
}
