import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChunkingService, type ChunkingResult } from "@/lib/chunkingService";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function ChunkDocumentsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [processingAll, setProcessingAll] = useState(false);
  const [results, setResults] = useState<ChunkingResult[]>([]);
  const [progress, setProgress] = useState(0);

  // Get all documents
  const { data: documents, isLoading, isError } = useQuery({
    queryKey: ['/api/admin/documents'],
    enabled: true,
  });

  // Chunk a single document
  const chunkDocumentMutation = useMutation({
    mutationFn: (documentId: string) => {
      return ChunkingService.chunkDocument(documentId);
    },
    onSuccess: (result) => {
      toast({
        title: result.success ? "Document chunked successfully" : "Failed to chunk document",
        description: result.success 
          ? `Created ${result.chunksCreated} chunks` 
          : `Error: ${result.error}`,
        variant: result.success ? "default" : "destructive",
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/admin/documents'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to chunk document: ${error}`,
        variant: "destructive",
      });
    }
  });

  // Process all unchunked documents
  const processAllMutation = useMutation({
    mutationFn: () => {
      setProcessingAll(true);
      setResults([]);
      setProgress(0);
      return ChunkingService.processAllUnchunked();
    },
    onSuccess: (response) => {
      setProcessingAll(false);
      setResults(response.results);
      setProgress(100);
      
      toast({
        title: response.success ? "Processing complete" : "Processing failed",
        description: response.message,
        variant: response.success ? "default" : "destructive",
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/admin/documents'] });
    },
    onError: (error) => {
      setProcessingAll(false);
      setProgress(0);
      
      toast({
        title: "Error",
        description: `Failed to process documents: ${error}`,
        variant: "destructive",
      });
    }
  });

  // Process a document
  const handleChunkDocument = (documentId: string) => {
    chunkDocumentMutation.mutate(documentId);
  };

  // Process all documents
  const handleProcessAll = () => {
    processAllMutation.mutate();
  };

  // Get count of unchunked documents
  const unchunkedDocuments = documents?.filter(
    (doc: any) => doc.approvalStatus === 'approved' && !doc.chunked
  ) || [];

  return (
    <div className="container py-10">
      <h1 className="text-3xl font-bold mb-8">Document Chunking</h1>
      
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Process Documents</CardTitle>
          <CardDescription>
            Process approved documents that haven't been chunked yet.
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <div className="flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  {unchunkedDocuments.length} documents waiting to be processed
                </p>
              </div>
              
              <Button 
                onClick={handleProcessAll}
                disabled={isLoading || processingAll || unchunkedDocuments.length === 0}
              >
                {processingAll ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Process All Documents"
                )}
              </Button>
            </div>
            
            {processingAll && (
              <Progress value={progress} className="w-full" />
            )}
          </div>
        </CardContent>
      </Card>
      
      {results.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Processing Results</CardTitle>
          </CardHeader>
          
          <CardContent>
            <div className="space-y-4">
              {results.map(r => (
                <div key={r.documentId} className="flex items-center space-x-2 border-b pb-2">
                  {r.success ? (
                    <CheckCircle className="text-green-500 h-5 w-5" />
                  ) : (
                    <XCircle className="text-red-500 h-5 w-5" />
                  )}
                  <span className="font-medium">{r.documentId}</span>
                  <span className="text-sm text-muted-foreground">
                    {r.success 
                      ? `Created ${r.chunksCreated} chunks` 
                      : `Error: ${r.error}`}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      <Card>
        <CardHeader>
          <CardTitle>Document List</CardTitle>
          <CardDescription>
            All uploaded documents and their chunking status.
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <div className="text-center py-8 text-destructive">
              Failed to load documents
            </div>
          ) : (
            <div className="divide-y">
              {documents?.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  No documents found
                </p>
              ) : (
                documents?.map((doc: any) => (
                  <div key={doc.id} className="py-4 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{doc.name}</div>
                      <div className="text-sm text-muted-foreground">
                        Status: {doc.approvalStatus} • 
                        {doc.chunked 
                          ? ` Chunked on ${new Date(doc.chunkedAt).toLocaleDateString()}` 
                          : " Not chunked"}
                      </div>
                    </div>
                    
                    <Button
                      variant={doc.chunked ? "outline" : "default"}
                      size="sm"
                      onClick={() => handleChunkDocument(doc.id)}
                      disabled={chunkDocumentMutation.isPending || doc.approvalStatus !== 'approved'}
                    >
                      {chunkDocumentMutation.isPending && chunkDocumentMutation.variables === doc.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      {doc.chunked ? "Rechunk" : "Chunk Document"}
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}