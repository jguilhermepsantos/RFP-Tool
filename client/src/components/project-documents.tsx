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
    <div className="space-y-4 h-full flex flex-col relative">
      {/* Compact Upload Button */}
      <div className="flex-shrink-0">
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
          onClick={() => document.getElementById('file-upload')?.click()}
          disabled={uploadMutation.isPending}
          className="w-full"
        >
          <Upload className="h-4 w-4 mr-2" />
          {uploadMutation.isPending ? 'Uploading...' : 'Add Document'}
        </Button>
      </div>

      {/* Selected File Info */}
      {selectedFile && (
        <div className="flex-shrink-0 p-3 bg-blue-50 rounded-lg border-2 border-blue-200">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-900 truncate">{selectedFile.name}</span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleUpload}
              disabled={uploadMutation.isPending}
              className="flex-1"
            >
              Upload
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

      {/* Documents List */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse flex items-center gap-2 p-2 bg-gray-100 rounded">
                <div className="w-4 h-4 bg-gray-300 rounded"></div>
                <div className="flex-1 h-3 bg-gray-300 rounded"></div>
              </div>
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No documents yet</p>
            <p className="text-xs">Upload to provide AI context</p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc: ProjectDocument) => (
              <div key={doc.id} className="p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex items-start gap-2">
                  {getStatusIcon(doc.status)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" title={doc.file_name}>
                      {doc.file_name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-1.5 py-0.5 bg-white rounded text-gray-600">
                        {doc.file_type}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatDistanceToNow(new Date(doc.uploaded_at))} ago
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Drag and drop overlay */}
      {isDragOver && (
        <div
          className="absolute inset-0 bg-blue-50/90 border-2 border-blue-300 border-dashed rounded-lg flex items-center justify-center"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="text-center">
            <Upload className="h-8 w-8 mx-auto mb-2 text-blue-500" />
            <p className="text-sm font-medium text-blue-900">Drop file to upload</p>
          </div>
        </div>
      )}
    </div>
  );
}