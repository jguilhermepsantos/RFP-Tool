import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/lib/auth';
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
import { Switch } from '@/components/ui/switch';
import NavHeader from '@/components/nav-header';
import { 
  Check, 
  X, 
  FileText, 
  Users, 
  Database, 
  ExternalLink,
  CheckCircle,
  XCircle 
} from 'lucide-react';
import { format } from 'date-fns';

// Interfaces
interface Document {
  id: string;
  name: string;
  uploadedBy: string;
  uploadedAt?: string;
  createdAt: string;
  fileUrl: string | null;
  approvalStatus: 'pending' | 'approved' | 'rejected';
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
  projectId: string | null;
  fileUrl: string | null;
  uploadedBy: string | null;
  uploadedAt: string | null;
  status: string | null;
  isPastRfp: boolean | null;
  approvalStatus: string | null;
  approvalStatusModifiedBy: string | null;
  approvalStatusModifiedAt: string | null;
  project_id?: string | null;
  file_url?: string | null;
  uploaded_by?: string | null;
  uploaded_at?: string | null;
  is_past_rfp?: boolean | null;
  approval_status?: string | null;
  approval_status_modified_by?: string | null;
  approval_status_modified_at?: string | null;
}

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  accessGranted: boolean | null;
  createdAt: string | null;
  access_granted?: boolean | null;
  created_at?: string | null;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  createdBy: string | null;
  created_at?: string;
  created_by?: string | null;
}

type SidebarSection = 'knowledge-base' | 'user-management';
type KnowledgeBaseTab = 'documents' | 'rfp-documents';

