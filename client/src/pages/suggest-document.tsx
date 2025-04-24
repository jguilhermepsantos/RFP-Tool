import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import NavHeader from "@/components/nav-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileUpIcon, CheckCircle } from "lucide-react";

export default function SuggestDocument() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [documentDescription, setDocumentDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      
      // Set default name from file if not set
      if (!documentName) {
        setDocumentName(selectedFile.name);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "You must be logged in to suggest documents",
      });
      return;
    }
    
    if (!file) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a file to upload",
      });
      return;
    }
    
    if (!documentName) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please provide a name for the document",
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Instead of uploading directly to Supabase, let's create a FormData and send it to our backend
      // which can then handle the upload with proper server-side permissions
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', documentName);
      formData.append('description', documentDescription || '');
      formData.append('userId', user.id);
      
      // Call our API endpoint that will handle the file upload
      const response = await fetch('/api/upload-document', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`File upload failed: ${errorData.message || response.statusText}`);
      }
      
      const uploadResult = await response.json();
      const fileUrl = uploadResult.fileUrl;
      const filePath = uploadResult.filePath;
      
      // Create the document record in the database
      await apiRequest("/api/suggested-documents", {
        method: "POST",
        body: JSON.stringify({
          name: documentName,
          filePath,
          fileUrl,
          contentType: file.type,
          description: documentDescription,
          suggestedBy: user.id,
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      toast({
        title: "Success",
        description: "Document suggested successfully. It will be reviewed by an admin.",
      });
      
      setIsSuccess(true);
    } catch (error) {
      console.error("Error uploading document:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || "Failed to suggest document",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setDocumentName("");
    setDocumentDescription("");
    setIsSuccess(false);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <NavHeader />
      
      <main className="container mx-auto py-6 px-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Suggest Document</h1>
        </div>
        
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Suggest a Document for Global Knowledge Base</CardTitle>
            <CardDescription>
              Submit a document to be included in the global knowledge base. All suggestions will be reviewed by an admin.
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            {isSuccess ? (
              <div className="text-center py-6">
                <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">Document Submitted Successfully</h3>
                <p className="text-muted-foreground mb-6">
                  Your document suggestion has been submitted for review. An admin will review it soon.
                </p>
                <Button onClick={resetForm}>Suggest Another Document</Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="document-name">Document Name</Label>
                  <Input
                    id="document-name"
                    value={documentName}
                    onChange={(e) => setDocumentName(e.target.value)}
                    placeholder="Enter document name"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="document-description">Description (Optional)</Label>
                  <Textarea
                    id="document-description"
                    value={documentDescription}
                    onChange={(e) => setDocumentDescription(e.target.value)}
                    placeholder="Brief description of this document and why it should be added"
                    rows={3}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="document-file">Document File</Label>
                  <div className="border-2 border-dashed rounded-md px-6 py-8">
                    <div className="flex flex-col items-center text-center">
                      <FileUpIcon className="h-10 w-10 text-muted-foreground mb-2" />
                      
                      {file ? (
                        <div>
                          <p className="font-medium">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">
                            Drag and drop your file here, or click to browse
                          </p>
                          <p className="text-xs text-muted-foreground">
                            PDF, Word, Excel, or Markdown files recommended
                          </p>
                        </div>
                      )}
                      
                      <Input
                        id="document-file"
                        type="file"
                        className="hidden"
                        onChange={handleFileChange}
                        required
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => document.getElementById("document-file")?.click()}
                      >
                        Select File
                      </Button>
                    </div>
                  </div>
                </div>
              </form>
            )}
          </CardContent>
          
          {!isSuccess && (
            <CardFooter className="flex justify-end space-x-2">
              <Button 
                variant="outline" 
                onClick={() => window.history.back()}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Submitting..." : "Submit Document"}
              </Button>
            </CardFooter>
          )}
        </Card>
      </main>
    </div>
  );
}
