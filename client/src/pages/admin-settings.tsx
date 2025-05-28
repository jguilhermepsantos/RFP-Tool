import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/lib/auth';
import { ChunkingService } from '@/lib/chunkingService';
import { useUserCache } from '@/hooks/use-user-cache';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import NavHeader from '@/components/nav-header';
import { Check, X, FileText, Filter, Scissors, Users, Database, Shield, User, MessageSquare, Loader2, Plus, Mail, Zap, Eye } from 'lucide-react';

// Form validation schema for inviting users
const inviteUserSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  role: z.enum(["user", "admin"], {
    required_error: "Please select a role"
  })
});

type InviteUserForm = z.infer<typeof inviteUserSchema>;

// Status Badge Component
const StatusBadge = ({ status }: { status: 'pending' | 'approved' | 'embedded' | 'rejected' }) => {
  const statusConfig = {
    pending: { color: 'bg-yellow-100 text-yellow-800', text: 'Pending' },
    approved: { color: 'bg-blue-100 text-blue-800', text: 'Approved' },
    embedded: { color: 'bg-green-100 text-green-800', text: 'Embedded' },
    rejected: { color: 'bg-red-100 text-red-800', text: 'Rejected' }
  };

  const config = statusConfig[status];
  return (
    <Badge className={`${config.color} border-0`}>
      {config.text}
    </Badge>
  );
};