export default function AdminSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<SidebarSection>('knowledge-base');
  const [activeKbTab, setActiveKbTab] = useState<KnowledgeBaseTab>('documents');

  // Fetch documents
  const { data: documents = [], isLoading: documentsLoading } = useQuery({
    queryKey: ['/api/admin/documents'],
    enabled: activeSection === 'knowledge-base'
  });

  // Fetch RFP documents
  const { data: rfpDocuments = [], isLoading: rfpDocumentsLoading } = useQuery({
    queryKey: ['/api/admin/rfp-documents'],
    enabled: activeSection === 'knowledge-base'
  });

  // Fetch all projects
  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ['/api/projects/all'],
    enabled: activeSection === 'knowledge-base'
  });

  // Fetch users
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['/api/admin/users'],
    enabled: activeSection === 'user-management'
  });

  const users = usersData?.users || [];

  // Helper function to get user email by ID
  const getUserEmail = (userId: string): string => {
    const foundUser = users.find((u: User) => u.id === userId);
    return foundUser?.email || userId;
  };

  // Document approval mutation
  const documentApprovalMutation = useMutation({
    mutationFn: async ({ documentId, approved }: { documentId: string; approved: boolean }) => {
      const url = `/api/admin/documents/${documentId}/approve`;
      return await apiRequest(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/documents'] });
      toast({
        title: 'Success',
        description: 'Document status updated successfully'
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to update document status'
      });
    }
  });

  // RFP document approval mutation
  const rfpDocumentApprovalMutation = useMutation({
    mutationFn: async ({ documentId, approved }: { documentId: string; approved: boolean }) => {
      const url = `/api/admin/rfp-documents/${documentId}/approve`;
      return await apiRequest(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/rfp-documents'] });
      toast({
        title: 'Success',
        description: 'RFP document status updated successfully'
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to update RFP document status'
      });
    }
  });

  // User access mutation
  const userAccessMutation = useMutation({
    mutationFn: async ({ userId, accessGranted }: { userId: string; accessGranted: boolean }) => {
      return await apiRequest(`/api/admin/users/${userId}/access`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessGranted })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({
        title: 'Success',
        description: 'User access updated successfully'
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to update user access'
      });
    }
  });

  const handleDocumentApproval = (documentId: string, approved: boolean) => {
    documentApprovalMutation.mutate({ documentId, approved });
  };

  const handleRfpDocumentApproval = (documentId: string, approved: boolean) => {
    rfpDocumentApprovalMutation.mutate({ documentId, approved });
  };

  const handleUserAccessToggle = (userId: string, currentAccess: boolean) => {
    userAccessMutation.mutate({ userId, accessGranted: !currentAccess });
  };

  const renderKnowledgeBaseDocuments = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Knowledge Base Documents
        </CardTitle>
        <CardDescription>
          Manage uploaded knowledge base documents and their approval status
        </CardDescription>
      </CardHeader>
      <CardContent>
        {documentsLoading ? (
          <div className="text-center py-4">Loading documents...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document Name</TableHead>
                <TableHead>Uploaded By</TableHead>
                <TableHead>Uploaded At</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc: Document) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    {doc.fileUrl || doc.file_url ? (
                      <a
                        href={doc.fileUrl || doc.file_url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        {doc.name}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span>{doc.name}</span>
                    )}
                  </TableCell>
                  <TableCell>{getUserEmail(doc.uploadedBy || doc.uploaded_by || '')}</TableCell>
                  <TableCell>
                    {doc.uploadedAt || doc.uploaded_at || doc.createdAt || doc.created_at 
                      ? format(new Date(doc.uploadedAt || doc.uploaded_at || doc.createdAt || doc.created_at || ''), 'yyyy-MM-dd')
                      : 'N/A'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={
                      (doc.approvalStatus || doc.approval_status) === 'approved' ? 'default' :
                      (doc.approvalStatus || doc.approval_status) === 'rejected' ? 'destructive' : 'secondary'
                    }>
                      {doc.approvalStatus || doc.approval_status || 'pending'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDocumentApproval(doc.id, true)}
                        disabled={documentApprovalMutation.isPending}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDocumentApproval(doc.id, false)}
                        disabled={documentApprovalMutation.isPending}
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
  );

  const renderRfpDocuments = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          RFP Documents
        </CardTitle>
        <CardDescription>
          Manage uploaded RFP documents and their approval status
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rfpDocumentsLoading ? (
          <div className="text-center py-4">Loading RFP documents...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document Name</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Uploaded By</TableHead>
                <TableHead>Uploaded At</TableHead>
                <TableHead>Past RFP</TableHead>
                <TableHead>Approval Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rfpDocuments.map((doc: RfpDocument) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <a
                      href={`/projects/${doc.projectId || doc.project_id}/rfp-documents/${doc.id}`}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      {doc.name || 'Untitled Document'}
                    </a>
                  </TableCell>
                  <TableCell>
                    {projectsData?.projects?.find((p: Project) => p.id === (doc.projectId || doc.project_id))?.name || 'Unknown Project'}
                  </TableCell>
                  <TableCell>{getUserEmail(doc.uploadedBy || doc.uploaded_by || '')}</TableCell>
                  <TableCell>
                    {doc.uploadedAt || doc.uploaded_at 
                      ? format(new Date(doc.uploadedAt || doc.uploaded_at || ''), 'yyyy-MM-dd')
                      : 'N/A'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={(doc.isPastRfp || doc.is_past_rfp) ? 'default' : 'secondary'}>
                      {(doc.isPastRfp || doc.is_past_rfp) ? 'Yes' : 'No'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={
                      (doc.approvalStatus || doc.approval_status) === 'approved' ? 'default' :
                      (doc.approvalStatus || doc.approval_status) === 'rejected' ? 'destructive' : 'secondary'
                    }>
                      {doc.approvalStatus || doc.approval_status || 'pending'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRfpDocumentApproval(doc.id, true)}
                        disabled={rfpDocumentApprovalMutation.isPending}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRfpDocumentApproval(doc.id, false)}
                        disabled={rfpDocumentApprovalMutation.isPending}
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
  );

  const renderUserManagement = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          User Management
        </CardTitle>
        <CardDescription>
          Manage user access and permissions
        </CardDescription>
      </CardHeader>
      <CardContent>
        {usersLoading ? (
          <div className="text-center py-4">Loading users...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Access Granted</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user: User) => (
                <TableRow key={user.id}>
                  <TableCell>{user.name || 'N/A'}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                      {user.role || 'user'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {(user.accessGranted || user.access_granted) ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                      <span>{(user.accessGranted || user.access_granted) ? 'Granted' : 'Denied'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.createdAt || user.created_at 
                      ? format(new Date(user.createdAt || user.created_at || ''), 'yyyy-MM-dd')
                      : 'N/A'}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={user.accessGranted || user.access_granted || false}
                      onCheckedChange={() => handleUserAccessToggle(user.id, user.accessGranted || user.access_granted || false)}
                      disabled={userAccessMutation.isPending}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <NavHeader />
      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 bg-white shadow-sm border-r min-h-screen">
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-6">Admin Settings</h2>
            <nav className="space-y-2">
              <button
                onClick={() => setActiveSection('knowledge-base')}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-colors ${
                  activeSection === 'knowledge-base'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Database className="h-5 w-5" />
                Knowledge Base Management
              </button>
              <button
                onClick={() => setActiveSection('user-management')}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-colors ${
                  activeSection === 'user-management'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Users className="h-5 w-5" />
                User Management
              </button>
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6">
          {activeSection === 'knowledge-base' && (
            <div className="space-y-6">
              <div className="flex gap-4 mb-6">
                <button
                  onClick={() => setActiveKbTab('documents')}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    activeKbTab === 'documents'
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'bg-white text-gray-600 hover:bg-gray-50 border'
                  }`}
                >
                  Knowledge Base Documents
                </button>
                <button
                  onClick={() => setActiveKbTab('rfp-documents')}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    activeKbTab === 'rfp-documents'
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'bg-white text-gray-600 hover:bg-gray-50 border'
                  }`}
                >
                  RFP Documents
                </button>
              </div>

              {activeKbTab === 'documents' && renderKnowledgeBaseDocuments()}
              {activeKbTab === 'rfp-documents' && renderRfpDocuments()}
            </div>
          )}

          {activeSection === 'user-management' && renderUserManagement()}
        </div>
      </div>
    </div>
  );
}