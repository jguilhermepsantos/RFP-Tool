import express, { type Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { supabase } from "./db";
import { handleMockUpload, isS3Configured } from "./supabase-s3";
import { chunkingRouter } from "./routes-chunking";
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

  // Add chunks endpoint FIRST to ensure it takes precedence
  // Get individual chunk by ID
  apiRouter.get("/chunks/:chunkId", async (req: Request, res: Response) => {
    try {
      const { chunkId } = req.params;
      
      // Query Supabase directly for the specific chunk
      const { data: chunk, error } = await supabase
        .from('chunks')
        .select('*')
        .eq('id', chunkId)
        .single();
      
      if (error || !chunk) {
        return res.status(404).json({ error: "Chunk not found" });
      }
      
      // Transform to camelCase to match frontend expectations
      const transformedChunk = {
        id: chunk.id,
        content: chunk.content,
        documentId: chunk.document_id,
        createdAt: chunk.created_at,
        embedded: chunk.embedded || false,
        embeddedAt: chunk.embedded_at,
        scope: chunk.scope || 'global',
        source: chunk.source || 'document'
      };
      
      return res.json(transformedChunk);
    } catch (error) {
      console.error("Error fetching chunk:", error);
      return res.status(500).json({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  apiRouter.get("/documents/:documentId/chunks", async (req: Request, res: Response) => {
    try {
      const { documentId } = req.params;
      
      console.log(`[CHUNKS API] Received request to get chunks for document ${documentId}`);
      
      // Set JSON response headers to ensure proper response type
      res.setHeader('Content-Type', 'application/json');
      
      // No validation needed - just get chunks directly by document_id
      // This works for both regular documents and RFP documents
      const chunks = await storage.getChunks(documentId);
      
      console.log(`[CHUNKS API] Found ${chunks.length} chunks for document ${documentId}`);
      console.log(`[CHUNKS API] Sample chunk data:`, chunks.length > 0 ? chunks[0] : 'none');
      
      return res.json({
        success: true,
        chunks: chunks
      });
    } catch (error) {
      console.error('[CHUNKS API] Error fetching document chunks:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        chunks: []
      });
    }
  });

  // Register chunking routes after the specific chunks endpoint
  apiRouter.use(chunkingRouter);

  // Middleware for requiring admin access
  const requireAdmin = async (
    req: Request,
    res: Response,
    next: express.NextFunction,
  ) => {
    try {
      // In a real app, get this from session or JWT token
      const userEmail = req.headers.authorization;

      if (!userEmail) {
        return res.status(401).json({ message: "Authentication required" });
      }

      console.log(`Admin authorization attempted with email: ${userEmail}`);

      // For development purposes, bypass admin check
      if (process.env.NODE_ENV === "development") {
        console.log("Development mode: bypassing admin check");
        return next();
      }

      // Check if the user is an admin
      const user = await storage.getUserByEmail(userEmail);

      if (!user || user.role !== "admin") {
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
  apiRouter.get(
    "/projects/all",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const projects = await storage.getProjects();
        return res.status(200).json({ projects });
      } catch (error) {
        console.error("Error getting all projects:", error);
        return res
          .status(500)
          .json({ error: "Failed to retrieve all projects" });
      }
    },
  );

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

  // Delete project (only owner can delete)
  apiRouter.delete("/projects/:id", async (req: Request, res: Response) => {
    try {
      const projectId = req.params.id;
      const userId = "feb8dcbc-7ec6-4eed-884e-f3136665eed6"; // This should come from auth context

      if (!projectId) {
        return res.status(400).json({ message: "Valid project ID is required" });
      }

      // Check if project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check if user has owner role for this project
      const projectMembers = await storage.getProjectMembers(projectId);
      const userMembership = projectMembers.find(member => 
        (member.userId || member.user_id) === userId
      );
      
      if (!userMembership || userMembership.role !== 'owner') {
        return res.status(403).json({ 
          message: "Only the project owner can delete this project" 
        });
      }

      // Delete the project (cascading deletes will handle related data)
      await storage.deleteProject(projectId);

      return res.status(200).json({ 
        message: "Project deleted successfully" 
      });
    } catch (error) {
      console.error("Error deleting project:", error);
      return res.status(500).json({ 
        message: "Failed to delete project. Please try again." 
      });
    }
  });

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
          return res
            .status(400)
            .json({ message: "Valid document ID is required" });
        }

        // Get document details first to check if it's in 'done' status
        const { data: document, error: documentError } = await supabase
          .from("rfp_documents")
          .select("*")
          .eq("id", documentId)
          .single();

        if (documentError || !document) {
          console.error("Error fetching document:", documentError);
          return res.status(404).json({ message: "Document not found" });
        }

        // Ensure document is in 'done' status
        if (document.status !== "done") {
          return res.status(400).json({
            message: "Only documents with 'done' status can be exported to CSV",
          });
        }

        // Get all answers for this document
        const { data: answers, error: answersError } = await supabase
          .from("rfp_answers")
          .select("*")
          .eq("rfp_document_id", documentId);

        if (answersError) {
          console.error("Error fetching answers:", answersError);
          return res
            .status(500)
            .json({ message: "Error fetching document answers" });
        }

        if (!answers || answers.length === 0) {
          return res
            .status(404)
            .json({ message: "No answers found for this document" });
        }

        // Generate CSV content
        const csvHeader = "Question,Compliance,Answer\n";

        const csvRows = answers.map((answer) => {
          // Escape double quotes in fields by replacing with two double quotes
          const question = answer.question_text?.replace(/"/g, '""') || "";
          const compliance =
            answer.compliance_answer?.replace(/"/g, '""') || "";
          const answerText = answer.generated_answer?.replace(/"/g, '""') || "";

          // Wrap fields in double quotes and separate with commas
          return `"${question}","${compliance}","${answerText}"`;
        });

        const csvContent = csvHeader + csvRows.join("\n");

        // Set response headers for CSV download
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="rfp_export_${documentId}.csv"`,
        );

        // Send CSV content
        return res.status(200).send(csvContent);
      } catch (error) {
        console.error("Error exporting to CSV:", error);
        return res.status(500).json({
          message: "Internal server error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
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
          return res.status(500).json({
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
            .eq("rfp_document_id", documentId)
            .order("created_at", { ascending: true });

          if (questionsError) {
            console.log(`Error fetching questions:`, questionsError);
            return res.status(500).json({
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
            .eq("rfp_document_id", documentId)
            .order("created_at", { ascending: true });

          if (answersError) {
            console.log(`Error fetching answers:`, answersError);
            return res.status(500).json({
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
          questionsWithAnswers = (answersData || []).map((dbAnswer: any, index: number) => {
            // Parse source chunks if they exist
            let sourceChunks = [];
            if (dbAnswer.source_chunks) {
              try {
                sourceChunks = JSON.parse(dbAnswer.source_chunks);
              } catch (e) {
                console.log(`Failed to parse source chunks for answer ${dbAnswer.id}:`, e);
              }
            }

            return {
              id: dbAnswer.rfp_question_id,
              rfpDocumentId: dbAnswer.rfp_document_id,
              questionText: dbAnswer.question_text,
              sortOrder: index, // Add stable sort order based on original created_at ordering
              createdAt: dbAnswer.created_at, // Include created_at for debugging
              answer: {
                id: dbAnswer.id,
                rfpQuestionId: dbAnswer.rfp_question_id,
                complianceAnswer: dbAnswer.compliance_answer,
                generatedAnswer: dbAnswer.generated_answer,
                sourceChunks: sourceChunks,
                averageSimilarity: dbAnswer.average_similarity,
                confidenceLevel: dbAnswer.confidence_level,
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
        const { processDocumentQuestions } = await import("./ai-service");

        // Process all questions for this document using RAG
        const processingResult = await processDocumentQuestions(documentId);

        if (!processingResult.success) {
          console.log(
            `Errors occurred during processing:`,
            processingResult.errors,
          );
          // Continue even if there are some errors, as we may have processed some questions successfully
        }

        console.log(
          `Successfully processed ${processingResult.processedCount} questions`,
        );

        // Update document status to processed
        const updatedDocument = await storage.updateRfpDocumentStatus(
          documentId,
          "processed",
        );

        return res.status(200).json({
          success: true,
          processedCount: processingResult.processedCount,
          document: updatedDocument,
          errors: processingResult.errors,
        });
      } catch (error) {
        console.error("Error in document processing endpoint:", error);
        return res.status(500).json({
          message: "Internal server error",
          error: error instanceof Error ? error.message : String(error),
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

  // Batch users endpoint for efficient user data fetching
  apiRouter.post("/users/batch", async (req: Request, res: Response) => {
    try {
      const { userIds } = req.body;

      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res
          .status(400)
          .json({ message: "Valid user IDs array is required" });
      }

      // Remove duplicates and filter out null/undefined values
      const uniqueUserIds = Array.from(new Set(userIds.filter((id) => id)));

      if (uniqueUserIds.length === 0) {
        return res.status(200).json({ users: [] });
      }

      // Fetch all users in a single query using Supabase
      const { data: users, error } = await supabase
        .from("users")
        .select("id, email, name")
        .in("id", uniqueUserIds);

      if (error) {
        console.error("Error fetching batch users:", error);
        return res.status(500).json({ message: "Failed to fetch users" });
      }

      return res.status(200).json({ users: users || [] });
    } catch (error) {
      console.error("Error in batch users endpoint:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

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

        // Auto-change document status from "processed" to "under review" when answer is edited
        if (updatedAnswer.rfpDocumentId) {
          try {
            const document = await storage.getRfpDocument(updatedAnswer.rfpDocumentId);
            if (document?.status === 'processed') {
              await storage.updateRfpDocumentStatus(document.id, 'under review');
            }
          } catch (statusError) {
            console.error(`Error updating document status after answer edit:`, statusError);
            // Don't fail the answer update if status change fails
          }
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

      if (!question || typeof question !== "string") {
        return res
          .status(400)
          .json({ message: "Valid question text is required" });
      }

      // Import the AI service
      const { answerQuestion } = await import("./ai-service");

      // Get answer from RAG engine
      const result = await answerQuestion(question);

      return res.status(200).json(result);
    } catch (error) {
      console.error("Error generating answer:", error);
      return res.status(500).json({
        message: "Error generating answer",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  apiRouter.post(
    "/vector-db/initialize",
    async (req: Request, res: Response) => {
      try {
        // Import the AI service
        const { initializePineconeIndex } = await import("./ai-service");

        // Initialize Pinecone index
        const success = await initializePineconeIndex();

        return res.status(200).json({
          success,
          message: success
            ? "Vector database initialized successfully"
            : "Failed to initialize vector database",
        });
      } catch (error) {
        console.error("Error initializing vector database:", error);
        return res.status(500).json({
          success: false,
          message: "Error initializing vector database",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  apiRouter.post(
    "/vector-db/index-document/:documentId",
    async (req: Request, res: Response) => {
      try {
        const documentId = req.params.documentId;

        if (!documentId) {
          return res
            .status(400)
            .json({ message: "Valid document ID is required" });
        }

        // Import the AI service
        const { indexDocumentChunks } = await import("./ai-service");

        // Index document chunks
        const result = await indexDocumentChunks(documentId);

        return res.status(200).json(result);
      } catch (error) {
        console.error("Error indexing document:", error);
        return res.status(500).json({
          success: false,
          message: "Error indexing document",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  apiRouter.post(
    "/vector-db/index-knowledge-base",
    async (req: Request, res: Response) => {
      try {
        // Import the AI service
        const { indexKnowledgeBase } = await import("./ai-service");

        // Index all knowledge base documents
        const result = await indexKnowledgeBase();

        return res.status(200).json(result);
      } catch (error) {
        console.error("Error indexing knowledge base:", error);
        return res.status(500).json({
          success: false,
          message: "Error indexing knowledge base",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // Use the S3 service for file uploads

  // File upload handling for document suggestions
  apiRouter.post("/upload-document", async (req: Request, res: Response) => {
    try {
      // Get file metadata from the request
      const userId = req.body.userId || "unknown-user";
      const fileName = req.body.name || "unnamed-document";
      const contentType = req.body.contentType || "application/pdf";

      console.log(
        `Processing file upload request: ${fileName} for user ${userId}`,
      );

      try {
        // Try the S3 credentials if configured
        if (isS3Configured()) {
          console.log("Using S3 credentials for Supabase upload");

          // Use the S3 client to upload a mock file
          // In a full implementation, this would process a real file upload
          const { fileUrl, filePath } = await handleMockUpload(
            userId,
            fileName,
            contentType,
          );

          return res.status(200).json({
            success: true,
            fileUrl,
            filePath,
            message: "File uploaded successfully to Supabase storage",
          });
        }
      } catch (uploadError) {
        // Log the error but continue with the fallback
        console.warn(
          "S3 upload failed, falling back to mock implementation:",
          uploadError,
        );
      }

      // Fall back to mock implementation regardless of whether S3 credentials exist
      console.log("Using mock URLs for development/testing");

      // Generate file paths in the same format that would be used in production
      const timestamp = Date.now();
      const filePath = `${userId}/${timestamp}_${fileName}`;
      const fileUrl = `https://txgrhpmthibqetiephzp.supabase.co/storage/v1/object/public/vtex-files/${filePath}`;

      return res.status(200).json({
        success: true,
        fileUrl,
        filePath,
        message: "Mock file metadata processed successfully",
      });
    } catch (error) {
      console.error("Error processing upload request:", error);
      return res.status(500).json({
        success: false,
        message: "Error processing upload request",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Suggested Document routes
  apiRouter.get("/suggested-documents", async (req: Request, res: Response) => {
    try {
      // For the MVP, use the in-memory mock documents instead of fetching from the database
      console.log("Returning mock documents:", mockDocuments.length);
      return res.status(200).json({ documents: mockDocuments });
    } catch (error) {
      console.error("Error fetching suggested documents:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // In-memory storage for mock documents for MVP
  const mockDocuments: any[] = [];

  apiRouter.post(
    "/suggested-documents",
    async (req: Request, res: Response) => {
      try {
        // For MVP, create a simple mock document response and store in memory
        // Instead of actually storing in the database

        // Extract the data from the request
        const {
          name,
          fileUrl,
          uploadedBy,
          suggestedBy,
          description,
          contentType,
        } = req.body;

        // Don't attempt to access the database - create a pure mock response
        const mockDocument = {
          id: crypto.randomUUID(),
          name,
          fileUrl,
          uploadedBy: uploadedBy || suggestedBy,
          description, // Include description in our mock
          contentType: contentType || "application/pdf",
          createdAt: new Date(),
          approvalStatus: "pending",
          embedded: false,
          chunked: false,
        };

        // Store in our in-memory array for MVP
        mockDocuments.push(mockDocument);

        console.log("Created mock document:", mockDocument);
        console.log("Total mock documents:", mockDocuments.length);

        return res.status(201).json({ document: mockDocument });
      } catch (error) {
        console.error("Error creating mock document:", error);
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: error.errors[0].message });
        }
        // Return detailed error for debugging
        return res.status(500).json({
          message: "Internal server error",
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
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

        // For MVP, update the in-memory document
        const documentIndex = mockDocuments.findIndex(
          (doc) => doc.id === documentId,
        );

        if (documentIndex === -1) {
          return res.status(404).json({ message: "Document not found" });
        }

        // Create an updated copy of the document
        const updatedDocument = {
          ...mockDocuments[documentIndex],
          approvalStatus: status,
          reviewedBy: reviewedBy,
          reviewedAt: new Date(),
        };

        // Update the document in the array
        mockDocuments[documentIndex] = updatedDocument;

        console.log(`Document ${documentId} status updated to ${status}`);

        return res.status(200).json({ document: updatedDocument });
      } catch (error) {
        console.error("Error updating suggested document:", error);
        return res.status(500).json({
          message: "Internal server error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // Admin middleware to check if user is an admin
  // Admin middleware already defined at the top of the file

  // Admin routes
  apiRouter.get(
    "/admin/documents",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        // Add cache-busting headers
        res.set({
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        
        const documents = await storage.getDocuments();
        return res.status(200).json(documents);
      } catch (error) {
        console.error("Error fetching documents for admin:", error);
        return res.status(500).json({ error: "Failed to fetch documents" });
      }
    },
  );

  apiRouter.get(
    "/admin/rfp-documents",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        // Add cache-busting headers
        res.set({
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        
        // Get all RFP documents across all projects
        const documents = await storage.getAllRfpDocuments();
        return res.status(200).json(documents);
      } catch (error) {
        console.error("Error fetching RFP documents for admin:", error);
        return res.status(500).json({ error: "Failed to fetch RFP documents" });
      }
    },
  );

  apiRouter.post(
    "/admin/documents/:id/approve",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        if (!id) {
          return res.status(400).json({ error: "Document ID is required" });
        }

        if (!["approved", "rejected"].includes(status)) {
          return res
            .status(400)
            .json({ error: 'Status must be either "approved" or "rejected"' });
        }

        const document = await storage.updateDocumentApprovalStatus(
          id,
          status,
        );

        if (!document) {
          return res.status(404).json({ error: "Document not found" });
        }

        // If document was approved, trigger the chunking process directly
        if (status === "approved") {
          try {
            console.log(
              `Document ${id} approved. Starting chunking process...`,
            );

            // Import chunking function and process directly
            const { chunkDocument } = await import('./document-chunking');
            const chunkingResult = await chunkDocument(id);

            if (chunkingResult.success) {
              // Update status to 'chunked' after successful chunking
              const updatedDocument = await storage.updateDocumentApprovalStatus(id, 'chunked');
              console.log(`Document ${id} successfully chunked and status updated`);
              
              // Return the updated document with 'chunked' status
              return res.status(200).json(updatedDocument);
            } else {
              console.error(`Chunking failed for document ${id}:`, chunkingResult.error);
              // Return the approved document even if chunking fails
              return res.status(200).json(document);
            }
          } catch (chunkingError) {
            console.error(
              `Error during document chunking for ${id}:`,
              chunkingError,
            );
            // Return the approved document even if chunking fails
            return res.status(200).json(document);
          }
        }

        return res.status(200).json(document);
      } catch (error) {
        console.error("Error updating document approval status:", error);
        return res
          .status(500)
          .json({ error: "Failed to update document approval status" });
      }
    },
  );

  apiRouter.post(
    "/admin/rfp-documents/:id/approve",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        console.log(
          `[API] Attempting to approve RFP document with ID: ${id} and status: ${status}`,
        );

        if (!id) {
          return res.status(400).json({ error: "RFP Document ID is required" });
        }

        if (!["approved", "rejected"].includes(status)) {
          return res
            .status(400)
            .json({ error: 'Status must be either "approved" or "rejected"' });
        }

        // First, check if the RFP document exists
        const documentExists = await storage.getRfpDocument(id);
        console.log(
          `[API] Document exists check:`,
          documentExists ? "YES" : "NO",
        );

        if (!documentExists) {
          console.log(`[API] RFP Document not found with ID: ${id}`);
          return res
            .status(404)
            .json({ error: "RFP Document not found (pre-check)" });
        }

        console.log(`[API] Updating approval status for RFP document: ${id}`);
        const rfpDocument = await storage.updateRfpDocumentApprovalStatus(
          id,
          status,
        );

        if (!rfpDocument) {
          console.log(
            `[API] Failed to update RFP Document status, returned undefined`,
          );
          return res.status(404).json({ error: "RFP Document not found" });
        }

        // If document was approved, trigger the chunking process directly
        if (status === "approved") {
          try {
            console.log(
              `RFP document ${id} approved. Starting chunking process...`,
            );

            // Import chunking function and process directly
            const { chunkRfpDocument } = await import('./document-chunking');
            const chunkingResult = await chunkRfpDocument(id);

            if (chunkingResult.success) {
              // Update status to 'chunked' after successful chunking
              const updatedDocument = await storage.updateRfpDocumentApprovalStatus(id, 'chunked');
              console.log(`RFP document ${id} successfully chunked and status updated`);
              
              // Return the updated document with 'chunked' status
              return res.status(200).json(updatedDocument);
            } else {
              console.error(`Chunking failed for RFP document ${id}:`, chunkingResult.error);
              // Return the approved document even if chunking fails
              return res.status(200).json(rfpDocument);
            }
          } catch (chunkingError) {
            console.error(
              `Error during RFP document chunking for ${id}:`,
              chunkingError,
            );
            // Return the approved document even if chunking fails
            return res.status(200).json(rfpDocument);
          }
        }

        return res.status(200).json(rfpDocument);
      } catch (error) {
        console.error("Error updating RFP document approval status:", error);
        return res
          .status(500)
          .json({ error: "Failed to update RFP document approval status" });
      }
    },
  );

  // Answer Feedback routes
  apiRouter.get("/rfp-answers/:answerId/feedback", async (req: Request, res: Response) => {
    try {
      const { answerId } = req.params;
      
      if (!answerId) {
        return res.status(400).json({ message: "Valid answer ID is required" });
      }
      
      const feedback = await storage.getAnswerFeedback(answerId);
      return res.status(200).json({ feedback });
    } catch (error) {
      console.error("Error getting answer feedback:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  apiRouter.post("/rfp-answers/:answerId/feedback", async (req: Request, res: Response) => {
    try {
      const { answerId } = req.params;
      const { rating, feedbackText } = req.body;
      
      if (!answerId) {
        return res.status(400).json({ message: "Valid answer ID is required" });
      }
      
      if (!rating || !["good", "bad"].includes(rating)) {
        return res.status(400).json({ message: "Rating must be either 'good' or 'bad'" });
      }
      
      // Get current user ID - using a placeholder for now since we don't have session middleware
      const userId = "feb8dcbc-7ec6-4eed-884e-f3136665eed6"; // This should come from auth context
      
      const feedbackData = {
        rfpAnswerId: answerId,
        rating,
        feedbackText: feedbackText || null,
        createdBy: userId
      };
      
      const feedback = await storage.createAnswerFeedback(feedbackData);
      return res.status(201).json({ feedback });
    } catch (error) {
      console.error("Error creating answer feedback:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  apiRouter.patch("/rfp-answers/:answerId/feedback/:feedbackId", async (req: Request, res: Response) => {
    try {
      const { feedbackId } = req.params;
      const { rating, feedbackText } = req.body;
      
      if (!feedbackId) {
        return res.status(400).json({ message: "Valid feedback ID is required" });
      }
      
      if (rating && !["good", "bad"].includes(rating)) {
        return res.status(400).json({ message: "Rating must be either 'good' or 'bad'" });
      }
      
      const updateData: any = { id: feedbackId };
      if (rating !== undefined) updateData.rating = rating;
      if (feedbackText !== undefined) updateData.feedbackText = feedbackText;
      
      const feedback = await storage.updateAnswerFeedback(updateData);
      
      if (!feedback) {
        return res.status(404).json({ message: "Feedback not found" });
      }
      
      return res.status(200).json({ feedback });
    } catch (error) {
      console.error("Error updating answer feedback:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  apiRouter.delete("/rfp-answers/:answerId/feedback/:feedbackId", async (req: Request, res: Response) => {
    try {
      const { feedbackId } = req.params;
      
      if (!feedbackId) {
        return res.status(400).json({ message: "Valid feedback ID is required" });
      }
      
      const success = await storage.deleteAnswerFeedback(feedbackId);
      
      if (!success) {
        return res.status(404).json({ message: "Feedback not found" });
      }
      
      return res.status(200).json({ message: "Feedback deleted successfully" });
    } catch (error) {
      console.error("Error deleting answer feedback:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // User management endpoints - direct Supabase query
  apiRouter.get("/admin/users-list", async (req: Request, res: Response) => {
    try {
      console.log("[API] /admin/users - Starting direct Supabase query");

      // Direct Supabase query to bypass any storage issues
      const { data: users, error } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("[API] Supabase error:", error);
        return res
          .status(500)
          .json({ error: `Supabase error: ${error.message}` });
      }

      console.log(
        "[API] /admin/users - Retrieved users directly from Supabase:",
        users?.length || 0,
      );

      if (users && users.length > 0) {
        console.log("[API] First user sample:", users[0]);
      }

      res.json(users || []);
    } catch (error) {
      console.error("[API] Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Invite user endpoint
  apiRouter.post(
    "/admin/invite-user",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        console.log("bibi");
        const { email, role } = req.body;

        if (!email || !role) {
          return res.status(400).json({ error: "Email and role are required" });
        }

        if (!["user", "admin"].includes(role)) {
          return res
            .status(400)
            .json({ error: 'Role must be either "user" or "admin"' });
        }

        // Use Supabase Auth Admin API to invite the user

        const { data, error } = await supabase.auth.admin.inviteUserByEmail(
          email,
          {
            data: {
              role: role,
              access_granted: true,
            },
            redirectTo: `${process.env.FRONTEND_URL || 'https://rfp-tool-vtex.replit.app'}/signup-complete`,
          },
        );

        if (error) {
          console.error("Error inviting user via Supabase Auth:", error);
          return res.status(400).json({ error: error.message });
        }

        // Create user record in our users table
        try {
          const { data: userData, error: userError } = await supabase
            .from("users")
            .insert({
              id: data.user?.id,
              email: email,
              role: role,
              access_granted: true,
              name: null,
            })
            .select()
            .single();

          if (userError) {
            console.error("Error creating user record:", userError);
            // Don't fail the invitation if user record creation fails
          }
        } catch (userRecordError) {
          console.error("Error creating user record:", userRecordError);
          // Continue even if user record creation fails
        }

        return res.status(200).json({
          success: true,
          message: "User invitation sent successfully",
          user: data.user,
        });
      } catch (error) {
        console.error("Error inviting user:", error);
        return res
          .status(500)
          .json({ error: "Failed to send user invitation" });
      }
    },
  );

  apiRouter.post(
    "/admin/users/:id/access",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { accessGranted } = req.body;

        if (typeof accessGranted !== "boolean") {
          return res
            .status(400)
            .json({ error: "accessGranted must be a boolean" });
        }

        const result = await storage.updateUserAccess(id, accessGranted);
        if (!result) {
          return res.status(404).json({ error: "User not found" });
        }

        res.json(result);
      } catch (error) {
        console.error("Error updating user access:", error);
        res.status(500).json({ error: "Failed to update user access" });
      }
    },
  );

  apiRouter.post(
    "/admin/users/:id/role",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { role } = req.body;

        if (!["admin", "user"].includes(role)) {
          return res
            .status(400)
            .json({ error: "Invalid role. Must be admin or user." });
        }

        const result = await storage.updateUserRole(id, role);
        if (!result) {
          return res.status(404).json({ error: "User not found" });
        }

        res.json(result);
      } catch (error) {
        console.error("Error updating user role:", error);
        res.status(500).json({ error: "Failed to update user role" });
      }
    },
  );

  // Feedback routes
  apiRouter.post("/feedback", async (req: Request, res: Response) => {
    try {
      const { content } = req.body;
      const userEmail = req.headers.authorization;

      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "Content is required" });
      }

      if (!userEmail) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Get user by email to get the user ID
      const user = await storage.getUserByEmail(userEmail);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Insert into Supabase feedbacks table
      const { supabase } = await import("./db");

      const { data: feedback, error } = await supabase
        .from("feedbacks")
        .insert({
          content,
          uploaded_by: user.id,
        })
        .select()
        .single();

      if (error) {
        console.error("Supabase feedback error:", error);
        throw new Error(`Failed to create feedback: ${error.message}`);
      }

      return res.status(201).json(feedback);
    } catch (error) {
      console.error("Error creating feedback:", error);
      return res.status(500).json({ error: "Failed to create feedback" });
    }
  });

  apiRouter.get(
    "/admin/feedback",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const feedbacks = await storage.getFeedbacks();
        return res.status(200).json(feedbacks);
      } catch (error) {
        console.error("Error fetching feedbacks:", error);
        return res.status(500).json({ error: "Failed to fetch feedbacks" });
      }
    },
  );

  apiRouter.get(
    "/admin/answer-feedbacks",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const answerFeedbacks = await storage.getAllAnswerFeedbacks();
        return res.status(200).json(answerFeedbacks);
      } catch (error) {
        console.error("Error fetching answer feedbacks:", error);
        return res.status(500).json({ error: "Failed to fetch answer feedbacks" });
      }
    },
  );

  // Create the HTTP server
  const httpServer = createServer(app);
  return httpServer;
}
