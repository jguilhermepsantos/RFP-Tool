import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/lib/auth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import NavHeader from '@/components/nav-header';
import { Check, X, FileText } from 'lucide-react';

// Interfaces for the approval data
// Adjusted to match actual API response (using snake_case for keys)
interface Document {
  id: string;
  name: string;
  uploaded_by: string;
  uploaded_at: string;
  file_url: string | null;
  approval_status: 'pending' | 'approved' | 'rejected';
  approval_status_modified_at: string | null;
  approval_status_modified_by: string | null;
}

interface RfpDocument {
  id: string;
  name: string | null;
  project_id: string | null;
  uploaded_by: string | null;
  uploaded_at: string | null;
  status: string | null;
  file_url: string | null;
  is_past_rfp: boolean | null;
  approval_status: 'pending' | 'approved' | 'rejected';
  approval_status_modified_at: string | null;
  approval_status_modified_by: string | null;
}

export default function AdminSettings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('documents');
  
  // Headers for admin API requests
  const adminHeaders = {
    'Authorization': user?.email || '' 
  };
  
  // Fetch the documents that need approval
  const {
    data: documentsResponse,
    isLoading: isDocumentsLoading,
    error: documentsError
  } = useQuery({
    queryKey: ['/api/admin/documents'],
    queryFn: () => apiRequest('/api/admin/documents', { headers: adminHeaders })
  });
  
  // Convert API response to array of documents
  const documents: Document[] = Array.isArray(documentsResponse) ? documentsResponse : [];

  // Fetch RFP documents that need approval
  const {
    data: rfpDocumentsResponse,
    isLoading: isRfpDocumentsLoading,
    error: rfpDocumentsError
  } = useQuery({
    queryKey: ['/api/admin/rfp-documents'],
    queryFn: () => apiRequest('/api/admin/rfp-documents', { headers: adminHeaders })
  });
  
  // Get project details from the API
  const {
    data: projectsData,
  } = useQuery({
    queryKey: ['/api/projects'],
    queryFn: () => apiRequest('/api/projects', { 
      headers: adminHeaders,
      params: { userId: user?.id }
    }),
    enabled: !!user?.id
  });
  
  // Create a map of project IDs to project names for easy lookup
  const projects = projectsData?.projects || [];
  
  // Convert API response to array of RFP documents, filtering for "done" status only
  const rfpDocuments: RfpDocument[] = Array.isArray(rfpDocumentsResponse) 
    ? rfpDocumentsResponse.filter(doc => doc.status === 'done')
    : [];
    
  console.log("RFP documents:", rfpDocuments);
  console.log("Projects:", projects);

  // Mutation for updating document approval status
  const updateDocumentApproval = useMutation({
    mutationFn: async ({id, status}: {id: string, status: 'approved' | 'rejected'}) => {
      return await apiRequest(`/api/admin/documents/${id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': user?.email || ''
        },
        body: JSON.stringify({ status })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/documents'] });
      toast({
        title: 'Document updated',
        description: 'Document approval status has been updated successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error updating document',
        description: 'There was a problem updating the document approval status.',
        variant: 'destructive',
      });
    }
  });

  // Mutation for updating RFP document approval status
  const updateRfpDocumentApproval = useMutation({
    mutationFn: async ({id, status}: {id: string, status: 'approved' | 'rejected'}) => {
      return await apiRequest(`/api/admin/rfp-documents/${id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': user?.email || ''
        },
        body: JSON.stringify({ status })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/rfp-documents'] });
      toast({
        title: 'RFP Document updated',
        description: 'RFP Document approval status has been updated successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error updating RFP document',
        description: 'There was a problem updating the RFP document approval status.',
        variant: 'destructive',
      });
    }
  });

  // Handle document approval
  const handleDocumentApproval = (id: string, status: 'approved' | 'rejected') => {
    updateDocumentApproval.mutate({ id, status });
  };

  // Handle RFP document approval
  const handleRfpDocumentApproval = (id: string, status: 'approved' | 'rejected') => {
    updateRfpDocumentApproval.mutate({ id, status });
  };

  // Format date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };
  
  // Function to get project name from project ID
  const getProjectName = (projectId: string | null) => {
    if (!projectId) return 'N/A';
    
    // Try to find the project by ID
    const project = projects.find((p: any) => p.id === projectId);
    
    if (project) {
      return project.name;
    }
    
    // If it's the special case for "past rfp project 1"
    if (projectId === "past rfp project 1") {
      return "Past RFP Project";
    }
    
    // Format the project ID to make it more readable if we can't find the name
    const shortId = projectId.substring(0, 8) + '...';
    return shortId;
  };

  // Status badge component
  const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
      case 'pending':
      default:
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <NavHeader />
      
      <main className="container mx-auto py-6 px-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Admin Settings</h1>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="documents" className="text-sm">Knowledge Base Documents</TabsTrigger>
            <TabsTrigger value="rfp-documents" className="text-sm">RFP Documents</TabsTrigger>
          </TabsList>
          
          <TabsContent value="documents">
            <Card>
              <CardHeader>
                <CardTitle>Document Approval</CardTitle>
                <CardDescription>
                  Approve or reject suggested documents for the knowledge base
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isDocumentsLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
                  </div>
                ) : documentsError ? (
                  <div className="text-center py-8 text-red-500">
                    Error loading documents
                  </div>
                ) : !documents || documents.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No documents pending approval
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Uploaded By</TableHead>
                        <TableHead>Uploaded At</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documents.map((doc: Document) => (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium flex items-center">
                            <FileText className="mr-2 h-4 w-4 text-gray-500" />
                            {doc.name || doc.file_url || 'Unnamed document'}
                          </TableCell>
                          <TableCell>{doc.uploaded_by}</TableCell>
                          <TableCell>{formatDate(doc.uploaded_at)}</TableCell>
                          <TableCell>
                            <StatusBadge status={doc.approval_status} />
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-green-500 text-green-500 hover:bg-green-50"
                                onClick={() => handleDocumentApproval(doc.id, 'approved')}
                                disabled={doc.approval_status !== 'pending' || updateDocumentApproval.isPending}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-red-500 text-red-500 hover:bg-red-50"
                                onClick={() => handleDocumentApproval(doc.id, 'rejected')}
                                disabled={doc.approval_status !== 'pending' || updateDocumentApproval.isPending}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="rfp-documents">
            <Card>
              <CardHeader>
                <CardTitle>RFP Document Approval</CardTitle>
                <CardDescription>
                  Manage approval status for completed RFP documents (status: "done")
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isRfpDocumentsLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
                  </div>
                ) : rfpDocumentsError ? (
                  <div className="text-center py-8 text-red-500">
                    Error loading RFP documents
                  </div>
                ) : !rfpDocuments || rfpDocuments.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No completed RFP documents pending approval
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Approval Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rfpDocuments.map((doc: RfpDocument) => (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium flex items-center">
                            <FileText className="mr-2 h-4 w-4 text-gray-500" />
                            {doc.name || doc.file_url || 'Unnamed document'}
                          </TableCell>
                          <TableCell>{getProjectName(doc.project_id)}</TableCell>
                          <TableCell>{doc.status}</TableCell>
                          <TableCell>
                            <StatusBadge status={doc.approval_status} />
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-green-500 text-green-500 hover:bg-green-50"
                                onClick={() => handleRfpDocumentApproval(doc.id, 'approved')}
                                disabled={doc.approval_status !== 'pending' || updateRfpDocumentApproval.isPending}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-red-500 text-red-500 hover:bg-red-50"
                                onClick={() => handleRfpDocumentApproval(doc.id, 'rejected')}
                                disabled={doc.approval_status !== 'pending' || updateRfpDocumentApproval.isPending}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}