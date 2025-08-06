import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface ProjectDocument {
  id: string;
  project_id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  uploaded_by: string;
  uploaded_at: string;
  processed_at?: string;
  status: 'pending' | 'processed' | 'failed';
}

interface ProjectDocumentsProps {
  projectId: string;
  userEmail: string;
}

export function ProjectDocuments({ projectId, userEmail }: ProjectDocumentsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Query to get project documents
  const { data: documentsResponse, isLoading } = useQuery<{ documents: ProjectDocument[] }>({
    queryKey: [`/api/projects/${projectId}/documents`],
    enabled: !!projectId
  });

  const documents = documentsResponse?.documents || [];

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`/api/projects/${projectId}/documents`, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': userEmail
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Upload successful",
        description: "Document has been uploaded and attached to the AI assistant",
      });
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/documents`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleFileSelect = (file: File) => {
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Please select a file smaller than 50MB",
        variant: "destructive"
      });
      return;
    }
    
    setSelectedFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pending':
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'processed':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">Processed</Badge>;
      case 'failed':
        return <Badge variant="secondary" className="bg-red-100 text-red-800">Failed</Badge>;
      case 'pending':
      default:
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Processing</Badge>;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Project Documents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drag and Drop Zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDragOver 
                ? 'border-blue-400 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium mb-2">
              {selectedFile ? selectedFile.name : 'Drop files here or click to upload'}
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Support for PDF, TXT, DOC, DOCX files up to 50MB
            </p>
            <Input
              type="file"
              accept=".pdf,.txt,.doc,.docx"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
              className="hidden"
              id="file-upload"
            />
            <Button
              variant="outline"
              onClick={() => document.getElementById('file-upload')?.click()}
              disabled={uploadMutation.isPending}
            >
              Choose File
            </Button>
          </div>

          {/* Selected File Info */}
          {selectedFile && (
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span className="font-medium">{selectedFile.name}</span>
                <span className="text-sm text-gray-500">({formatFileSize(selectedFile.size)})</span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleUpload}
                  disabled={uploadMutation.isPending}
                >
                  {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedFile(null)}
                  disabled={uploadMutation.isPending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documents List */}
      <Card>
        <CardHeader>
          <CardTitle>Project Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse flex items-center gap-3 p-3 bg-gray-100 rounded-lg">
                  <div className="w-4 h-4 bg-gray-300 rounded"></div>
                  <div className="flex-1 h-4 bg-gray-300 rounded"></div>
                  <div className="w-16 h-4 bg-gray-300 rounded"></div>
                </div>
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No documents uploaded yet</p>
              <p className="text-sm">Upload documents to provide context to the AI assistant</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc: ProjectDocument) => (
                <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(doc.status)}
                    <div>
                      <p className="font-medium">{doc.file_name}</p>
                      <p className="text-sm text-gray-500">
                        Uploaded {formatDistanceToNow(new Date(doc.uploaded_at))} ago
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(doc.status)}
                    <span className="text-sm text-gray-500">{doc.file_type}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}