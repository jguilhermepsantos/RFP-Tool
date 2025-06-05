import { supabase } from './db';
import { IStorage } from './storage';
import {
  User, InsertUser,
  Project, InsertProject,
  ProjectPermission, InsertProjectPermission,
  RfpDocument, InsertRfpDocument,
  RfpQuestion, InsertRfpQuestion,
  RfpAnswer, InsertRfpAnswer,
  Document, InsertDocument,
  Chunk, InsertChunk,
  ComplianceMapping, InsertComplianceMapping,
  Feedback, InsertFeedback,
  AnswerFeedback, InsertAnswerFeedback, UpdateAnswerFeedback,
  UpdateRfpAnswer
} from '@shared/schema';

export class SupabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) return undefined;
    return data as User;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error || !data) return undefined;
    return data as User;
  }

  async createUser(user: InsertUser): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .insert(user)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create user: ${error.message}`);
    return data as User;
  }

  async getAllUsers(): Promise<User[]> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching users from Supabase:', error);
      throw new Error(`Failed to fetch users: ${error.message}`);
    }
    
    return data || [];
  }

  async updateUserAccess(id: string, accessGranted: boolean): Promise<User | undefined> {
    const { data, error } = await supabase
      .from('users')
      .update({ access_granted: accessGranted })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating user access in Supabase:', error);
      throw new Error(`Failed to update user access: ${error.message}`);
    }
    
    return data || undefined;
  }

  async updateUserRole(id: string, role: string): Promise<User | undefined> {
    const { data, error } = await supabase
      .from('users')
      .update({ role })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating user role in Supabase:', error);
      throw new Error(`Failed to update user role: ${error.message}`);
    }
    
    return data || undefined;
  }
  
  // Project operations
  async getProjects(): Promise<Project[]> {
    const { data, error } = await supabase
      .from('projects')
      .select('*');
    
    if (error) throw new Error(`Failed to get projects: ${error.message}`);
    return data as Project[];
  }

  async getProject(id: string): Promise<Project | undefined> {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) return undefined;
    return data as Project;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const { data, error } = await supabase
      .from('projects')
      .insert(project)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create project: ${error.message}`);
    
    // Automatically add the creator as an owner
    await this.addProjectMember({
      projectId: data.id,
      userId: project.createdBy,
      role: 'owner'
    });
    
    return data as Project;
  }

  async deleteProject(id: string): Promise<void> {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);
    
    if (error) throw new Error(`Failed to delete project: ${error.message}`);
  }

  async getProjectsByUserId(userId: string): Promise<Project[]> {
    // Get projects through project permissions
    const { data: permissions, error: permissionsError } = await supabase
      .from('project_permissions')
      .select('project_id')
      .eq('user_id', userId);
    
    if (permissionsError) throw new Error(`Failed to get project permissions: ${permissionsError.message}`);
    
    if (!permissions || permissions.length === 0) return [];
    
    const projectIds = permissions.map(p => p.project_id);
    
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('*')
      .in('id', projectIds);
    
    if (projectsError) throw new Error(`Failed to get projects: ${projectsError.message}`);
    return projects as Project[];
  }
  
  // Project Members operations
  async getProjectMembers(projectId: string): Promise<ProjectPermission[]> {
    const { data, error } = await supabase
      .from('project_permissions')
      .select('*')
      .eq('project_id', projectId);
    
    if (error) throw new Error(`Failed to get project members: ${error.message}`);
    return data as ProjectPermission[];
  }

  async addProjectMember(projectMember: InsertProjectPermission): Promise<ProjectPermission> {
    const { data, error } = await supabase
      .from('project_permissions')
      .insert(projectMember)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to add project member: ${error.message}`);
    return data as ProjectPermission;
  }

  async updateProjectMemberRole(id: string, role: string): Promise<ProjectPermission | undefined> {
    const { data, error } = await supabase
      .from('project_permissions')
      .update({ role })
      .eq('id', id)
      .select()
      .single();
    
    if (error || !data) return undefined;
    return data as ProjectPermission;
  }
  
  // RFP Document operations
  async getRfpDocuments(projectId: string): Promise<RfpDocument[]> {
    const { data, error } = await supabase
      .from('rfp_documents')
      .select('*')
      .eq('project_id', projectId);
    
    if (error) throw new Error(`Failed to get RFP documents: ${error.message}`);
    return data as RfpDocument[];
  }

  async getRfpDocument(id: string): Promise<RfpDocument | undefined> {
    console.log(`[SupabaseStorage] Getting RFP document with ID: ${id}`);
    
    const { data, error } = await supabase
      .from('rfp_documents')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.log(`[SupabaseStorage] Error getting RFP document: ${error.message}`, error);
      return undefined;
    }
    
    if (!data) {
      console.log(`[SupabaseStorage] No RFP document found with ID: ${id}`);
      return undefined;
    }
    
    console.log(`[SupabaseStorage] Successfully retrieved RFP document:`, data);
    return data as RfpDocument;
  }

  async createRfpDocument(document: InsertRfpDocument): Promise<RfpDocument> {
    const { data, error } = await supabase
      .from('rfp_documents')
      .insert(document)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create RFP document: ${error.message}`);
    return data as RfpDocument;
  }

  async updateRfpDocumentStatus(id: string, status: string): Promise<RfpDocument | undefined> {
    console.log(`[SupabaseStorage] Updating RFP document status for ID: ${id} to ${status}`);
    
    const { data, error } = await supabase
      .from('rfp_documents')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.log(`[SupabaseStorage] Error updating RFP document status: ${error.message}`, error);
      return undefined;
    }
    
    if (!data) {
      console.log(`[SupabaseStorage] No data returned after updating RFP document status`);
      return undefined;
    }
    
    console.log(`[SupabaseStorage] Successfully updated RFP document status:`, data);
    return data as RfpDocument;
  }

  async getAllRfpDocuments(): Promise<RfpDocument[]> {
    const { data, error } = await supabase
      .from('rfp_documents')
      .select('*')
      .eq('status', 'done');
    
    if (error) throw new Error(`Failed to get all RFP documents: ${error.message}`);
    return data as RfpDocument[];
  }

  async updateRfpDocumentApprovalStatus(id: string, status: string): Promise<RfpDocument | undefined> {
    console.log(`[SupabaseStorage] Updating RFP document approval status for ID: ${id} to ${status}`);
    
    const now = new Date().toISOString();
    
    // Verify the document exists first
    const { data: checkData, error: checkError } = await supabase
      .from('rfp_documents')
      .select('id, name')
      .eq('id', id)
      .single();
      
    if (checkError) {
      console.log(`[SupabaseStorage] Error checking if RFP document exists: ${checkError.message}`, checkError);
      return undefined;
    }
    
    if (!checkData) {
      console.log(`[SupabaseStorage] RFP document does not exist with ID: ${id}`);
      return undefined;
    }
    
    console.log(`[SupabaseStorage] Found RFP document to update: ${checkData.name || id}`);
    
    // Get the current authenticated user
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    
    console.log(`[SupabaseStorage] Current authenticated user ID: ${userId || 'none'}`);
    
    // Build update payload without the modified_by field (which expects UUID)
    const updatePayload: any = {
      approval_status: status,
      approval_status_modified_at: now
    };
    
    // Only add modified_by if we have a valid UUID (don't use strings for UUID fields)
    if (userId) {
      updatePayload.approval_status_modified_by = userId;
    } else {
      // Skip the modified_by field completely to avoid the UUID error
      console.log('[SupabaseStorage] No authenticated user ID available, skipping modified_by field');
    }
    
    console.log(`[SupabaseStorage] Update payload:`, updatePayload);
    
    const { data, error } = await supabase
      .from('rfp_documents')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.log(`[SupabaseStorage] Error updating RFP document approval status: ${error.message}`, error);
      return undefined;
    }
    
    if (!data) {
      console.log(`[SupabaseStorage] No data returned after updating RFP document`);
      return undefined;
    }
    
    console.log(`[SupabaseStorage] Successfully updated RFP document approval status:`, data);
    return data as RfpDocument;
  }
  
  // RFP Question operations
  async getRfpQuestions(documentId: string): Promise<RfpQuestion[]> {
    console.log(`[SupabaseStorage] Getting RFP questions for document ID: ${documentId}`);
    
    const { data, error } = await supabase
      .from('rfp_questions')
      .select('*')
      .eq('rfp_document_id', documentId);
    
    if (error) {
      console.log(`[SupabaseStorage] Error getting RFP questions: ${error.message}`);
      throw new Error(`Failed to get RFP questions: ${error.message}`);
    }
    
    console.log(`[SupabaseStorage] Found ${data ? data.length : 0} RFP questions`);
    if (data && data.length > 0) {
      console.log(`[SupabaseStorage] First question:`, data[0]);
    }
    
    return data as RfpQuestion[];
  }

  async createRfpQuestion(question: InsertRfpQuestion): Promise<RfpQuestion> {
    const { data, error } = await supabase
      .from('rfp_questions')
      .insert(question)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create RFP question: ${error.message}`);
    return data as RfpQuestion;
  }
  
  // RFP Answer operations
  async getRfpAnswers(questionIds: string[]): Promise<RfpAnswer[]> {
    console.log(`[SupabaseStorage] Getting RFP answers for question IDs:`, questionIds);
    
    if (questionIds.length === 0) {
      console.log(`[SupabaseStorage] No question IDs provided, returning empty array`);
      return [];
    }
    
    const { data, error } = await supabase
      .from('rfp_answers')
      .select('*')
      .in('rfp_question_id', questionIds);
    
    if (error) {
      console.log(`[SupabaseStorage] Error getting RFP answers: ${error.message}`);
      throw new Error(`Failed to get RFP answers: ${error.message}`);
    }
    
    console.log(`[SupabaseStorage] Found ${data ? data.length : 0} RFP answers`);
    if (data && data.length > 0) {
      console.log(`[SupabaseStorage] First answer:`, data[0]);
    }
    
    return data as RfpAnswer[];
  }
  
  async getRfpAnswersByDocumentId(rfpDocumentId: string): Promise<RfpAnswer[]> {
    console.log(`[SupabaseStorage] Getting RFP answers directly for document ID: ${rfpDocumentId}`);
    
    // Directly query for answers linked to this RFP document
    // All the content we need (question_text, compliance_answer, generated_answer) 
    // is already available in the rfp_answers table
    const { data: answers, error } = await supabase
      .from('rfp_answers')
      .select('*')
      .eq('rfp_document_id', rfpDocumentId);
    
    if (error) {
      console.log(`[SupabaseStorage] Error getting answers: ${error.message}`);
      throw new Error(`Failed to get answers for RFP document: ${error.message}`);
    }
    
    console.log(`[SupabaseStorage] Direct answer check found ${answers?.length || 0} answers`);
    
    if (answers && answers.length > 0) {
      console.log(`[SupabaseStorage] First answer:`, answers[0]);
    } else {
      console.log(`[SupabaseStorage] No answers found for this RFP document`);
    }
    
    return answers as RfpAnswer[];
  }

  async createRfpAnswer(answer: InsertRfpAnswer): Promise<RfpAnswer> {
    const { data, error } = await supabase
      .from('rfp_answers')
      .insert(answer)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create RFP answer: ${error.message}`);
    return data as RfpAnswer;
  }

  async updateRfpAnswer(answer: UpdateRfpAnswer): Promise<RfpAnswer | undefined> {
    console.log("[SupabaseStorage] Updating RFP answer:", answer);
    
    // Build the update object based on what fields are provided
    const updateObj: Record<string, any> = {};
    
    if (answer.complianceAnswer !== undefined) {
      updateObj.compliance_answer = answer.complianceAnswer;
    }
    
    if (answer.generatedAnswer !== undefined) {
      updateObj.generated_answer = answer.generatedAnswer;
    }
    
    // Add review information when provided
    if (answer.lastReviewedBy !== undefined) {
      updateObj.last_reviewed_by = answer.lastReviewedBy;
    }
    
    if (answer.lastReviewedAt !== undefined) {
      updateObj.last_reviewed_at = answer.lastReviewedAt;
    }
    
    // Only update if we have fields to update
    if (Object.keys(updateObj).length === 0) {
      console.log("[SupabaseStorage] No fields to update for answer");
      return undefined;
    }
    
    console.log("[SupabaseStorage] Update object:", updateObj);
    
    const { data, error } = await supabase
      .from('rfp_answers')
      .update(updateObj)
      .eq('id', answer.id)
      .select()
      .single();
    
    if (error) {
      console.log("[SupabaseStorage] Error updating RFP answer:", error);
      return undefined;
    }
    
    if (!data) {
      console.log("[SupabaseStorage] No data returned from update");
      return undefined;
    }
    
    console.log("[SupabaseStorage] Raw updated answer from DB:", data);
    
    // Transform snake_case to camelCase to match RfpAnswer interface
    const transformedAnswer: RfpAnswer = {
      id: data.id,
      rfpDocumentId: data.rfp_document_id,
      rfpQuestionId: data.rfp_question_id,
      questionText: data.question_text,
      generatedAnswer: data.generated_answer,
      complianceAnswer: data.compliance_answer,
      createdAt: data.created_at,
      lastReviewedBy: data.last_reviewed_by,
      lastReviewedAt: data.last_reviewed_at,
      sourceChunks: data.source_chunks,
      averageSimilarity: data.average_similarity,
      confidenceLevel: data.confidence_level
    };
    
    console.log("[SupabaseStorage] Transformed answer:", transformedAnswer);
    return transformedAnswer;
  }

  // Document operations
  async getDocuments(): Promise<Document[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('*');
    
    if (error) throw new Error(`Failed to get documents: ${error.message}`);
    return data as Document[];
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) return undefined;
    return data as Document;
  }

  async createDocument(document: InsertDocument): Promise<Document> {
    const { data, error } = await supabase
      .from('documents')
      .insert(document)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create document: ${error.message}`);
    return data as Document;
  }

  async updateDocumentApprovalStatus(id: string, status: string): Promise<Document | undefined> {
    const now = new Date().toISOString();
    
    console.log(`[SupabaseStorage] Updating document ${id} approval_status to: ${status}`);
    
    // Get the current authenticated user
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    
    console.log(`[SupabaseStorage] Current authenticated user ID: ${userId || 'none'}`);
    
    // Build the update payload
    const updatePayload: any = { 
      approval_status: status,
      approval_status_modified_at: now,
    };
    
    // Only add the modified_by field if we have a valid user ID
    if (userId) {
      updatePayload.approval_status_modified_by = userId;
    }
    
    const { data, error } = await supabase
      .from('documents')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error(`[SupabaseStorage] Error updating document approval status:`, error);
      return undefined;
    }
    
    if (!data) {
      console.error(`[SupabaseStorage] Document not found with ID: ${id}`);
      return undefined;
    }
    
    console.log(`[SupabaseStorage] Successfully updated document approval status:`, data);
    return data as Document;
  }
  
  async updateDocumentChunkStatus(id: string, chunked: boolean): Promise<Document | undefined> {
    console.log(`[SupabaseStorage] Updating document ${id} chunked status to: ${chunked}`);
    
    const now = new Date().toISOString();
    
    // Use chunked for the DB column name and chunked_at for timestamp
    const { data, error } = await supabase
      .from('documents')
      .update({ 
        chunked, 
        chunked_at: now 
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error(`[SupabaseStorage] Error updating document chunk status:`, error);
      return undefined;
    }
    
    if (!data) {
      console.error(`[SupabaseStorage] Document not found with ID: ${id}`);
      return undefined;
    }
    
    console.log(`[SupabaseStorage] Successfully updated document chunk status:`, data);
    return data as Document;
  }

  // Chunk operations
  async getChunks(documentId: string): Promise<Chunk[]> {
    console.log(`[SupabaseStorage] Getting chunks for document: ${documentId}`);
    
    const { data, error } = await supabase
      .from('chunks')
      .select('*')
      .eq('document_id', documentId);
    
    if (error) {
      console.error(`[SupabaseStorage] Error fetching chunks: ${error.message}`);
      throw new Error(`Failed to get chunks: ${error.message}`);
    }
    
    console.log(`[SupabaseStorage] Raw Supabase response for chunks:`, data);
    console.log(`[SupabaseStorage] Found ${data?.length || 0} chunks in database`);
    
    if (data && data.length > 0) {
      // Log details about each chunk's embedding status
      data.forEach((chunk, index) => {
        console.log(`[SupabaseStorage] Chunk ${index + 1}: ID=${chunk.id}, embedded=${chunk.embedded}, embedded_at=${chunk.embedded_at}`);
      });
    }
    
    // Transform snake_case to camelCase to match the Chunk interface
    const transformedChunks = (data || []).map(chunk => ({
      id: chunk.id,
      content: chunk.content,
      documentId: chunk.document_id,
      createdAt: chunk.created_at,
      embedded: chunk.embedded || false,
      embeddedAt: chunk.embedded_at,
      scope: chunk.scope || 'global',
      source: chunk.source || 'document'
    }));
    
    console.log(`[SupabaseStorage] Returning ${transformedChunks.length} transformed chunks`);
    return transformedChunks;
  }

  async createChunk(chunk: InsertChunk): Promise<Chunk> {
    // Convert from camelCase (memory) to snake_case (Supabase)
    const supabaseChunk = {
      document_id: chunk.documentId,
      content: chunk.content,
      scope: chunk.scope,
      source: chunk.source,
      embedded: false,
      embedded_at: null,
      created_at: new Date().toISOString()
    };
    
    console.log('[SupabaseStorage] Creating chunk with data:', supabaseChunk);
    
    const { data, error } = await supabase
      .from('chunks')
      .insert(supabaseChunk)
      .select()
      .single();
    
    if (error) {
      console.error('[SupabaseStorage] Error creating chunk:', error);
      throw new Error(`Failed to create chunk: ${error.message}`);
    }
    
    if (!data) {
      console.error('[SupabaseStorage] No data returned from chunk creation');
      throw new Error('No data returned from chunk creation');
    }
    
    console.log('[SupabaseStorage] Successfully created chunk:', data.id);
    return data as Chunk;
  }

  async getDocumentChunks(documentId: string, documentType: string): Promise<Chunk[]> {
    // In Supabase implementation, we're using the scope field as equivalent to documentType
    const { data, error } = await supabase
      .from('chunks')
      .select('*')
      .eq('document_id', documentId)
      .eq('scope', documentType);
    
    if (error) throw new Error(`Failed to get document chunks: ${error.message}`);
    return data as Chunk[];
  }
  
  async getUnembeddedChunks(limit: number = 100): Promise<Chunk[]> {
    console.log(`[SupabaseStorage] Fetching up to ${limit} unembedded chunks`);
    
    const { data, error } = await supabase
      .from('chunks')
      .select('*')
      .eq('embedded', false)
      .limit(limit);
      
    if (error) {
      console.log(`[SupabaseStorage] Error getting unembedded chunks: ${error.message}`);
      throw new Error(`Failed to get unembedded chunks: ${error.message}`);
    }
    
    console.log(`[SupabaseStorage] Found ${data?.length || 0} unembedded chunks`);
    return data as Chunk[];
  }
  
  async markChunkAsEmbedded(chunkId: string, embedded: boolean = true): Promise<boolean> {
    console.log(`[SupabaseStorage] Marking chunk ${chunkId} as embedded: ${embedded}`);
    
    const updateData: any = {
      embedded: embedded
    };
    
    if (embedded) {
      updateData.embedded_at = new Date().toISOString();
    } else {
      updateData.embedded_at = null;
    }
    
    const { data, error } = await supabase
      .from('chunks')
      .update(updateData)
      .eq('id', chunkId);
      
    if (error) {
      console.log(`[SupabaseStorage] Error updating chunk embedding status: ${error.message}`);
      return false;
    }
    
    return true;
  }

  // Compliance Mapping operations
  async getComplianceMappings(projectId: string): Promise<ComplianceMapping[]> {
    const { data, error } = await supabase
      .from('compliance_mappings')
      .select('*')
      .eq('project_id', projectId);
    
    if (error) throw new Error(`Failed to get compliance mappings: ${error.message}`);
    return data as ComplianceMapping[];
  }

  async createComplianceMapping(mapping: InsertComplianceMapping): Promise<ComplianceMapping> {
    const { data, error } = await supabase
      .from('compliance_mappings')
      .insert(mapping)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create compliance mapping: ${error.message}`);
    return data as ComplianceMapping;
  }

  // Compatibility methods to satisfy the IStorage interface
  // These methods are needed to fulfill the interface but will need to be adapted to work with our Supabase schema
  
  async getKnowledgeDocuments(): Promise<Document[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('approval_status', 'approved');
    
    if (error) throw new Error(`Failed to get knowledge documents: ${error.message}`);
    return data as Document[];
  }

  async createKnowledgeDocument(document: any): Promise<Document> {
    // First create the document with the basic fields
    const newDoc = await this.createDocument({
      name: document.name,
      fileUrl: document.filePath,
      uploadedBy: document.createdBy,
    });
    
    // Then set its approval status
    return this.updateDocumentApprovalStatus(newDoc.id, 'approved') as Promise<Document>;
  }

  async getSuggestedDocuments(): Promise<Document[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .is('approval_status', null);
    
    if (error) throw new Error(`Failed to get suggested documents: ${error.message}`);
    return data as Document[];
  }

  async createSuggestedDocument(document: any): Promise<Document> {
    return this.createDocument({
      name: document.name,
      fileUrl: document.filePath,
      uploadedBy: document.suggestedBy,
      // approval_status will be null by default
    });
  }

  async updateSuggestedDocumentStatus(id: string, status: 'approved' | 'rejected', reviewedBy: string): Promise<Document | undefined> {
    const now = new Date().toISOString();
    
    console.log(`[SupabaseStorage] Updating document ${id} status to: ${status} by user ${reviewedBy}`);
    
    const { data, error } = await supabase
      .from('documents')
      .update({ 
        approval_status: status,
        approval_status_modified_at: now,
        approval_status_modified_by: reviewedBy
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error(`[SupabaseStorage] Error updating document status:`, error);
      return undefined;
    }
    
    if (!data) {
      console.error(`[SupabaseStorage] Document not found with ID: ${id}`);
      return undefined;
    }
    
    console.log(`[SupabaseStorage] Successfully updated document status:`, data);
    return data as Document;
  }

  // Feedback operations
  async createFeedback(feedback: InsertFeedback): Promise<Feedback> {
    const { data, error } = await supabase
      .from('feedbacks')
      .insert({
        content: feedback.content,
        uploaded_by: feedback.uploadedBy
      })
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create feedback: ${error.message}`);
    
    // Map the response back to camelCase for consistency
    return {
      id: data.id,
      uploadedBy: data.uploaded_by,
      content: data.content,
      createdAt: data.created_at
    } as Feedback;
  }

  async getFeedbacks(): Promise<Feedback[]> {
    const { data, error } = await supabase
      .from('feedbacks')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw new Error(`Failed to get feedbacks: ${error.message}`);
    return data as Feedback[];
  }

  // Answer Feedback operations
  async getAnswerFeedback(rfpAnswerId: string): Promise<AnswerFeedback | undefined> {
    const { data, error } = await supabase
      .from('answer_feedbacks')
      .select('*')
      .eq('rfp_answer_id', rfpAnswerId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return undefined;
      }
      throw new Error(`Failed to get answer feedback: ${error.message}`);
    }
    
    // Transform snake_case to camelCase
    return {
      id: data.id,
      rfpAnswerId: data.rfp_answer_id,
      rating: data.rating,
      feedbackText: data.feedback_text,
      createdBy: data.created_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    } as AnswerFeedback;
  }

  async createAnswerFeedback(feedback: InsertAnswerFeedback): Promise<AnswerFeedback> {
    // Transform camelCase to snake_case for database
    const insertData = {
      rfp_answer_id: feedback.rfpAnswerId,
      rating: feedback.rating,
      feedback_text: feedback.feedbackText,
      created_by: feedback.createdBy
    };

    const { data, error } = await supabase
      .from('answer_feedbacks')
      .insert(insertData)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create answer feedback: ${error.message}`);
    
    // Transform snake_case to camelCase
    return {
      id: data.id,
      rfpAnswerId: data.rfp_answer_id,
      rating: data.rating,
      feedbackText: data.feedback_text,
      createdBy: data.created_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    } as AnswerFeedback;
  }

  async updateAnswerFeedback(feedback: UpdateAnswerFeedback): Promise<AnswerFeedback | undefined> {
    // Transform camelCase to snake_case for database
    const updateData: any = {};
    
    if (feedback.rating !== undefined) {
      updateData.rating = feedback.rating;
    }
    if (feedback.feedbackText !== undefined) {
      updateData.feedback_text = feedback.feedbackText;
    }

    const { data, error } = await supabase
      .from('answer_feedbacks')
      .update(updateData)
      .eq('id', feedback.id)
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return undefined;
      }
      throw new Error(`Failed to update answer feedback: ${error.message}`);
    }
    
    // Transform snake_case to camelCase
    return {
      id: data.id,
      rfpAnswerId: data.rfp_answer_id,
      rating: data.rating,
      feedbackText: data.feedback_text,
      createdBy: data.created_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    } as AnswerFeedback;
  }

  async getAllAnswerFeedbacks(): Promise<any[]> {
    // Use raw SQL query to avoid Supabase relationship conflicts
    const { data, error } = await supabase.rpc('get_answer_feedbacks_with_details');
    
    if (error) {
      // Fallback to simpler query if RPC doesn't exist
      console.log("RPC not found, using fallback query");
      const { data: feedbacks, error: feedbackError } = await supabase
        .from('answer_feedbacks')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (feedbackError) throw new Error(`Failed to get answer feedbacks: ${feedbackError.message}`);
      
      // Get additional data for each feedback
      const enrichedFeedbacks = await Promise.all(
        feedbacks.map(async (feedback: any) => {
          // Get answer details
          const { data: answer } = await supabase
            .from('rfp_answers')
            .select('generated_answer, compliance_answer, question_text')
            .eq('id', feedback.rfp_answer_id)
            .single();
          
          // Get user details
          const { data: user } = await supabase
            .from('users')
            .select('email')
            .eq('id', feedback.created_by)
            .single();
          
          return {
            ...feedback,
            generated_answer: answer?.generated_answer,
            compliance_answer: answer?.compliance_answer,
            question: answer?.question_text,
            user_email: user?.email
          };
        })
      );
      
      return enrichedFeedbacks;
    }
    
    return data || [];
  }

  async deleteAnswerFeedback(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('answer_feedbacks')
      .delete()
      .eq('id', id);
    
    if (error) throw new Error(`Failed to delete answer feedback: ${error.message}`);
    return true;
  }
}

