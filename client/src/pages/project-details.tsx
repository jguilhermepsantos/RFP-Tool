import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import NavHeader from "@/components/nav-header";
import RfpDocumentTable from "@/components/rfp-document-table";
import DocumentUpload from "@/components/document-upload";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

interface ProjectDetailsProps {
  projectId: number;
}

export default function ProjectDetails({ projectId }: ProjectDetailsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !!projectId,
  });

  useEffect(() => {
    if (isError && error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || "Failed to load project details",
      });
      // Redirect to projects page if project not found
      setLocation("/projects");
    }
  }, [isError, error, toast, setLocation]);

  const project = data?.project;
  const documents = data?.documents || [];
  const members = data?.members || [];

  const userRole = members.find(m => m.userId === user?.id)?.role || 'viewer';
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
                  <DocumentUpload projectId={projectId} />
                )}
                
                <RfpDocumentTable 
                  projectId={projectId} 
                  documents={documents} 
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
                                <p className="font-medium">User ID: {member.userId}</p>
                                <p className="text-sm text-muted-foreground">
                                  Added on {new Date(member.createdAt).toLocaleDateString()}
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