// Interfaces for the approval data
interface Document {
  id: string;
  name: string;
  uploadedBy: string;
  uploadedAt?: string;
  createdAt: string;
  fileUrl: string | null;
  approvalStatus: 'pending' | 'approved' | 'embedded' | 'rejected';
  approvalStatusModifiedAt: string | null;
  approvalStatusModifiedBy: string | null;
  uploaded_by?: string;
  uploaded_at?: string;
  created_at?: string;
  file_url?: string | null;
  approval_status?: 'pending' | 'approved' | 'rejected';
  approval_status_modified_at?: string | null;
  approval_status_modified_by?: string | null;
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

interface Chunk {
  id: string;
  content: string;
  documentId: string;
  createdAt: string;
  embedded: boolean;
  embeddedAt: string | null;
  scope: string;
}

interface Feedback {
  id: string;
  content: string;
  uploaded_by: string;
  created_at: string;
}

export default function AdminSettings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<string>('knowledge-base');
  const [activeTab, setActiveTab] = useState<string>('documents');
  const [documentFilterStatus, setDocumentFilterStatus] = useState<string>('all');
  const [rfpFilterStatus, setRfpFilterStatus] = useState<string>('all');
  const [showInviteForm, setShowInviteForm] = useState<boolean>(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [chunksModalOpen, setChunksModalOpen] = useState(false);
  
  // Invite user form
  const inviteForm = useForm<InviteUserForm>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: "",
      role: "user"
    }
  });
  
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

  // Fetch all users for user management
  const {
    data: usersResponse,
    isLoading: isAllUsersLoading,
    error: usersError
  } = useQuery({
    queryKey: ['/api/admin/users-list'],
    queryFn: () => apiRequest('/api/admin/users-list', { headers: adminHeaders }),
    enabled: activeSection === 'user-management'
  });

  // Fetch all feedbacks
  const {
    data: feedbacksResponse,
    isLoading: isFeedbacksLoading,
    error: feedbacksError
  } = useQuery({
    queryKey: ['/api/admin/feedback'],
    queryFn: () => apiRequest('/api/admin/feedback', { headers: adminHeaders }),
    enabled: activeSection === 'feedbacks'
  });
  
  // Get ALL project details from the API (as admin, we need access to all projects)
  const {
    data: projectsData,
  } = useQuery({
    queryKey: ['/api/projects/all'],
    queryFn: () => apiRequest('/api/projects/all', { 
      headers: adminHeaders,
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

  // Process feedbacks data
  const feedbacks: Feedback[] = Array.isArray(feedbacksResponse) ? feedbacksResponse : [];

  // Fetch document chunks when a document is selected
  const {
    data: chunksResponse,
    isLoading: isChunksLoading,
    error: chunksError
  } = useQuery({
    queryKey: ['/api/documents', selectedDocumentId, 'chunks'],
    queryFn: async () => {
      const response = await fetch(`/api/documents/${selectedDocumentId}/chunks`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    },
    enabled: !!selectedDocumentId && chunksModalOpen,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true
  });

  // Convert API response to array of chunks
  const chunks: Chunk[] = (chunksResponse as any)?.chunks || [];
  
  // Add debug logging to see what we're getting
  if (selectedDocumentId && chunksModalOpen) {
    console.log('Selected document ID:', selectedDocumentId);
    console.log('Chunks response:', chunksResponse);
    console.log('Chunks array:', chunks);
  }

  // Handle viewing chunks for a document
  const handleViewChunks = (documentId: string) => {
    // Clear any cached data for this specific chunks query
    queryClient.removeQueries({
      queryKey: ['/api/documents', documentId, 'chunks']
    });
    
    setSelectedDocumentId(documentId);
    setChunksModalOpen(true);
  };

  // Handle closing the chunks modal
  const handleCloseChunksModal = () => {
    setChunksModalOpen(false);
    setSelectedDocumentId(null);
  };

  // Collect all user IDs that need to be fetched for email display
  const allUserIds = [
    ...documents.map(doc => doc.uploaded_by || doc.uploadedBy),
    ...documents.map(doc => doc.approval_status_modified_by || doc.approvalStatusModifiedBy),
    ...rfpDocuments.map(doc => doc.uploaded_by),
    ...rfpDocuments.map(doc => doc.approval_status_modified_by),
    ...feedbacks.map(feedback => feedback.uploaded_by)
  ].filter((id): id is string => Boolean(id));

  // Use the batch user cache hook
  const { getUserEmail, isLoading: isUsersLoading } = useUserCache(allUserIds);
    
  console.log("RFP documents:", rfpDocuments);
  console.log("RFP document uploaded_by values:", rfpDocuments.map(doc => ({ name: doc.name, uploaded_by: doc.uploaded_by })));
  console.log("All user IDs being fetched:", allUserIds);
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
        title: "Success",
        description: "Document status updated successfully",
      });
    },
    onError: (error) => {
      console.error('Error updating document approval:', error);
      toast({
        title: "Error",
        description: "Failed to update document status",
        variant: "destructive",
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
        title: "Success",
        description: "RFP document status updated successfully",
      });
    },
    onError: (error) => {
      console.error('Error updating RFP document approval:', error);
      toast({
        title: "Error",
        description: "Failed to update RFP document status",
        variant: "destructive",
      });
    }
  });

  // Mutation for embedding a single document
  const embedDocument = useMutation({
    mutationFn: async (documentId: string) => {
      return await apiRequest(`/api/documents/${documentId}/embed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': user?.email || ''
        }
      });
    },
    onSuccess: () => {
      // Force refetch of documents to show updated status
      queryClient.invalidateQueries({ queryKey: ['/api/admin/documents'] });
      queryClient.refetchQueries({ queryKey: ['/api/admin/documents'] });
      
      toast({
        title: "Success",
        description: "Document embedding completed successfully",
      });
    },
    onError: (error) => {
      console.error('Error embedding document:', error);
      toast({
        title: "Error",
        description: "Failed to embed document",
        variant: "destructive",
      });
    }
  });

  // Mutation for embedding all approved documents
  const embedAllApprovedDocuments = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/documents/embed-approved', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': user?.email || ''
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/documents'] });
      toast({
        title: "Success",
        description: "All approved documents are being embedded",
      });
    },
    onError: (error) => {
      console.error('Error embedding approved documents:', error);
      toast({
        title: "Error",
        description: "Failed to embed approved documents",
        variant: "destructive",
      });
    }
  });

  // Mutation for updating user access
  const updateUserAccess = useMutation({
    mutationFn: async ({id, accessGranted}: {id: string, accessGranted: boolean}) => {
      return await apiRequest(`/api/admin/users/${id}/access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': user?.email || ''
        },
        body: JSON.stringify({ accessGranted })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({
        title: "Success",
        description: "User access updated successfully",
      });
    },
    onError: (error) => {
      console.error('Error updating user access:', error);
      toast({
        title: "Error",
        description: "Failed to update user access",
        variant: "destructive",
      });
    }
  });

  // Mutation for updating user role
  const updateUserRole = useMutation({
    mutationFn: async ({id, role}: {id: string, role: string}) => {
      return await apiRequest(`/api/admin/users/${id}/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': user?.email || ''
        },
        body: JSON.stringify({ role })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({
        title: "Success",
        description: "User role updated successfully",
      });
    },
    onError: (error) => {
      console.error('Error updating user role:', error);
      toast({
        title: "Error",
        description: "Failed to update user role",
        variant: "destructive",
      });
    }
  });

  // Mutation for inviting a new user
  const inviteUser = useMutation({
    mutationFn: async (data: InviteUserForm) => {
      return await apiRequest('/api/admin/invite-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': user?.email || ''
        },
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      inviteForm.reset();
      setShowInviteForm(false);
      toast({
        title: "Success",
        description: "User invitation sent successfully",
      });
    },
    onError: (error) => {
      console.error('Error inviting user:', error);
      toast({
        title: "Error", 
        description: "Failed to send user invitation",
        variant: "destructive",
      });
    }
  });

  // Format date for display - show only the date part
  const formatDate = (dateString: string | undefined | null) => {
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

  // Status badge component
  const StatusBadge = ({ status }: { status: string | undefined }) => {
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
        
        <div className="flex gap-6">
          {/* Sidebar Navigation */}
          <div className="w-64 flex-shrink-0">
            <Card>
              <CardContent className="p-4">
                <nav className="space-y-2">
                  <button
                    onClick={() => setActiveSection('knowledge-base')}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                      activeSection === 'knowledge-base' 
                        ? "bg-blue-100 text-blue-900" 
                        : "hover:bg-gray-100"
                    )}
                  >
                    <Database className="h-4 w-4" />
                    Knowledge Base Management
                  </button>
                  <button
                    onClick={() => setActiveSection('user-management')}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                      activeSection === 'user-management' 
                        ? "bg-blue-100 text-blue-900" 
                        : "hover:bg-gray-100"
                    )}
                  >
                    <Users className="h-4 w-4" />
                    User Management
                  </button>
                  <button
                    onClick={() => setActiveSection('feedbacks')}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                      activeSection === 'feedbacks' 
                        ? "bg-blue-100 text-blue-900" 
                        : "hover:bg-gray-100"
                    )}
                  >
                    <MessageSquare className="h-4 w-4" />
                    Feedbacks
                  </button>
                </nav>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {activeSection === 'knowledge-base' && (
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
                            <SelectItem value="all">All Documents</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {isDocumentsLoading ? (
                        <div className="text-center py-4">Loading documents...</div>
                      ) : documentsError ? (
                        <div className="text-center py-4 text-red-600">Error loading documents</div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Document Name</TableHead>
                              <TableHead>Uploaded By</TableHead>
                              <TableHead>Created</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {documents.map((doc: Document) => (
                              <TableRow key={doc.id}>
                                <TableCell>
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
                                <TableCell>{getUserEmail(doc.uploaded_by || null)}</TableCell>
                                <TableCell>{formatDate(doc.createdAt || doc.created_at)}</TableCell>
                                <TableCell>
                                  <StatusBadge status={doc.approval_status} />
                                </TableCell>
                                <TableCell>
                                  {doc.approval_status === 'pending' ? (
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        onClick={() => updateDocumentApproval.mutate({id: doc.id, status: 'approved'})}
                                        disabled={updateDocumentApproval.isPending}
                                      >
                                        <Check className="h-4 w-4 mr-1" />
                                        Approve
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => updateDocumentApproval.mutate({id: doc.id, status: 'rejected'})}
                                        disabled={updateDocumentApproval.isPending}
                                      >
                                        <X className="h-4 w-4 mr-1" />
                                        Reject
                                      </Button>
                                    </div>
                                  ) : doc.approval_status === 'approved' ? (
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => embedDocument.mutate(doc.id)}
                                        disabled={embedDocument.isPending}
                                      >
                                        <Zap className="h-4 w-4 mr-1" />
                                        Process Embedding
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => handleViewChunks(doc.id)}
                                      >
                                        <FileText className="h-4 w-4 mr-1" />
                                        View Chunks
                                      </Button>
                                    </div>
                                  ) : doc.approval_status === 'embedded' ? (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => handleViewChunks(doc.id)}
                                    >
                                      <FileText className="h-4 w-4 mr-1" />
                                      View Chunks
                                    </Button>
                                  ) : (
                                    <span className="text-sm text-gray-500">
                                      No actions available
                                    </span>
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
                        Approve or reject RFP documents for inclusion in the knowledge base
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
                            <SelectItem value="all">All Documents</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {isRfpDocumentsLoading ? (
                        <div className="text-center py-4">Loading RFP documents...</div>
                      ) : rfpDocumentsError ? (
                        <div className="text-center py-4 text-red-600">Error loading RFP documents</div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Document Name</TableHead>
                              <TableHead>Project</TableHead>
                              <TableHead>Uploaded By</TableHead>
                              <TableHead>Created</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rfpDocuments.map((doc: RfpDocument) => (
                              <TableRow key={doc.id}>
                                <TableCell>
                                  <a
                                    href={`/projects/${doc.project_id}/rfp-documents/${doc.id}`}
                                    className="text-blue-600 hover:underline"
                                  >
                                    {doc.name || doc.file_url || 'Unnamed document'}
                                  </a>
                                </TableCell>
                                <TableCell>{getProjectName(doc.project_id)}</TableCell>
                                <TableCell>{getUserEmail(doc.uploaded_by || null)}</TableCell>
                                <TableCell>{formatDate(doc.uploaded_at)}</TableCell>
                                <TableCell>
                                  <StatusBadge status={doc.approval_status} />
                                </TableCell>
                                <TableCell>
                                  {doc.approval_status === 'pending' ? (
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        onClick={() => updateRfpDocumentApproval.mutate({id: doc.id, status: 'approved'})}
                                        disabled={updateRfpDocumentApproval.isPending}
                                      >
                                        <Check className="h-4 w-4 mr-1" />
                                        Approve
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => updateRfpDocumentApproval.mutate({id: doc.id, status: 'rejected'})}
                                        disabled={updateRfpDocumentApproval.isPending}
                                      >
                                        <X className="h-4 w-4 mr-1" />
                                        Reject
                                      </Button>
                                    </div>
                                  ) : (
                                    <span className="text-sm text-gray-500">No actions available</span>
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
              </Tabs>
            )}

            {activeSection === 'user-management' && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>User Management</CardTitle>
                      <CardDescription>
                        Manage user access and roles in the system
                      </CardDescription>
                    </div>
                    <Button 
                      onClick={() => setShowInviteForm(!showInviteForm)}
                      className="flex items-center gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Invite User
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Invite User Form */}
                  {showInviteForm && (
                    <div className="mb-6 p-4 border rounded-lg bg-gray-50">
                      <h3 className="text-lg font-medium mb-4">Invite New User</h3>
                      <form onSubmit={inviteForm.handleSubmit((data) => inviteUser.mutate(data))} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="email">Email Address</Label>
                            <Input
                              id="email"
                              type="email"
                              placeholder="user@example.com"
                              {...inviteForm.register("email")}
                            />
                            {inviteForm.formState.errors.email && (
                              <p className="text-sm text-red-600 mt-1">
                                {inviteForm.formState.errors.email.message}
                              </p>
                            )}
                          </div>
                          <div>
                            <Label htmlFor="role">Role</Label>
                            <Select 
                              onValueChange={(value) => inviteForm.setValue("role", value as "user" | "admin")}
                              defaultValue={inviteForm.getValues("role")}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select role" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">User</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                            {inviteForm.formState.errors.role && (
                              <p className="text-sm text-red-600 mt-1">
                                {inviteForm.formState.errors.role.message}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            type="submit" 
                            disabled={inviteUser.isPending}
                            className="flex items-center gap-2"
                          >
                            {inviteUser.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Mail className="h-4 w-4" />
                            )}
                            {inviteUser.isPending ? 'Sending...' : 'Send Invitation'}
                          </Button>
                          <Button 
                            type="button" 
                            variant="outline" 
                            onClick={() => {
                              setShowInviteForm(false);
                              inviteForm.reset();
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    </div>
                  )}
                  {isAllUsersLoading ? (
                    <div className="text-center py-4">Loading users...</div>
                  ) : usersError ? (
                    <div className="text-center py-4 text-red-600">Error loading users</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Access Status</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Array.isArray(usersResponse) && usersResponse.map((user: any) => (
                          <TableRow key={user.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{user.email}</div>
                                {user.name && <div className="text-sm text-gray-500">{user.name}</div>}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                                <Shield className="h-3 w-3 mr-1" />
                                {user.role || 'user'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={(user.accessGranted || user.access_granted) ? 'default' : 'destructive'}>
                                {(user.accessGranted || user.access_granted) ? 'Granted' : 'Denied'}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDate(user.createdAt || user.created_at)}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant={(user.accessGranted || user.access_granted) ? 'destructive' : 'default'}
                                  onClick={() => updateUserAccess.mutate({id: user.id, accessGranted: !(user.accessGranted || user.access_granted)})}
                                  disabled={updateUserAccess.isPending}
                                >
                                  {(user.accessGranted || user.access_granted) ? 'Revoke' : 'Grant'} Access
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateUserRole.mutate({id: user.id, role: user.role === 'admin' ? 'user' : 'admin'})}
                                  disabled={updateUserRole.isPending}
                                >
                                  {user.role === 'admin' ? 'Make User' : 'Make Admin'}
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
            )}

            {activeSection === 'feedbacks' && (
              <Card>
                <CardHeader>
                  <CardTitle>User Feedbacks</CardTitle>
                  <CardDescription>
                    View all feedback submissions from Solution Engineers about the RFP Assistant Tool
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isFeedbacksLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      Loading feedbacks...
                    </div>
                  ) : feedbacksError ? (
                    <div className="text-center py-8 text-red-600">
                      Error loading feedbacks: {feedbacksError.message}
                    </div>
                  ) : feedbacks.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No feedback submissions yet
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Feedback</TableHead>
                          <TableHead>Submitted</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {feedbacks
                          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                          .map((feedback) => {
                            const userEmail = getUserEmail(feedback.uploaded_by) || 'Unknown User';
                            const submittedDate = new Date(feedback.created_at).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            });

                            return (
                              <TableRow key={feedback.id}>
                                <TableCell>
                                  <div className="font-medium">{userEmail}</div>
                                </TableCell>
                                <TableCell>
                                  <div className="max-w-md">
                                    <p className="text-sm text-gray-900 break-words">
                                      {feedback.content}
                                    </p>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="text-sm text-gray-500">
                                    {submittedDate}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Chunks Modal Dialog */}
      <Dialog open={chunksModalOpen} onOpenChange={handleCloseChunksModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Document Chunks</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            {isChunksLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Loading chunks...
              </div>
            ) : chunksError ? (
              <div className="text-center py-8 text-red-600">
                Error loading chunks: {chunksError.message}
              </div>
            ) : chunks.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No chunks found for this document
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-gray-600 mb-4">
                  Found {chunks.length} chunks for this document
                </div>
                {chunks.map((chunk, index) => (
                  <div key={chunk.id} className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        Chunk {index + 1}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          chunk.embedded 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {chunk.embedded ? 'Embedded' : 'Not Embedded'}
                        </span>
                        {chunk.scope && (
                          <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                            {chunk.scope}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                      {chunk.content}
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      Created: {new Date(chunk.createdAt).toLocaleString()}
                      {chunk.embeddedAt && (
                        <span className="ml-4">
                          Embedded: {new Date(chunk.embeddedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}