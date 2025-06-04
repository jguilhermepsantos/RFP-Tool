/**
 * Server-side document chunking functionality
 */
import { storage } from './storage';
import { v4 as uuidv4 } from 'uuid';
import { PDFExtract } from 'pdf.js-extract';
import { encoding_for_model } from 'tiktoken';

/**
 * Options for text splitting
 */
interface TextSplitOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  separator?: string;
  // Enhanced options for token-based chunking
  minChunkTokens?: number;
  maxChunkTokens?: number;
  overlapTokens?: number;
  preserveStructure?: boolean;
}

/**
 * Chunk processing result
 */
interface ChunkingResult {
  success: boolean;
  documentId: string;
  chunksCreated: number;
  error?: any;
}

/**
 * Extract text from a PDF file
 * @param buffer Buffer containing PDF data
 * @returns Extracted text content
 */
async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    // Initialize the PDF extractor
    const pdfExtract = new PDFExtract();
    
    // Extract text from the PDF data
    const data = await pdfExtract.extractBuffer(buffer, {});
    
    if (!data || !data.pages || data.pages.length === 0) {
      throw new Error('Failed to extract data from PDF');
    }
    
    // Process each page and extract the content
    let extractedText = '';
    
    for (const page of data.pages) {
      // Extract text from current page
      const pageText = page.content
        .map((item: { str: string }) => item.str)
        .join(' ');
        
      extractedText += pageText + '\n\n';
    }
    
    return extractedText;
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Extract text from a plain text file
 * @param buffer Buffer containing text data
 * @returns Extracted text content
 */
function extractTextFromTxt(buffer: Buffer): string {
  return buffer.toString('utf-8');
}

/**
 * Extract text from any supported file type
 * @param buffer File data buffer
 * @param contentType MIME type of the file
 * @returns Extracted text
 */
async function extractText(buffer: Buffer, contentType: string): Promise<string> {
  if (contentType === 'application/pdf') {
    return extractTextFromPdf(buffer);
  } else if (contentType === 'text/plain' || contentType === 'text/markdown') {
    return extractTextFromTxt(buffer);
  } else if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    // Would need external libraries to handle docx
    throw new Error('DOCX format not supported yet');
  } else {
    throw new Error(`Unsupported file type: ${contentType}`);
  }
}

/**
 * Get tiktoken encoder for accurate token counting
 */
function getTokenEncoder() {
  return encoding_for_model('text-embedding-3-small');
}

/**
 * Count tokens in text using tiktoken
 */
function countTokens(text: string): number {
  const encoder = getTokenEncoder();
  const tokens = encoder.encode(text);
  encoder.free();
  return tokens.length;
}

/**
 * Split text on structural boundaries (paragraphs, headers, sections)
 */
function splitOnStructuralBoundaries(text: string): string[] {
  // Start with simple paragraph splitting on double line breaks
  let chunks = text.split(/\n\s*\n/).filter(chunk => chunk.trim().length > 0);
  
  // If we don't find enough structural boundaries, fall back to single line breaks
  if (chunks.length < 2) {
    chunks = text.split(/\n/).filter(chunk => chunk.trim().length > 0);
  }
  
  return chunks;
}

/**
 * Split text on sentence boundaries
 */
