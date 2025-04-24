import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import fs from 'fs';
import stream from 'stream';
import path from 'path';
import { Request } from 'express';

// Get S3-compatible credentials from environment variables
const awsAccessKeyId = process.env.SUPABASE_S3_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.SUPABASE_S3_SECRET_ACCESS_KEY;

// Supabase storage configuration
const SUPABASE_BUCKET_NAME = 'vtex-files';  // Your bucket name
const SUPABASE_PROJECT_ID = 'txgrhpmthibqetiephzp';  // Your Supabase project ID/reference
const SUPABASE_REGION = 'us-east-1';  // Default region for Supabase storage

// Create a Supabase-compatible S3 client
const s3Client = new S3Client({
  region: SUPABASE_REGION,
  endpoint: `https://${SUPABASE_PROJECT_ID}.supabase.co/storage/v1`,
  credentials: {
    accessKeyId: awsAccessKeyId || '',
    secretAccessKey: awsSecretAccessKey || '',
  },
  forcePathStyle: true, // Required for Supabase compatibility
});

/**
 * Check if S3 credentials are configured
 */
export function isS3Configured(): boolean {
  return Boolean(awsAccessKeyId && awsSecretAccessKey);
}

/**
 * Get the public URL for a file in the bucket
 */
export function getPublicUrl(filePath: string): string {
  return `https://${SUPABASE_PROJECT_ID}.supabase.co/storage/v1/object/public/${SUPABASE_BUCKET_NAME}/${filePath}`;
}

/**
 * Upload a file buffer to Supabase storage using S3 API
 */
export async function uploadBuffer(
  buffer: Buffer,
  filePath: string,
  contentType: string
): Promise<{ fileUrl: string; filePath: string }> {
  try {
    const params = {
      Bucket: SUPABASE_BUCKET_NAME,
      Key: filePath,
      Body: buffer,
      ContentType: contentType,
    };

    // Use the multipart upload for better reliability with larger files
    const upload = new Upload({
      client: s3Client,
      params,
    });

    await upload.done();

    // Generate the public URL
    const fileUrl = getPublicUrl(filePath);

    console.log(`File uploaded successfully to: ${fileUrl}`);
    return { fileUrl, filePath };
  } catch (error) {
    console.error('Error uploading file to Supabase storage:', error);
    throw new Error(
      `Failed to upload file to Supabase storage: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Simple function to handle file uploads with JSON metadata
 * For a production implementation, you would want to use multer or another
 * file upload middleware to handle multipart form data properly
 */
export async function handleMockUpload(
  userId: string, 
  fileName: string, 
  contentType: string = 'application/pdf'
): Promise<{ fileUrl: string; filePath: string }> {
  try {
    // Generate a mock buffer (1kb of zeros) for testing
    const mockBuffer = Buffer.alloc(1024);
    
    // Create a timestamped file path
    const timestamp = Date.now();
    const filePath = `${userId}/${timestamp}_${fileName}`;
    
    if (!isS3Configured()) {
      console.warn('S3 credentials not configured, returning mock URL');
      return {
        fileUrl: getPublicUrl(filePath),
        filePath,
      };
    }
    
    // Upload the mock buffer
    return await uploadBuffer(mockBuffer, filePath, contentType);
  } catch (error) {
    console.error('Error in mock upload:', error);
    throw error;
  }
}