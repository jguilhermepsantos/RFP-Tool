import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Users } from "lucide-react";

interface Project {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  role: 'owner' | 'collaborator' | 'viewer';
}

interface ProjectCardProps {
  project: Project;
}

export default function ProjectCard({ project }: ProjectCardProps) {
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
          Created {formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })}
        </p>
      </CardHeader>
      
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {project.description || "No description provided."}
        </p>
      </CardContent>
      
      <CardFooter className="pt-2">
        <Link href={`/projects/${project.id}`}>
          <Button variant="default" className="w-full">
            <FileText className="mr-2 h-4 w-4" />
            View Project
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