// Special patched method that will get a document with its answers in one query
async function getRfpDocumentWithAnswers(documentId: string): Promise<{ document: any, questionsWithAnswers: any[] }> {
  console.log(`[SupabaseStorage] PATCHED: Getting RFP document with ID: ${documentId} WITH ANSWERS`);
  
  // Get document
  const { data: document, error: docError } = await supabase
    .from('rfp_documents')
    .select('*')
    .eq('id', documentId)
    .single();
  
  if (docError || !document) {
    console.log(`[SupabaseStorage] PATCHED: Error fetching document:`, docError);
    throw new Error(`Failed to get RFP document: ${docError?.message || 'Document not found'}`);
  }
  
  // Get answers directly from the answers table
  const { data: answers, error: answersError } = await supabase
    .from('rfp_answers')
    .select('*')
    .eq('rfp_document_id', documentId);
  
  if (answersError) {
    console.log(`[SupabaseStorage] PATCHED: Error fetching answers:`, answersError);
    throw new Error(`Failed to get RFP answers: ${answersError.message}`);
  }
  
  console.log(`[SupabaseStorage] PATCHED: Found ${answers?.length || 0} answers for document`);
  
  // Transform the data for the frontend
  const questionsWithAnswers = (answers || []).map((answer) => {
    return {
      id: answer.rfp_question_id,
      rfpDocumentId: answer.rfp_document_id,
      questionText: answer.question_text,
      answer: {
        id: answer.id,
        rfpQuestionId: answer.rfp_question_id,
        complianceAnswer: answer.compliance_answer,
        generatedAnswer: answer.generated_answer,
        // finalAnswer removed as it doesn't exist in the database
        lastReviewedBy: answer.last_reviewed_by,
        lastReviewedAt: answer.last_reviewed_at
      }
    };
  });
  
  console.log(`[SupabaseStorage] PATCHED: Returning document with ${questionsWithAnswers.length} answers`);
  
  return {
    document,
    questionsWithAnswers
  };
}

