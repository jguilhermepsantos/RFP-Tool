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
    const { data, error } = await supabase
      .from('rfp_documents')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) return undefined;
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
    const { data, error } = await supabase
      .from('rfp_documents')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
    
    if (error || !data) return undefined;
    return data as RfpDocument;
  }
  
  // RFP Question operations
  async getRfpQuestions(documentId: string): Promise<RfpQuestion[]> {
    const { data, error } = await supabase
      .from('rfp_questions')
      .select('*')
      .eq('rfp_document_id', documentId);
    
    if (error) throw new Error(`Failed to get RFP questions: ${error.message}`);
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
    const { data, error } = await supabase
      .from('rfp_answers')
      .select('*')
      .in('rfp_question_id', questionIds);
    
    if (error) throw new Error(`Failed to get RFP answers: ${error.message}`);
    return data as RfpAnswer[];
  }
  
  async getRfpAnswersByDocumentId(documentId: string): Promise<RfpAnswer[]> {
    const { data, error } = await supabase
      .from('rfp_answers')
      .select('*')
      .eq('rfp_document_id', documentId);
    
    if (error) throw new Error(`Failed to get RFP answers for document: ${error.message}`);
    return data as RfpAnswer[];
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
    const { data, error } = await supabase
      .from('rfp_answers')
      .update({ 
        compliance_answer: answer.complianceAnswer,
        generated_answer: answer.generatedAnswer,
        final_answer: answer.finalAnswer
      })
      .eq('id', answer.id)
      .select()
      .single();
    
    if (error || !data) return undefined;
    return data as RfpAnswer;
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

  async updateDocumentApprovalStatus(id: string, approved: boolean): Promise<Document | undefined> {
    const { data, error } = await supabase
      .from('documents')
      .update({ approved })
      .eq('id', id)
      .select()
      .single();
    
    if (error || !data) return undefined;
    return data as Document;
  }

  // Chunk operations
  async getChunks(documentId: string): Promise<Chunk[]> {
    const { data, error } = await supabase
      .from('chunks')
      .select('*')
      .eq('document_id', documentId);
    
    if (error) throw new Error(`Failed to get chunks: ${error.message}`);
    return data as Chunk[];
  }

  async createChunk(chunk: InsertChunk): Promise<Chunk> {
    const { data, error } = await supabase
      .from('chunks')
      .insert(chunk)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create chunk: ${error.message}`);
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
      .eq('approved', true);
    
    if (error) throw new Error(`Failed to get knowledge documents: ${error.message}`);
    return data as Document[];
  }

  async createKnowledgeDocument(document: any): Promise<Document> {
    return this.createDocument({
      name: document.name,
      fileUrl: document.filePath,
      uploadedBy: document.createdBy,
      approved: true,
    });
  }

  async getSuggestedDocuments(): Promise<Document[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .is('approved', null);
    
    if (error) throw new Error(`Failed to get suggested documents: ${error.message}`);
    return data as Document[];
  }

  async createSuggestedDocument(document: any): Promise<Document> {
    return this.createDocument({
      name: document.name,
      fileUrl: document.filePath,
      uploadedBy: document.suggestedBy,
      approved: null,
    });
  }

  async updateSuggestedDocumentStatus(id: string, status: 'approved' | 'rejected', reviewedBy: string): Promise<Document | undefined> {
    const approved = status === 'approved';
    
    const { data, error } = await supabase
      .from('documents')
      .update({ 
        approved,
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error || !data) return undefined;
    return data as Document;
  }
}

export const storage = new SupabaseStorage();