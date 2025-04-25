import { supabase } from './supabase';

export interface DocumentMetadata {
  name: string;
  fileUrl: string;
  filePath?: string;
  contentType: string;
  description?: string;
  uploadedBy: string;
}

export interface Document {
  id: string;
  name: string;
  fileUrl: string;
  filePath?: string;
  uploadedBy: string;
  description?: string;
  contentType: string;
  createdAt: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  approvalStatusModifiedAt?: string;
  approvalStatusModifiedBy?: string;
  chunked: boolean;
  chunkedAt?: string;
}

/**
 * Create a new document in the Supabase documents table
 * @param documentData Document metadata 
 * @returns Created document with ID and timestamps
 */
export async function createDocument(documentData: DocumentMetadata): Promise<{ success: boolean, document?: Document, error?: any }> {
  try {
    // Create default values for document record
    const documentRecord = {
      name: documentData.name,
      file_url: documentData.fileUrl,
      file_path: documentData.filePath,
      content_type: documentData.contentType,
      description: documentData.description || '',
      uploaded_by: documentData.uploadedBy,
      approval_status: 'pending',
      chunked: false,
      created_at: new Date().toISOString()
    };

    // Insert into documents table
    const { data, error } = await supabase
      .from('documents')
      .insert(documentRecord)
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating document record:', error);
      return { success: false, error };
    }

    // Transform from snake_case to camelCase for frontend use
    const document: Document = {
      id: data.id,
      name: data.name,
      fileUrl: data.file_url,
      filePath: data.file_path,
      uploadedBy: data.uploaded_by,
      description: data.description,
      contentType: data.content_type,
      createdAt: data.created_at,
      approvalStatus: data.approval_status,
      approvalStatusModifiedAt: data.approval_status_modified_at,
      approvalStatusModifiedBy: data.approval_status_modified_by,
      chunked: data.chunked,
      chunkedAt: data.chunked_at
    };

    console.log('✅ Document record created:', document);
    return { success: true, document };
  } catch (error) {
    console.error('❌ Error in createDocument:', error);
    return { success: false, error };
  }
}

/**
 * Get all documents with 'pending' approval status
 * @returns Array of pending documents
 */
export async function getPendingDocuments(): Promise<{ success: boolean, documents?: Document[], error?: any }> {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching pending documents:', error);
      return { success: false, error };
    }

    // Transform from snake_case to camelCase for frontend use
    const documents: Document[] = data.map(doc => ({
      id: doc.id,
      name: doc.name,
      fileUrl: doc.file_url,
      filePath: doc.file_path,
      uploadedBy: doc.uploaded_by,
      description: doc.description,
      contentType: doc.content_type,
      createdAt: doc.created_at,
      approvalStatus: doc.approval_status,
      approvalStatusModifiedAt: doc.approval_status_modified_at,
      approvalStatusModifiedBy: doc.approval_status_modified_by,
      chunked: doc.chunked,
      chunkedAt: doc.chunked_at
    }));

    return { success: true, documents };
  } catch (error) {
    console.error('❌ Error in getPendingDocuments:', error);
    return { success: false, error };
  }
}

/**
 * Update document approval status
 * @param id Document ID
 * @param status New approval status
 * @param reviewedBy User ID of the reviewer
 * @returns Updated document
 */
export async function updateDocumentApprovalStatus(
  id: string, 
  status: 'approved' | 'rejected', 
  reviewedBy: string
): Promise<{ success: boolean, document?: Document, error?: any }> {
  try {
    const { data, error } = await supabase
      .from('documents')
      .update({
        approval_status: status,
        approval_status_modified_at: new Date().toISOString(),
        approval_status_modified_by: reviewedBy
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Error updating document approval status:', error);
      return { success: false, error };
    }

    // Transform from snake_case to camelCase for frontend use
    const document: Document = {
      id: data.id,
      name: data.name,
      fileUrl: data.file_url,
      filePath: data.file_path,
      uploadedBy: data.uploaded_by,
      description: data.description,
      contentType: data.content_type,
      createdAt: data.created_at,
      approvalStatus: data.approval_status,
      approvalStatusModifiedAt: data.approval_status_modified_at,
      approvalStatusModifiedBy: data.approval_status_modified_by,
      chunked: data.chunked,
      chunkedAt: data.chunked_at
    };

    console.log('✅ Document approval status updated:', document);
    return { success: true, document };
  } catch (error) {
    console.error('❌ Error in updateDocumentApprovalStatus:', error);
    return { success: false, error };
  }
}