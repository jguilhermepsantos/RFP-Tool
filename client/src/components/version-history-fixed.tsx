import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { History, User, Bot, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
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
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const { data: versions, isLoading, error } = useQuery<AnswerVersion[]>({
    queryKey: [`/api/rfp-questions/${questionId}/versions`],
    enabled: isOpen,
  });

  const { data: members = [] } = useQuery<any[]>({
    queryKey: [`/api/projects/${projectId}/members`],
    enabled: isOpen && !!projectId,
  });

  useEffect(() => {
    if (versions && versions.length > 0) {
      setCurrentIndex(0);
    }
  }, [versions]);

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

  const defaultTrigger = (
    <Button variant="outline" size="sm" className="gap-2">
      <History className="w-4 h-4" />
      Version History
    </Button>
  );

  const handleNext = () => {
    if (versions && versions.length > 0 && currentIndex < versions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (versions && versions.length > 0 && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setCurrentIndex(0);
    }
  };

  const safeCurrentIndex = versions && versions.length > 0 ? Math.min(currentIndex, versions.length - 1) : 0;

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
        <DialogTrigger asChild>
          {trigger || defaultTrigger}
        </DialogTrigger>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (error) {
    return (
      <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
        <DialogTrigger asChild>
          {trigger || defaultTrigger}
        </DialogTrigger>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
          </DialogHeader>
          <div className="text-center py-8 text-red-600">
            Failed to load version history
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!versions || versions.length === 0) {
    return (
      <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
        <DialogTrigger asChild>
          {trigger || defaultTrigger}
        </DialogTrigger>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
          </DialogHeader>
          <div className="text-center py-8 text-gray-600">
            No version history available
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const currentVersion = versions[safeCurrentIndex];

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
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
        
        <div className="space-y-4">
          {/* Carousel Navigation */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handlePrevious}
                disabled={safeCurrentIndex === 0}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              <span className="text-sm text-gray-500">
                {safeCurrentIndex + 1} of {versions.length}
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleNext}
                disabled={safeCurrentIndex === versions.length - 1}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            
            {/* Version indicators */}
            <div className="flex items-center gap-1">
              {versions.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentIndex(index)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    index === safeCurrentIndex ? 'bg-blue-500' : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Current Version Display */}
          {currentVersion && (
            <Card className={safeCurrentIndex === 0 ? 'ring-2 ring-blue-500' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getVersionIcon(currentVersion.created_by)}
                    <CardTitle className="text-lg">
                      {safeCurrentIndex === 0 ? 'Current Version' : `Version ${versions.length - safeCurrentIndex}`}
                    </CardTitle>
                    {getVersionBadge(currentVersion.created_by)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Clock className="w-4 h-4" />
                    {formatDistanceToNow(new Date(currentVersion.created_at), { addSuffix: true })}
                  </div>
                </div>
                <CardDescription>
                  Created by {formatCreatedBy(currentVersion.created_by)}
                  {currentVersion.created_by === 'AI-generated' && currentVersion.confidence_level && (
                    <span className="ml-2">
                      • Confidence: <span className="capitalize">{currentVersion.confidence_level}</span>
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {currentVersion.compliance_answer && (
                  <div>
                    <h4 className="font-medium mb-2">Compliance Answer:</h4>
                    <p className="text-sm bg-gray-50 p-3 rounded-md">
                      {currentVersion.compliance_answer}
                    </p>
                  </div>
                )}
                {currentVersion.generated_answer && (
                  <div>
                    <h4 className="font-medium mb-2">Detailed Answer:</h4>
                    <p className="text-sm bg-gray-50 p-3 rounded-md whitespace-pre-wrap">
                      {currentVersion.generated_answer}
                    </p>
                  </div>
                )}
                {currentVersion.created_by === 'AI-generated' && currentVersion.source_chunks && (
                  <div>
                    <h4 className="font-medium mb-2">Source Information:</h4>
                    <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-md">
                      <div className="flex items-center gap-4">
                        <span>Average Similarity: {currentVersion.average_similarity ? (currentVersion.average_similarity * 100).toFixed(1) : 0}%</span>
                        <span>Confidence: <span className="capitalize">{currentVersion.confidence_level || 'unknown'}</span></span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}