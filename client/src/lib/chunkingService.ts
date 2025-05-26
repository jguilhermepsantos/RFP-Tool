/**
 * ChunkingService - Client-side interface for document chunking operations
 */

export interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  separator?: string;
}

export interface ChunkingResult {
  success: boolean;
  documentId: string;
  chunksCreated: number;
  error?: any;
}

export const ChunkingService = {
  /**
   * Chunk a single document
   */
  async chunkDocument(documentId: string, options: ChunkingOptions = {}): Promise<ChunkingResult> {
    try {
      console.log(`Calling chunking API for document ${documentId} with options:`, options);
      
      // Direct fetch to avoid apiRequest adding /api prefix
      const response = await fetch(`/api/documents/chunk/${documentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API error ${response.status}: ${errorText}`);
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }
      
      const result = await response.json();
      console.log(`Chunking result for ${documentId}:`, result);
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
   */
  async processAllUnchunked(options: ChunkingOptions = {}): Promise<{
    success: boolean;
    message: string;
    results: ChunkingResult[];
  }> {
    try {
      console.log(`Calling process all unchunked API with options:`, options);
      
      // Direct fetch to avoid apiRequest adding /api prefix
      const response = await fetch(`/api/documents/process-all-unchunked`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API error ${response.status}: ${errorText}`);
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }
      
      const result = await response.json();
      console.log(`Process all unchunked result:`, result);
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

  /**
   * Chunk an RFP document
   */
  async chunkRfpDocument(rfpDocumentId: string, options: ChunkingOptions = {}): Promise<ChunkingResult> {
    try {
      console.log(`Calling RFP chunking API for document ${rfpDocumentId} with options:`, options);
      
      const response = await fetch(`/api/rfp-documents/chunk/${rfpDocumentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API error ${response.status}: ${errorText}`);
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }
      
      const result = await response.json();
      console.log(`RFP chunking result for ${rfpDocumentId}:`, result);
      return result as ChunkingResult;
    } catch (error) {
      console.error('Error chunking RFP document:', error);
      return {
        success: false,
        documentId: rfpDocumentId,
        chunksCreated: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /**
   * Process all unembedded chunks
   */
  async processUnembeddedChunks(): Promise<{
    success: boolean;
    chunksEmbedded: number;
    errors: string[];
  }> {
    try {
      console.log(`Calling process unembedded chunks API`);
      
      const response = await fetch(`/api/process-unembedded-chunks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API error ${response.status}: ${errorText}`);
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }
      
      const result = await response.json();
      console.log(`Process unembedded chunks result:`, result);
      return result;
    } catch (error) {
      console.error('Error processing unembedded chunks:', error);
      return {
        success: false,
        chunksEmbedded: 0,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  },
};