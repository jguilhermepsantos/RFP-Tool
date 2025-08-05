import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useWebSocket } from "@/hooks/use-websocket";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { FileUpIcon, Loader2, Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import Papa from "papaparse";

interface DocumentUploadProps {
  projectId: string;
  onUploadSuccess?: () => void;
}

export default function DocumentUpload({
  projectId,
  onUploadSuccess,
}: DocumentUploadProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [isPastRfp, setIsPastRfp] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);
  
  const { registerForProgress, getProgress } = useWebSocket();

  // Function to download CSV example
  const downloadCSVExample = (type: 'new' | 'past') => {
    let csvContent = '';
    let filename = '';
    
    if (type === 'new') {
      // New RFP CSV example
      csvContent = `"Question Text","Requirement ID","Section","Subsection"
"Does your system support single sign-on (SSO) integration?","REQ-001","Technical Requirements","Authentication"
"What is the maximum number of concurrent users your platform can support?","REQ-002","Technical Requirements","Performance"
"Does your platform comply with GDPR regulations?","REQ-003","Compliance","Data Protection"
"What security certifications does your platform have?","REQ-004","Compliance","Security"
"Can you provide 24/7 technical support?","REQ-005","Support","Technical Support"`;
      filename = 'new_rfp_template.csv';
    } else {
      // Past RFP CSV example
      csvContent = `"Question Text","Compliance Answer","Generated Answer","Requirement ID","Section","Subsection"
"Does your system support single sign-on (SSO) integration?","Yes, natively","VTEX supports SSO integration natively through SAML 2.0 and OAuth 2.0 protocols.","REQ-001","Technical Requirements","Authentication"
"What is the maximum number of concurrent users your platform can support?","100,000+ users","VTEX platform can handle over 100,000 concurrent users with auto-scaling capabilities.","REQ-002","Technical Requirements","Performance"
"Does your platform comply with GDPR regulations?","Yes, fully compliant","VTEX is fully GDPR compliant with comprehensive data protection measures.","REQ-003","Compliance","Data Protection"
"What security certifications does your platform have?","ISO 27001, SOC 2","VTEX holds ISO 27001 and SOC 2 Type II certifications for security management.","REQ-004","Compliance","Security"
"Can you provide 24/7 technical support?","Yes, available","VTEX provides 24/7 technical support with multilingual assistance.","REQ-005","Support","Technical Support"`;
      filename = 'past_rfp_template.csv';
    }

    // Create and download the file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

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

  const parseCSV = (file: File): Promise<Record<string, any>[]> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          console.log("CSV parsing complete, headers:", results.meta.fields);
          console.log("First row sample:", results.data[0]);

          // Normalize column names to lowercase for easier comparison
          const normalizedData = results.data.map((row: any) => {
            const normalizedRow: Record<string, any> = {};

            // Convert all keys to lowercase
            Object.keys(row).forEach((key: string) => {
              const lowerKey = key.toLowerCase().trim();
              normalizedRow[lowerKey] = row[key];
            });

            return normalizedRow;
          });

          resolve(normalizedData);
        },
        error: (error) => {
          reject(error);
        },
      });
    });
  };

  const processCSVData = async (
    data: any[],
    rfpDocumentId: string,
    isPastRfp: boolean,
  ) => {
    try {
      console.log(
        `Processing CSV data for document: ${rfpDocumentId}, isPastRfp: ${isPastRfp}`,
      );
      console.log(`Data rows count: ${data.length}`);

      // Register for progress updates and set initial state
      setCurrentDocumentId(rfpDocumentId);
      setUploadProgress(0);
      setUploadStatus("Starting CSV processing...");
      registerForProgress(rfpDocumentId);

      const totalRows = data.length;
      let insertedRows = 0;

      // Helper function to emit progress with throttling
      const emitProgress = (current: number, message: string) => {
        const percentage = Math.round((current / totalRows) * 100);
        setUploadProgress(percentage);
        setUploadStatus(message);
        
        // Send progress update to backend via API call
        fetch(`/api/progress/csv-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId: rfpDocumentId,
            current,
            total: totalRows,
            percentage,
            message
          })
        }).catch(err => console.error('Progress update failed:', err));
      };

      if (isPastRfp) {
        // For past RFPs: insert directly into rfp_answers table
        // Expected columns: question_text, compliance_answer, generated_answer
        console.log("Processing as past RFP (inserting into rfp_answers)");
        console.log("isPastRfp =", isPastRfp);

        for (const row of data) {
          // Using lowercase column names for compatibility with different CSV formats
          const questionText = row.question_text || row["question text"] || "";
          if (!questionText) {
            console.log("Skipping row without question text:", row);
            continue;
          }

          const complianceAnswer =
            row.compliance_answer || row["compliance answer"] || null;
          const generatedAnswer =
            row.generated_answer || row["generated answer"] || null;

          console.log(
            `Inserting answer row into rfp_answers: Question="${questionText.substring(0, 20)}...", Compliance=${!!complianceAnswer}, Generated=${!!generatedAnswer}`,
          );

          // Extract hierarchical fields for past RFPs too
          const requirementId = row.requirement_id || row["requirement id"] || row.requirement || null;
          const section = row.section || row["section"] || null;
          const subsection = row.subsection || row["subsection"] || row.sub_section || row["sub section"] || null;

          // First create an rfp_question entry
          const { data: questionData, error: questionError } = await supabase
            .from("rfp_questions")
            .insert({
              rfp_document_id: rfpDocumentId,
              question_text: questionText,
              requirement_id: requirementId,
              section: section,
              subsection: subsection,
              created_at: new Date().toISOString(),
            })
            .select("id")
            .single();

          if (questionError) {
            console.error(
              "Error inserting question for past RFP:",
              questionError,
            );
            throw questionError;
          }

          // Then create an rfp_answer entry linked to the question
          const { data: answerData, error: answerError } = await supabase
            .from("rfp_answers")
            .insert({
              rfp_question_id: questionData.id,
              rfp_document_id: rfpDocumentId,
              question_text: questionText, // Adding question_text here as well
              compliance_answer: complianceAnswer,
              generated_answer: generatedAnswer,
              created_by: 'AI-generated',
              created_at: new Date().toISOString(),
            });

          if (answerError) {
            console.error("Error inserting answer for past RFP:", answerError);
            throw answerError;
          }

          console.log(
            "Created question and answer for past RFP:",
            questionData.id,
          );
          insertedRows++;
          
          // Emit progress update every 5 rows or at 100%
          if (insertedRows % 5 === 0 || insertedRows === totalRows) {
            emitProgress(insertedRows, `Creating questions (${insertedRows}/${totalRows})...`);
          }
        }

        console.log(
          `Successfully inserted ${insertedRows} answers for past RFP`,
        );

        // Update document status to 'done'
        const { error: updateError } = await supabase
          .from("rfp_documents")
          .update({ status: "done" })
          .eq("id", rfpDocumentId);

        if (updateError) {
          console.error("Error updating document status:", updateError);
          throw updateError;
        }
      } else {
        // For new RFPs: insert into rfp_questions table
        // Expected column: question_text
        console.log("Processing as new RFP (inserting into rfp_questions)");

        let insertedRows = 0;
        for (const row of data) {
          // Using lowercase column names for compatibility with different CSV formats
          const questionText = row.question_text || row["question text"] || "";
          if (!questionText) {
            console.log("Skipping row without question text:", row);
            continue;
          }

          // Extract hierarchical fields with fallback column names
          const requirementId = row.requirement_id || row["requirement id"] || row.requirement || null;
          const section = row.section || row["section"] || null;
          const subsection = row.subsection || row["subsection"] || row.sub_section || row["sub section"] || null;

          console.log(
            `Inserting question row: Question=${questionText.substring(0, 20)}..., Section=${section}, Subsection=${subsection}`,
          );

          const { data: insertData, error: insertError } = await supabase
            .from("rfp_questions")
            .insert({
              rfp_document_id: rfpDocumentId,
              question_text: questionText,
              requirement_id: requirementId,
              section: section,
              subsection: subsection,
              created_at: new Date().toISOString(),
            });

          if (insertError) {
            console.error("Error inserting question:", insertError);
            throw insertError;
          }

          insertedRows++;
          
          // Emit progress update every 10 rows or at 100%
          if (insertedRows % 10 === 0 || insertedRows === totalRows) {
            emitProgress(insertedRows, `Creating questions (${insertedRows}/${totalRows})...`);
          }
        }

        console.log(`Successfully inserted ${insertedRows} questions`);

        // Document status stays as 'unprocessed'
      }

      // Emit final completion update
      emitProgress(totalRows, `CSV processing completed! ${totalRows} questions created.`);
      
      // Clear progress after a short delay
      setTimeout(() => {
        setUploadProgress(0);
        setUploadStatus("");
        setCurrentDocumentId(null);
      }, 2000);

      return true;
    } catch (error) {
      console.error("Error processing CSV data:", error);
      
      // Emit error progress update
      setUploadStatus("Error processing CSV file");
      setTimeout(() => {
        setUploadProgress(0);
        setUploadStatus("");
        setCurrentDocumentId(null);
      }, 3000);
      
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

    // Show upload start notification
    toast({
      title: "Uploading Document",
      description: "Document upload started. Please wait...",
    });

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
        const hasQuestionText =
          firstRow.question_text || firstRow["question text"];
        const hasComplianceAnswer =
          firstRow.compliance_answer || firstRow["compliance answer"];
        const hasGeneratedAnswer =
          firstRow.generated_answer || firstRow["generated answer"];

        if (!hasQuestionText || (!hasComplianceAnswer && !hasGeneratedAnswer)) {
          throw new Error(
            "CSV file for past RFPs should contain 'question_text' and either 'compliance_answer' or 'generated_answer' columns",
          );
        }
      } else {
        // New RFP should have question_text column
        const firstRow = csvData[0];
        const hasQuestionText =
          firstRow.question_text || firstRow["question text"];

        if (!hasQuestionText) {
          throw new Error(
            "CSV file should contain a 'question_text' or 'Question Text' column",
          );
        }
      }

      // File is valid, create the document in Supabase
      const { data: document, error: docError } = await supabase
        .from("rfp_documents")
        .insert({
          project_id: projectId,
          name: documentName,
          file_url: file.name,
          uploaded_by: user.id,
          status: isPastRfp ? "done" : "unprocessed",
          is_past_rfp: isPastRfp,
          uploaded_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (docError) throw new Error(docError.message);

      // Process the CSV data and insert questions/answers
      await processCSVData(csvData, document.id, isPastRfp);

      toast({
        title: "Upload Complete",
        description: `Document "${documentName}" uploaded successfully! ${isPastRfp ? 'Past RFP data has been processed.' : 'Questions are ready for processing.'}`,
      });

      // Reset form
      setFile(null);
      setDocumentName("");
      setIsPastRfp(false);

      // Refresh project data
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${projectId}`],
      });

      // Call the callback to refresh the parent component
      if (onUploadSuccess) {
        onUploadSuccess();
      }
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
            <div className="mt-2 space-y-2">
              <span className="block text-xs text-blue-600">
                Past RFP files should have columns: "Question Text", "Compliance Answer", "Generated Answer". 
                Optional columns: "Requirement ID", "Section", "Subsection"
                (Column names are case-insensitive)
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadCSVExample('past')}
                className="text-xs h-7"
              >
                <Download className="h-3 w-3 mr-1" />
                Download Past RFP Template
              </Button>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <span className="block text-xs text-blue-600">
                New RFP files should have at least a "Question Text" column. 
                Optional columns: "Requirement ID", "Section", "Subsection"
                (Column names are case-insensitive)
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadCSVExample('new')}
                className="text-xs h-7"
              >
                <Download className="h-3 w-3 mr-1" />
                Download New RFP Template
              </Button>
            </div>
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

            {/* Progress bar for CSV processing */}
            {(isUploading && uploadProgress > 0) && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{uploadStatus}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="w-full" />
              </div>
            )}
          </div>

          <div className="md:w-1/3 flex items-center justify-center">
            <Button
              onClick={handleUpload}
              className="w-full"
              disabled={isUploading || !file}
            >
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileUpIcon className="mr-2 h-4 w-4" />
              )}
              {isUploading ? "Uploading..." : "Upload Document"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
