import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, Bot, User, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessage {
  id: string;
  project_id: string;
  thread_id: string;
  message_type: 'user' | 'assistant';
  content: string;
  user_id?: string;
  created_at: string;
}

interface SimpleChatProps {
  projectId: string;
}

interface ProjectThread {
  id: string;
  project_id: string;
  thread_id: string;
  assistant_id: string;
}

export default function SimpleChat({ projectId }: SimpleChatProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Fetch or cache project thread info for performance
  const { data: threadData } = useQuery({
    queryKey: ['/api/projects', projectId, 'thread'],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/thread`, {
        headers: { 'Authorization': user?.email || '' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    },
    enabled: !!projectId && !!user?.email,
    staleTime: 5 * 60 * 1000, // Cache thread info for 5 minutes
    retry: false,
  });

  // Fetch chat messages with correct field mapping
  const { data: chatData, isLoading, error } = useQuery({
    queryKey: ['/api/projects', projectId, 'chat'],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/chat`, {
        headers: {
          'Authorization': user?.email || '',
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    },
    enabled: !!projectId && !!user?.email,
    refetchOnWindowFocus: false,
    staleTime: 30000,
    retry: false,
  });

  const serverMessages: ChatMessage[] = Array.isArray(chatData?.messages) ? chatData.messages : [];
  
  // Combine server messages with optimistic messages for display
  const allMessages = [...serverMessages, ...optimisticMessages];

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      // Create optimistic user message immediately
      const thread = threadData?.thread;
      const optimisticUserMessage: ChatMessage = {
        id: `optimistic-user-${Date.now()}`,
        project_id: projectId,
        thread_id: thread?.thread_id || '',
        message_type: 'user',
        content,
        user_id: user?.id,
        created_at: new Date().toISOString()
      };
      
      // Add user message immediately to UI
      setOptimisticMessages([optimisticUserMessage]);
      setIsGenerating(true);
      
      console.log('[FRONTEND] Sending message to backend:', content);
      
      // Include thread info and user info to avoid backend database lookups
      return await apiRequest(`/api/projects/${projectId}/chat`, {
        method: 'POST',
        headers: {
          'Authorization': user?.email || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          messageType: 'user',
          // Performance optimization: include thread and user context
          threadId: thread?.thread_id,
          userId: user?.id
        }),
        timeout: 90000, // 90 seconds for chat operations (OpenAI can be slow)
      });
    },
    onSuccess: (data) => {
      console.log('[FRONTEND] Message sent successfully:', data);
      // Clear optimistic messages as server now has the real ones
      setOptimisticMessages([]);
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'chat'] });
      setMessage("");
      setIsGenerating(false);
      console.log('Chat response received:', data);
    },
    onError: (error) => {
      console.error('Error sending message:', error);
      // Clear optimistic messages on error
      setOptimisticMessages([]);
      setIsGenerating(false);
      toast({
        title: "Failed to send message",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

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
  }, [allMessages, isGenerating]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0">
        <CardTitle className="flex items-center space-x-2">
          <Bot className="h-5 w-5" />
          <span>Project Assistant</span>
          <Badge variant="secondary">AI-Powered</Badge>
        </CardTitle>
        <CardDescription>
          Ask questions about this project, get RFP guidance, or discuss technical details
        </CardDescription>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col space-y-4">
        {/* Chat Messages */}
        <ScrollArea ref={scrollAreaRef} className="flex-1 w-full border rounded-md p-4">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}
          
          {!isLoading && error && (
            <div className="text-center text-muted-foreground">
              <p>Unable to load chat messages</p>
              <p className="text-sm">Error: {error.message}</p>
            </div>
          )}
          
          {!isLoading && !error && allMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
              <Bot className="h-12 w-12 text-muted-foreground" />
              <div>
                <h3 className="text-lg font-medium">Start a conversation</h3>
                <p className="text-sm text-muted-foreground">
                  Ask me anything about this project or RFP
                </p>
              </div>
            </div>
          )}
          
          {!isLoading && !error && allMessages.length > 0 && (
            <div className="space-y-4">
              {allMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex space-x-3 ${
                    msg.message_type === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.message_type === 'assistant' && (
                    <div className="flex-shrink-0">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    </div>
                  )}
                  
                  <div className={`max-w-[80%] ${msg.message_type === 'user' ? 'order-1' : ''}`}>
                    <div
                      className={`rounded-lg px-3 py-2 text-sm ${
                        msg.message_type === 'user'
                          ? 'bg-primary text-primary-foreground ml-auto'
                          : 'bg-muted'
                      }`}
                    >
                      {msg.message_type === 'assistant' ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a: ({ href, children, ...props }) => (
                                <a 
                                  href={href} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800 underline"
                                  {...props}
                                >
                                  {children}
                                </a>
                              )
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 px-1">
                      {formatDistanceToNow(new Date(msg.created_at))} ago
                    </p>
                  </div>

                  {msg.message_type === 'user' && (
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
        <div className="flex space-x-2 flex-shrink-0">
          <Textarea
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