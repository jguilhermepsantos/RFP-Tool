import { Link } from "wouter";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileText, Users, Trash2 } from "lucide-react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Project as BaseProject } from "@shared/schema";

interface ProjectWithRole extends BaseProject {
  role: 'owner' | 'collaborator' | 'viewer';
}

interface ProjectCardProps {
  project: ProjectWithRole;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner':
        return "bg-emerald-50 text-emerald-600 border-emerald-200";
      case 'collaborator':
        return "bg-blue-50 text-blue-600 border-blue-200";
      case 'viewer':
        return "bg-purple-50 text-purple-600 border-purple-200";
      default:
        return "";
    }
  };

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/projects/${project.id}`, {
        method: "DELETE"
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Project deleted successfully",
      });
      // Invalidate projects list to refresh the data
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      setDeleteDialogOpen(false);
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || "Failed to delete project",
      });
    }
  });

  const handleDeleteProject = () => {
    deleteProjectMutation.mutate();
  };

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow duration-200">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg font-semibold">{project.name}</CardTitle>
          <Badge 
            variant="outline" 
            className={getRoleBadgeColor(project.role)}
          >
            {project.role}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Created {project.createdAt 
            ? new Date(project.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })
            : 'Unknown date'
          }
        </p>
      </CardHeader>
      
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {project.description || "No description provided."}
        </p>
      </CardContent>
      
      <CardFooter className="pt-2">
        <div className="flex gap-2 w-full">
          <Link href={`/projects/${project.id}`} className="flex-1">
            <Button variant="default" className="w-full">
              <FileText className="mr-2 h-4 w-4" />
              View Project
            </Button>
          </Link>
          
          {/* Only show delete button for project owners */}
          {project.role === 'owner' && (
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="px-3">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Project</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete "{project.name}"? This action cannot be undone.
                    All RFP documents, questions, answers, and team members will be permanently deleted.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button 
                    variant="outline" 
                    onClick={() => setDeleteDialogOpen(false)}
                    disabled={deleteProjectMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button 
                    variant="destructive" 
                    onClick={handleDeleteProject}
                    disabled={deleteProjectMutation.isPending}
                  >
                    {deleteProjectMutation.isPending ? "Deleting..." : "Delete Project"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
