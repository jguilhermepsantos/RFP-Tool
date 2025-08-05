import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ChatMessage {
  id: string;
  projectId: string;
  threadId: string;
  messageType: 'user' | 'assistant';
  content: string;
  userId?: string;
  createdAt: string;
}

interface ProjectChatProps {
  projectId: string;
}

export default function ProjectChat({ projectId }: ProjectChatProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch chat messages
  const { data: chatData, isLoading } = useQuery({
    queryKey: ['/api/projects', projectId, 'chat'],
    queryFn: () => fetch(`/api/projects/${projectId}/chat`, {
      headers: {
        'Authorization': user?.email || '',
      },
    }).then(res => res.json()),
    enabled: !!projectId && !!user?.email,
    // Remove automatic polling - only refetch when manually triggered
    refetchOnWindowFocus: false,
    staleTime: 30000, // Consider data fresh for 30 seconds
  });

  const messages: ChatMessage[] = chatData?.messages || [];

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      setIsGenerating(true);
      return await apiRequest(`/projects/${projectId}/chat`, {
        method: 'POST',
        headers: {
          'Authorization': user?.email || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          messageType: 'user'
        }),
      });
    },
    onSuccess: (data) => {
      // The backend already handles OpenAI Assistant response automatically
      // Just invalidate to refresh the chat and clear the message
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'chat'] });
      setMessage("");
      setIsGenerating(false);
      
      console.log('Chat response received:', data);
    },
    onError: (error) => {
      console.error('Error sending message:', error);
      setIsGenerating(false);
      toast({
        title: "Failed to send message",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  // Assistant responses are now handled automatically by the backend

  const handleSendMessage = () => {
    if (!message.trim() || sendMessageMutation.isPending) return;
    
    sendMessageMutation.mutate(message.trim());
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages]);

  // Auto-focus textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="flex-shrink-0">
        <CardTitle className="flex items-center space-x-2">
          <Bot className="h-5 w-5" />
          <span>Project Assistant</span>
          <Badge variant="secondary" className="text-xs">AI-Powered</Badge>
        </CardTitle>
        <CardDescription>
          Ask questions about this project, get RFP guidance, or discuss technical details
        </CardDescription>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col space-y-4 min-h-0">
        {/* Messages Area */}
        <ScrollArea ref={scrollAreaRef} className="flex-1 pr-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex space-x-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-center text-muted-foreground">
              <div>
                <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">Start a conversation</p>
                <p className="text-sm">Ask me anything about this project or RFP</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex space-x-3 ${
                    msg.messageType === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.messageType === 'assistant' && (
                    <div className="flex-shrink-0">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    </div>
                  )}
                  
                  <div className={`max-w-[80%] ${msg.messageType === 'user' ? 'order-1' : ''}`}>
                    <div
                      className={`rounded-lg px-3 py-2 text-sm ${
                        msg.messageType === 'user'
                          ? 'bg-primary text-primary-foreground ml-auto'
                          : 'bg-muted'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 px-1">
                      {formatDistanceToNow(new Date(msg.createdAt))} ago
                    </p>
                  </div>

                  {msg.messageType === 'user' && (
                    <div className="flex-shrink-0 order-2">
                      <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                        <User className="h-4 w-4 text-gray-600" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {isGenerating && (
                <div className="flex space-x-3">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                  <div className="max-w-[80%]">
                    <div className="rounded-lg px-3 py-2 text-sm bg-muted">
                      <div className="flex items-center space-x-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Assistant is thinking...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Input Area */}
        <div className="flex-shrink-0 flex space-x-2">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about this project, request RFP help, or discuss technical details..."
            className="min-h-[60px] max-h-[120px] resize-none"
            disabled={sendMessageMutation.isPending || isGenerating}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!message.trim() || sendMessageMutation.isPending || isGenerating}
            size="sm"
            className="px-3 h-[60px]"
          >
            {sendMessageMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}