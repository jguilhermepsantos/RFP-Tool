import { pgTable, text, uuid, boolean, timestamp, pgEnum, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User role enum for project access
export const userRoleEnum = pgEnum('user_role', ['owner', 'collaborator', 'viewer']);

// Region enum for projects
export const regionEnum = pgEnum('region', ['US', 'Brazil', 'South LATAM', 'North LATAM', 'EMEA', 'APAC']);

// Language enum for projects
export const languageEnum = pgEnum('language', ['English', 'Spanish', 'Portuguese', 'French', 'German', 'Polish']);

// Document status enum for RFP documents
export const documentStatusEnum = pgEnum('document_status', [
  'unprocessed', 
  'processed', 
  'under review',
  'reviewed', // kept for backward compatibility
  'done'
]);

// Users table
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: text("role").default('user'),
  accessGranted: boolean("access_granted").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Projects table
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"), // Added description column
  salesforceLink: text("salesforce_link"),
  region: regionEnum("region"),
  language: languageEnum("language"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: uuid("created_by").references(() => users.id),
});

// Project Permissions table
export const projectPermissions = pgTable("project_permissions", {
  id: uuid("id").primaryKey(),
  projectId: uuid("project_id").references(() => projects.id),
  userId: uuid("user_id").references(() => users.id),
  role: text("role").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Define approval status enum
export const approvalStatusEnum = pgEnum('approval_status', ['pending', 'approved', 'rejected', 'chunked']);

// Define chunk source enum
export const chunkSourceEnum = pgEnum('chunk_source', ['document', 'rfp']);

// Documents table
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  fileUrl: text("file_url"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  chunked: boolean("chunked").notNull().default(false),
  chunkedAt: timestamp("chunked_at"),
  approvalStatus: text("approval_status").default('pending'),
  approvalStatusModifiedBy: uuid("approval_status_modified_by").references(() => users.id),
  approvalStatusModifiedAt: timestamp("approval_status_modified_at"),
});

// RFP Documents table
export const rfpDocuments = pgTable("rfp_documents", {
  id: uuid("id").primaryKey(),
  projectId: uuid("project_id").references(() => projects.id),
  name: text("name"),
  fileUrl: text("file_url"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  status: text("status").default('unprocessed'),
  isPastRfp: boolean("is_past_rfp").default(false),
  approvalStatus: text("approval_status").default('pending'),
  approvalStatusModifiedBy: uuid("approval_status_modified_by").references(() => users.id),
  approvalStatusModifiedAt: timestamp("approval_status_modified_at"),
});

// RFP Questions table
export const rfpQuestions = pgTable("rfp_questions", {
  id: uuid("id").primaryKey(),
  rfpDocumentId: uuid("rfp_document_id").references(() => rfpDocuments.id),
  questionText: text("question_text").notNull(),
  requirementId: text("requirement_id"), // Added hierarchical field
  section: text("section"), // Added hierarchical field
  subsection: text("subsection"), // Added hierarchical field
  assignedTo: uuid("assigned_to").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// RFP Answers table - Now supports versioned answers
export const rfpAnswers = pgTable("rfp_answers", {
  id: uuid("id").primaryKey(),
  rfpDocumentId: uuid("rfp_document_id").references(() => rfpDocuments.id),
  rfpQuestionId: uuid("rfp_question_id").references(() => rfpQuestions.id),
  questionText: text("question_text").notNull(),
  generatedAnswer: text("generated_answer"),
  complianceAnswer: text("compliance_answer"),
  sourceChunks: text("source_chunks"),
  averageSimilarity: real("average_similarity"),
  confidenceLevel: text("confidence_level"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: text("created_by").notNull(), // "AI-generated" or user ID
});

// Section Assignments table for hierarchical assignment tracking
export const sectionAssignments = pgTable("section_assignments", {
  id: uuid("id").primaryKey(),
  rfpDocumentId: uuid("rfp_document_id").references(() => rfpDocuments.id),
  section: text("section").notNull(),
  subsection: text("subsection"), // nullable for section-only assignments
  assignedTo: uuid("assigned_to").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Chunks table (for RAG engine)
export const chunks = pgTable("chunks", {
  id: uuid("id").primaryKey(),
  documentId: uuid("document_id").references(() => documents.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  scope: text("scope"),
  embedded: boolean("embedded").notNull().default(false),
  embeddedAt: timestamp("embedded_at"),
  source: chunkSourceEnum("source").notNull(),
});

// Compliance Mappings table
export const complianceMappings = pgTable("compliance_mappings", {
  projectId: uuid("project_id").references(() => projects.id),
  standardLabel: text("standard_label"),
  mappedLabel: text("mapped_label"),
});

// Feedbacks table
export const feedbacks = pgTable("feedbacks", {
  id: uuid("id").primaryKey(),
  uploadedBy: uuid("uploaded_by").references(() => users.id).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Answer Feedbacks table
export const answerFeedbacks = pgTable("answer_feedbacks", {
  id: uuid("id").primaryKey(),
  rfpAnswerId: uuid("rfp_answer_id").references(() => rfpAnswers.id).notNull(),
  rating: text("rating").notNull(), // 'good' or 'bad'
  feedbackText: text("feedback_text"),
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Define insert schemas using drizzle-zod
export const insertUserSchema = createInsertSchema(users).omit({
  id: true, 
  createdAt: true
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true, 
  createdAt: true
});

export const insertProjectPermissionSchema = createInsertSchema(projectPermissions).omit({
  id: true, 
  createdAt: true
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true, 
  createdAt: true,
  chunked: true,
  chunkedAt: true,
  approvalStatus: true,
  approvalStatusModifiedBy: true,
  approvalStatusModifiedAt: true
});

export const insertRfpDocumentSchema = createInsertSchema(rfpDocuments).omit({
  id: true, 
  uploadedAt: true,
  approvalStatus: true,
  approvalStatusModifiedBy: true,
  approvalStatusModifiedAt: true
});

export const insertRfpQuestionSchema = createInsertSchema(rfpQuestions).omit({
  id: true, 
  createdAt: true
});

export const insertRfpAnswerSchema = createInsertSchema(rfpAnswers).omit({
  id: true, 
  createdAt: true
});

export const insertChunkSchema = createInsertSchema(chunks).omit({
  id: true, 
  createdAt: true,
  embedded: true,
  embeddedAt: true
});

export const insertComplianceMappingSchema = createInsertSchema(complianceMappings);

export const insertFeedbackSchema = createInsertSchema(feedbacks).omit({
  id: true, 
  createdAt: true
});

export const insertAnswerFeedbackSchema = createInsertSchema(answerFeedbacks).omit({
  id: true, 
  createdAt: true,
  updatedAt: true
});

export const insertSectionAssignmentSchema = createInsertSchema(sectionAssignments).omit({
  id: true, 
  createdAt: true
});

// Update schema for answer feedback
export const updateAnswerFeedbackSchema = insertAnswerFeedbackSchema.omit({
  rfpAnswerId: true,
  createdBy: true
}).extend({
  id: z.string()
});

// Define types using z.infer
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type InsertProjectPermission = z.infer<typeof insertProjectPermissionSchema>;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type InsertRfpDocument = z.infer<typeof insertRfpDocumentSchema>;
export type InsertRfpQuestion = z.infer<typeof insertRfpQuestionSchema>;
export type InsertRfpAnswer = z.infer<typeof insertRfpAnswerSchema>;
export type InsertChunk = z.infer<typeof insertChunkSchema>;
export type InsertComplianceMapping = z.infer<typeof insertComplianceMappingSchema>;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type InsertAnswerFeedback = z.infer<typeof insertAnswerFeedbackSchema>;
export type UpdateAnswerFeedback = z.infer<typeof updateAnswerFeedbackSchema>;
export type InsertSectionAssignment = z.infer<typeof insertSectionAssignmentSchema>;

// Define select types
export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectPermission = typeof projectPermissions.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type RfpDocument = typeof rfpDocuments.$inferSelect;
export type RfpQuestion = typeof rfpQuestions.$inferSelect;
export type RfpAnswer = typeof rfpAnswers.$inferSelect;
export type Chunk = typeof chunks.$inferSelect;
export type ComplianceMapping = typeof complianceMappings.$inferSelect;
export type Feedback = typeof feedbacks.$inferSelect;
export type AnswerFeedback = typeof answerFeedbacks.$inferSelect;
export type SectionAssignment = typeof sectionAssignments.$inferSelect;

// Extended schemas for form validation
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const updateRfpAnswerSchema = z.object({
  id: z.string().uuid(),
  complianceAnswer: z.string().optional(),
  generatedAnswer: z.string().optional(),
  createdBy: z.string().optional(),
});

// Schema for updating document approval status
export const updateDocumentApprovalSchema = z.object({
  id: z.string().uuid(),
  approvalStatus: z.enum(['pending', 'approved', 'rejected']),
  approvalStatusModifiedBy: z.string().uuid(),
});

// Schema for updating RFP document approval status
export const updateRfpDocumentApprovalSchema = z.object({
  id: z.string().uuid(),
  approvalStatus: z.enum(['pending', 'approved', 'rejected']),
  approvalStatusModifiedBy: z.string().uuid(),
});

export type LoginCredentials = z.infer<typeof loginSchema>;
export type UpdateRfpAnswer = z.infer<typeof updateRfpAnswerSchema>;
export type UpdateDocumentApproval = z.infer<typeof updateDocumentApprovalSchema>;
export type UpdateRfpDocumentApproval = z.infer<typeof updateRfpDocumentApprovalSchema>;

// Source chunk metadata type
export interface SourceChunk {
  chunkId: string;
  similarity: number;
  source: 'document' | 'rfp';
}
