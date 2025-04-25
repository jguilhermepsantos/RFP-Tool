import { apiRequest } from "./queryClient";

// This is needed for TypeScript to understand the Response type from fetch
declare global {
  interface Response {
    json(): Promise<any>;
  }
}

/**
 * Options for document chunking
 */
export interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

/**
 * Result of document chunking operation
 */
export interface ChunkingResult {
  success: boolean;
  documentId: string;
  chunksCreated: number;
  error?: string;
}

/**
 * Service for document chunking operations
 */
export const ChunkingService = {
  /**
   * Process a document into chunks
   * @param documentId ID of the document to process
   * @param options Chunking options
   * @returns Result of the chunking operation
   */
  async chunkDocument(documentId: string, options: ChunkingOptions = {}): Promise<ChunkingResult> {
    try {
      const response = await apiRequest(`/documents/chunk/${documentId}`, {
        method: 'POST',
        body: JSON.stringify(options),
      });
      
      const result = await response.json();
      return result as ChunkingResult;
    } catch (error) {
      console.error('Error chunking document:', error);
      return {
        success: false,
        documentId,
        chunksCreated: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
  
  /**
   * Process all approved but unchunked documents
   * @param options Chunking options
   * @returns Results of the chunking operations
   */
  async processAllUnchunked(options: ChunkingOptions = {}): Promise<{
    success: boolean;
    message: string;
    results: ChunkingResult[];
  }> {
    try {
      const response = await apiRequest('/documents/process-all-unchunked', {
        method: 'POST',
        body: JSON.stringify(options),
      });
      
      const result = await response.json();
      return result as {
        success: boolean;
        message: string;
        results: ChunkingResult[];
      };
    } catch (error) {
      console.error('Error processing unchunked documents:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        results: [],
      };
    }
  },
};