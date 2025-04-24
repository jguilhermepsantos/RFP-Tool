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
import { supabase } from "@/lib/supabase";
import Papa from "papaparse";

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

  const parseCSV = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          resolve(results.data);
        },
        error: (error) => {
          reject(error);
        }
      });
    });
  };
  
  const processCSVData = async (data: any[], rfpDocumentId: string, isPastRfp: boolean) => {
    try {
      if (isPastRfp) {
        // For past RFPs: insert directly into rfp_answers table
        // Expected columns: question_text, compliance_answer, generated_answer
        for (const row of data) {
          if (!row.question_text) continue; // Skip rows without question text
          
          await supabase.from('rfp_answers').insert({
            rfp_document_id: rfpDocumentId,
            question_text: row.question_text,
            compliance_answer: row.compliance_answer || null,
            generated_answer: row.generated_answer || null,
            created_at: new Date().toISOString()
          });
        }
        
        // Update document status to 'done'
        await supabase.from('rfp_documents')
          .update({ status: 'done' })
          .eq('id', rfpDocumentId);
          
      } else {
        // For new RFPs: insert into rfp_questions table
        // Expected column: question_text
        for (const row of data) {
          if (!row.question_text) continue; // Skip rows without question text
          
          await supabase.from('rfp_questions').insert({
            rfp_document_id: rfpDocumentId,
            question_text: row.question_text,
            created_at: new Date().toISOString()
          });
        }
        
        // Document status stays as 'unprocessed'
      }
      
      return true;
    } catch (error) {
      console.error('Error processing CSV data:', error);
      throw error;
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
      // Parse CSV data
      const csvData = await parseCSV(file);
      
      if (csvData.length === 0) {
        throw new Error("CSV file appears to be empty");
      }
      
      // Validate CSV structure based on isPastRfp flag
      if (isPastRfp) {
        // Past RFP should have question_text, compliance_answer, and generated_answer columns
        const firstRow = csvData[0];
        if (!firstRow.question_text || (!firstRow.compliance_answer && !firstRow.generated_answer)) {
          throw new Error("CSV file for past RFPs should contain 'question_text' and either 'compliance_answer' or 'generated_answer' columns");
        }
      } else {
        // New RFP should have question_text column
        const firstRow = csvData[0];
        if (!firstRow.question_text) {
          throw new Error("CSV file should contain a 'question_text' column");
        }
      }
      
      // File is valid, create the document in Supabase
      const { data: document, error: docError } = await supabase
        .from('rfp_documents')
        .insert({
          project_id: projectId,
          name: documentName,
          file_url: file.name,
          uploaded_by: user.id,
          status: isPastRfp ? 'done' : 'unprocessed',
          is_past_rfp: isPastRfp,
          uploaded_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (docError) throw new Error(docError.message);
      
      // Process the CSV data and insert questions/answers
      await processCSVData(csvData, document.id, isPastRfp);
      
      toast({
        title: "Success",
        description: "Document uploaded and processed successfully",
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
          {isPastRfp ? (
            <span className="block mt-1 text-xs text-blue-600">
              Past RFP files should have columns: question_text, compliance_answer, generated_answer
            </span>
          ) : (
            <span className="block mt-1 text-xs text-blue-600">
              New RFP files should have at least a question_text column
            </span>
          )}
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
