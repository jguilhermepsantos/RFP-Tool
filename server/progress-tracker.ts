import { WebSocket } from "ws";

interface ProgressUpdate {
  documentId: string;
  questionIndex: number;
  totalQuestions: number;
  progress: number;
  currentQuestion?: string;
  status: string;
  completed: boolean;
}

class ProgressTracker {
  private clients: Map<string, WebSocket[]> = new Map();

  // Register a client for progress updates on a specific document
  registerClient(documentId: string, ws: WebSocket) {
    if (!this.clients.has(documentId)) {
      this.clients.set(documentId, []);
    }
    this.clients.get(documentId)!.push(ws);

    // Remove client on disconnect
    ws.on('close', () => {
      this.removeClient(documentId, ws);
    });
  }

  // Remove a client from tracking
  private removeClient(documentId: string, ws: WebSocket) {
    const clients = this.clients.get(documentId);
    if (clients) {
      const index = clients.indexOf(ws);
      if (index !== -1) {
        clients.splice(index, 1);
      }
      if (clients.length === 0) {
        this.clients.delete(documentId);
      }
    }
  }

  // Send progress update to all clients tracking this document
  updateProgress(update: ProgressUpdate) {
    const clients = this.clients.get(update.documentId);
    if (!clients || clients.length === 0) {
      return;
    }

    const message = JSON.stringify({
      type: 'progress',
      ...update
    });

    // Send to all connected clients for this document
    clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
        } catch (error) {
          console.error('Error sending progress update:', error);
        }
      }
    });

    // Clean up completed progress tracking
    if (update.completed) {
      setTimeout(() => {
        this.clients.delete(update.documentId);
      }, 5000); // Clean up after 5 seconds
    }
  }

  // Send error to clients
  sendError(documentId: string, error: string) {
    const clients = this.clients.get(documentId);
    if (!clients) return;

    const message = JSON.stringify({
      type: 'error',
      documentId,
      error,
      completed: true
    });

    clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
        } catch (error) {
          console.error('Error sending error message:', error);
        }
      }
    });
  }
}

// Global progress tracker instance
export const progressTracker = new ProgressTracker();

// Helper function to get WebSocket server from global
export function getWebSocketServer() {
  return (global as any).wss;
}