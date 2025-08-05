import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Send, Bot, Loader2 } from "lucide-react";

interface SimpleChatProps {
  projectId: string;
}

export default function SimpleChat({ projectId }: SimpleChatProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState("");

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
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
      setMessage("");
      toast({
        title: "Message sent!",
        description: "Your message has been sent to the assistant.",
      });
      console.log('Chat response received:', data);
    },
    onError: (error) => {
      console.error('Error sending message:', error);
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Bot className="h-5 w-5" />
          <span>Project Assistant</span>
          <Badge variant="secondary">AI-Powered</Badge>
        </CardTitle>
        <CardDescription>
          Send a message to test the chat functionality
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="flex space-x-2">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message here..."
            className="min-h-[60px] max-h-[120px] resize-none"
            disabled={sendMessageMutation.isPending}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!message.trim() || sendMessageMutation.isPending}
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
        
        {sendMessageMutation.isPending && (
          <div className="text-sm text-muted-foreground">
            Sending message to OpenAI Assistant...
          </div>
        )}
      </CardContent>
    </Card>
  );
}