import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot } from "lucide-react";

interface ProjectChatMinimalProps {
  projectId: string;
}

export default function ProjectChatMinimal({ projectId }: ProjectChatMinimalProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Bot className="h-5 w-5" />
          <span>Project Assistant</span>
        </CardTitle>
        <CardDescription>
          Chat functionality temporarily disabled for debugging
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Project ID: {projectId}
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Chat feature will be restored once the issue is resolved.
        </p>
      </CardContent>
    </Card>
  );
}