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

// Storage interface for all CRUD operations
export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Project operations
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  getProjectsByUserId(userId: string): Promise<Project[]>;
  
  // Project Permission operations
  getProjectMembers(projectId: string): Promise<ProjectPermission[]>;
  addProjectMember(projectMember: InsertProjectPermission): Promise<ProjectPermission>;
  updateProjectMemberRole(id: string, role: string): Promise<ProjectPermission | undefined>;
  
  // RFP Document operations
  getRfpDocuments(projectId: string): Promise<RfpDocument[]>;
  getRfpDocument(id: string): Promise<RfpDocument | undefined>;
  createRfpDocument(document: InsertRfpDocument): Promise<RfpDocument>;
  updateRfpDocumentStatus(id: string, status: string): Promise<RfpDocument | undefined>;
  getAllRfpDocuments(): Promise<RfpDocument[]>;
  updateRfpDocumentApprovalStatus(id: string, status: string): Promise<RfpDocument | undefined>;
  
  // RFP Question operations
  getRfpQuestions(documentId: string): Promise<RfpQuestion[]>;
  createRfpQuestion(question: InsertRfpQuestion): Promise<RfpQuestion>;
  
  // RFP Answer operations
  getRfpAnswers(questionIds: string[]): Promise<RfpAnswer[]>;
  createRfpAnswer(answer: InsertRfpAnswer): Promise<RfpAnswer>;
  updateRfpAnswer(answer: UpdateRfpAnswer): Promise<RfpAnswer | undefined>;
  
  // Document operations
  getDocuments(): Promise<Document[]>;
  getDocument(id: string): Promise<Document | undefined>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocumentApprovalStatus(id: string, approved: boolean): Promise<Document | undefined>;
  updateDocumentChunkStatus(id: string, chunked: boolean): Promise<Document | undefined>;
  
  // Chunk operations
  getChunks(documentId: string): Promise<Chunk[]>;
  createChunk(chunk: InsertChunk): Promise<Chunk>;
  getDocumentChunks(documentId: string, documentType: string): Promise<Chunk[]>;
  
  // Compliance Mapping operations
  getComplianceMappings(projectId: string): Promise<ComplianceMapping[]>;
  createComplianceMapping(mapping: InsertComplianceMapping): Promise<ComplianceMapping>;
  
  // Compatibility methods
  getKnowledgeDocuments(): Promise<Document[]>;
  createKnowledgeDocument(document: any): Promise<Document>;
  getSuggestedDocuments(): Promise<Document[]>;
  createSuggestedDocument(document: any): Promise<Document>;
  updateSuggestedDocumentStatus(id: string, status: 'approved' | 'rejected', reviewedBy: string): Promise<Document | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private projects: Map<number, Project>;
  private projectMembers: Map<number, ProjectMember>;
  private rfpDocuments: Map<number, RfpDocument>;
  private rfpQuestions: Map<number, RfpQuestion>;
  private rfpAnswers: Map<number, RfpAnswer>;
  private knowledgeDocuments: Map<number, KnowledgeDocument>;
  private suggestedDocuments: Map<number, SuggestedDocument>;
  private documentChunks: Map<number, DocumentChunk>;
  
  private userId: number = 1;
  private projectId: number = 1;
  private projectMemberId: number = 1;
  private rfpDocumentId: number = 1;
  private rfpQuestionId: number = 1;
  private rfpAnswerId: number = 1;
  private knowledgeDocumentId: number = 1;
  private suggestedDocumentId: number = 1;
  private documentChunkId: number = 1;

  constructor() {
    this.users = new Map();
    this.projects = new Map();
    this.projectMembers = new Map();
    this.rfpDocuments = new Map();
    this.rfpQuestions = new Map();
    this.rfpAnswers = new Map();
    this.knowledgeDocuments = new Map();
    this.suggestedDocuments = new Map();
    this.documentChunks = new Map();
    
    // Add a demo user
    const demoUser: User = {
      id: this.userId++,
      email: 'demo@example.com',
      password: 'password123',
      isAdmin: true,
      createdAt: new Date()
    };
    this.users.set(demoUser.id, demoUser);
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userId++;
    const user: User = { ...insertUser, id, createdAt: new Date() };
    this.users.set(id, user);
    return user;
  }

  // Project operations
  async getProjects(): Promise<Project[]> {
    return Array.from(this.projects.values());
  }

  async getProject(id: number): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = this.projectId++;
    const project: Project = { ...insertProject, id, createdAt: new Date() };
    this.projects.set(id, project);
    
    // Automatically add the creator as an owner
    await this.addProjectMember({
      projectId: project.id,
      userId: project.createdBy,
      role: 'owner'
    });
    
    return project;
  }

  async getProjectsByUserId(userId: number): Promise<Project[]> {
    // Get all project memberships for this user
    const memberships = Array.from(this.projectMembers.values())
      .filter(member => member.userId === userId);
    
    // Get the corresponding projects
    return Promise.all(
      memberships.map(async membership => 
        (await this.getProject(membership.projectId))!
      )
    );
  }

  // Project Members operations
  async getProjectMembers(projectId: number): Promise<ProjectMember[]> {
    return Array.from(this.projectMembers.values())
      .filter(member => member.projectId === projectId);
  }

  async addProjectMember(insertProjectMember: InsertProjectMember): Promise<ProjectMember> {
    const id = this.projectMemberId++;
    const projectMember: ProjectMember = { 
      ...insertProjectMember, 
      id, 
      createdAt: new Date() 
    };
    this.projectMembers.set(id, projectMember);
    return projectMember;
  }

  async updateProjectMemberRole(id: number, role: 'owner' | 'collaborator' | 'viewer'): Promise<ProjectMember | undefined> {
    const projectMember = this.projectMembers.get(id);
    if (!projectMember) return undefined;
    
    const updatedMember = { ...projectMember, role };
    this.projectMembers.set(id, updatedMember);
    return updatedMember;
  }

  // RFP Document operations
  async getRfpDocuments(projectId: number): Promise<RfpDocument[]> {
    return Array.from(this.rfpDocuments.values())
      .filter(doc => doc.projectId === projectId);
  }

  async getRfpDocument(id: number): Promise<RfpDocument | undefined> {
    return this.rfpDocuments.get(id);
  }

  async createRfpDocument(insertDocument: InsertRfpDocument): Promise<RfpDocument> {
    const id = this.rfpDocumentId++;
    const rfpDocument: RfpDocument = { 
      ...insertDocument, 
      id, 
      createdAt: new Date() 
    };
    this.rfpDocuments.set(id, rfpDocument);
    return rfpDocument;
  }

  async updateRfpDocumentStatus(id: number, status: 'unprocessed' | 'processed' | 'reviewed' | 'done'): Promise<RfpDocument | undefined> {
    const document = this.rfpDocuments.get(id);
    if (!document) return undefined;
    
    const updatedDocument = { ...document, status };
    this.rfpDocuments.set(id, updatedDocument);
    return updatedDocument;
  }

  // RFP Question operations
  async getRfpQuestions(documentId: number): Promise<RfpQuestion[]> {
    return Array.from(this.rfpQuestions.values())
      .filter(question => question.documentId === documentId);
  }

  async createRfpQuestion(insertQuestion: InsertRfpQuestion): Promise<RfpQuestion> {
    const id = this.rfpQuestionId++;
    const rfpQuestion: RfpQuestion = { 
      ...insertQuestion, 
      id, 
      createdAt: new Date() 
    };
    this.rfpQuestions.set(id, rfpQuestion);
    return rfpQuestion;
  }

  // RFP Answer operations
  async getRfpAnswers(questionIds: number[]): Promise<RfpAnswer[]> {
    return Array.from(this.rfpAnswers.values())
      .filter(answer => questionIds.includes(answer.questionId));
  }

  async createRfpAnswer(insertAnswer: InsertRfpAnswer): Promise<RfpAnswer> {
    const id = this.rfpAnswerId++;
    const now = new Date();
    const rfpAnswer: RfpAnswer = { 
      ...insertAnswer, 
      id, 
      createdAt: now,
      updatedAt: now
    };
    this.rfpAnswers.set(id, rfpAnswer);
    return rfpAnswer;
  }

  async updateRfpAnswer(updateAnswer: UpdateRfpAnswer): Promise<RfpAnswer | undefined> {
    const answer = this.rfpAnswers.get(updateAnswer.id);
    if (!answer) return undefined;
    
    const updatedAnswer = { 
      ...answer, 
      ...updateAnswer,
      updatedAt: new Date() 
    };
    this.rfpAnswers.set(answer.id, updatedAnswer);
    return updatedAnswer;
  }

  // Knowledge Document operations
  async getKnowledgeDocuments(): Promise<KnowledgeDocument[]> {
    return Array.from(this.knowledgeDocuments.values());
  }

  async createKnowledgeDocument(insertDocument: InsertKnowledgeDocument): Promise<KnowledgeDocument> {
    const id = this.knowledgeDocumentId++;
    const knowledgeDocument: KnowledgeDocument = { 
      ...insertDocument, 
      id, 
      createdAt: new Date() 
    };
    this.knowledgeDocuments.set(id, knowledgeDocument);
    return knowledgeDocument;
  }

  // Suggested Document operations
  async getSuggestedDocuments(): Promise<SuggestedDocument[]> {
    return Array.from(this.suggestedDocuments.values());
  }

  async createSuggestedDocument(insertDocument: InsertSuggestedDocument): Promise<SuggestedDocument> {
    const id = this.suggestedDocumentId++;
    const suggestedDocument: SuggestedDocument = { 
      ...insertDocument, 
      id, 
      createdAt: new Date(),
      reviewedAt: null,
      reviewedBy: null
    };
    this.suggestedDocuments.set(id, suggestedDocument);
    return suggestedDocument;
  }

  async updateSuggestedDocumentStatus(
    id: number, 
    status: 'approved' | 'rejected', 
    reviewedBy: number
  ): Promise<SuggestedDocument | undefined> {
    const document = this.suggestedDocuments.get(id);
    if (!document) return undefined;
    
    const updatedDocument = { 
      ...document, 
      status, 
      reviewedBy,
      reviewedAt: new Date()
    };
    this.suggestedDocuments.set(id, updatedDocument);
    
    // If approved, add to knowledge documents
    if (status === 'approved') {
      await this.createKnowledgeDocument({
        name: document.name,
        filePath: document.filePath,
        contentType: document.contentType,
        createdBy: reviewedBy
      });
    }
    
    return updatedDocument;
  }

  // Document operations
  async getDocuments(): Promise<Document[]> {
    // For simplicity in this demo implementation, we'll just return all documents from both collections
    return [
      ...Array.from(this.knowledgeDocuments.values()),
      ...Array.from(this.suggestedDocuments.values()).filter(doc => doc.status === 'approved')
    ];
  }
  
  async getDocument(id: string): Promise<Document | undefined> {
    // Try to find in knowledge documents first
    let doc = Array.from(this.knowledgeDocuments.values()).find(d => d.id.toString() === id);
    if (doc) return doc;
    
    // If not found, try suggested documents
    doc = Array.from(this.suggestedDocuments.values()).find(d => d.id.toString() === id);
    return doc;
  }
  
  async createDocument(document: InsertDocument): Promise<Document> {
    // In this simplified implementation, we'll create a suggested document
    return this.createSuggestedDocument(document);
  }
  
  async updateDocumentApprovalStatus(id: string, approved: boolean): Promise<Document | undefined> {
    const status = approved ? 'approved' : 'rejected';
    // In this simplified implementation, we'll just use the suggested document update method
    // In a real implementation, this would be more specific
    return this.updateSuggestedDocumentStatus(id, status, '1'); // Using demo user ID
  }
  
  async updateDocumentChunkStatus(id: string, chunked: boolean): Promise<Document | undefined> {
    const doc = await this.getDocument(id);
    if (!doc) return undefined;
    
    const updatedDoc = { 
      ...doc, 
      chunked,
      chunkedAt: chunked ? new Date() : null
    };
    
    // Update in the appropriate collection
    if ('source' in doc && doc.source === 'knowledge_base') {
      this.knowledgeDocuments.set(parseInt(id), updatedDoc as any);
    } else {
      this.suggestedDocuments.set(parseInt(id), updatedDoc as any);
    }
    
    return updatedDoc;
  }

  // Chunk operations
  async getChunks(documentId: string): Promise<Chunk[]> {
    return Array.from(this.documentChunks.values())
      .filter(chunk => chunk.documentId.toString() === documentId)
      .map(chunk => ({
        id: chunk.id.toString(),
        documentId: chunk.documentId.toString(),
        content: chunk.content,
        createdAt: chunk.createdAt,
        scope: chunk.scope || 'global',
        embedded: false,
        embeddedAt: null
      }));
  }
  
  async createChunk(chunk: InsertChunk): Promise<Chunk> {
    const id = this.documentChunkId++;
    const documentChunk = { 
      ...chunk, 
      id, 
      createdAt: new Date(),
      documentType: 'document', // Default document type
      scope: chunk.scope || 'global',
      embedded: false,
      embeddedAt: null
    };
    
    this.documentChunks.set(id, documentChunk as any);
    
    return {
      id: id.toString(),
      documentId: chunk.documentId,
      content: chunk.content,
      createdAt: documentChunk.createdAt,
      scope: documentChunk.scope,
      embedded: documentChunk.embedded,
      embeddedAt: documentChunk.embeddedAt
    };
  }
  
  async getDocumentChunks(documentId: string, documentType: string): Promise<Chunk[]> {
    return Array.from(this.documentChunks.values())
      .filter(chunk => 
        chunk.documentId.toString() === documentId && 
        (chunk.documentType === documentType || !documentType)
      )
      .map(chunk => ({
        id: chunk.id.toString(),
        documentId: chunk.documentId.toString(),
        content: chunk.content,
        createdAt: chunk.createdAt,
        scope: chunk.scope || 'global',
        embedded: false,
        embeddedAt: null
      }));
  }
}

// Changed to named export so we can override it in index.ts

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
    
    return db
      .select()
      .from(projects)
      .where(
        projectIds.map(id => eq(projects.id, id)).reduce(
          (acc, condition) => acc || condition
        )
      );
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
    
    return db
      .select()
      .from(rfpAnswers)
      .where(
        questionIds.map(id => eq(rfpAnswers.rfpQuestionId, id)).reduce(
          (acc, condition) => acc || condition
        )
      );
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
    const now = new Date();
    const [document] = await db
      .update(documents)
      .set({ 
        approvalStatus: approved ? 'approved' : 'rejected',
        approvalStatusModifiedAt: now 
      })
      .where(eq(documents.id, id))
      .returning();
    return document;
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

export const storage = new DatabaseStorage();
