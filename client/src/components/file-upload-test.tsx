import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileUpIcon } from "lucide-react";
import { uploadFile } from "@/lib/uploadService";
import { useToast } from "@/hooks/use-toast";

export default function FileUploadTest() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
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

    setIsUploading(true);
    setUploadResult(null);

    try {
      // Use our uploadFile utility to directly upload to Supabase storage
      const result = await uploadFile(file, 'test-uploads');
      
      if (result.success) {
        toast({
          title: "Success",
          description: "File uploaded successfully",
        });
        setUploadResult(JSON.stringify(result, null, 2));
      } else {
        throw new Error(`Upload failed: ${result.error?.message || 'Unknown error'}`);
      }
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
        </div>
      </CardContent>
    </Card>
  );
}