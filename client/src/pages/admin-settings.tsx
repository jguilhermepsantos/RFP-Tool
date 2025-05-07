import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { ChunkingService } from '@/lib/chunkingService';
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
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from "@/components/ui/select";
import NavHeader from '@/components/nav-header';
import { Check, X, FileText, Filter, Scissors } from 'lucide-react';

// Interfaces for the approval data
// Adjusted to match actual API response (using snake_case for keys)
interface Document {
  id: string;
  name: string;
  uploaded_by: string;
  uploaded_at: string;
  created_at: string;
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
  // We don't actually need created_at field since we'll use uploaded_at
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
  const [documentFilterStatus, setDocumentFilterStatus] = useState<string>('all');
  const [rfpFilterStatus, setRfpFilterStatus] = useState<string>('all');
  const [userEmailsMap, setUserEmailsMap] = useState<Record<string, string>>({});
  
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
  const allDocuments: Document[] = Array.isArray(documentsResponse) ? documentsResponse : [];
  
  // Filter documents based on selected status
  const documents = allDocuments.filter(doc => {
    if (documentFilterStatus === 'all') return true;
    return doc.approval_status === documentFilterStatus;
  });

  // Fetch RFP documents that need approval
  const {
    data: rfpDocumentsResponse,
    isLoading: isRfpDocumentsLoading,
    error: rfpDocumentsError
  } = useQuery({
    queryKey: ['/api/admin/rfp-documents'],
    queryFn: () => apiRequest('/api/admin/rfp-documents', { headers: adminHeaders })
  });
  
  // Get ALL project details from the API (as admin, we need access to all projects)
  const {
    data: projectsData,
  } = useQuery({
    queryKey: ['/api/projects/all'],
    queryFn: () => apiRequest('/api/projects/all', { 
      headers: adminHeaders,
      // No userId param to get all projects
    }),
    enabled: !!user?.id
  });
  
  // Create a map of project IDs to project names for easy lookup
  const projects = projectsData ? (projectsData as any).projects || [] : [];
  
  // Convert API response to array of RFP documents, filtering for "done" status only
  const allRfpDocuments: RfpDocument[] = Array.isArray(rfpDocumentsResponse) 
    ? rfpDocumentsResponse.filter(doc => doc.status === 'done')
    : [];
    
  // Filter RFP documents based on selected status
  const rfpDocuments = allRfpDocuments.filter(doc => {
    if (rfpFilterStatus === 'all') return true;
    return doc.approval_status === rfpFilterStatus;
  });
    
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

  // Processing state for chunking
  const [processingChunks, setProcessingChunks] = useState<Record<string, boolean>>({});
  
  // Handle document approval
  const handleDocumentApproval = async (id: string, status: 'approved' | 'rejected') => {
    // First update the document status through the API
    updateDocumentApproval.mutate({ id, status }, {
      onSuccess: async (data) => {
        // If the document is approved, trigger the chunking process
        if (status === 'approved') {
          try {
            setProcessingChunks(prev => ({ ...prev, [id]: true }));
            
            toast({
              title: "Processing document",
              description: "Splitting document into chunks for AI processing...",
            });
            
            // Call the chunking service to process the document
            const result = await ChunkingService.chunkDocument(id, {
              chunkSize: 500,
              chunkOverlap: 50
            });
            
            setProcessingChunks(prev => ({ ...prev, [id]: false }));
            
            if (result.success) {
              toast({
                title: "Document processed",
                description: `Created ${result.chunksCreated} chunks for AI processing.`,
              });
            } else {
              toast({
                title: "Warning",
                description: `Document approved but chunking failed: ${result.error}`,
                variant: "destructive",
              });
            }
          } catch (error) {
            setProcessingChunks(prev => ({ ...prev, [id]: false }));
            console.error("Error chunking document:", error);
            toast({
              title: "Error",
              description: "Failed to process document chunks. Document was approved but needs to be reprocessed.",
              variant: "destructive",
            });
          }
        }
      }
    });
  };

