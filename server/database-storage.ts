/**
 * DatabaseStorage - PostgreSQL implementation of the IStorage interface
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
  UpdateRfpAnswer,
  users, projects, projectPermissions, rfpDocuments, 
  rfpQuestions, rfpAnswers, documents, chunks, complianceMappings
} from "@shared/schema";
import { db } from './db';
import { eq, and, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { IStorage } from './storage';

// Database implementation of the storage interface
export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        id: uuidv4(),
        ...insertUser
      })
      .returning();
    return user;
  }

  // Project operations
  async getProjects(): Promise<Project[]> {
    return db.select().from(projects);
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const [project] = await db
      .insert(projects)
      .values({
        id: uuidv4(),
        ...insertProject
      })
      .returning();
    return project;
  }

  async getProjectsByUserId(userId: string): Promise<Project[]> {
    const permissions = await db
      .select()
      .from(projectPermissions)
      .where(eq(projectPermissions.userId, userId));
    
    const projectIds = permissions.map(p => p.projectId);
    
    if (projectIds.length === 0) {
      return [];
    }
    
    const conditions = projectIds.map(id => eq(projects.id, id));
    
    return db
      .select()
      .from(projects)
      .where(or(...conditions));
  }

  // Project Permission operations
  async getProjectMembers(projectId: string): Promise<ProjectPermission[]> {
    return db
      .select()
      .from(projectPermissions)
      .where(eq(projectPermissions.projectId, projectId));
  }

  async addProjectMember(insertProjectMember: InsertProjectPermission): Promise<ProjectPermission> {
    const [permission] = await db
      .insert(projectPermissions)
      .values({
        id: uuidv4(),
        ...insertProjectMember
      })
      .returning();
    return permission;
  }

  async updateProjectMemberRole(id: string, role: string): Promise<ProjectPermission | undefined> {
    const [permission] = await db
      .update(projectPermissions)
      .set({ role })
      .where(eq(projectPermissions.id, id))
      .returning();
    return permission;
  }

  // RFP Document operations
  async getRfpDocuments(projectId: string): Promise<RfpDocument[]> {
    return db
      .select()
      .from(rfpDocuments)
      .where(eq(rfpDocuments.projectId, projectId));
  }

  async getRfpDocument(id: string): Promise<RfpDocument | undefined> {
    const [document] = await db
      .select()
      .from(rfpDocuments)
      .where(eq(rfpDocuments.id, id));
    return document;
  }

  async createRfpDocument(insertDocument: InsertRfpDocument): Promise<RfpDocument> {
    const [document] = await db
      .insert(rfpDocuments)
      .values({
        id: uuidv4(),
        ...insertDocument
      })
      .returning();
    return document;
  }

  async updateRfpDocumentStatus(id: string, status: string): Promise<RfpDocument | undefined> {
    const [document] = await db
      .update(rfpDocuments)
      .set({ status })
      .where(eq(rfpDocuments.id, id))
      .returning();
    return document;
  }

  async getAllRfpDocuments(): Promise<RfpDocument[]> {
    return db.select().from(rfpDocuments);
  }

  async updateRfpDocumentApprovalStatus(id: string, status: string): Promise<RfpDocument | undefined> {
    const now = new Date();
    const [document] = await db
      .update(rfpDocuments)
      .set({ 
        approvalStatus: status,
        approvalStatusModifiedAt: now
      })
      .where(eq(rfpDocuments.id, id))
      .returning();
    return document;
  }

  // RFP Question operations
  async getRfpQuestions(documentId: string): Promise<RfpQuestion[]> {
    return db
      .select()
      .from(rfpQuestions)
      .where(eq(rfpQuestions.rfpDocumentId, documentId));
  }

  async createRfpQuestion(insertQuestion: InsertRfpQuestion): Promise<RfpQuestion> {
    const [question] = await db
      .insert(rfpQuestions)
      .values({
        id: uuidv4(),
        ...insertQuestion
      })
      .returning();
    return question;
  }

  // RFP Answer operations
  async getRfpAnswers(questionIds: string[]): Promise<RfpAnswer[]> {
    if (questionIds.length === 0) {
      return [];
    }
    
    const conditions = questionIds.map(id => eq(rfpAnswers.rfpQuestionId, id));
    
    return db
      .select()
      .from(rfpAnswers)
      .where(or(...conditions));
  }

  async createRfpAnswer(insertAnswer: InsertRfpAnswer): Promise<RfpAnswer> {
    const [answer] = await db
      .insert(rfpAnswers)
      .values({
        id: uuidv4(),
        ...insertAnswer
      })
      .returning();
    return answer;
  }

  async updateRfpAnswer(updateAnswer: UpdateRfpAnswer): Promise<RfpAnswer | undefined> {
    const [answer] = await db
      .update(rfpAnswers)
      .set(updateAnswer)
      .where(eq(rfpAnswers.id, updateAnswer.id))
      .returning();
    return answer;
  }

  // Document operations
  async getDocuments(): Promise<Document[]> {
    return db.select().from(documents);
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, id));
    return document;
  }

  async createDocument(insertDocument: InsertDocument): Promise<Document> {
    const [document] = await db
      .insert(documents)
      .values({
        id: uuidv4(),
        ...insertDocument
      })
      .returning();
    return document;
  }

  async updateDocumentApprovalStatus(id: string, approved: boolean): Promise<Document | undefined> {
    console.log(`Updating document approval status: ${id} to ${approved ? 'approved' : 'rejected'}`);
    const now = new Date();
    try {
      const [document] = await db
        .update(documents)
        .set({ 
          approvalStatus: approved ? 'approved' : 'rejected',
          approvalStatusModifiedAt: now 
        })
        .where(eq(documents.id, id))
        .returning();
      console.log('Updated document:', document);
      return document;
    } catch (error) {
      console.error('Error updating document approval status:', error);
      throw error;
    }
  }

  async updateDocumentChunkStatus(id: string, chunked: boolean): Promise<Document | undefined> {
    const now = new Date();
    const [document] = await db
      .update(documents)
      .set({ 
        chunked,
        chunkedAt: chunked ? now : null 
      })
      .where(eq(documents.id, id))
      .returning();
    return document;
  }

  // Chunk operations
  async getChunks(documentId: string): Promise<Chunk[]> {
    return db
      .select()
      .from(chunks)
      .where(eq(chunks.documentId, documentId));
  }

  async createChunk(insertChunk: InsertChunk): Promise<Chunk> {
    const [chunk] = await db
      .insert(chunks)
      .values({
        id: uuidv4(),
        ...insertChunk
      })
      .returning();
    return chunk;
  }

  async getDocumentChunks(documentId: string, documentType: string): Promise<Chunk[]> {
    return this.getChunks(documentId);
  }

  // Compliance Mapping operations
  async getComplianceMappings(projectId: string): Promise<ComplianceMapping[]> {
    return db
      .select()
      .from(complianceMappings)
      .where(eq(complianceMappings.projectId, projectId));
  }

  async createComplianceMapping(mapping: InsertComplianceMapping): Promise<ComplianceMapping> {
    const [complianceMapping] = await db
      .insert(complianceMappings)
      .values(mapping)
      .returning();
    return complianceMapping;
  }

  // Compatibility methods
  async getKnowledgeDocuments(): Promise<Document[]> {
    return this.getDocuments();
  }

  async createKnowledgeDocument(document: any): Promise<Document> {
    return this.createDocument(document);
  }

  async getSuggestedDocuments(): Promise<Document[]> {
    return this.getDocuments();
  }

  async createSuggestedDocument(document: any): Promise<Document> {
    return this.createDocument(document);
  }

  async updateSuggestedDocumentStatus(id: string, status: 'approved' | 'rejected', reviewedBy: string): Promise<Document | undefined> {
    const now = new Date();
    const [document] = await db
      .update(documents)
      .set({ 
        approvalStatus: status,
        approvalStatusModifiedBy: reviewedBy,
        approvalStatusModifiedAt: now 
      })
      .where(eq(documents.id, id))
      .returning();
    return document;
  }
}