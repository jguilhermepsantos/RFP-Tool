import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ProspectTabTestProps {
  projectId: string;
}

// Simple test component to isolate the prospect tab issue
export default function ProspectTabTest({ projectId }: ProspectTabTestProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Prospect Discovery - Test</CardTitle>
        <CardDescription>
          Test component to debug the white page issue
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <p>Project ID: {projectId}</p>
        <p>This component is working correctly.</p>
      </CardContent>
    </Card>
  );
}