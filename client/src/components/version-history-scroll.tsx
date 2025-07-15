import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, User, Bot, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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

export function VersionHistory({ questionId, currentAnswer, trigger, projectId }: VersionHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const { data: versions, isLoading, error } = useQuery<AnswerVersion[]>({
    queryKey: [`/api/rfp-questions/${questionId}/versions`],
    enabled: isOpen,
  });

  const { data: members = [] } = useQuery<any[]>({
    queryKey: [`/api/projects/${projectId}/members`],
    enabled: isOpen && !!projectId,
  });

  const formatCreatedBy = (createdBy: string) => {
    if (!createdBy) return 'Unknown';
    
    if (createdBy === 'AI-generated') {
      return 'AI Generated';
    }
    
    const user = members?.find(member => member?.id === createdBy);
    if (user) {
      return user.name || user.email || 'Unknown User';
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

  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch (e) {
      return 'Unknown date';
    }
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
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Answer Version History
          </DialogTitle>
          <DialogDescription>
            View all versions of this answer to compare AI-generated and human-edited responses.
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="h-[60vh] pr-4">
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
          
          {versions && versions.length > 0 ? (
            <div className="space-y-4">
              {versions.map((version, index) => (
                <Card key={version.id} className={index === 0 ? 'ring-2 ring-blue-500' : ''}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getVersionIcon(version.created_by)}
                        <CardTitle className="text-lg">
                          {index === 0 ? 'Current Version' : `Version ${versions.length - index}`}
                        </CardTitle>
                        {getVersionBadge(version.created_by)}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Clock className="w-4 h-4" />
                        {formatDate(version.created_at)}
                      </div>
                    </div>
                    <CardDescription>
                      Created by {formatCreatedBy(version.created_by)}
                      {version.created_by === 'AI-generated' && version.confidence_level && (
                        <span className="ml-2">
                          • Confidence: <span className="capitalize">{version.confidence_level}</span>
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {version.compliance_answer && (
                      <div>
                        <h4 className="font-medium mb-2">Compliance Answer:</h4>
                        <p className="text-sm bg-gray-50 p-3 rounded-md">
                          {version.compliance_answer}
                        </p>
                      </div>
                    )}
                    {version.generated_answer && (
                      <div>
                        <h4 className="font-medium mb-2">Detailed Answer:</h4>
                        <p className="text-sm bg-gray-50 p-3 rounded-md whitespace-pre-wrap">
                          {version.generated_answer}
                        </p>
                      </div>
                    )}
                    {version.created_by === 'AI-generated' && version.source_chunks && (
                      <div>
                        <h4 className="font-medium mb-2">Source Information:</h4>
                        <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-md">
                          <div className="flex items-center gap-4">
                            <span>Average Similarity: {version.average_similarity ? (version.average_similarity * 100).toFixed(1) : 0}%</span>
                            <span>Confidence: <span className="capitalize">{version.confidence_level || 'unknown'}</span></span>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : versions && versions.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              No version history available
            </div>
          ) : null}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}