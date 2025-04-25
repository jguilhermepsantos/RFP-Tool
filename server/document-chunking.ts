/**
 * Server-side document chunking functionality
 */
import { storage } from './storage';
import { v4 as uuidv4 } from 'uuid';
import { PDFExtract } from 'pdf.js-extract';

/**
 * Options for text splitting
 */
interface TextSplitOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  separator?: string;
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
 * Split text into chunks
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
    
    // Check for file URL in either snake_case (Supabase) or camelCase (memory storage) format
    const fileUrl = document.file_url || document.fileUrl;
    
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
    
    // Split text into chunks
    const chunks = splitTextIntoChunks(text, options);
    console.log(`Created ${chunks.length} chunks`);
    
    // Store chunks
    let createdChunks = 0;
    
    for (const chunkText of chunks) {
      if (chunkText.trim().length === 0) continue;
      
      // Create chunk record
      await storage.createChunk({
        documentId,
        content: chunkText,
        scope: "global"
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
    
    // Get all questions for this RFP document
    const questions = await storage.getRfpQuestions(rfpDocumentId);
    
    if (!questions || questions.length === 0) {
      throw new Error(`No questions found for RFP document: ${rfpDocumentId}`);
    }
    
    console.log(`Found ${questions.length} questions for RFP document ${rfpDocumentId}`);
    
    // Get answers for all questions
    const questionIds = questions.map(q => q.id);
    const answers = await storage.getRfpAnswers(questionIds);
    
    console.log(`Found ${answers.length} answers for ${questions.length} questions`);
    
    // Create a map of question ID to its answer for easier lookup
    const answerMap = new Map();
    answers.forEach(answer => {
      answerMap.set(answer.rfpQuestionId, answer);
    });
    
    // Store chunks - one chunk per question-answer pair
    let createdChunks = 0;
    
    for (const question of questions) {
      const answer = answerMap.get(question.id);
      
      if (!answer) {
        console.log(`No answer found for question ${question.id}, skipping`);
        continue;
      }
      
      // Combine question text and answers into a single chunk
      const chunkContent = [
        `Question: ${question.questionText || ''}`,
        `Compliance Answer: ${answer.complianceAnswer || ''}`,
        `Generated Answer: ${answer.generatedAnswer || ''}`
      ].join('\n\n');
      
      if (chunkContent.trim().length === 0) {
        console.log(`Empty content for question ${question.id}, skipping`);
        continue;
      }
      
      // Create chunk record, using rfpDocumentId as the documentId
      await storage.createChunk({
        documentId: rfpDocumentId,
        content: chunkContent,
        scope: "global"
      });
      
      createdChunks++;
    }
    
    // Update RFP document to mark as chunked - using a status update
    await storage.updateRfpDocumentStatus(rfpDocumentId, 'chunked');
    
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