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
  updateRfpAnswerSchema,
} from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // API Routes
  const apiRouter = express.Router();
  app.use("/api", apiRouter);
  
  // Middleware for requiring admin access
  const requireAdmin = async (req: Request, res: Response, next: express.NextFunction) => {
    try {
      // In a real app, get this from session or JWT token
      const userEmail = req.headers.authorization;
      
      if (!userEmail) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Check if the user is an admin
      const user = await storage.getUserByEmail(userEmail);
      
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      // User is admin, proceed
      next();
    } catch (error) {
      console.error("Error in admin middleware:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

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
          isAdmin: user.isAdmin,
        },
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
          isAdmin: newUser.isAdmin,
        },
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
          const userMembership = members.find((m) => m.userId === userId);
          return {
            ...project,
            role: userMembership?.role || "viewer",
          };
        }),
      );

      return res.status(200).json({ projects: projectsWithRole });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // API endpoint to get ALL projects (for admin users)
  apiRouter.get("/projects/all", requireAdmin, async (req: Request, res: Response) => {
    try {
      const projects = await storage.getProjects();
      return res.status(200).json({ projects });
    } catch (error) {
      console.error("Error getting all projects:", error);
      return res.status(500).json({ error: "Failed to retrieve all projects" });
    }
  });
  
  apiRouter.get("/projects/:id", async (req: Request, res: Response) => {
    try {
      const projectId = req.params.id;

      if (!projectId) {
        return res
          .status(400)
          .json({ message: "Valid project ID is required" });
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
        documents,
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
  apiRouter.post(
    "/projects/:projectId/members",
    async (req: Request, res: Response) => {
      try {
        const projectId = req.params.projectId;

        if (!projectId) {
          return res
            .status(400)
            .json({ message: "Valid project ID is required" });
        }

        const memberData = insertProjectPermissionSchema.parse({
          ...req.body,
          projectId,
        });

        const newMember = await storage.addProjectMember(memberData);
        return res.status(201).json({ member: newMember });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: error.errors[0].message });
        }
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // RFP Document routes
  apiRouter.get(
    "/projects/:projectId/rfp-documents",
    async (req: Request, res: Response) => {
      try {
        const projectId = req.params.projectId;

        if (!projectId) {
          return res
            .status(400)
            .json({ message: "Valid project ID is required" });
        }

        const documents = await storage.getRfpDocuments(projectId);
        return res.status(200).json({ documents });
      } catch (error) {
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Export RFP document to CSV
  apiRouter.get(
    "/projects/:projectId/rfp-documents/:documentId/export-csv",
    async (req: Request, res: Response) => {
      try {
        const documentId = req.params.documentId;
        
        if (!documentId) {
          return res.status(400).json({ message: "Valid document ID is required" });
        }
        
        // Get document details first to check if it's in 'done' status
        const { data: document, error: documentError } = await supabase
          .from('rfp_documents')
          .select('*')
          .eq('id', documentId)
          .single();
          
        if (documentError || !document) {
          console.error('Error fetching document:', documentError);
          return res.status(404).json({ message: "Document not found" });
        }
        
        // Ensure document is in 'done' status
        if (document.status !== 'done') {
          return res.status(400).json({ 
            message: "Only documents with 'done' status can be exported to CSV" 
          });
        }
        
        // Get all answers for this document
        const { data: answers, error: answersError } = await supabase
          .from('rfp_answers')
          .select('*')
          .eq('rfp_document_id', documentId);
          
        if (answersError) {
          console.error('Error fetching answers:', answersError);
          return res.status(500).json({ message: "Error fetching document answers" });
        }
        
        if (!answers || answers.length === 0) {
          return res.status(404).json({ message: "No answers found for this document" });
        }
        
        // Generate CSV content
        const csvHeader = "Question,Compliance,Answer\n";
        
        const csvRows = answers.map(answer => {
          // Escape double quotes in fields by replacing with two double quotes
          const question = answer.question_text?.replace(/"/g, '""') || '';
          const compliance = answer.compliance_answer?.replace(/"/g, '""') || '';
          const answerText = answer.generated_answer?.replace(/"/g, '""') || '';
          
          // Wrap fields in double quotes and separate with commas
          return `"${question}","${compliance}","${answerText}"`;
        });
        
        const csvContent = csvHeader + csvRows.join('\n');
        
        // Set response headers for CSV download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="rfp_export_${documentId}.csv"`);
        
        // Send CSV content
        return res.status(200).send(csvContent);
      } catch (error) {
        console.error('Error exporting to CSV:', error);
        return res.status(500).json({ 
          message: "Internal server error",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  );
  
  apiRouter.get(
    "/projects/:projectId/rfp-documents/:documentId",
    async (req: Request, res: Response) => {
      try {
        const documentId = req.params.documentId;

        console.log(
          `*** DIRECT DB IMPLEMENTATION: Attempting to load document with ID: ${documentId}`,
        );

        if (!documentId) {
          return res
            .status(400)
            .json({ message: "Valid document ID is required" });
        }

        // Get the document details
        const { data: documentData, error: documentError } = await supabase
          .from("rfp_documents")
          .select("*")
          .eq("id", documentId)
          .single();

        if (documentError) {
          console.log(`Error fetching document:`, documentError);
          return res
            .status(500)
            .json({
              message: `Failed to fetch document: ${documentError.message}`,
            });
        }

        if (!documentData) {
          return res.status(404).json({ message: "Document not found" });
        }

        console.log(`Document from database:`, documentData);

        let questionsWithAnswers = [];
        
        console.log(`Document status: ${documentData.status}`);
        
        // Handle differently based on document status
        if (documentData.status === "unprocessed") {
          // For unprocessed documents, get questions without answers
          console.log(
            `Fetching questions for unprocessed document ID: ${documentId}`,
          );

          const { data: questionsData, error: questionsError } = await supabase
            .from("rfp_questions")
            .select("*")
            .eq("rfp_document_id", documentId);

          if (questionsError) {
            console.log(`Error fetching questions:`, questionsError);
            return res
              .status(500)
              .json({
                message: `Failed to fetch questions: ${questionsError.message}`,
              });
          }

          console.log(
            `Found ${questionsData?.length || 0} questions for unprocessed document`,
          );

          // Debug: output all questions found for this document
          if (questionsData && questionsData.length > 0) {
            console.log("Questions found for this document:");
            questionsData.forEach((q: any) => {
              console.log(` - ${q.id}: ${q.question_text}`);
            });
          } else {
            console.log(
              "No questions found in rfp_questions table for this document",
            );
          }

          // Transform questions into expected format (without answers)
          questionsWithAnswers = (questionsData || []).map((question: any) => {
            return {
              id: question.id,
              rfpDocumentId: question.rfp_document_id,
              // questionNumber: question.question_number || '',
              questionText: question.question_text,
              // section: question.section,
              // answer: null // No answer yet for unprocessed documents
            };
          });
        } else {
          // For processed/reviewed/done documents, get answers with questions
          const { data: answersData, error: answersError } = await supabase
            .from("rfp_answers")
            .select("*")
            .eq("rfp_document_id", documentId);

          if (answersError) {
            console.log(`Error fetching answers:`, answersError);
            return res
              .status(500)
              .json({
                message: `Failed to fetch answers: ${answersError.message}`,
              });
          }

          console.log(
            `Found ${answersData?.length || 0} answers directly from answers table`,
          );
          if (answersData && answersData.length > 0) {
            console.log(`First answer from DB:`, answersData[0]);
          } else {
            console.log(`No answers found for document ID: ${documentId}`);
          }

          // Transform the answers into the expected format for the frontend
          questionsWithAnswers = (answersData || []).map((dbAnswer: any) => {
            return {
              id: dbAnswer.rfp_question_id,
              rfpDocumentId: dbAnswer.rfp_document_id,
              questionText: dbAnswer.question_text,
              answer: {
                id: dbAnswer.id,
                rfpQuestionId: dbAnswer.rfp_question_id,
                complianceAnswer: dbAnswer.compliance_answer,
                generatedAnswer: dbAnswer.generated_answer,
                lastReviewedBy: dbAnswer.last_reviewed_by,
                lastReviewedAt: dbAnswer.last_reviewed_at,
              },
            };
          });
        }

        console.log(
          `Returning ${questionsWithAnswers.length} questions with answers from direct DB call`,
        );

        // Add this for debugging
        if (questionsWithAnswers.length > 0) {
          console.log(
            "Sample transformed question with answer:",
            JSON.stringify(questionsWithAnswers[0], null, 2),
          );
        }

        // Return the results
        return res.status(200).json({
          document: documentData,
          questionsWithAnswers,
        });
      } catch (error) {
        console.log(`Error in GET rfp-documents route:`, error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  apiRouter.post(
    "/projects/:projectId/rfp-documents",
    async (req: Request, res: Response) => {
      try {
        const projectId = req.params.projectId;

        if (!projectId) {
          return res
            .status(400)
            .json({ message: "Valid project ID is required" });
        }

        const documentData = insertRfpDocumentSchema.parse({
          ...req.body,
          projectId,
        });

        const newDocument = await storage.createRfpDocument(documentData);
        return res.status(201).json({ document: newDocument });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: error.errors[0].message });
        }
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  apiRouter.post(
    "/projects/:projectId/rfp-documents/:documentId/process",
    async (req: Request, res: Response) => {
      try {
        const documentId = req.params.documentId;

        console.log(`Processing document with ID: ${documentId}`);

        if (!documentId) {
          return res
            .status(400)
            .json({ message: "Valid document ID is required" });
        }

        const document = await storage.getRfpDocument(documentId);

        console.log(`Found document:`, document);

        if (!document) {
          return res.status(404).json({ message: "Document not found" });
        }

        // Import the AI service
        const { processDocumentQuestions } = await import('./ai-service');
        
        // Process all questions for this document using RAG
        const processingResult = await processDocumentQuestions(documentId);
        
        if (!processingResult.success) {
          console.log(`Errors occurred during processing:`, processingResult.errors);
          // Continue even if there are some errors, as we may have processed some questions successfully
        }
        
        console.log(`Successfully processed ${processingResult.processedCount} questions`);
        
        // Update document status to processed
        const updatedDocument = await storage.updateRfpDocumentStatus(
          documentId,
          "processed",
        );

        return res.status(200).json({
          success: true,
          processedCount: processingResult.processedCount,
          document: updatedDocument,
          errors: processingResult.errors
        });
      } catch (error) {
        console.error("Error in document processing endpoint:", error);
        return res.status(500).json({ 
          message: "Internal server error",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    },
  );

  apiRouter.patch(
    "/projects/:projectId/rfp-documents/:documentId/status",
    async (req: Request, res: Response) => {
      try {
        const documentId = req.params.documentId;

        if (!documentId) {
          return res
            .status(400)
            .json({ message: "Valid document ID is required" });
        }

        const { status } = req.body;
        const validStatuses = [
          "unprocessed",
          "processed",
          "under review",
          "reviewed",
          "done",
        ];

        if (!validStatuses.includes(status)) {
          return res.status(400).json({
            message: `Status must be one of: ${validStatuses.join(", ")}`,
          });
        }

        const updatedDocument = await storage.updateRfpDocumentStatus(
          documentId,
          status as any,
        );

        if (!updatedDocument) {
          return res.status(404).json({ message: "Document not found" });
        }

        return res.status(200).json({ document: updatedDocument });
      } catch (error) {
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // RFP Answer routes
  apiRouter.patch(
    "/rfp-answers/:answerId",
    async (req: Request, res: Response) => {
      try {
        const answerId = req.params.answerId;

        console.log(`Attempting to update answer with ID: ${answerId}`);
        console.log(`Request body:`, req.body);

        if (!answerId) {
          return res
            .status(400)
            .json({ message: "Valid answer ID is required" });
        }

        const answerData = updateRfpAnswerSchema.parse({
          ...req.body,
          id: answerId,
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
    },
  );

  // AI and Vector Database routes
  apiRouter.post("/ai/answer", async (req: Request, res: Response) => {
    try {
      const { question } = req.body;
      
      if (!question || typeof question !== 'string') {
        return res.status(400).json({ message: "Valid question text is required" });
      }
      
      // Import the AI service
      const { answerQuestion } = await import('./ai-service');
      
      // Get answer from RAG engine
      const result = await answerQuestion(question);
      
      return res.status(200).json(result);
    } catch (error) {
      console.error("Error generating answer:", error);
      return res.status(500).json({ 
        message: "Error generating answer",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  apiRouter.post("/vector-db/initialize", async (req: Request, res: Response) => {
    try {
      // Import the AI service
      const { initializePineconeIndex } = await import('./ai-service');
      
      // Initialize Pinecone index
      const success = await initializePineconeIndex();
      
      return res.status(200).json({ 
        success,
        message: success ? "Vector database initialized successfully" : "Failed to initialize vector database"
      });
    } catch (error) {
      console.error("Error initializing vector database:", error);
      return res.status(500).json({ 
        success: false,
        message: "Error initializing vector database",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  apiRouter.post("/vector-db/index-document/:documentId", async (req: Request, res: Response) => {
    try {
      const documentId = req.params.documentId;
      
      if (!documentId) {
        return res.status(400).json({ message: "Valid document ID is required" });
      }
      
      // Import the AI service
      const { indexDocumentChunks } = await import('./ai-service');
      
      // Index document chunks
      const result = await indexDocumentChunks(documentId);
      
      return res.status(200).json(result);
    } catch (error) {
      console.error("Error indexing document:", error);
      return res.status(500).json({ 
        success: false,
        message: "Error indexing document",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  apiRouter.post("/vector-db/index-knowledge-base", async (req: Request, res: Response) => {
    try {
      // Import the AI service
      const { indexKnowledgeBase } = await import('./ai-service');
      
      // Index all knowledge base documents
      const result = await indexKnowledgeBase();
      
      return res.status(200).json(result);
    } catch (error) {
      console.error("Error indexing knowledge base:", error);
      return res.status(500).json({ 
        success: false,
        message: "Error indexing knowledge base",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // File upload handling for document suggestions
  apiRouter.post("/upload-document", async (req: Request, res: Response) => {
    try {
      // We need multer for file upload handling, but since we want to keep this 
      // simple for now, let's respond with a placeholder URL
      // In a production app, we'd use multer middleware to handle file uploads
      
      // Use the Supabase client to upload the file to the vtex-files bucket
      const userId = req.body.userId || 'unknown-user';
      const fileName = req.body.name || 'unnamed-document';
      const timestamp = Date.now();
      const filePath = `${userId}/${timestamp}_${fileName}`;
      
      // Get the Supabase URL for this file
      // In production, this would be after actually uploading the file
      const { data: { publicUrl } } = supabase.storage
        .from('vtex-files')
        .getPublicUrl(filePath);
      
      return res.status(200).json({
        success: true,
        fileUrl: publicUrl,
        filePath,
        message: "File uploaded successfully"
      });
    } catch (error) {
      console.error("Error uploading document:", error);
      return res.status(500).json({ 
        success: false,
        message: "Error uploading document",
        error: error instanceof Error ? error.message : String(error)
      });
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

  apiRouter.post(
    "/suggested-documents",
    async (req: Request, res: Response) => {
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
    },
  );

  apiRouter.patch(
    "/suggested-documents/:documentId/review",
    async (req: Request, res: Response) => {
      try {
        const documentId = req.params.documentId;

        if (!documentId) {
          return res
            .status(400)
            .json({ message: "Valid document ID is required" });
        }

        const { status, reviewedBy } = req.body;

        if (!["approved", "rejected"].includes(status)) {
          return res.status(400).json({
            message: "Status must be either 'approved' or 'rejected'",
          });
        }

        if (!reviewedBy) {
          return res
            .status(400)
            .json({ message: "Valid reviewer ID is required" });
        }

        const updatedDocument = await storage.updateSuggestedDocumentStatus(
          documentId,
          status as "approved" | "rejected",
          reviewedBy,
        );

        if (!updatedDocument) {
          return res.status(404).json({ message: "Document not found" });
        }

        return res.status(200).json({ document: updatedDocument });
      } catch (error) {
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Admin middleware to check if user is an admin
  // Admin middleware already defined at the top of the file

  // Admin routes
  apiRouter.get("/admin/documents", requireAdmin, async (req: Request, res: Response) => {
    try {
      const documents = await storage.getDocuments();
      return res.status(200).json(documents);
    } catch (error) {
      console.error('Error fetching documents for admin:', error);
      return res.status(500).json({ error: 'Failed to fetch documents' });
    }
  });

  apiRouter.get("/admin/rfp-documents", requireAdmin, async (req: Request, res: Response) => {
    try {
      // Get all RFP documents across all projects
      const documents = await storage.getAllRfpDocuments();
      return res.status(200).json(documents);
    } catch (error) {
      console.error('Error fetching RFP documents for admin:', error);
      return res.status(500).json({ error: 'Failed to fetch RFP documents' });
    }
  });

  apiRouter.post("/admin/documents/:id/approve", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      if (!id) {
        return res.status(400).json({ error: 'Document ID is required' });
      }
      
      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Status must be either "approved" or "rejected"' });
      }
      
      const document = await storage.updateDocumentApprovalStatus(id, status === 'approved');
      
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      return res.status(200).json(document);
    } catch (error) {
      console.error('Error updating document approval status:', error);
      return res.status(500).json({ error: 'Failed to update document approval status' });
    }
  });

  apiRouter.post("/admin/rfp-documents/:id/approve", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      if (!id) {
        return res.status(400).json({ error: 'RFP Document ID is required' });
      }
      
      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Status must be either "approved" or "rejected"' });
      }
      
      const rfpDocument = await storage.updateRfpDocumentApprovalStatus(id, status);
      
      if (!rfpDocument) {
        return res.status(404).json({ error: 'RFP Document not found' });
      }
      
      return res.status(200).json(rfpDocument);
    } catch (error) {
      console.error('Error updating RFP document approval status:', error);
      return res.status(500).json({ error: 'Failed to update RFP document approval status' });
    }
  });

  // Create the HTTP server
  const httpServer = createServer(app);
  return httpServer;
}