function splitOnSentenceBoundaries(text: string): string[] {
  // Simple sentence detection - split on periods followed by space and capital letter
  const sentences = text.split(/\.\s+(?=[A-Z])/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  // If sentence splitting didn't work well, fall back to splitting on periods
  if (sentences.length < 2) {
    return text.split(/\.\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }
  
  return sentences;
}

/**
 * Combine sentences into token-sized chunks
 */
function combineIntoTokenChunks(sentences: string[], options: TextSplitOptions): string[] {
  const {
    minChunkTokens = 300,
    maxChunkTokens = 800,
    overlapTokens = 100
  } = options;
  
  const chunks: string[] = [];
  let currentChunk = '';
  let currentTokens = 0;
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceTokens = countTokens(sentence);
    
    // If adding this sentence would exceed max tokens, finalize current chunk
    if (currentTokens + sentenceTokens > maxChunkTokens && currentTokens >= minChunkTokens) {
      console.log(`=== CHUNK BOUNDARY ===`);
      console.log(`Finalizing chunk ${chunks.length + 1} with ${currentTokens} tokens`);
      console.log(`Last 100 chars of chunk: "${currentChunk.slice(-100)}"`);
      chunks.push(currentChunk.trim());
      
      // Start new chunk with overlap
      if (overlapTokens > 0) {
        const overlapText = getOverlapText(currentChunk, overlapTokens);
        console.log(`Generated overlap text (${countTokens(overlapText)} tokens): "${overlapText.slice(0, 200)}..."`);
        currentChunk = overlapText;
        currentTokens = countTokens(currentChunk);
        
        // Add the current sentence to the overlap
        if (currentChunk.length > 0) {
          currentChunk += ' ';
        }
        currentChunk += sentence;
        currentTokens = countTokens(currentChunk); // Recalculate total tokens
        console.log(`New chunk starts with (${currentTokens} tokens): "${currentChunk.slice(0, 200)}..."`);
      } else {
        currentChunk = sentence;
        currentTokens = sentenceTokens;
      }
    } else {
      // Add sentence to current chunk
      if (currentChunk.length > 0) {
        currentChunk += ' ';
      }
      currentChunk += sentence;
      currentTokens += sentenceTokens;
    }
  }
  
  // Add final chunk if it meets minimum requirements or if we have content to preserve
  if (currentTokens >= minChunkTokens || chunks.length === 0 || currentTokens > 100) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(chunk => chunk.trim().length > 0);
}

/**
 * Get overlap text from the end of a chunk
 */
function getOverlapText(text: string, targetTokens: number): string {
  console.log(`Getting overlap from text (${text.length} chars) with target ${targetTokens} tokens`);
  const sentences = splitOnSentenceBoundaries(text);
  console.log(`Split into ${sentences.length} sentences for overlap`);
  
  const overlapSentences: string[] = [];
  let overlapTokens = 0;
  
  // Add sentences from the end until we reach target tokens
  for (let i = sentences.length - 1; i >= 0; i--) {
    const sentence = sentences[i];
    const sentenceTokens = countTokens(sentence);
    console.log(`Overlap sentence ${i}: ${sentenceTokens} tokens - "${sentence.slice(0, 50)}..."`);
    
    if (overlapTokens + sentenceTokens <= targetTokens) {
      overlapSentences.unshift(sentence); // Add to beginning to maintain order
      overlapTokens += sentenceTokens;
      console.log(`Added to overlap, total now: ${overlapTokens} tokens`);
    } else {
      console.log(`Skipping sentence - would exceed target tokens`);
      break;
    }
  }
  
  const result = overlapSentences.join(' ');
  console.log(`Final overlap result: ${overlapTokens} tokens, ${result.length} chars`);
  return result;
}

/**
 * Enhanced text splitting with structural boundaries and token limits
 */
function enhancedSplitTextIntoChunks(
  text: string,
  options: TextSplitOptions = {}
): string[] {
  const {
    preserveStructure = true,
    minChunkTokens = 300,
    maxChunkTokens = 800,
    overlapTokens = 100
  } = options;
  
  if (!preserveStructure) {
    // Fall back to legacy chunking if structure preservation is disabled
    return splitTextIntoChunks(text, options);
  }
  
  try {
    // 1. Split on structural boundaries first
    const structuralChunks = splitOnStructuralBoundaries(text);
    // 2. For each structural chunk, apply sentence detection
    const allSentences: string[] = [];
    for (const chunk of structuralChunks) {
      const sentences = splitOnSentenceBoundaries(chunk);
      allSentences.push(...sentences);
    }
    
    // 3. Combine sentences into token-sized chunks
    const tokenizedChunks = combineIntoTokenChunks(allSentences, options);
    
    return tokenizedChunks;
  } catch (error) {
    console.warn('Enhanced chunking failed, falling back to legacy method:', error);
    return splitTextIntoChunks(text, options);
  }
}

/**
 * Split text into chunks (legacy method for backward compatibility)
 * @param text Text to split into chunks
 * @param options Splitting options
 * @returns Array of text chunks
 */
function splitTextIntoChunks(
  text: string,
  options: TextSplitOptions = {}
): string[] {
  const {
    chunkSize = 500,
    chunkOverlap = 50,
    separator = '\n',
  } = options;

  if (chunkSize <= 0) {
    throw new Error('Chunk size must be positive');
  }

  if (chunkOverlap >= chunkSize) {
    throw new Error('Chunk overlap must be less than chunk size');
  }

  const chunks: string[] = [];
  
  // Split text by separator first
  const segments = text.split(separator);
  
  // Groups segments into chunks based on size
  let currentChunk = '';
  
  for (const segment of segments) {
    if (segment.trim().length === 0) {
      continue; // Skip empty segments
    }
    
    // If adding this segment would exceed chunk size, finalize current chunk
    if (currentChunk.length + segment.length + separator.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk);
      
      // For next chunk, include overlap from end of previous chunk if applicable
      if (chunkOverlap > 0 && currentChunk.length > chunkOverlap) {
        currentChunk = currentChunk.substring(currentChunk.length - chunkOverlap) + separator;
      } else {
        currentChunk = '';
      }
    }
    
    // Add segment to current chunk
    if (currentChunk.length > 0) {
      currentChunk += separator;
    }
    currentChunk += segment;
  }
  
  // Add final chunk if not empty
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

/**
 * Process a document and create chunks
 * @param documentId ID of the document to process
 * @param options Chunking options
 * @returns Result of the chunking operation
 */
export async function chunkDocument(
  documentId: string,
  options: TextSplitOptions = {}
): Promise<ChunkingResult> {
  console.log(`Starting chunking for document ${documentId} with options:`, options);
  try {
    // Get document information
    const document = await storage.getDocument(documentId);
    
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }
    
    console.log(`Processing document: ${document.name}`);
    
    // Check for file URL
    // For TypeScript safety, we need to use type assertion since document might be from Supabase
    // which uses snake_case or from memory storage which uses camelCase
    const fileUrl = (document as any).file_url || document.fileUrl;
    
    if (!fileUrl) {
      console.error('Document data:', document);
      throw new Error('Document has no file URL');
    }
    
    console.log(`Using file URL: ${fileUrl}`);
    
    // Fetch document content
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch document: ${response.statusText}`);
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    // Extract text from the document
    console.log(`Extracting text from ${contentType} document`);
    const text = await extractText(buffer, contentType);
    
    if (!text || text.trim().length === 0) {
      throw new Error('No text content extracted from document');
    }
    
    console.log(`Extracted ${text.length} characters, splitting into chunks...`);
    
    // Split text into chunks using enhanced chunking strategy
    const enhancedOptions = {
      ...options,
      preserveStructure: true,
      minChunkTokens: 300,
      maxChunkTokens: 800,
      overlapTokens: 100
    };
    
    const chunks = enhancedSplitTextIntoChunks(text, enhancedOptions);
    console.log(`Created ${chunks.length} chunks using enhanced strategy`);
    
    // Store chunks
    let createdChunks = 0;
    
    for (const chunkText of chunks) {
      if (chunkText.trim().length === 0) continue;
      
      // Create chunk record
      await storage.createChunk({
        documentId,
        content: chunkText,
        scope: "global",
        source: "document"
      });
      
      createdChunks++;
    }
    
    // Update document to mark as chunked
    await storage.updateDocumentChunkStatus(documentId, true);
    
    return {
      success: true,
      documentId,
      chunksCreated: createdChunks
    };
  } catch (error) {
    console.error(`Error chunking document ${documentId}:`, error);
    
    return {
      success: false,
      documentId,
      chunksCreated: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Process an RFP document and create chunks from its questions/answers
 * @param rfpDocumentId ID of the RFP document to process
 * @returns Result of the chunking operation
 */
export async function chunkRfpDocument(
  rfpDocumentId: string
): Promise<ChunkingResult> {
  try {
    console.log(`Starting chunking for RFP document ${rfpDocumentId}`);
    
    // Get RFP document from storage
    const rfpDocument = await storage.getRfpDocument(rfpDocumentId);
    
    if (!rfpDocument) {
      throw new Error(`RFP document not found: ${rfpDocumentId}`);
    }
    
    console.log(`Processing RFP document: ${rfpDocument.name || rfpDocumentId}`);
    
    // Get all answers for this RFP document directly
    // We'll use a special method to get all answers by rfp_document_id
    const answers = await storage.getRfpAnswersByDocumentId(rfpDocumentId);
    
    if (!answers || answers.length === 0) {
      console.log(`WARNING: No answers found for RFP document: ${rfpDocumentId}`);
      
      // Still update the status to indicate it was processed
      await storage.updateRfpDocumentStatus(rfpDocumentId, 'chunked');
      
      // Return success but with 0 chunks created
      return {
        success: true,
        documentId: rfpDocumentId,
        chunksCreated: 0
      };
    }
    
    console.log(`Found ${answers.length} answers for RFP document ${rfpDocumentId}`);
    
    // Store chunks - one chunk per answer
    let createdChunks = 0;
    
    for (const answer of answers) {
      // Combine question text and answers into a single chunk
      // Handle both camelCase and snake_case field names from Supabase
      const questionText = answer.questionText || 
                          (answer as any).question_text || 
                          '';
      
      const complianceAnswer = answer.complianceAnswer || 
                              (answer as any).compliance_answer || 
                              '';
      
      const generatedAnswer = answer.generatedAnswer || 
                             (answer as any).generated_answer || 
                             '';
      
      const chunkContent = [
        `Question: ${questionText}`,
        `Compliance Answer: ${complianceAnswer}`,
        `Generated Answer: ${generatedAnswer}`
      ].join('\n\n');
      
      if (chunkContent.trim().length === 0) {
        console.log(`Empty content for answer ${answer.id}, skipping`);
        continue;
      }
      
      // Create chunk record, using rfpDocumentId as the documentId
      await storage.createChunk({
        documentId: rfpDocumentId,
        content: chunkContent,
        scope: "global",
        source: "rfp"
      });
      
      createdChunks++;
    }
    
    // Update RFP document to mark as chunked - using a status update
    // await storage.updateRfpDocumentStatus(rfpDocumentId, 'chunked');
    
    console.log(`📝 Chunking completed for RFP document ${rfpDocumentId}. Created ${createdChunks} chunks.`);
    console.log(`ℹ️ Embedding can be triggered manually from the admin interface.`);
    
    return {
      success: true,
      documentId: rfpDocumentId,
      chunksCreated: createdChunks
    };
  } catch (error) {
    console.error(`Error chunking RFP document ${rfpDocumentId}:`, error);
    
    return {
      success: false,
      documentId: rfpDocumentId,
      chunksCreated: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}