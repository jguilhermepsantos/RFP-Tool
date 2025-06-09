import { useEffect } from 'react';
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
}

export default function ProgressModal({ isOpen, onClose, documentId, documentName }: ProgressModalProps) {
  const { isConnected, registerForProgress, getProgress, clearProgress } = useWebSocket();
  
  const progress = getProgress(documentId);

  useEffect(() => {
    console.log('ProgressModal state:', { isOpen, documentId, isConnected, progress });
    if (isOpen && documentId) {
      if (isConnected) {
        console.log('Registering for progress updates for document:', documentId);
        registerForProgress(documentId);
      } else {
        console.log('WebSocket not connected yet, waiting...');
        // Set up a retry mechanism
        const retryInterval = setInterval(() => {
          if (isConnected) {
            console.log('WebSocket connected, registering for progress updates for document:', documentId);
            registerForProgress(documentId);
            clearInterval(retryInterval);
          }
        }, 100);
        
        // Clear interval after 5 seconds to avoid infinite retries
        setTimeout(() => clearInterval(retryInterval), 5000);
        
        return () => clearInterval(retryInterval);
      }
    }
  }, [isOpen, documentId, isConnected, registerForProgress]);

  useEffect(() => {
    // Auto-close modal after completion with a delay
    if (progress?.completed) {
      const timer = setTimeout(() => {
        clearProgress(documentId);
        onClose();
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [progress?.completed, documentId, clearProgress, onClose]);

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

  console.log('ProgressModal render:', { isOpen, documentId, documentName });

  return (
    <>
      {/* TEST: Simple visible div to verify rendering */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
            <h2 className="text-lg font-semibold mb-4">Processing Questions</h2>
            <p className="mb-4">Document: {documentName}</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>{progress?.progress || 0}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${progress?.progress || 0}%` }}
                />
              </div>
            </div>
            {progress && (
              <div className="mt-4 text-sm">
                <p>Status: {progress.status}</p>
                <p>Question {progress.questionIndex} of {progress.totalQuestions}</p>
                {progress.currentQuestion && (
                  <p className="mt-2 text-gray-600">
                    Current: {progress.currentQuestion.substring(0, 80)}...
                  </p>
                )}
              </div>
            )}
            <div className="flex justify-end mt-4">
              <Button onClick={onClose} size="sm">
                {progress?.completed ? 'Close' : 'Run in Background'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}