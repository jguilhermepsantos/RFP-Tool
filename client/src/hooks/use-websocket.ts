import { useEffect, useRef, useState } from 'react';

interface ProgressUpdate {
  documentId: string;
  questionIndex: number;
  totalQuestions: number;
  progress: number;
  currentQuestion?: string;
  status: string;
  completed: boolean;
}

interface WebSocketMessage {
  type: 'progress' | 'error' | 'registered';
  documentId?: string;
  error?: string;
  completed?: boolean;
  questionIndex?: number;
  totalQuestions?: number;
  progress?: number;
  currentQuestion?: string;
  status?: string;
}

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [progressUpdates, setProgressUpdates] = useState<Map<string, ProgressUpdate>>(new Map());

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const connectWebSocket = () => {
      try {
        ws.current = new WebSocket(wsUrl);
        
        ws.current.onopen = () => {
          console.log('WebSocket connected to', wsUrl);
          setIsConnected(true);
        };
        
        ws.current.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            console.log('WebSocket message received:', message);
            
            if (message.type === 'progress' && message.documentId) {
              const update: ProgressUpdate = {
                documentId: message.documentId,
                questionIndex: message.questionIndex || 0,
                totalQuestions: message.totalQuestions || 0,
                progress: message.progress || 0,
                currentQuestion: message.currentQuestion,
                status: message.status || '',
                completed: message.completed || false
              };
              
              console.log('Progress update:', update);
              
              setProgressUpdates(prev => {
                const newMap = new Map(prev);
                newMap.set(message.documentId!, update);
                console.log('Updated progress map:', newMap);
                return newMap;
              });
            } else if (message.type === 'error' && message.documentId) {
              const errorUpdate: ProgressUpdate = {
                documentId: message.documentId,
                questionIndex: 0,
                totalQuestions: 0,
                progress: 0,
                status: `Error: ${message.error}`,
                completed: true
              };
              
              console.log('Error update:', errorUpdate);
              
              setProgressUpdates(prev => {
                const newMap = new Map(prev);
                newMap.set(message.documentId!, errorUpdate);
                return newMap;
              });
            } else if (message.type === 'registered') {
              console.log('Successfully registered for progress updates:', message.documentId);
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
        
        ws.current.onclose = () => {
          console.log('WebSocket disconnected');
          setIsConnected(false);
          
          // Attempt to reconnect after 3 seconds
          setTimeout(connectWebSocket, 3000);
        };
        
        ws.current.onerror = (error) => {
          console.error('WebSocket error:', error);
          setIsConnected(false);
        };
      } catch (error) {
        console.error('Error creating WebSocket connection:', error);
        setTimeout(connectWebSocket, 3000);
      }
    };
    
    connectWebSocket();
    
    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  const registerForProgress = (documentId: string) => {
    console.log('registerForProgress called with:', documentId, 'connected:', isConnected);
    if (ws.current && isConnected) {
      const message = {
        type: 'register',
        documentId
      };
      console.log('Sending registration message:', message);
      ws.current.send(JSON.stringify(message));
    } else {
      console.log('Cannot register - WebSocket not ready:', { wsExists: !!ws.current, isConnected });
    }
  };

  const getProgress = (documentId: string): ProgressUpdate | undefined => {
    return progressUpdates.get(documentId);
  };

  const clearProgress = (documentId: string) => {
    setProgressUpdates(prev => {
      const newMap = new Map(prev);
      newMap.delete(documentId);
      return newMap;
    });
  };

  return {
    isConnected,
    registerForProgress,
    getProgress,
    clearProgress
  };
}