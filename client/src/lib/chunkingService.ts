/**
 * Document chunking service for processing documents
 * and storing chunks in Supabase
 */

import { v4 as uuidv4 } from 'uuid';
import { supabase } from './supabase';
import { extractText } from './textExtractor';
import { createDocumentChunks } from './textSplitter';

/**
 * Interface for document chunking options
 */
export interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

/**
 * Chunk processing result
 */
export interface ChunkingResult {
  success: boolean;
  documentId: string;
  chunksCreated: number;
  error?: any;
}

/**
 * Download a document from its URL
 * @param fileUrl URL of the file to download
 * @returns ArrayBuffer of the file content
 */
async function downloadDocument(fileUrl: string): Promise<ArrayBuffer> {
  try {
    const response = await fetch(fileUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to download document: ${response.statusText}`);
    }
    
    return await response.arrayBuffer();
  } catch (error) {
    console.error('Error downloading document:', error);
    throw new Error(`Download failed: ${(error as Error).message}`);
  }
}

/**
 * Process a document and create chunks in the database
 * @param documentId ID of the document to process
 * @param options Chunking options
 * @returns Result of the chunking operation
 */
export async function chunkDocument(
  documentId: string,
  options: ChunkingOptions = {}
): Promise<ChunkingResult> {
  try {
    console.log(`🔍 Processing document: ${documentId}`);
    
    // Get document info from Supabase
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();
      
    if (docError || !document) {
      console.error('Error fetching document:', docError);
      return { 
        success: false, 
        documentId, 
        chunksCreated: 0, 
        error: docError || 'Document not found' 
      };
    }
    
    // Download document content
    console.log(`⬇️ Downloading: ${document.name}`);
    const fileBuffer = await downloadDocument(document.file_url);
    
    // Extract text from document
    console.log(`📄 Extracting text from: ${document.name}`);
    const text = await extractText(Buffer.from(fileBuffer), document.content_type);
    
    if (!text || text.trim().length === 0) {
      throw new Error('No text content extracted from document');
    }
    
    // Split text into chunks
    console.log(`✂️ Splitting into chunks...`);
    const chunks = createDocumentChunks(text, options);
    
    console.log(`📤 Uploading ${chunks.length} chunks to Supabase...`);
    
    // Store each chunk in Supabase
    const now = new Date().toISOString();
    const chunkData = chunks.map(content => ({
      id: uuidv4(),
      document_id: documentId,
      content: content,
      scope: 'global',
      embedded: false,
      created_at: now
    }));
    
    const { error: insertError } = await supabase
      .from('chunks')
      .insert(chunkData);
      
    if (insertError) {
      console.error('Error inserting chunks:', insertError);
      return { 
        success: false, 
        documentId, 
        chunksCreated: 0, 
        error: insertError 
      };
    }
    
    // Update document as chunked
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        chunked: true,
        chunked_at: now
      })
      .eq('id', documentId);
      
    if (updateError) {
      console.error('Error updating document status:', updateError);
      return { 
        success: false, 
        documentId, 
        chunksCreated: chunks.length, 
        error: updateError 
      };
    }
    
    console.log(`✅ Document processed: ${document.name}, created ${chunks.length} chunks`);
    return {
      success: true,
      documentId,
      chunksCreated: chunks.length
    };
  } catch (error) {
    console.error(`❌ Error chunking document ${documentId}:`, error);
    return {
      success: false,
      documentId,
      chunksCreated: 0,
      error
    };
  }
}

/**
 * Process all unchunked documents in the database
 * @param options Chunking options
 * @returns Array of results, one for each document processed
 */
export async function processAllUnchunkedDocuments(
  options: ChunkingOptions = {}
): Promise<ChunkingResult[]> {
  try {
    // Get all unchunked documents
    const { data: documents, error } = await supabase
      .from('documents')
      .select('*')
      .eq('chunked', false)
      .eq('approval_status', 'approved');
      
    if (error) {
      console.error('Error fetching unchunked documents:', error);
      throw error;
    }
    
    console.log(`🔍 Found ${documents.length} unchunked documents.`);
    
    if (documents.length === 0) {
      return [];
    }
    
    // Process each document
    const results: ChunkingResult[] = [];
    for (const doc of documents) {
      const result = await chunkDocument(doc.id, options);
      results.push(result);
    }
    
    return results;
  } catch (error) {
    console.error('Error processing unchunked documents:', error);
    throw error;
  }
}