import { Router, Request, Response } from 'express';
import { chunkDocument, chunkRfpDocument } from './document-chunking';
import { storage } from './storage';

export const chunkingRouter = Router();

/**
 * Process a single document into chunks
 * POST /documents/chunk/:documentId
 */
chunkingRouter.post("/documents/chunk/:documentId", async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;
    const options = req.body || {};
    
    console.log(`Received chunking request for document ${documentId} with options:`, options);
    
    // Check if document exists
    const document = await storage.getDocument(documentId);
    
    if (!document) {
      return res.status(404).json({
        success: false,
        error: `Document not found: ${documentId}`
      });
    }
    
    // Process the document into chunks
    const result = await chunkDocument(documentId, options);
    
    return res.json(result);
  } catch (error) {
    console.error('Error in chunking endpoint:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Process all approved but unchunked documents
 * POST /documents/process-all-unchunked
 */
chunkingRouter.post("/documents/process-all-unchunked", async (req: Request, res: Response) => {
  try {
    const options = req.body || {};
    
    // Get all approved but unchunked documents
    const documents = await storage.getDocuments();
    
    // Log the documents to see what properties they have
    console.log('Document properties example:', 
      documents.length > 0 ? Object.keys(documents[0]) : 'No documents found');
    
    // Determine if we should use approval_status (Supabase) or approvalStatus (memory)
    // Log the first document if available to see what fields are present
    if (documents.length > 0) {
      console.log('Document properties example:', Object.keys(documents[0]));
    }
    
    // Check which property exists and use it
    const approvedUnchunked = documents.filter(doc => {
      // If doc has approval_status property, use it
      if ('approval_status' in doc) {
        return doc.approval_status === 'approved' && !doc.chunked;
      } 
      // Fallback to approvalStatus for compatibility
      else if ('approvalStatus' in doc) {
        return doc.approvalStatus === 'approved' && !doc.chunked;
      }
      // Document doesn't have either property
      return false;
    });
    
    console.log(`Found ${approvedUnchunked.length} approved but unchunked documents`);
    
    if (approvedUnchunked.length === 0) {
      return res.json({
        success: true,
        message: 'No approved unchunked documents found',
        results: []
      });
    }
    
    // Process each document
    const results = [];
    
    for (const doc of approvedUnchunked) {
      try {
        console.log(`Processing document ${doc.id}: ${doc.name}`);
        const result = await chunkDocument(doc.id, options);
        results.push(result);
      } catch (error) {
        console.error(`Error processing document ${doc.id}:`, error);
        results.push({
          success: false,
          documentId: doc.id,
          chunksCreated: 0,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    return res.json({
      success: true,
      message: `Processed ${results.length} documents`,
      results
    });
  } catch (error) {
    console.error('Error in process all unchunked endpoint:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
      results: []
    });
  }
});

/**
 * Process an RFP document into chunks from its questions and answers
 * POST /rfp-documents/chunk/:rfpDocumentId
 */
chunkingRouter.post("/rfp-documents/chunk/:rfpDocumentId", async (req: Request, res: Response) => {
  try {
    const { rfpDocumentId } = req.params;
    
    console.log(`Received chunking request for RFP document ${rfpDocumentId}`);
    
    // Check if RFP document exists
    const rfpDocument = await storage.getRfpDocument(rfpDocumentId);
    
    if (!rfpDocument) {
      return res.status(404).json({
        success: false,
        error: `RFP document not found: ${rfpDocumentId}`
      });
    }
    
    // Process the RFP document into chunks
    const result = await chunkRfpDocument(rfpDocumentId);
    
    return res.json(result);
  } catch (error) {
    console.error('Error in RFP chunking endpoint:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Process all approved but unchunked RFP documents
 * POST /rfp-documents/process-all-unchunked
 */
chunkingRouter.post("/rfp-documents/process-all-unchunked", async (req: Request, res: Response) => {
  try {
    // Get all approved RFP documents
    const rfpDocuments = await storage.getAllRfpDocuments();
    
    console.log(`Found ${rfpDocuments.length} RFP documents`);
    
    // Filter for approved but not chunked RFP documents
    const approvedUnchunked = rfpDocuments.filter(doc => {
      // If doc has approval_status property, use it (Supabase)
      if ('approval_status' in doc) {
        return doc.approval_status === 'approved' && doc.status !== 'chunked';
      } 
      // Otherwise use approvalStatus (memory storage)
      else if ('approvalStatus' in doc) {
        return doc.approvalStatus === 'approved' && doc.status !== 'chunked';
      }
      // Document doesn't have required properties
      return false;
    });
    
    console.log(`Found ${approvedUnchunked.length} approved but unchunked RFP documents`);
    
    if (approvedUnchunked.length === 0) {
      return res.json({
        success: true,
        message: 'No approved unchunked RFP documents found',
        results: []
      });
    }
    
    // Process each RFP document
    const results = [];
    
    for (const doc of approvedUnchunked) {
      try {
        console.log(`Processing RFP document ${doc.id}: ${doc.name || 'Unnamed'}`);
        const result = await chunkRfpDocument(doc.id);
        results.push(result);
      } catch (error) {
        console.error(`Error processing RFP document ${doc.id}:`, error);
        results.push({
          success: false,
          documentId: doc.id,
          chunksCreated: 0,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    return res.json({
      success: true,
      message: `Processed ${results.length} RFP documents`,
      results
    });
  } catch (error) {
    console.error('Error in process all unchunked RFP documents endpoint:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
      results: []
    });
  }
});

/**
 * Process all chunks for a specific document and embed them
 * POST /documents/:documentId/embed
 */
chunkingRouter.post("/documents/:documentId/embed", async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;
    
    console.log(`Received embedding request for document ${documentId}`);
    
    // Check if document exists
    const document = await storage.getDocument(documentId);
    
    if (!document) {
      return res.status(404).json({
        success: false,
        error: `Document not found: ${documentId}`
      });
    }
    
    // Import and call the embedDocumentChunks function
    const { embedDocumentChunks } = await import('./ai-service');
    
    // Process all chunks for this document
    const result = await embedDocumentChunks(documentId);
    
    return res.json(result);
  } catch (error) {
    console.error('Error in document embedding endpoint:', error);
    return res.status(500).json({
      success: false,
      chunksEmbedded: 0,
      errors: [error instanceof Error ? error.message : String(error)]
    });
  }
});

/**
 * Process all chunks for a specific RFP document and embed them
 * POST /rfp-documents/:documentId/embed
 */
chunkingRouter.post("/rfp-documents/:documentId/embed", async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;
    
    console.log(`Received embedding request for RFP document ${documentId}`);
    
    // Check if RFP document exists
    const rfpDocument = await storage.getRfpDocument(documentId);
    
    if (!rfpDocument) {
      return res.status(404).json({
        success: false,
        error: `RFP document not found: ${documentId}`
      });
    }
    
    // Import and call the embedDocumentChunks function
    const { embedDocumentChunks } = await import('./ai-service');
    
    // Process all chunks for this RFP document
    const result = await embedDocumentChunks(documentId);
    
    // If successful, update the RFP document status to 'embedded'
    if (result.success && result.chunksEmbedded > 0) {
      await storage.updateRfpDocumentApprovalStatus(documentId, 'embedded');
      console.log(`Updated RFP document ${documentId} status to 'embedded'`);
    }
    
    return res.json(result);
  } catch (error) {
    console.error('Error in RFP document embedding endpoint:', error);
    return res.status(500).json({
      success: false,
      chunksEmbedded: 0,
      errors: [error instanceof Error ? error.message : String(error)]
    });
  }
});

/**
 * Process all approved documents and embed their chunks
 * POST /documents/embed-approved
 */
chunkingRouter.post("/documents/embed-approved", async (req: Request, res: Response) => {
  try {
    console.log(`Received request to embed all approved documents`);
    
    // Get all documents with status 'approved'
    const documents = await storage.getDocuments();
    const approvedDocuments = documents.filter(doc => doc.approvalStatus === 'approved');
    
    console.log(`Found ${approvedDocuments.length} approved documents to embed`);
    
    if (approvedDocuments.length === 0) {
      return res.json({
        success: true,
        message: 'No approved documents found for embedding',
        results: []
      });
    }
    
    // Import the embedDocumentChunks function
    const { embedDocumentChunks } = await import('./ai-service');
    
    // Process each approved document
    const results = [];
    
    for (const doc of approvedDocuments) {
      try {
        console.log(`Embedding document ${doc.id}: ${doc.name}`);
        const result = await embedDocumentChunks(doc.id);
        results.push({
          documentId: doc.id,
          documentName: doc.name,
          ...result
        });
      } catch (error) {
        console.error(`Error embedding document ${doc.id}:`, error);
        results.push({
          documentId: doc.id,
          documentName: doc.name,
          success: false,
          chunksEmbedded: 0,
          errors: [error instanceof Error ? error.message : String(error)]
        });
      }
    }
    
    return res.json({
      success: true,
      message: `Processed ${results.length} approved documents`,
      results
    });
  } catch (error) {
    console.error('Error in embed approved documents endpoint:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
      results: []
    });
  }
});

/**
 * Get all chunks for a specific document
 * GET /documents/:documentId/chunks
 */
chunkingRouter.get("/documents/:documentId/chunks", async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;
    
    console.log(`Received request to get chunks for document ${documentId}`);
    
    // Check if document exists
    const document = await storage.getDocument(documentId);
    
    if (!document) {
      return res.status(404).json({
        success: false,
        error: `Document not found: ${documentId}`
      });
    }
    
    // Get all chunks for this document
    const chunks = await storage.getChunks(documentId);
    
    console.log(`Found ${chunks.length} chunks for document ${documentId}`);
    
    return res.json({
      success: true,
      chunks: chunks
    });
  } catch (error) {
    console.error('Error fetching document chunks:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      chunks: []
    });
  }
});

/**
 * Process all unembedded chunks and embed them into the vector database
 * POST /process-unembedded-chunks
 */
chunkingRouter.post("/process-unembedded-chunks", async (req: Request, res: Response) => {
  try {
    console.log(`Received request to process all unembedded chunks`);
    
    // Import the embedUnprocessedChunks function
    const { embedUnprocessedChunks } = await import('./ai-service');
    
    // Process all unembedded chunks
    const result = await embedUnprocessedChunks();
    
    return res.json({
      success: result.success,
      chunksEmbedded: result.chunksEmbedded,
      errors: result.errors
    });
  } catch (error) {
    console.error('Error processing unembedded chunks:', error);
    return res.status(500).json({
      success: false,
      chunksEmbedded: 0,
      errors: [error instanceof Error ? error.message : String(error)]
    });
  }
});