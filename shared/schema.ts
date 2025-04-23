import { pgTable, text, serial, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User role enum for project access
export const userRoleEnum = pgEnum('user_role', ['owner', 'collaborator', 'viewer']);

// Document status enum for RFP documents
export const documentStatusEnum = pgEnum('document_status', [
  'unprocessed', 
  'processed', 
  'reviewed', 
  'done'
]);

// Suggested document status enum
export const suggestedDocStatusEnum = pgEnum('suggested_doc_status', [
  'pending',
  'approved',
  'rejected'
]);

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  isAdmin: boolean("is_admin").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Projects table
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: integer("created_by").notNull().references(() => users.id),
});

// Project Members table (for storing user roles in projects)
export const projectMembers = pgTable("project_members", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  userId: integer("user_id").notNull().references(() => users.id),
  role: userRoleEnum("role").notNull().default('viewer'),
  createdAt: timestamp("created_at").defaultNow(),
});

// RFP Documents table
export const rfpDocuments = pgTable("rfp_documents", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
  filePath: text("file_path").notNull(),
  status: documentStatusEnum("status").notNull().default('unprocessed'),
  createdAt: timestamp("created_at").defaultNow(),
  uploadedBy: integer("uploaded_by").notNull().references(() => users.id),
  isPastRfp: boolean("is_past_rfp").default(false),
});

// RFP Questions table
export const rfpQuestions = pgTable("rfp_questions", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => rfpDocuments.id),
  questionNumber: text("question_number").notNull(),
  questionText: text("question_text").notNull(),
  section: text("section"),
  createdAt: timestamp("created_at").defaultNow(),
});

// RFP Answers table
export const rfpAnswers = pgTable("rfp_answers", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull().references(() => rfpQuestions.id),
  complianceAnswer: text("compliance_answer"),
  generatedAnswer: text("generated_answer"),
  finalAnswer: text("final_answer"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Global Knowledge Documents table
export const knowledgeDocuments = pgTable("knowledge_documents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  filePath: text("file_path").notNull(),
  contentType: text("content_type").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: integer("created_by").notNull().references(() => users.id),
});

// Suggested Documents table (for global knowledge base)
export const suggestedDocuments = pgTable("suggested_documents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  filePath: text("file_path").notNull(),
  contentType: text("content_type").notNull(),
  status: suggestedDocStatusEnum("status").notNull().default('pending'),
  createdAt: timestamp("created_at").defaultNow(),
  suggestedBy: integer("suggested_by").notNull().references(() => users.id),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
});

// Chunks table (for RAG engine)
export const documentChunks = pgTable("document_chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  documentType: text("document_type").notNull(), // 'rfp' or 'knowledge'
  content: text("content").notNull(),
  embedding: text("embedding"), // Store embedding vector as text (will be replaced with vector type)
  createdAt: timestamp("created_at").defaultNow(),
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

export const insertProjectMemberSchema = createInsertSchema(projectMembers).omit({
  id: true, 
  createdAt: true
});

export const insertRfpDocumentSchema = createInsertSchema(rfpDocuments).omit({
  id: true, 
  createdAt: true
});

export const insertRfpQuestionSchema = createInsertSchema(rfpQuestions).omit({
  id: true, 
  createdAt: true
});

export const insertRfpAnswerSchema = createInsertSchema(rfpAnswers).omit({
  id: true, 
  createdAt: true,
  updatedAt: true
});

export const insertKnowledgeDocumentSchema = createInsertSchema(knowledgeDocuments).omit({
  id: true, 
  createdAt: true
});

export const insertSuggestedDocumentSchema = createInsertSchema(suggestedDocuments).omit({
  id: true, 
  createdAt: true,
  reviewedAt: true,
  reviewedBy: true
});

export const insertDocumentChunkSchema = createInsertSchema(documentChunks).omit({
  id: true, 
  createdAt: true
});

// Define types using z.infer
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type InsertProjectMember = z.infer<typeof insertProjectMemberSchema>;
export type InsertRfpDocument = z.infer<typeof insertRfpDocumentSchema>;
export type InsertRfpQuestion = z.infer<typeof insertRfpQuestionSchema>;
export type InsertRfpAnswer = z.infer<typeof insertRfpAnswerSchema>;
export type InsertKnowledgeDocument = z.infer<typeof insertKnowledgeDocumentSchema>;
export type InsertSuggestedDocument = z.infer<typeof insertSuggestedDocumentSchema>;
export type InsertDocumentChunk = z.infer<typeof insertDocumentChunkSchema>;

// Define select types
export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type RfpDocument = typeof rfpDocuments.$inferSelect;
export type RfpQuestion = typeof rfpQuestions.$inferSelect;
export type RfpAnswer = typeof rfpAnswers.$inferSelect;
export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;
export type SuggestedDocument = typeof suggestedDocuments.$inferSelect;
export type DocumentChunk = typeof documentChunks.$inferSelect;

// Extended schemas for form validation
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const updateRfpAnswerSchema = z.object({
  id: z.number(),
  complianceAnswer: z.string().optional(),
  generatedAnswer: z.string().optional(),
  finalAnswer: z.string().optional(),
});

export type LoginCredentials = z.infer<typeof loginSchema>;
export type UpdateRfpAnswer = z.infer<typeof updateRfpAnswerSchema>;