  // Handle RFP document approval with improved error handling
  const handleRfpDocumentApproval = (id: string, status: 'approved' | 'rejected') => {
    try {
      // Set a timeout to detect if the call is taking too long
      const timeoutId = setTimeout(() => {
        console.log('RFP document approval request is taking a long time...');
        toast({
          title: 'Processing',
          description: 'The request is taking longer than expected. Please wait...',
        });
      }, 5000); // 5 second timeout
      
      updateRfpDocumentApproval.mutate(
        { id, status },
        {
          onSuccess: () => {
            clearTimeout(timeoutId);
            console.log(`RFP Document ${id} ${status} successfully`);
          },
          onError: (error) => {
            clearTimeout(timeoutId);
            console.error('Error approving RFP document:', error);
          }
        }
      );
    } catch (err) {
      console.error('Exception in handleRfpDocumentApproval:', err);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Format date for display - show only the date part
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
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
    
    // If this is the first time we're seeing this project ID, log it
    console.log(`Project ID not found in projects list: ${projectId}`);
    
    // Format the project ID to make it more readable if we can't find the name
    const shortId = projectId.substring(0, 8) + '...';
    return shortId;
  };
  
  // Function to get user email from user ID
  const getUserEmail = (userId: string | null) => {
    if (!userId) return 'N/A';
    
    // Return the email from the map if it exists
    if (userEmailsMap[userId]) {
      return userEmailsMap[userId];
    }
    
    // If we don't have the email, return a formatted user ID
    const shortId = userId.substring(0, 8) + '...';
    return shortId;
  };
  
  // Fetch user emails for document uploaders
  useEffect(() => {
    const fetchUserEmails = async () => {
      // Collect all user IDs from documents and RFP documents
      const userIds = new Set<string>();
      
      if (documents && documents.length > 0) {
        documents.forEach(doc => {
          if (doc.uploaded_by) userIds.add(doc.uploaded_by);
        });
      }
      
      if (allRfpDocuments && allRfpDocuments.length > 0) {
        allRfpDocuments.forEach(doc => {
          if (doc.uploaded_by) userIds.add(doc.uploaded_by);
        });
      }
      
      if (userIds.size === 0) {
        console.log('No user IDs found to fetch emails for');
        return;
      }
      
      try {
        console.log(`Fetching emails for ${userIds.size} users:`, Array.from(userIds));
        
        // Query Supabase for user details
        const { data, error } = await supabase
          .from('users')
          .select('id, email')
          .in('id', Array.from(userIds));
          
        if (error) throw new Error(error.message);
        
        if (!data || data.length === 0) {
          console.warn('No user data returned from Supabase');
          return;
        }
        
        // Create a map of user IDs to emails
        const emailMap: Record<string, string> = {};
        data.forEach(user => {
          emailMap[user.id] = user.email;
        });
        
        console.log('Email map created:', emailMap);
        setUserEmailsMap(emailMap);
      } catch (err) {
        console.error('Error fetching user emails:', err);
        // Continue without emails, don't block the UI
      }
    };
    
    fetchUserEmails();
  }, [documents, allRfpDocuments]);

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
                <div className="mb-4 flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium">Filter by status:</span>
                  <Select
                    value={documentFilterStatus}
                    onValueChange={setDocumentFilterStatus}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select a status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                        <TableHead>Approval Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documents.map((doc: Document) => (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium flex items-center">
                            <FileText className="mr-2 h-4 w-4 text-gray-500" />
                            {doc.file_url ? (
                              <a 
                                href={doc.file_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                {doc.name || doc.file_url || 'Unnamed document'}
                              </a>
                            ) : (
                              doc.name || 'Unnamed document'
                            )}
                          </TableCell>
                          <TableCell>{getUserEmail(doc.uploaded_by)}</TableCell>
                          <TableCell>{formatDate(doc.created_at)}</TableCell>
                          <TableCell>
                            <StatusBadge status={doc.approval_status} />
                          </TableCell>
                          <TableCell>
                            {processingChunks[doc.id] ? (
                              <div className="flex items-center space-x-2 text-primary">
                                <Scissors className="h-4 w-4 animate-pulse" />
                                <span className="text-xs">Processing chunks...</span>
                              </div>
                            ) : (
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
                            )}
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
                <div className="mb-4 flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium">Filter by status:</span>
                  <Select
                    value={rfpFilterStatus}
                    onValueChange={setRfpFilterStatus}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select a status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                        <TableHead>Uploaded By</TableHead>
                        <TableHead>Uploaded At</TableHead>
                        <TableHead>Approval Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rfpDocuments.map((doc: RfpDocument) => (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium flex items-center">
                            <FileText className="mr-2 h-4 w-4 text-gray-500" />
                            <a 
                              href={`/projects/${doc.project_id}/rfp-documents/${doc.id}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {doc.name || doc.file_url || 'Unnamed document'}
                            </a>
                          </TableCell>
                          <TableCell>{getProjectName(doc.project_id)}</TableCell>
                          <TableCell>{getUserEmail(doc.uploaded_by)}</TableCell>
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