import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { History } from 'lucide-react';

interface VersionHistoryProps {
  questionId: string;
  currentAnswer: any;
  trigger?: React.ReactNode;
  projectId?: string;
}

interface AnswerVersion {
  id: string;
  compliance_answer: string;
  generated_answer: string;
  created_by: string;
  created_at: string;
  source_chunks: string;
  average_similarity: number;
  confidence_level: 'low' | 'medium' | 'high';
}

export function VersionHistorySimple({ questionId, currentAnswer, trigger, projectId }: VersionHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { data: versions, isLoading, error } = useQuery<AnswerVersion[]>({
    queryKey: [`/api/rfp-questions/${questionId}/versions`],
    enabled: isOpen,
  });

  const defaultTrigger = (
    <Button variant="outline" size="sm" className="gap-2">
      <History className="w-4 h-4" />
      Version History
    </Button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Version History</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}
          
          {error && (
            <div className="text-center py-8 text-red-600">
              Failed to load version history
            </div>
          )}
          
          {versions && versions.length > 0 && (
            <div className="space-y-4">
              <p>Found {versions.length} versions</p>
              {versions.map((version, index) => (
                <div key={version.id} className="border p-4 rounded">
                  <h3>Version {index + 1}</h3>
                  <p><strong>Created by:</strong> {version.created_by}</p>
                  <p><strong>Created at:</strong> {version.created_at}</p>
                  {version.compliance_answer && (
                    <div>
                      <strong>Compliance:</strong> {version.compliance_answer}
                    </div>
                  )}
                  {version.generated_answer && (
                    <div>
                      <strong>Answer:</strong> {version.generated_answer.substring(0, 200)}...
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          
          {versions && versions.length === 0 && (
            <div className="text-center py-8 text-gray-600">
              No version history available
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}