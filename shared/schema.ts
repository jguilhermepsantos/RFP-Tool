import { pgTable, text, uuid, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
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

// Users table
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: text("role").default('user'),
  createdAt: timestamp("created_at").defaultNow(),
});

// Projects table
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
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

// Documents table
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  fileUrl: text("file_url"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  approved: boolean("approved"),
  createdAt: timestamp("created_at").defaultNow(),
  chunked: boolean("chunked").notNull().default(false),
  chunkedAt: timestamp("chunked_at"),
});

// RFP Documents table
export const rfpDocuments = pgTable("rfp_documents", {
  id: uuid("id").primaryKey(),
  projectId: uuid("project_id").references(() => projects.id),
  fileUrl: text("file_url"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  status: text("status").default('unprocessed'),
});

// RFP Questions table
export const rfpQuestions = pgTable("rfp_questions", {
  id: uuid("id").primaryKey(),
  rfpDocumentId: uuid("rfp_document_id").references(() => rfpDocuments.id),
  questionText: text("question_text").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// RFP Answers table
export const rfpAnswers = pgTable("rfp_answers", {
  id: uuid("id").primaryKey(),
  rfpDocumentId: uuid("rfp_document_id").references(() => rfpDocuments.id),
  rfpQuestionId: uuid("rfp_question_id").references(() => rfpQuestions.id),
  questionText: text("question_text").notNull(),
  generatedAnswer: text("generated_answer"),
  complianceAnswer: text("compliance_answer"),
  createdAt: timestamp("created_at").defaultNow(),
  lastReviewedBy: uuid("last_reviewed_by").references(() => users.id),
  lastReviewedAt: timestamp("last_reviewed_at"),
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
});

// Compliance Mappings table
export const complianceMappings = pgTable("compliance_mappings", {
  projectId: uuid("project_id").references(() => projects.id),
  standardLabel: text("standard_label"),
  mappedLabel: text("mapped_label"),
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
  chunkedAt: true
});

export const insertRfpDocumentSchema = createInsertSchema(rfpDocuments).omit({
  id: true, 
  uploadedAt: true
});

export const insertRfpQuestionSchema = createInsertSchema(rfpQuestions).omit({
  id: true, 
  createdAt: true
});

export const insertRfpAnswerSchema = createInsertSchema(rfpAnswers).omit({
  id: true, 
  createdAt: true,
  lastReviewedAt: true,
  lastReviewedBy: true
});

export const insertChunkSchema = createInsertSchema(chunks).omit({
  id: true, 
  createdAt: true,
  embedded: true,
  embeddedAt: true
});

export const insertComplianceMappingSchema = createInsertSchema(complianceMappings);

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

// Extended schemas for form validation
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const updateRfpAnswerSchema = z.object({
  id: z.string().uuid(),
  complianceAnswer: z.string().optional(),
  generatedAnswer: z.string().optional(),
});

export type LoginCredentials = z.infer<typeof loginSchema>;
export type UpdateRfpAnswer = z.infer<typeof updateRfpAnswerSchema>;
