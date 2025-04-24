import express, { type Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./supabase-storage";
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
      const projectId = parseInt(req.params.projectId);
      
      if (isNaN(projectId)) {
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
      
      const questions = await storage.getRfpQuestions(documentId);
      console.log(`Found ${questions.length} questions for document:`, questions);
      
      // Get answers directly by document ID
      const answers = await storage.getRfpAnswersByDocumentId(documentId);
      console.log(`Found ${answers.length} answers for document ${documentId}:`, answers);
      
      // Map questions to their answers
      const questionsWithAnswers = questions.map(question => {
        const answer = answers.find(a => a.rfpQuestionId === question.id);
        console.log(`For question ${question.id}, found answer:`, answer);
        return {
          ...question,
          answer: answer || null
        };
      });
      
      return res.status(200).json({ 
        document,
        questionsWithAnswers
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  apiRouter.post("/projects/:projectId/rfp-documents", async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      if (isNaN(projectId)) {
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
      console.log("Processing document with ID:", documentId);
      
      if (!documentId) {
        return res.status(400).json({ message: "Valid document ID is required" });
      }
      
      const document = await storage.getRfpDocument(documentId);
      console.log("Found document:", document);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      // Mock processing questions and generating answers
      // In a real app, this would call the RAG engine
      const questions = await storage.getRfpQuestions(documentId);
      
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
            rfpDocumentId: documentId,
            rfpQuestionId: newQuestion.id,
            complianceAnswer: "Yes, we comply with this requirement.",
            generatedAnswer: "Our company has extensive experience in AI solutions, with over 50 successful implementations..."
          });
        }
      } else {
        // Check if each existing question has an answer
        const answers = await storage.getRfpAnswersByDocumentId(documentId);
        console.log(`Found ${answers.length} existing answers for document ${documentId}`);
        
        // For questions without answers, create new answers
        for (const question of questions) {
          const existingAnswer = answers.find(a => a.rfpQuestionId === question.id);
          
          if (!existingAnswer) {
            console.log(`Creating answer for question ${question.id}`);
            
            // Generate a demo answer for this question
            let demoAnswer = "This is an AI-generated answer based on your knowledge base.";
            let demoCompliance = "Yes, natively";
            
            // Generate more specific answers for common requirements
            if (question.questionText.toLowerCase().includes("security") || 
                question.questionText.toLowerCase().includes("encrypt")) {
              demoAnswer = "Our platform utilizes industry-standard security measures including AES-256 encryption for data at rest and TLS 1.3 for data in transit. All user authentication follows OAuth 2.0 protocols and supports multi-factor authentication.";
              demoCompliance = "Yes, exceeds requirements";
            } else if (question.questionText.toLowerCase().includes("scale") || 
                       question.questionText.toLowerCase().includes("traffic") ||
                       question.questionText.toLowerCase().includes("increase")) {
              demoAnswer = "Our cloud-native architecture is designed to scale horizontally and vertically. The platform automatically provisions additional resources during peak demand periods and can handle a 500% increase in traffic without degradation in performance.";
              demoCompliance = "Yes, natively";
            } else if (question.questionText.toLowerCase().includes("update") || 
                       question.questionText.toLowerCase().includes("downtime")) {
              demoAnswer = "Updates to the platform are performed with zero downtime using a blue-green deployment strategy. All content and product changes are reflected in real-time across all instances and regions.";
              demoCompliance = "Yes, natively";  
            }
            
            await storage.createRfpAnswer({
              rfpDocumentId: documentId,
              rfpQuestionId: question.id,
              complianceAnswer: demoCompliance,
              generatedAnswer: demoAnswer
            });
          }
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
      
      if (!answerId) {
        return res.status(400).json({ message: "Valid answer ID is required" });
      }
      
      const answerData = updateRfpAnswerSchema.parse({
        ...req.body,
        id: answerId
      });
      
      const updatedAnswer = await storage.updateRfpAnswer(answerData);
      
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
      const documentData = insertSuggestedDocumentSchema.parse(req.body);
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