// Patch the routes module directly for the specific endpoint
import { registerRoutes as originalRegisterRoutes } from './routes';
import { Express, Request, Response } from 'express';
import { Server } from 'http';

// Override the registerRoutes function to patch our specific endpoint
export async function registerRoutes(app: Express): Promise<Server> {
  const server = await originalRegisterRoutes(app);
  
  // Get ready for our new route
  const apiPrefix = '/api';
  const targetRoutePath = '/projects/:projectId/rfp-documents/:documentId';
  
  console.log(`[PATCH] Attempting to patch routes for ${apiPrefix}${targetRoutePath}`);
  
  // Add our patched handler
  app.get(`${apiPrefix}${targetRoutePath}`, async (req: Request, res: Response) => {
    try {
      console.log(`[PATCHED HANDLER] Getting document with ID: ${req.params.documentId}`);
      
      const result = await getRfpDocumentWithAnswers(req.params.documentId);
      console.log(`[PATCHED HANDLER] Successfully got document with answers`);
      
      return res.status(200).json(result);
    } catch (error) {
      console.log(`[PATCHED HANDLER] Error:`, error);
      return res.status(500).json({ message: `Internal server error: ${(error as Error).message}` });
    }
  });
  
  console.log(`[PATCH] Successfully patched routes`);
  
  return server;
}

// Export the original storage instance for other parts of the app
export const storage = new SupabaseStorage();