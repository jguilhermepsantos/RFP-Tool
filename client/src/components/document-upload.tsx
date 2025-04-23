import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FileUpIcon } from "lucide-react";

interface DocumentUploadProps {
  projectId: string;
}

export default function DocumentUpload({ projectId }: DocumentUploadProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [file, setFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [isPastRfp, setIsPastRfp] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

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
    if (!user) return;
    
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
    
    setIsUploading(true);
    
    try {
      // In a real application, you would upload the file to a storage service
      // Here we're just mocking the file path
      const mockFilePath = `uploads/${Date.now()}_${file.name}`;
      
      await apiRequest("POST", `/api/projects/${projectId}/rfp-documents`, {
        name: documentName,
        filePath: mockFilePath,
        status: 'unprocessed',
        isPastRfp,
        uploadedBy: user.id
      });
      
      toast({
        title: "Success",
        description: "Document uploaded successfully",
      });
      
      // Reset form
      setFile(null);
      setDocumentName("");
      setIsPastRfp(false);
      
      // Refresh project data
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || "Failed to upload document",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Upload RFP Document</CardTitle>
        <CardDescription>
          Upload a CSV file containing RFP questions and requirements.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="md:w-2/3 space-y-4">
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
              <Label htmlFor="document-file">Upload File</Label>
              <div className="border rounded-md p-2">
                <Input
                  id="document-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                />
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="is-past-rfp" 
                checked={isPastRfp} 
                onCheckedChange={(checked) => setIsPastRfp(checked === true)}
              />
              <Label htmlFor="is-past-rfp">
                This is a past RFP document (for reference only)
              </Label>
            </div>
          </div>
          
          <div className="md:w-1/3 flex items-center justify-center">
            <Button 
              onClick={handleUpload} 
              className="w-full" 
              disabled={isUploading || !file}
            >
              <FileUpIcon className="mr-2 h-4 w-4" />
              {isUploading ? "Uploading..." : "Upload Document"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
