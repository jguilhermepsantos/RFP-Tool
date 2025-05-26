/**
 * SupabaseOnlyStorage - Complete Supabase implementation of the IStorage interface
 * All operations use Supabase exclusively
 */
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
  UpdateRfpAnswer
} from "@shared/schema";
import { supabase } from './db';
import { v4 as uuidv4 } from 'uuid';
import { IStorage } from './storage';

export class SupabaseOnlyStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching user from Supabase:', error);
      throw new Error(`Failed to fetch user: ${error.message}`);
    }
    
    return data || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching user by email from Supabase:', error);
      throw new Error(`Failed to fetch user by email: ${error.message}`);
    }
    
    return data || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .insert(insertUser)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating user in Supabase:', error);
      throw new Error(`Failed to create user: ${error.message}`);
    }
    
    return data;
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
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching projects from Supabase:', error);
      throw new Error(`Failed to fetch projects: ${error.message}`);
    }
    
    return data || [];
  }

  async getProject(id: string): Promise<Project | undefined> {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching project from Supabase:', error);
      throw new Error(`Failed to fetch project: ${error.message}`);
    }
    
    return data || undefined;
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const { data, error } = await supabase
      .from('projects')
      .insert(insertProject)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating project in Supabase:', error);
      throw new Error(`Failed to create project: ${error.message}`);
    }
    
    return data;
  }

  async getProjectsByUserId(userId: string): Promise<Project[]> {
    const { data, error } = await supabase
      .from('project_permissions')
      .select(`
        projects (*)
      `)
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error fetching projects by user from Supabase:', error);
      throw new Error(`Failed to fetch projects by user: ${error.message}`);
    }
    
    return data?.map(item => item.projects).filter(Boolean) || [];
  }

  // Project Permission operations
  async getProjectMembers(projectId: string): Promise<ProjectPermission[]> {
    const { data, error } = await supabase
      .from('project_permissions')
      .select('*')
      .eq('project_id', projectId);
    
    if (error) {
      console.error('Error fetching project members from Supabase:', error);
      throw new Error(`Failed to fetch project members: ${error.message}`);
    }
    
    return data || [];
  }

  async addProjectMember(insertProjectMember: InsertProjectPermission): Promise<ProjectPermission> {
    const { data, error } = await supabase
      .from('project_permissions')
      .insert(insertProjectMember)
      .select()
      .single();
    
    if (error) {
      console.error('Error adding project member in Supabase:', error);
      throw new Error(`Failed to add project member: ${error.message}`);
    }
    
    return data;
  }

  async updateProjectMemberRole(id: string, role: string): Promise<ProjectPermission | undefined> {
    const { data, error } = await supabase
      .from('project_permissions')
      .update({ role })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating project member role in Supabase:', error);
      throw new Error(`Failed to update project member role: ${error.message}`);
    }
    
    return data || undefined;
  }

  // RFP Document operations
  async getRfpDocuments(projectId: string): Promise<RfpDocument[]> {
    const { data, error } = await supabase
      .from('rfp_documents')
      .select('*')
      .eq('project_id', projectId)
      .order('uploaded_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching RFP documents from Supabase:', error);
      throw new Error(`Failed to fetch RFP documents: ${error.message}`);
    }
    
    return data || [];
  }

  async getRfpDocument(id: string): Promise<RfpDocument | undefined> {
    const { data, error } = await supabase
      .from('rfp_documents')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching RFP document from Supabase:', error);
      throw new Error(`Failed to fetch RFP document: ${error.message}`);
    }
    
    return data || undefined;
  }

  async createRfpDocument(insertDocument: InsertRfpDocument): Promise<RfpDocument> {
    const { data, error } = await supabase
      .from('rfp_documents')
      .insert(insertDocument)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating RFP document in Supabase:', error);
      throw new Error(`Failed to create RFP document: ${error.message}`);
    }
    
    return data;
  }

  async updateRfpDocumentStatus(id: string, status: string): Promise<RfpDocument | undefined> {
    const { data, error } = await supabase
      .from('rfp_documents')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating RFP document status in Supabase:', error);
      throw new Error(`Failed to update RFP document status: ${error.message}`);
    }
    
    return data || undefined;
  }

  async getAllRfpDocuments(): Promise<RfpDocument[]> {
    const { data, error } = await supabase
      .from('rfp_documents')
      .select('*')
      .order('uploaded_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching all RFP documents from Supabase:', error);
      throw new Error(`Failed to fetch all RFP documents: ${error.message}`);
    }
    
    return data || [];
  }

  async updateRfpDocumentApprovalStatus(id: string, status: string): Promise<RfpDocument | undefined> {
    const { data, error } = await supabase
      .from('rfp_documents')
      .update({ 
        approval_status: status,
        approval_status_modified_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating RFP document approval status in Supabase:', error);
      throw new Error(`Failed to update RFP document approval status: ${error.message}`);
    }
    
    return data || undefined;
  }

  // RFP Question operations
  async getRfpQuestions(documentId: string): Promise<RfpQuestion[]> {
    const { data, error } = await supabase
      .from('rfp_questions')
      .select('*')
      .eq('rfp_document_id', documentId)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching RFP questions from Supabase:', error);
      throw new Error(`Failed to fetch RFP questions: ${error.message}`);
    }
    
    return data || [];
  }

  async createRfpQuestion(insertQuestion: InsertRfpQuestion): Promise<RfpQuestion> {
    const { data, error } = await supabase
      .from('rfp_questions')
      .insert(insertQuestion)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating RFP question in Supabase:', error);
      throw new Error(`Failed to create RFP question: ${error.message}`);
    }
    
    return data;
  }

  // RFP Answer operations
  async getRfpAnswers(questionIds: string[]): Promise<RfpAnswer[]> {
    const { data, error } = await supabase
      .from('rfp_answers')
      .select('*')
      .in('question_id', questionIds);
    
    if (error) {
      console.error('Error fetching RFP answers from Supabase:', error);
      throw new Error(`Failed to fetch RFP answers: ${error.message}`);
    }
    
    return data || [];
  }

  async getRfpAnswersByDocumentId(rfpDocumentId: string): Promise<RfpAnswer[]> {
    const { data, error } = await supabase
      .from('rfp_answers')
      .select(`
        *,
        rfp_questions!inner(rfp_document_id)
      `)
      .eq('rfp_questions.rfp_document_id', rfpDocumentId);
    
    if (error) {
      console.error('Error fetching RFP answers by document from Supabase:', error);
      throw new Error(`Failed to fetch RFP answers by document: ${error.message}`);
    }
    
    return data || [];
  }

  async createRfpAnswer(insertAnswer: InsertRfpAnswer): Promise<RfpAnswer> {
    const { data, error } = await supabase
      .from('rfp_answers')
      .insert(insertAnswer)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating RFP answer in Supabase:', error);
      throw new Error(`Failed to create RFP answer: ${error.message}`);
    }
    
    return data;
  }

  async updateRfpAnswer(updateAnswer: UpdateRfpAnswer): Promise<RfpAnswer | undefined> {
    const { data, error } = await supabase
      .from('rfp_answers')
      .update({
        generated_answer: updateAnswer.generatedAnswer,
        compliance_answer: updateAnswer.complianceAnswer,
        last_reviewed_by: updateAnswer.lastReviewedBy,
        last_reviewed_at: updateAnswer.lastReviewedAt ? new Date(updateAnswer.lastReviewedAt).toISOString() : null
      })
      .eq('id', updateAnswer.id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating RFP answer in Supabase:', error);
      throw new Error(`Failed to update RFP answer: ${error.message}`);
    }
    
    return data || undefined;
  }

  // Document operations
  async getDocuments(): Promise<Document[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('uploaded_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching documents from Supabase:', error);
      throw new Error(`Failed to fetch documents: ${error.message}`);
    }
    
    return data || [];
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching document from Supabase:', error);
      throw new Error(`Failed to fetch document: ${error.message}`);
    }
    
    return data || undefined;
  }

  async createDocument(insertDocument: InsertDocument): Promise<Document> {
    const { data, error } = await supabase
      .from('documents')
      .insert(insertDocument)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating document in Supabase:', error);
      throw new Error(`Failed to create document: ${error.message}`);
    }
    
    return data;
  }

  async updateDocumentApprovalStatus(id: string, approved: boolean): Promise<Document | undefined> {
    const { data, error } = await supabase
      .from('documents')
      .update({ 
        approved,
        approval_status_modified_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating document approval status in Supabase:', error);
      throw new Error(`Failed to update document approval status: ${error.message}`);
    }
    
    return data || undefined;
  }

  async updateDocumentChunkStatus(id: string, chunked: boolean): Promise<Document | undefined> {
    const { data, error } = await supabase
      .from('documents')
      .update({ chunked })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating document chunk status in Supabase:', error);
      throw new Error(`Failed to update document chunk status: ${error.message}`);
    }
    
    return data || undefined;
  }

  // Chunk operations
  async getChunks(documentId: string): Promise<Chunk[]> {
    const { data, error } = await supabase
      .from('chunks')
      .select('*')
      .eq('document_id', documentId)
      .order('chunk_index', { ascending: true });
    
    if (error) {
      console.error('Error fetching chunks from Supabase:', error);
      throw new Error(`Failed to fetch chunks: ${error.message}`);
    }
    
    return data || [];
  }

  async createChunk(insertChunk: InsertChunk): Promise<Chunk> {
    const { data, error } = await supabase
      .from('chunks')
      .insert(insertChunk)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating chunk in Supabase:', error);
      throw new Error(`Failed to create chunk: ${error.message}`);
    }
    
    return data;
  }

  async getDocumentChunks(documentId: string, documentType: string): Promise<Chunk[]> {
    const { data, error } = await supabase
      .from('chunks')
      .select('*')
      .eq('document_id', documentId)
      .eq('document_type', documentType)
      .order('chunk_index', { ascending: true });
    
    if (error) {
      console.error('Error fetching document chunks from Supabase:', error);
      throw new Error(`Failed to fetch document chunks: ${error.message}`);
    }
    
    return data || [];
  }

  async getUnembeddedChunks(limit: number = 100): Promise<Chunk[]> {
    const { data, error } = await supabase
      .from('chunks')
      .select('*')
      .eq('embedded', false)
      .limit(limit)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching unembedded chunks from Supabase:', error);
      throw new Error(`Failed to fetch unembedded chunks: ${error.message}`);
    }
    
    return data || [];
  }

  async markChunkAsEmbedded(chunkId: string): Promise<boolean> {
    const { error } = await supabase
      .from('chunks')
      .update({ 
        embedded: true,
        embedded_at: new Date().toISOString()
      })
      .eq('id', chunkId);
    
    if (error) {
      console.error('Error marking chunk as embedded in Supabase:', error);
      throw new Error(`Failed to mark chunk as embedded: ${error.message}`);
    }
    
    return true;
  }

  // Compliance Mapping operations
  async getComplianceMappings(projectId: string): Promise<ComplianceMapping[]> {
    const { data, error } = await supabase
      .from('compliance_mappings')
      .select('*')
      .eq('project_id', projectId);
    
    if (error) {
      console.error('Error fetching compliance mappings from Supabase:', error);
      throw new Error(`Failed to fetch compliance mappings: ${error.message}`);
    }
    
    return data || [];
  }

  async createComplianceMapping(mapping: InsertComplianceMapping): Promise<ComplianceMapping> {
    const { data, error } = await supabase
      .from('compliance_mappings')
      .insert(mapping)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating compliance mapping in Supabase:', error);
      throw new Error(`Failed to create compliance mapping: ${error.message}`);
    }
    
    return data;
  }

  // Compatibility methods
  async getKnowledgeDocuments(): Promise<Document[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('document_type', 'knowledge')
      .order('uploaded_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching knowledge documents from Supabase:', error);
      throw new Error(`Failed to fetch knowledge documents: ${error.message}`);
    }
    
    return data || [];
  }

  async createKnowledgeDocument(document: any): Promise<Document> {
    const insertDocument = {
      ...document,
      document_type: 'knowledge'
    };
    
    const { data, error } = await supabase
      .from('documents')
      .insert(insertDocument)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating knowledge document in Supabase:', error);
      throw new Error(`Failed to create knowledge document: ${error.message}`);
    }
    
    return data;
  }

  async getSuggestedDocuments(): Promise<Document[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('document_type', 'suggested')
      .order('uploaded_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching suggested documents from Supabase:', error);
      throw new Error(`Failed to fetch suggested documents: ${error.message}`);
    }
    
    return data || [];
  }

  async createSuggestedDocument(document: any): Promise<Document> {
    const insertDocument = {
      ...document,
      document_type: 'suggested'
    };
    
    const { data, error } = await supabase
      .from('documents')
      .insert(insertDocument)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating suggested document in Supabase:', error);
      throw new Error(`Failed to create suggested document: ${error.message}`);
    }
    
    return data;
  }

  async updateSuggestedDocumentStatus(id: string, status: 'approved' | 'rejected', reviewedBy: string): Promise<Document | undefined> {
    const { data, error } = await supabase
      .from('documents')
      .update({ 
        status,
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating suggested document status in Supabase:', error);
      throw new Error(`Failed to update suggested document status: ${error.message}`);
    }
    
    return data || undefined;
  }
}