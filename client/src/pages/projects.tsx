import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Project } from "@shared/schema";
import NavHeader from "@/components/nav-header";
import ProjectCard from "@/components/project-card";
import { PlusCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";

interface ProjectWithRole extends Project {
  role: 'owner' | 'collaborator' | 'viewer';
}

const formSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  salesforceLink: z.string().optional(),
  region: z.enum(['US', 'Brazil', 'South LATAM', 'North LATAM', 'EMEA', 'APAC']).optional(),
});

export default function Projects() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [`/api/projects`],
    queryFn: async () => {
      if (!user?.id) throw new Error("User ID is required");
      // Make direct call to Supabase to get projects
      const { data: projectPermissions, error: permError } = await supabase
        .from('project_permissions')
        .select('project_id, role')
        .eq('user_id', user.id);
        
      if (permError) throw new Error(permError.message);
      
      // If no permissions found, return empty array
      if (!projectPermissions || projectPermissions.length === 0) {
        return { projects: [] };
      }
      
      // Get project IDs
      const projectIds = projectPermissions.map(p => p.project_id);
      
      // Get projects by IDs and sort by created_at DESC
      const { data: projects, error: projError } = await supabase
        .from('projects')
        .select('*')
        .in('id', projectIds)
        .order('created_at', { ascending: false });
        
      if (projError) throw new Error(projError.message);
      
      // Combine projects with their roles and transform field names
      const projectsWithRole = projects.map(project => {
        const permission = projectPermissions.find(p => p.project_id === project.id);
        return {
          id: project.id,
          name: project.name,
          description: project.description,
          createdAt: project.created_at, // Transform snake_case to camelCase
          createdBy: project.created_by, // Transform snake_case to camelCase
          salesforceLink: project.salesforce_link,
          region: project.region,
          role: permission?.role || 'viewer'
        };
      });
      
      return { projects: projectsWithRole };
    },
    enabled: !!user,
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      salesforceLink: "",
      region: undefined,
    },
  });

  useEffect(() => {
    if (isError && error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || "Failed to load projects",
      });
    }
  }, [isError, error, toast]);

  const handleCreateProject = async (values: z.infer<typeof formSchema>) => {
    if (!user) return;

    try {
      // Create project directly in Supabase
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          name: values.name,
          description: values.description || null,
          salesforce_link: values.salesforceLink || null,
          region: values.region || null,
          created_by: user.id,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
        
      if (projectError) throw new Error(projectError.message);
      
      // Add project permission for the creator
      const { error: permError } = await supabase
        .from('project_permissions')
        .insert({
          project_id: project.id,
          user_id: user.id,
          role: 'owner',
          created_at: new Date().toISOString()
        });
        
      if (permError) throw new Error(permError.message);

      toast({
        title: "Success",
        description: "Project created successfully",
      });

      // Reset form and invalidate query to refresh data
      form.reset();
      queryClient.invalidateQueries({ queryKey: [`/api/projects`] });
      
      // Close the dialog
      setDialogOpen(false);
      
      // Redirect to the project details page
      setLocation(`/projects/${project.id}`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || "Failed to create project",
      });
    }
  };

  const projects = data?.projects as ProjectWithRole[] || [];

  return (
    <div className="min-h-screen bg-slate-50">
      <NavHeader />
      
      <main className="container mx-auto py-6 px-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Projects</h1>
          
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Create New Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
                <DialogDescription>
                  Add a new RFP project to your workspace.
                </DialogDescription>
              </DialogHeader>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleCreateProject)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter project name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Brief description of the project" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="salesforceLink"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Salesforce Link (Optional)</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Enter Salesforce link" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="region"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Region (Optional)</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a region" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="US">US</SelectItem>
                            <SelectItem value="Brazil">Brazil</SelectItem>
                            <SelectItem value="South LATAM">South LATAM</SelectItem>
                            <SelectItem value="North LATAM">North LATAM</SelectItem>
                            <SelectItem value="EMEA">EMEA</SelectItem>
                            <SelectItem value="APAC">APAC</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <DialogFooter>
                    <Button type="submit">Create Project</Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
        
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
                <CardFooter>
                  <Skeleton className="h-10 w-full" />
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <Card className="bg-white shadow-sm">
            <CardHeader>
              <CardTitle>No Projects Found</CardTitle>
              <CardDescription>
                Create your first project to get started with RFP Assistant.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Projects help you organize your RFP documents and collaborate with your team.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
