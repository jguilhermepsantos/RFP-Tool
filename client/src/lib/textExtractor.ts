/**
 * Utility for extracting text from various document types
 */

import pdfParse from 'pdf-parse';

/**
 * Extract text from a PDF file
 * @param buffer Buffer containing PDF data
 * @returns Extracted text content
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error(`Failed to extract text from PDF: ${(error as Error).message}`);
  }
}

/**
 * Extract text from a plain text file
 * @param buffer Buffer containing text data
 * @returns Extracted text content
 */
export function extractTextFromTxt(buffer: Buffer): string {
  try {
    return buffer.toString('utf-8');
  } catch (error) {
    console.error('Error extracting text from TXT:', error);
    throw new Error(`Failed to extract text from TXT: ${(error as Error).message}`);
  }
}

/**
 * Extract text from any supported file type
 * @param buffer File data buffer
 * @param contentType MIME type of the file
 * @returns Extracted text
 */
export async function extractText(buffer: Buffer, contentType: string): Promise<string> {
  if (contentType.includes('pdf')) {
    return extractTextFromPdf(buffer);
  } else if (contentType.includes('text/plain')) {
    return extractTextFromTxt(buffer);
  } else {
    // Fall back to trying PDF extraction for unknown types
    try {
      return await extractTextFromPdf(buffer);
    } catch (pdfError) {
      // If PDF extraction fails, try plain text
      try {
        return extractTextFromTxt(buffer);
      } catch (txtError) {
        throw new Error(`Unsupported file type or corrupt file: ${contentType}`);
      }
    }
  }
}