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

// Add Member Form Component
interface AddMemberFormProps {
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function AddMemberForm({ projectId, onClose, onSuccess }: AddMemberFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userSearchResults, setUserSearchResults] = useState<UserData[]>([]);
  const [searchEmail, setSearchEmail] = useState('');
  
  const form = useForm<AddMemberFormValues>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: {
      email: '',
      role: 'viewer',
    },
  });
  
  // Search for a user by email
  const handleSearchUser = async (email: string) => {
    if (!email) {
      setUserSearchResults([]);
      return;
    }
    
    setSearchEmail(email);
    form.setValue('email', email);
    
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, name')
        .ilike('email', `%${email}%`)
        .limit(5);
        
      if (error) throw new Error(error.message);
      setUserSearchResults(data || []);
    } catch (err) {
      console.error('Error searching for users:', err);
    }
  };
  
  // Handle form submission
  const onSubmit = async (values: AddMemberFormValues) => {
    try {
      setIsSubmitting(true);
      
      // First, search for the user with the given email
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('email', values.email)
        .single();
        
      if (userError) {
        if (userError.code === 'PGRST116') {
          // No results found
          throw new Error(`No user found with email: ${values.email}`);
        }
        throw new Error(userError.message);
      }
      
      // Check if user is already a member of this project
      const { data: existingMember, error: memberError } = await supabase
        .from('project_permissions')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', userData.id)
        .single();
        
      if (!memberError && existingMember) {
        throw new Error('User is already a member of this project');
      }
      
      // Add the user as a project member
      const { error: addError } = await supabase
        .from('project_permissions')
        .insert({
          project_id: projectId,
          user_id: userData.id,
          role: values.role,
        });
        
      if (addError) throw new Error(addError.message);
      
      toast({
        title: 'Member Added',
        description: `${values.email} has been added to the project as a ${values.role}`,
      });
      
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error adding team member:', err);
      toast({
        title: 'Error',
        description: (err as Error).message || 'Failed to add team member',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <>
      <DialogHeader>
        <DialogTitle>Add Team Member</DialogTitle>
        <DialogDescription>
          Add a user to this project by their email address and assign them a role.
        </DialogDescription>
      </DialogHeader>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Enter user email" 
                    {...field} 
                    onChange={(e) => {
                      field.onChange(e);
                      handleSearchUser(e.target.value);
                    }}
                  />
                </FormControl>
                <FormMessage />
                
                {userSearchResults.length > 0 && (
                  <ul className="mt-2 border rounded-md overflow-hidden">
                    {userSearchResults.map(user => (
                      <li 
                        key={user.id} 
                        className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                        onClick={() => {
                          form.setValue('email', user.email);
                          setSearchEmail(user.email);
                          setUserSearchResults([]);
                        }}
                      >
                        {user.email} {user.name ? `(${user.name})` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="collaborator">Collaborator</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding..." : "Add Member"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}

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

      // Get user emails for the members
      const userEmails: Record<string, string> = {};
      if (memberData && memberData.length > 0) {
        const userIds = memberData.map(member => member.user_id);
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id, email')
          .in('id', userIds);
          
        if (userError) {
          console.error('Error fetching user details:', userError);
        } else if (userData) {
          userData.forEach(user => {
            userEmails[user.id] = user.email;
          });
        }
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
      setUsersWithEmail(userEmails);
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

  // Handle changing a team member's role
  const handleChangeRole = async (member: MemberData, newRole: string) => {
    if (userRole !== 'owner') {
      toast({
        title: "Permission Denied",
        description: "Only project owners can change team member roles",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsUpdatingRole(true);
      setMemberToUpdateRole(member);
      
      const { error } = await supabase
        .from('project_permissions')
        .update({ role: newRole })
        .eq('id', member.id);
        
      if (error) throw new Error(error.message);
      
      toast({
        title: "Role Updated",
        description: `Team member role updated to ${newRole}`,
      });
      
      fetchProjectDetails();
    } catch (err) {
      console.error('Error changing role:', err);
      toast({
        title: "Error",
        description: `Failed to update role: ${(err as Error).message}`,
        variant: "destructive",
      });
    } finally {
      setIsUpdatingRole(false);
      setMemberToUpdateRole(null);
    }
  };
  
  // Handle removing a team member
  const handleRemoveMember = async (member: MemberData) => {
    if (userRole !== 'owner') {
      toast({
        title: "Permission Denied",
        description: "Only project owners can remove team members",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsRemovingMember(true);
      setMemberToRemove(member);
      
      const { error } = await supabase
        .from('project_permissions')
        .delete()
        .eq('id', member.id);
        
      if (error) throw new Error(error.message);
      
      toast({
        title: "Member Removed",
        description: "Team member removed from project",
      });
      
      fetchProjectDetails();
    } catch (err) {
      console.error('Error removing member:', err);
      toast({
        title: "Error",
        description: `Failed to remove member: ${(err as Error).message}`,
        variant: "destructive",
      });
    } finally {
      setIsRemovingMember(false);
      setMemberToRemove(null);
    }
  };

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
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Team Members</CardTitle>
                      <CardDescription>
                        People with access to this project
                      </CardDescription>
                    </div>
                    
                    {userRole === 'owner' && (
                      <Dialog open={addMemberDialogOpen} onOpenChange={setAddMemberDialogOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm" className="flex items-center gap-1">
                            <PlusCircle className="h-4 w-4" />
                            <span>Add Member</span>
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <AddMemberForm 
                            projectId={projectId} 
                            onClose={() => setAddMemberDialogOpen(false)}
                            onSuccess={fetchProjectDetails}
                          />
                        </DialogContent>
                      </Dialog>
                    )}
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
                                <p className="font-medium">
                                  {usersWithEmail[member.user_id] || `ID: ${member.user_id}`}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  Added on {new Date(member.created_at).toLocaleDateString()}
                                </p>
                              </div>
                              
                              <div className="flex items-center gap-2">
                                <div className="px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                                  {member.role}
                                </div>
                                
                                {userRole === 'owner' && user?.id !== member.user_id && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <Shield className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem 
                                        onClick={() => handleChangeRole(member, 'owner')}
                                        disabled={member.role === 'owner'}
                                      >
                                        Make Owner
                                      </DropdownMenuItem>
                                      <DropdownMenuItem 
                                        onClick={() => handleChangeRole(member, 'collaborator')}
                                        disabled={member.role === 'collaborator'}
                                      >
                                        Make Collaborator
                                      </DropdownMenuItem>
                                      <DropdownMenuItem 
                                        onClick={() => handleChangeRole(member, 'viewer')}
                                        disabled={member.role === 'viewer'}
                                      >
                                        Make Viewer
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                                
                                {userRole === 'owner' && user?.id !== member.user_id && (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8 text-red-500 hover:text-red-600"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Are you sure you want to remove this member from the project? 
                                          This action cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction 
                                          onClick={() => handleRemoveMember(member)}
                                          className="bg-red-500 hover:bg-red-600"
                                        >
                                          Remove
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                )}
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
