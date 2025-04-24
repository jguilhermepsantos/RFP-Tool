import express, { type Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./supabase-storage";
import { supabase } from "./db";
import {
  insertUserSchema,
  insertProjectSchema,
  insertProjectPermissionSchema,
  insertRfpDocumentSchema,
  insertRfpQuestionSchema,
  insertRfpAnswerSchema,
  insertDocumentSchema,
  loginSchema,
  updateRfpAnswerSchema
} from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // API Routes
  const apiRouter = express.Router();
  app.use("/api", apiRouter);

  // Auth routes
  apiRouter.post("/auth/login", async (req: Request, res: Response) => {
    try {
      const credentials = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(credentials.email);
      
      if (!user || user.password !== credentials.password) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      
      // In a real app, you would use a JWT or another session mechanism
      return res.status(200).json({ 
        user: { 
          id: user.id, 
          email: user.email, 
          isAdmin: user.isAdmin 
        } 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // User routes
  apiRouter.post("/users", async (req: Request, res: Response) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const existingUser = await storage.getUserByEmail(userData.email);
      
      if (existingUser) {
        return res.status(409).json({ message: "Email already in use" });
      }
      
      const newUser = await storage.createUser(userData);
      return res.status(201).json({ 
        user: { 
          id: newUser.id, 
          email: newUser.email, 
          isAdmin: newUser.isAdmin 
        } 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Project routes
  apiRouter.get("/projects", async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string;
      
      if (!userId) {
        return res.status(400).json({ message: "Valid user ID is required" });
      }
      
      const projects = await storage.getProjectsByUserId(userId);
      
      // Get the role for each project
      const projectsWithRole = await Promise.all(
        projects.map(async (project) => {
          const members = await storage.getProjectMembers(project.id);
          const userMembership = members.find(m => m.userId === userId);
          return {
            ...project,
            role: userMembership?.role || 'viewer'
          };
        })
      );
      
      return res.status(200).json({ projects: projectsWithRole });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  apiRouter.get("/projects/:id", async (req: Request, res: Response) => {
    try {
      const projectId = req.params.id;
      
      if (!projectId) {
        return res.status(400).json({ message: "Valid project ID is required" });
      }
      
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const members = await storage.getProjectMembers(projectId);
      const documents = await storage.getRfpDocuments(projectId);
      
      return res.status(200).json({ 
        project,
        members,
        documents
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  apiRouter.post("/projects", async (req: Request, res: Response) => {
    try {
      const projectData = insertProjectSchema.parse(req.body);
      const newProject = await storage.createProject(projectData);
      return res.status(201).json({ project: newProject });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Project Permissions routes
  apiRouter.post("/projects/:projectId/members", async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId;
      
      if (!projectId) {
        return res.status(400).json({ message: "Valid project ID is required" });
      }
      
      const memberData = insertProjectPermissionSchema.parse({
        ...req.body,
        projectId
      });
      
      const newMember = await storage.addProjectMember(memberData);
      return res.status(201).json({ member: newMember });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // RFP Document routes
  apiRouter.get("/projects/:projectId/rfp-documents", async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId;
      
      if (!projectId) {
        return res.status(400).json({ message: "Valid project ID is required" });
      }
      
      const documents = await storage.getRfpDocuments(projectId);
      return res.status(200).json({ documents });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  apiRouter.get("/projects/:projectId/rfp-documents/:documentId", async (req: Request, res: Response) => {
    try {
      const documentId = req.params.documentId;
      
      console.log(`Attempting to load document with ID: ${documentId}`);
      
      if (!documentId) {
        return res.status(400).json({ message: "Valid document ID is required" });
      }
      
      const document = await storage.getRfpDocument(documentId);
      
      console.log(`Document result:`, document);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      // Get all answers for the document directly from the rfp_answers table
      // This is the key change - we're no longer using rfp_questions as the main source
      const { data: allAnswers, error } = await supabase
        .from('rfp_answers')
        .select('*')
        .eq('rfp_document_id', documentId);
      
      if (error) {
        console.log(`Error fetching answers:`, error);
        return res.status(500).json({ message: `Failed to fetch answers: ${error.message}` });
      }
      
      console.log(`Found ${allAnswers?.length || 0} answers directly from answers table`);
      if (allAnswers && allAnswers.length > 0) {
        console.log(`First answer from DB:`, allAnswers[0]);
      } else {
        console.log(`No answers found for document ID: ${documentId}`);
      }
      
      // Transform the answers into the expected format for the frontend
      const questionsWithAnswers = (allAnswers || []).map((dbAnswer: any) => {
        // Transform snake_case to camelCase
        return {
          // Create a question object based on the answer's data
          id: dbAnswer.rfp_question_id, 
          rfpDocumentId: dbAnswer.rfp_document_id,
          questionText: dbAnswer.question_text,
          // Add the answer directly in the format the frontend expects
          answer: {
            id: dbAnswer.id,
            rfpQuestionId: dbAnswer.rfp_question_id,
            complianceAnswer: dbAnswer.compliance_answer,
            generatedAnswer: dbAnswer.generated_answer,
            finalAnswer: dbAnswer.final_answer,
            lastReviewedBy: dbAnswer.last_reviewed_by,
            lastReviewedAt: dbAnswer.last_reviewed_at
          }
        };
      });
      
      console.log(`Returning ${questionsWithAnswers.length} questions with answers`);
      
      // Add this for debugging
      if (questionsWithAnswers.length > 0) {
        console.log('Sample transformed question with answer:', JSON.stringify(questionsWithAnswers[0], null, 2));
      }
      
      return res.status(200).json({ 
        document,
        questionsWithAnswers
      });
    } catch (error) {
      console.log(`Error in GET rfp-documents route:`, error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  apiRouter.post("/projects/:projectId/rfp-documents", async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId;
      
      if (!projectId) {
        return res.status(400).json({ message: "Valid project ID is required" });
      }
      
      const documentData = insertRfpDocumentSchema.parse({
        ...req.body,
        projectId
      });
      
      const newDocument = await storage.createRfpDocument(documentData);
      return res.status(201).json({ document: newDocument });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  apiRouter.post("/projects/:projectId/rfp-documents/:documentId/process", async (req: Request, res: Response) => {
    try {
      const documentId = req.params.documentId;
      
      console.log(`Processing document with ID: ${documentId}`);
      
      if (!documentId) {
        return res.status(400).json({ message: "Valid document ID is required" });
      }
      
      const document = await storage.getRfpDocument(documentId);
      
      console.log(`Found document:`, document);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      // Mock processing questions and generating answers
      // In a real app, this would call the RAG engine
      const questions = await storage.getRfpQuestions(documentId);
      console.log(`Found ${questions.length} existing questions for document ID: ${documentId}`);
      
      // If no questions yet, create some mock ones
      if (questions.length === 0) {
        const mockQuestions = [
          {
            rfpDocumentId: documentId,
            questionNumber: "1.1",
            questionText: "Describe your company's experience with AI solutions.",
            section: "Company Background"
          },
          {
            rfpDocumentId: documentId,
            questionNumber: "2.3",
            questionText: "What security measures do you implement for data protection?",
            section: "Security & Compliance"
          },
          {
            rfpDocumentId: documentId,
            questionNumber: "3.5",
            questionText: "Outline your support and maintenance procedures.",
            section: "Support"
          }
        ];
        
        for (const q of mockQuestions) {
          const newQuestion = await storage.createRfpQuestion(q);
          
          // Create an answer for each question
          await storage.createRfpAnswer({
            rfpQuestionId: newQuestion.id,
            // We need to include questionText as it's required by the schema
            questionText: newQuestion.questionText,
            complianceAnswer: "Yes, we comply with this requirement.",
            generatedAnswer: "Our company has extensive experience in AI solutions, with over 50 successful implementations..."
          });
        }
      }
      
      // Update document status to processed
      const updatedDocument = await storage.updateRfpDocumentStatus(documentId, 'processed');
      
      return res.status(200).json({ 
        success: true,
        document: updatedDocument
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  apiRouter.patch("/projects/:projectId/rfp-documents/:documentId/status", async (req: Request, res: Response) => {
    try {
      const documentId = req.params.documentId;
      
      if (!documentId) {
        return res.status(400).json({ message: "Valid document ID is required" });
      }
      
      const { status } = req.body;
      const validStatuses = ['unprocessed', 'processed', 'reviewed', 'done'];
      
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          message: `Status must be one of: ${validStatuses.join(', ')}` 
        });
      }
      
      const updatedDocument = await storage.updateRfpDocumentStatus(documentId, status as any);
      
      if (!updatedDocument) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      return res.status(200).json({ document: updatedDocument });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // RFP Answer routes
  apiRouter.patch("/rfp-answers/:answerId", async (req: Request, res: Response) => {
    try {
      const answerId = req.params.answerId;
      
      console.log(`Attempting to update answer with ID: ${answerId}`);
      console.log(`Request body:`, req.body);
      
      if (!answerId) {
        return res.status(400).json({ message: "Valid answer ID is required" });
      }
      
      const answerData = updateRfpAnswerSchema.parse({
        ...req.body,
        id: answerId
      });
      
      console.log(`Parsed answer data:`, answerData);
      
      const updatedAnswer = await storage.updateRfpAnswer(answerData);
      
      console.log(`Update result:`, updatedAnswer);
      
      if (!updatedAnswer) {
        return res.status(404).json({ message: "Answer not found" });
      }
      
      return res.status(200).json({ answer: updatedAnswer });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Suggested Document routes
  apiRouter.get("/suggested-documents", async (req: Request, res: Response) => {
    try {
      const documents = await storage.getSuggestedDocuments();
      return res.status(200).json({ documents });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  apiRouter.post("/suggested-documents", async (req: Request, res: Response) => {
    try {
      const documentData = insertDocumentSchema.parse(req.body);
      const newDocument = await storage.createSuggestedDocument(documentData);
      return res.status(201).json({ document: newDocument });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  apiRouter.patch("/suggested-documents/:documentId/review", async (req: Request, res: Response) => {
    try {
      const documentId = req.params.documentId;
      
      if (!documentId) {
        return res.status(400).json({ message: "Valid document ID is required" });
      }
      
      const { status, reviewedBy } = req.body;
      
      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ 
          message: "Status must be either 'approved' or 'rejected'" 
        });
      }
      
      if (!reviewedBy) {
        return res.status(400).json({ message: "Valid reviewer ID is required" });
      }
      
      const updatedDocument = await storage.updateSuggestedDocumentStatus(
        documentId,
        status as 'approved' | 'rejected',
        reviewedBy
      );
      
      if (!updatedDocument) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      return res.status(200).json({ document: updatedDocument });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create the HTTP server
  const httpServer = createServer(app);
  return httpServer;
}
