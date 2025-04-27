import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import NavHeader from "@/components/nav-header";
import RfpDocumentTable from "@/components/rfp-document-table";
import DocumentUpload from "@/components/document-upload";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { PlusCircle, Trash2, Shield } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface ProjectDetailsProps {
  projectId: string;
}

interface ProjectData {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  created_by: string | null;
}

interface MemberData {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  created_at: string;
  email?: string;
}

interface UserData {
  id: string;
  email: string;
  name?: string;
  role?: string;
}

interface DocumentData {
  id: string;
  project_id: string;
  name?: string;
  status: string;
  created_at: string;
  uploaded_at?: string;
  file_url?: string;
  uploaded_by?: string;
  is_past_rfp?: boolean;
}

// Add member form schema
const addMemberSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  role: z.string().refine(val => ["owner", "collaborator", "viewer"].includes(val), {
    message: "Please select a valid role"
  })
});

// Update role form schema
const updateRoleSchema = z.object({
  role: z.string().refine(val => ["owner", "collaborator", "viewer"].includes(val), {
    message: "Please select a valid role"
  })
});

type AddMemberFormValues = z.infer<typeof addMemberSchema>;
type UpdateRoleFormValues = z.infer<typeof updateRoleSchema>;

export default function ProjectDetails({ projectId }: ProjectDetailsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [usersWithEmail, setUsersWithEmail] = useState<Record<string, string>>({});
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<MemberData | null>(null);
  const [isRemovingMember, setIsRemovingMember] = useState(false);
  const [memberToUpdateRole, setMemberToUpdateRole] = useState<MemberData | null>(null);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchProjectDetails = async () => {
    if (!projectId) return;
    
    try {
      setIsLoading(true);
      
      // Fetch project
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();
        
      if (projectError) {
        throw new Error(projectError.message);
      }
      
      if (!projectData) {
        throw new Error('Project not found');
      }
      
      // Fetch project members
      const { data: memberData, error: memberError } = await supabase
        .from('project_permissions')
        .select('*')
        .eq('project_id', projectId);
        
      if (memberError) {
        throw new Error(memberError.message);
      }
      
      // Fetch RFP documents
      const { data: documentData, error: documentError } = await supabase
        .from('rfp_documents')
        .select('*')
        .eq('project_id', projectId)
        .order('uploaded_at', { ascending: false });
        
      console.log('RFP Documents from Supabase:', documentData);
        
      if (documentError) {
        throw new Error(documentError.message);
      }
      
      setProject(projectData);
      setMembers(memberData || []);
      setDocuments(documentData || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching project details:', err);
      setError(err as Error);
      toast({
        variant: "destructive",
        title: "Error",
        description: (err as Error).message || "Failed to load project details",
      });
      
      // Redirect to projects page if project not found
      if ((err as Error).message.includes('not found')) {
        setLocation("/projects");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectDetails();
  }, [projectId]);

  const userRole = members.find((m) => m.user_id === user?.id)?.role || 'viewer';
  const isOwnerOrCollaborator = userRole === 'owner' || userRole === 'collaborator';

  return (
    <div className="min-h-screen bg-slate-50">
      <NavHeader />
      
      <main className="container mx-auto py-6 px-4">
        {isLoading ? (
          <>
            <div className="mb-6">
              <Skeleton className="h-8 w-2/3 mb-2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-1/4 mb-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          </>
        ) : project ? (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold">{project.name}</h1>
              <p className="text-muted-foreground">
                {project.description || "No description provided"}
              </p>
            </div>
            
            <Tabs defaultValue="documents" className="w-full">
              <TabsList>
                <TabsTrigger value="documents">RFP Documents</TabsTrigger>
                <TabsTrigger value="team">Team Members</TabsTrigger>
              </TabsList>
              
              <TabsContent value="documents" className="space-y-4">
                {isOwnerOrCollaborator && (
                  <DocumentUpload 
                    projectId={projectId} 
                    onUploadSuccess={fetchProjectDetails}
                  />
                )}
                
                <RfpDocumentTable 
                  projectId={projectId} 
                  documents={documents.map(doc => ({
                    id: doc.id,
                    projectId: doc.project_id,
                    // Use file_url path as name if no name field exists
                    name: doc.name || (doc.file_url ? doc.file_url.split('/').pop() || 'Untitled Document' : 'Untitled Document'),
                    status: doc.status || 'unprocessed',
                    createdAt: doc.created_at || doc.uploaded_at,
                    isPastRfp: doc.is_past_rfp || false
                  }))}
                  isEditable={isOwnerOrCollaborator}
                />
              </TabsContent>
              
              <TabsContent value="team">
                <Card>
                  <CardHeader>
                    <CardTitle>Team Members</CardTitle>
                    <CardDescription>
                      People with access to this project
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {members.length === 0 ? (
                        <p className="text-muted-foreground">No team members found</p>
                      ) : (
                        <ul className="divide-y">
                          {members.map((member) => (
                            <li key={member.id} className="py-3 flex justify-between items-center">
                              <div>
                                <p className="font-medium">User ID: {member.user_id}</p>
                                <p className="text-sm text-muted-foreground">
                                  Added on {new Date(member.created_at).toLocaleDateString()}
                                </p>
                              </div>
                              <div className="px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                                {member.role}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </main>
    </div>
  );
}
