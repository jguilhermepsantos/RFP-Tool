import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useWebSocket } from '@/hooks/use-websocket';

interface ProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentName?: string;
  onStartProcessing?: () => Promise<void>;
}

export default function ProgressModal({ isOpen, onClose, documentId, documentName, onStartProcessing }: ProgressModalProps) {
  const { isConnected, registerForProgress, getProgress, clearProgress } = useWebSocket();
  const [hasStartedProcessing, setHasStartedProcessing] = useState(false);
  
  const progress = getProgress(documentId);

  useEffect(() => {
    console.log('ProgressModal state:', { isOpen, documentId, isConnected, progress, hasStartedProcessing });
    if (isOpen && documentId && !hasStartedProcessing) {
      if (isConnected) {
        console.log('Registering for progress updates for document:', documentId);
        registerForProgress(documentId);
        
        // Start processing after registration
        if (onStartProcessing) {
          console.log('Starting processing for document:', documentId);
          setHasStartedProcessing(true);
          onStartProcessing().catch(error => {
            console.error('Error starting processing:', error);
          });
        }
      } else {
        console.log('WebSocket not connected yet, waiting...');
        // Set up a retry mechanism
        const retryInterval = setInterval(() => {
          if (isConnected) {
            console.log('WebSocket connected, registering for progress updates for document:', documentId);
            registerForProgress(documentId);
            
            // Start processing after registration
            if (onStartProcessing) {
              console.log('Starting processing for document:', documentId);
              setHasStartedProcessing(true);
              onStartProcessing().catch(error => {
                console.error('Error starting processing:', error);
              });
            }
            clearInterval(retryInterval);
          }
        }, 100);
        
        // Clear interval after 5 seconds to avoid infinite retries
        setTimeout(() => clearInterval(retryInterval), 5000);
        
        return () => clearInterval(retryInterval);
      }
    }
  }, [isOpen, documentId, isConnected, registerForProgress, onStartProcessing, hasStartedProcessing]);

  useEffect(() => {
    // Auto-close modal after completion with a delay
    if (progress?.completed) {
      const timer = setTimeout(() => {
        clearProgress(documentId);
        onClose();
        // Refresh the page to show updated document status
        window.location.reload();
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [progress?.completed, documentId, clearProgress, onClose]);

  useEffect(() => {
    // Reset processing state when modal closes
    if (!isOpen) {
      setHasStartedProcessing(false);
    }
  }, [isOpen]);

  const getStatusIcon = () => {
    if (!progress) {
      return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    }
    
    if (progress.completed) {
      if (progress.status.includes('Error')) {
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      }
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
    
    return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
  };

  const getProgressBarColor = () => {
    if (!progress) return '';
    
    if (progress.completed) {
      if (progress.status.includes('Error')) {
        return 'bg-red-500';
      }
      return 'bg-green-500';
    }
    
    return 'bg-blue-500';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getStatusIcon()}
            Processing Questions
          </DialogTitle>
          <DialogDescription>
            {documentName && `Processing questions for "${documentName}"`}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{progress?.progress || 0}%</span>
            </div>
            <Progress 
              value={progress?.progress || 0} 
              className="w-full"
            />
          </div>
          
          {/* Question Progress */}
          {progress && progress.totalQuestions > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Questions</span>
                <span>{progress.questionIndex} of {progress.totalQuestions}</span>
              </div>
            </div>
          )}
          
          {/* Current Question */}
          {progress?.currentQuestion && !progress.completed && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Current Question:</div>
              <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                {progress.currentQuestion.length > 100 
                  ? `${progress.currentQuestion.substring(0, 100)}...` 
                  : progress.currentQuestion
                }
              </div>
            </div>
          )}
          
          {/* Status */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Status:</div>
            <div className={`text-sm p-2 rounded-md ${
              progress?.status.includes('Error') 
                ? 'bg-red-50 text-red-700 border border-red-200' 
                : progress?.completed
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
            }`}>
              {progress?.status || 'Connecting...'}
            </div>
          </div>
          
          {/* WebSocket Connection Status */}
          {!isConnected && (
            <div className="text-sm text-yellow-600 bg-yellow-50 p-2 rounded-md border border-yellow-200">
              Reconnecting to server...
            </div>
          )}
          
          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4">
            {progress?.completed && (
              <Button onClick={onClose} size="sm">
                Close
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}