import { users, type User, type InsertUser } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { IStorage } from "./storage";
import { 
  projects, 
  projectPermissions, 
  rfpDocuments, 
  rfpQuestions, 
  rfpAnswers, 
  documents, 
  chunks, 
  complianceMappings,
  type Project,
  type InsertProject,
  type ProjectPermission,
  type InsertProjectPermission,
  type RfpDocument,
  type InsertRfpDocument,
  type RfpQuestion,
  type InsertRfpQuestion,
  type RfpAnswer,
  type InsertRfpAnswer,
  type Document,
  type InsertDocument,
  type Chunk,
  type InsertChunk,
  type ComplianceMapping,
  type InsertComplianceMapping
} from "@shared/schema";

// Implement IStorage using Drizzle ORM
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
      .values(insertUser)
      .returning();
    return user;
  }
  
  // Project operations
  async getProjects(): Promise<Project[]> {
    return await db.select().from(projects);
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const [project] = await db
      .insert(projects)
      .values(insertProject)
      .returning();
    return project;
  }

  async getProjectsByUserId(userId: string): Promise<Project[]> {
    // Get all projects where user is a member with any role
    const permissions = await db.select()
      .from(projectPermissions)
      .where(eq(projectPermissions.userId, userId));
    
    if (permissions.length === 0) {
      return [];
    }
    
    const projectIds = permissions.map(p => p.projectId);
    
    // Get the actual projects
    const projectList = await db.select()
      .from(projects)
      .where(
        // This would filter by projectIds when we switch to an in() operator
        // Right now just return all projects, we'll filter in memory
        // This is just a placeholder until we implement proper SQL queries
        projects.id !== null 
      );
    
    const validIds = new Set(projectIds.filter(id => id !== null) as string[]);
    return projectList.filter(project => validIds.has(project.id));
  }
  
  // Project Permission operations
  async getProjectMembers(projectId: string): Promise<ProjectPermission[]> {
    return await db.select()
      .from(projectPermissions)
      .where(eq(projectPermissions.projectId, projectId));
  }

  async addProjectMember(projectMember: InsertProjectPermission): Promise<ProjectPermission> {
    const [member] = await db
      .insert(projectPermissions)
      .values(projectMember)
      .returning();
    return member;
  }

  async updateProjectMemberRole(id: string, role: string): Promise<ProjectPermission | undefined> {
    const [member] = await db
      .update(projectPermissions)
      .set({ role })
      .where(eq(projectPermissions.id, id))
      .returning();
    return member;
  }
  
  // RFP Document operations
  async getRfpDocuments(projectId: string): Promise<RfpDocument[]> {
    return await db.select()
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

  async createRfpDocument(document: InsertRfpDocument): Promise<RfpDocument> {
    const [rfpDoc] = await db
      .insert(rfpDocuments)
      .values(document)
      .returning();
    return rfpDoc;
  }

  async updateRfpDocumentStatus(id: string, status: string): Promise<RfpDocument | undefined> {
    const [document] = await db
      .update(rfpDocuments)
      .set({ status })
      .where(eq(rfpDocuments.id, id))
      .returning();
    return document;
  }
  
  // RFP Question operations
  async getRfpQuestions(documentId: string): Promise<RfpQuestion[]> {
    return await db
      .select()
      .from(rfpQuestions)
      .where(eq(rfpQuestions.rfpDocumentId, documentId));
  }

  async createRfpQuestion(question: InsertRfpQuestion): Promise<RfpQuestion> {
    const [rfpQuestion] = await db
      .insert(rfpQuestions)
      .values(question)
      .returning();
    return rfpQuestion;
  }
  
  // RFP Answer operations
  async getRfpAnswers(questionIds: string[]): Promise<RfpAnswer[]> {
    // TODO: Implement proper IN query when available
    // For now we'll filter after fetching all answers related to these questions
    const answers = await db.select().from(rfpAnswers);
    
    return answers.filter(answer => {
      return answer.rfpQuestionId !== null && 
        questionIds.includes(answer.rfpQuestionId);
    });
  }

  async createRfpAnswer(answer: InsertRfpAnswer): Promise<RfpAnswer> {
    const [rfpAnswer] = await db
      .insert(rfpAnswers)
      .values(answer)
      .returning();
    return rfpAnswer;
  }

  async updateRfpAnswer(answer: { id: string, complianceAnswer?: string, generatedAnswer?: string, finalAnswer?: string, lastReviewedBy?: string }): Promise<RfpAnswer | undefined> {
    const { id, ...updateData } = answer;
    const [updatedAnswer] = await db
      .update(rfpAnswers)
      .set({
        ...updateData,
        lastReviewedAt: new Date()
      })
      .where(eq(rfpAnswers.id, id))
      .returning();
    return updatedAnswer;
  }
  
  // Document operations
  async getDocuments(): Promise<Document[]> {
    return await db.select().from(documents);
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, id));
    return document;
  }

  async createDocument(document: InsertDocument): Promise<Document> {
    const [newDocument] = await db
      .insert(documents)
      .values(document)
      .returning();
    return newDocument;
  }

  async updateDocumentApprovalStatus(id: string, approved: boolean): Promise<Document | undefined> {
    const [document] = await db
      .update(documents)
      .set({ approved })
      .where(eq(documents.id, id))
      .returning();
    return document;
  }
  
  // Chunk operations
  async getChunks(documentId: string): Promise<Chunk[]> {
    return await db
      .select()
      .from(chunks)
      .where(eq(chunks.documentId, documentId));
  }

  async createChunk(chunk: InsertChunk): Promise<Chunk> {
    const [newChunk] = await db
      .insert(chunks)
      .values(chunk)
      .returning();
    return newChunk;
  }

  async getDocumentChunks(documentId: string, documentType: string): Promise<Chunk[]> {
    // For now, we don't filter by document type since that would need a join
    // This would need to be implemented when proper joins are available
    return await db
      .select()
      .from(chunks)
      .where(eq(chunks.documentId, documentId));
  }
  
  // Compliance Mapping operations
  async getComplianceMappings(projectId: string): Promise<ComplianceMapping[]> {
    return await db
      .select()
      .from(complianceMappings)
      .where(eq(complianceMappings.projectId, projectId));
  }

  async createComplianceMapping(mapping: InsertComplianceMapping): Promise<ComplianceMapping> {
    const [newMapping] = await db
      .insert(complianceMappings)
      .values(mapping)
      .returning();
    return newMapping;
  }
  
  // Compatibility methods - mapped to use standard Document type
  async getKnowledgeDocuments(): Promise<Document[]> {
    return await db
      .select()
      .from(documents)
      .where(eq(documents.isKnowledgeDocument, true));
  }
  
  async createKnowledgeDocument(document: any): Promise<Document> {
    const docToInsert = {
      ...document,
      isKnowledgeDocument: true
    };
    const [newDocument] = await db
      .insert(documents)
      .values(docToInsert)
      .returning();
    return newDocument;
  }
  
  async getSuggestedDocuments(): Promise<Document[]> {
    return await db
      .select()
      .from(documents)
      .where(eq(documents.isSuggestedDocument, true));
  }
  
  async createSuggestedDocument(document: any): Promise<Document> {
    const docToInsert = {
      ...document,
      isSuggestedDocument: true
    };
    const [newDocument] = await db
      .insert(documents)
      .values(docToInsert)
      .returning();
    return newDocument;
  }
  
  async updateSuggestedDocumentStatus(id: string, status: 'approved' | 'rejected', reviewedBy: string): Promise<Document | undefined> {
    const [document] = await db
      .update(documents)
      .set({ 
        approved: status === 'approved',
        reviewedBy,
        reviewedAt: new Date()
      })
      .where(eq(documents.id, id))
      .returning();
    return document;
  }
}

// Create and export a singleton instance
export const dbStorage = new DatabaseStorage();