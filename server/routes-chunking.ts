import { Router, Request, Response } from 'express';
import { chunkDocument } from './document-chunking';
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
    const approvedUnchunked = documents.filter(doc => 
      doc.approvalStatus === 'approved' && !doc.chunked
    );
    
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