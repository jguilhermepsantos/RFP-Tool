import { supabase } from './supabase';

export interface UploadResult {
  success: boolean;
  fileUrl?: string;
  filePath?: string;
  error?: any;
}

/**
 * Uploads a file to Supabase storage
 * @param file The file to upload
 * @param folder Optional folder path to store the file in
 * @returns Upload result with success status and file path/URL
 */
export async function uploadFile(file: File, folder: string = 'documents'): Promise<UploadResult> {
  try {
    // Generate a unique filename to prevent collisions
    const timestamp = Date.now();
    const fileExtension = file.name.split('.').pop();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
    const filePath = `${folder}/${timestamp}_${safeFileName}`;

    // Upload the file to Supabase
    const { data, error } = await supabase.storage
      .from('vtex-files') // bucket name
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false, // prevents overwriting
      });

    if (error) {
      console.error('❌ Upload failed:', error.message);
      return { success: false, error };
    }

    // Get the public URL for the uploaded file
    const fileUrl = supabase.storage
      .from('vtex-files')
      .getPublicUrl(filePath).data.publicUrl;

    console.log('✅ Upload succeeded:', { filePath, fileUrl });
    return { 
      success: true, 
      fileUrl,
      filePath
    };
  } catch (error) {
    console.error('❌ Upload error:', error);
    return { 
      success: false, 
      error 
    };
  }
}