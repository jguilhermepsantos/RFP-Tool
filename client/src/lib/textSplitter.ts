/**
 * Text splitter utility to divide text into chunks
 */

/**
 * Options for text splitting
 */
export interface TextSplitOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  separator?: string;
}

/**
 * Split text into chunks using a recursive character splitting approach
 * (simplified version of LangChain's RecursiveCharacterTextSplitter)
 * 
 * @param text The text to split into chunks
 * @param options Splitting options
 * @returns Array of text chunks
 */
export function splitTextIntoChunks(
  text: string, 
  options: TextSplitOptions = {}
): string[] {
  // Default options
  const {
    chunkSize = 500,
    chunkOverlap = 50,
    separator = "\n"
  } = options;

  if (chunkSize <= 0) {
    throw new Error("Chunk size must be greater than 0");
  }

  if (chunkOverlap >= chunkSize) {
    throw new Error("Chunk overlap must be less than chunk size");
  }

  if (!text || text.length === 0) {
    return [];
  }

  // Remove multiple newlines, tabs, excessive spaces
  const cleanedText = text
    .replace(/\n+/g, '\n')
    .replace(/\t+/g, ' ')
    .replace(/ +/g, ' ')
    .trim();

  // Split on separator
  const segments = cleanedText.split(separator);
  const chunks: string[] = [];
  
  let currentChunk = "";
  
  // Process each segment
  for (const segment of segments) {
    // Skip empty segments
    if (!segment.trim()) continue;
    
    // If adding this segment exceeds the chunk size, push the current chunk
    // and start a new one (with overlap)
    if (currentChunk && currentChunk.length + segment.length + 1 > chunkSize) {
      chunks.push(currentChunk);
      
      // For overlap, get the last n characters from the previous chunk
      if (chunkOverlap > 0 && currentChunk.length > chunkOverlap) {
        currentChunk = currentChunk.slice(-chunkOverlap) + separator;
      } else {
        currentChunk = "";
      }
    }
    
    // Add separator if chunk isn't empty
    if (currentChunk && !currentChunk.endsWith(separator)) {
      currentChunk += separator;
    }
    
    // Add segment to current chunk
    currentChunk += segment;
    
    // If segment itself is longer than chunk size, we need to split it
    while (currentChunk.length > chunkSize) {
      chunks.push(currentChunk.slice(0, chunkSize));
      
      // Keep the overlap for the next chunk
      const overlapText = currentChunk.slice(chunkSize - chunkOverlap, chunkSize);
      currentChunk = overlapText + currentChunk.slice(chunkSize);
    }
  }
  
  // Add the last chunk if it's not empty
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

/**
 * Split a text into chunks, ensuring that each chunk is cleaned and formatted
 * @param text Text to be split
 * @param options Options for splitting the text
 * @returns Array of document chunks
 */
export function createDocumentChunks(
  text: string,
  options: TextSplitOptions = {}
): string[] {
  try {
    // Basic text cleaning
    const cleanedText = text
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\s+/g, ' ')   // Replace multiple spaces with a single space
      .trim();                // Remove leading/trailing whitespace
      
    // Split the text into chunks
    return splitTextIntoChunks(cleanedText, options);
  } catch (error) {
    console.error('Error creating document chunks:', error);
    // Return a single chunk with the original text as fallback
    return [text]; 
  }
}