/**
 * Storage interface for the RFP Assistant Tool
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
  Feedback, InsertFeedback,
  UpdateRfpAnswer
} from "@shared/schema";

// Storage interface for all CRUD operations
export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUserAccess(id: string, accessGranted: boolean): Promise<User | undefined>;
  updateUserRole(id: string, role: string): Promise<User | undefined>;
  
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
  getRfpAnswersByDocumentId(rfpDocumentId: string): Promise<RfpAnswer[]>;
  createRfpAnswer(answer: InsertRfpAnswer): Promise<RfpAnswer>;
  updateRfpAnswer(answer: UpdateRfpAnswer): Promise<RfpAnswer | undefined>;
  
  // Document operations
  getDocuments(): Promise<Document[]>;
  getDocument(id: string): Promise<Document | undefined>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocumentApprovalStatus(id: string, status: string): Promise<Document | undefined>;
  updateDocumentChunkStatus(id: string, chunked: boolean): Promise<Document | undefined>;
  
  // Chunk operations
  getChunks(documentId: string): Promise<Chunk[]>;
  createChunk(chunk: InsertChunk): Promise<Chunk>;
  getDocumentChunks(documentId: string, documentType: string): Promise<Chunk[]>;
  getUnembeddedChunks(limit?: number): Promise<Chunk[]>;
  markChunkAsEmbedded(chunkId: string): Promise<boolean>;
  
  // Compliance Mapping operations
  getComplianceMappings(projectId: string): Promise<ComplianceMapping[]>;
  createComplianceMapping(mapping: InsertComplianceMapping): Promise<ComplianceMapping>;
  
  // Compatibility methods
  getKnowledgeDocuments(): Promise<Document[]>;
  createKnowledgeDocument(document: any): Promise<Document>;
  getSuggestedDocuments(): Promise<Document[]>;
  createSuggestedDocument(document: any): Promise<Document>;
  updateSuggestedDocumentStatus(id: string, status: 'approved' | 'rejected', reviewedBy: string): Promise<Document | undefined>;
  
  // Feedback operations
  createFeedback(feedback: InsertFeedback): Promise<Feedback>;
  getFeedbacks(): Promise<Feedback[]>;
}

// Import the SupabaseStorage implementation
import { SupabaseStorage } from './supabase-storage';

// Export an instance of SupabaseStorage to be used throughout the application
export const storage = new SupabaseStorage();