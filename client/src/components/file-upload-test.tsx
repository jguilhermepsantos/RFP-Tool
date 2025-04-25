import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileUpIcon } from "lucide-react";
import { uploadFile } from "@/lib/uploadService";
import { createDocument } from "@/lib/documentService";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

export default function FileUploadTest() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [documentDescription, setDocumentDescription] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [documentResult, setDocumentResult] = useState<string | null>(null);

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

  const handleUpload = async () => {
    if (!file) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a file to upload",
      });
      return;
    }

    if (!user) {
      toast({
        variant: "destructive",
        title: "Error", 
        description: "You must be logged in to upload files",
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

    setIsUploading(true);
    setUploadResult(null);
    setDocumentResult(null);

    try {
      // Step 1: Upload the file to Supabase storage
      const uploadResult = await uploadFile(file, user.id);
      
      if (!uploadResult.success) {
        throw new Error(`Upload failed: ${uploadResult.error?.message || 'Unknown error'}`);
      }
      
      setUploadResult(JSON.stringify(uploadResult, null, 2));
      
      // Step 2: Create a document record in Supabase
      const documentData = {
        name: documentName,
        fileUrl: uploadResult.fileUrl!,
        filePath: uploadResult.filePath,
        contentType: file.type,
        description: documentDescription,
        uploadedBy: user.id
      };
      
      const docResult = await createDocument(documentData);
      
      if (!docResult.success) {
        throw new Error(`Failed to create document record: ${docResult.error?.message || 'Unknown error'}`);
      }
      
      setDocumentResult(JSON.stringify(docResult.document, null, 2));
      
      toast({
        title: "Success",
        description: "File uploaded and document record created successfully",
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || "Failed to upload file",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Direct Supabase Storage Upload Test</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="document-name">Document Name</Label>
            <Input
              id="document-name"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              placeholder="Enter document name"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="document-description">Description (Optional)</Label>
            <Textarea
              id="document-description"
              value={documentDescription}
              onChange={(e) => setDocumentDescription(e.target.value)}
              placeholder="Brief description of this document"
              rows={2}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="test-file">Select File</Label>
            <Input
              id="test-file"
              type="file"
              onChange={handleFileChange}
            />
          </div>

          <Button
            onClick={handleUpload}
            disabled={isUploading || !file}
            className="w-full"
          >
            <FileUpIcon className="mr-2 h-4 w-4" />
            {isUploading ? "Uploading..." : "Upload File"}
          </Button>

          {uploadResult && (
            <div className="mt-4">
              <h4 className="font-medium mb-2">Upload Result:</h4>
              <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
                {uploadResult}
              </pre>
            </div>
          )}
          
          {documentResult && (
            <div className="mt-4">
              <h4 className="font-medium mb-2">Document Record Created:</h4>
              <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
                {documentResult}
              </pre>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}