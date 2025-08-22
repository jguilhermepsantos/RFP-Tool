import OpenAI from 'openai';

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const ASSISTANT_ID = 'asst_ANabtpP5Ogs0lv4nrrACQIPE';

export interface AssistantThreadResult {
  threadId: string;
  assistantId: string;
}

export interface AssistantMessageResult {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  createdAt: string;
}

export class AssistantService {
  
  /**
   * Cancel any active runs on a thread to allow new messages
   */
  async cancelActiveRuns(threadId: string): Promise<void> {
    try {
      const activeRuns = await openai.beta.threads.runs.list(threadId, {
        limit: 5,
        order: 'desc'
      });
      
      for (const run of activeRuns.data) {
        if (run.status === 'queued' || run.status === 'in_progress') {
          console.log(`[AssistantService] Canceling active run ${run.id}`);
          await openai.beta.threads.runs.cancel(threadId, run.id);
        }
      }
    } catch (error) {
      console.error('Error canceling active runs:', error);
      // Don't throw - this is cleanup, not critical
    }
  }
  
  /**
   * Create a new thread for the OpenAI Assistant
   */
  async createThread(): Promise<AssistantThreadResult> {
    try {
      const thread = await openai.beta.threads.create();
      
      return {
        threadId: thread.id,
        assistantId: ASSISTANT_ID
      };
    } catch (error) {
      console.error('Failed to create OpenAI thread:', error);
      throw new Error(`Failed to create assistant thread: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send a message to the assistant and get a response
   */
  async sendMessage(threadId: string, message: string): Promise<AssistantMessageResult> {
    try {
      // Check if there are any active runs on this thread
      const activeRuns = await openai.beta.threads.runs.list(threadId, {
        limit: 1,
        order: 'desc'
      });
      
      if (activeRuns.data.length > 0) {
        const latestRun = activeRuns.data[0];
        if (latestRun.status === 'queued' || latestRun.status === 'in_progress') {
          // Wait for the active run to complete before proceeding
          console.log(`[AssistantService] Waiting for active run ${latestRun.id} to complete...`);
          
          let attempts = 0;
          const maxAttempts = 30; // 30 seconds timeout for existing run
          
          while (latestRun.status === 'queued' || latestRun.status === 'in_progress') {
            if (attempts >= maxAttempts) {
              throw new Error('Timeout waiting for existing run to complete');
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            const updatedRun = await openai.beta.threads.runs.retrieve(threadId, latestRun.id);
            Object.assign(latestRun, updatedRun); // Update the run status
            attempts++;
          }
        }
      }
      
      // Add the user message to the thread
      await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: message
      });

      // Create a run with the assistant
      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: ASSISTANT_ID
      });

      // Poll the run until completion
      let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
      
      // Wait for completion with timeout
      let attempts = 0;
      const maxAttempts = 60; // 60 seconds timeout
      
      while (runStatus.status === 'queued' || runStatus.status === 'in_progress') {
        if (attempts >= maxAttempts) {
          throw new Error('Assistant response timeout');
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
        attempts++;
      }

      if (runStatus.status !== 'completed') {
        console.error('Assistant run failed. Full run details:', JSON.stringify(runStatus, null, 2));
        
        // Get detailed error information if available
        let errorDetails = `Assistant run failed with status: ${runStatus.status}`;
        if (runStatus.last_error) {
          errorDetails += `. Error: ${runStatus.last_error.code} - ${runStatus.last_error.message}`;
        }
        if (runStatus.failed_at) {
          errorDetails += `. Failed at: ${new Date(runStatus.failed_at * 1000).toISOString()}`;
        }
        
        throw new Error(errorDetails);
      }

      // Get the assistant's response
      const messages = await openai.beta.threads.messages.list(threadId, {
        order: 'desc',
        limit: 1
      });

      const assistantMessage = messages.data[0];
      
      if (!assistantMessage || assistantMessage.role !== 'assistant') {
        throw new Error('No assistant response found');
      }

      // Extract text content from the message
      const textContent = assistantMessage.content.find(content => content.type === 'text');
      
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in assistant response');
      }

      return {
        id: assistantMessage.id,
        content: textContent.text.value,
        role: 'assistant',
        createdAt: new Date(assistantMessage.created_at * 1000).toISOString()
      };

    } catch (error) {
      console.error('Failed to send message to assistant:', error);
      throw new Error(`Failed to send message to assistant: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * SECURITY-AWARE: Upload file with thread-scoped context message
   * Files are uploaded to OpenAI storage but immediately contextualized to specific thread
   */
  async uploadFileToThread(threadId: string, fileBuffer: Buffer, fileName: string, fileType: string): Promise<string> {
    try {
      // Create a temporary file and use fs.createReadStream for proper OpenAI upload
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      
      // Create temporary file path with thread ID for tracking
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `thread_${threadId}_${Date.now()}_${fileName}`);
      
      // Write buffer to temporary file
      fs.writeFileSync(tempFilePath, fileBuffer);
      
      // Create read stream from temporary file
      const fileStream = fs.createReadStream(tempFilePath);
      
      // Upload file to OpenAI (required for message attachments)
      const file = await openai.files.create({
        file: fileStream,
        purpose: 'assistants'
      });
      
      // Clean up temporary file
      fs.unlinkSync(tempFilePath);
      
      console.log(`[AssistantService] Uploaded file to OpenAI: ${file.id} for thread ${threadId}`);
      
      // CRITICAL: Immediately attach file to specific thread with contextual message
      // This creates a strong association between file and thread
      const message = await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: `[DOCUMENT UPLOADED] "${fileName}" - This document is specific to this project and should only be used for context within this conversation thread.`,
        attachments: [
          {
            file_id: file.id,
            tools: [{ type: "file_search" }]
          }
        ]
      });
      
      console.log(`[AssistantService] SECURED: File ${file.id} attached to thread ${threadId} with contextual message ${message.id}`);
      console.log(`[AssistantService] File contextualized for this specific project thread`);
      
      return file.id;
      
    } catch (error) {
      console.error('Failed to upload file to OpenAI:', error);
      throw new Error(`Failed to upload file to OpenAI: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the assistant ID being used
   */
  getAssistantId(): string {
    return ASSISTANT_ID;
  }
}

export const assistantService = new AssistantService();