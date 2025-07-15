import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { History, User, Bot, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface VersionHistoryProps {
  questionId: string;
  currentAnswer: any;
  trigger?: React.ReactNode;
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

export function VersionHistory({ questionId, currentAnswer, trigger }: VersionHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const { data: versions, isLoading, error } = useQuery<AnswerVersion[]>({
    queryKey: [`/api/rfp-questions/${questionId}/versions`],
    enabled: isOpen, // Only fetch when dialog is open
  });

  // Get unique user IDs from versions
  const userIds = versions?.filter(v => v.created_by !== 'AI-generated').map(v => v.created_by) || [];
  const uniqueUserIds = [...new Set(userIds)];
  
  const { data: users } = useQuery<{id: string, name: string, email: string}[]>({
    queryKey: [`/api/users/batch`],
    enabled: isOpen && uniqueUserIds.length > 0,
  });

  const formatCreatedBy = (createdBy: string) => {
    if (createdBy === 'AI-generated') {
      return 'AI Generated';
    }
    // Look up user information
    const user = users?.find(u => u.id === createdBy);
    if (user) {
      return user.name || user.email;
    }
    return `User ${createdBy.slice(0, 8)}...`;
  };

  const getVersionIcon = (createdBy: string) => {
    return createdBy === 'AI-generated' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />;
  };

  const getVersionBadge = (createdBy: string) => {
    return createdBy === 'AI-generated' ? 
      <Badge variant="secondary">AI</Badge> : 
      <Badge variant="outline">Human</Badge>;
  };

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
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="flex-shrink-0 p-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Answer Version History
          </DialogTitle>
          <DialogDescription>
            View all versions of this answer to compare AI-generated and human-edited responses.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto px-6 pb-6 max-h-[calc(85vh-140px)]">
          <div className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : error ? (
              <div className="text-center py-8 text-red-600">
                Failed to load version history
              </div>
            ) : versions && versions.length > 0 ? (
              versions.map((version, index) => (
                <Card key={version.id} className={index === 0 ? 'ring-2 ring-blue-500' : ''}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getVersionIcon(version.created_by)}
                        <CardTitle className="text-base">
                          {index === 0 ? 'Latest Version' : `Version ${versions.length - index}`}
                        </CardTitle>
                        {getVersionBadge(version.created_by)}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
                      </div>
                    </div>
                    <CardDescription className="text-sm">
                      {version.created_by === 'AI-generated' ? 'AI Generated' : `Edited by ${formatCreatedBy(version.created_by)}`}
                      {version.created_by === 'AI-generated' && version.confidence_level && (
                        <span className="ml-2">
                          • Confidence: <span className="capitalize">{version.confidence_level}</span>
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    {version.compliance_answer && (
                      <div>
                        <h4 className="font-medium mb-1 text-sm">Compliance Answer:</h4>
                        <p className="text-sm bg-gray-50 p-2 rounded-md">
                          {version.compliance_answer}
                        </p>
                      </div>
                    )}
                    {version.generated_answer && (
                      <div>
                        <h4 className="font-medium mb-1 text-sm">Detailed Answer:</h4>
                        <p className="text-sm bg-gray-50 p-2 rounded-md whitespace-pre-wrap max-h-32 overflow-y-auto">
                          {version.generated_answer}
                        </p>
                      </div>
                    )}
                    {version.created_by === 'AI-generated' && version.source_chunks && (
                      <div>
                        <h4 className="font-medium mb-1 text-sm">Source Information:</h4>
                        <div className="text-xs text-gray-600 bg-blue-50 p-2 rounded-md">
                          <div className="flex items-center gap-4">
                            <span>Average Similarity: {(version.average_similarity * 100).toFixed(1)}%</span>
                            <span>Confidence: <span className="capitalize">{version.confidence_level}</span></span>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                  {index < versions.length - 1 && <Separator className="my-3" />}
                </Card>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                No versions found for this answer
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}