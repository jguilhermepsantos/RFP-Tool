import express, { type Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { supabase } from "./db";
import { handleMockUpload, isS3Configured } from "./supabase-s3";
import { chunkingRouter } from "./routes-chunking";
import { assistantService } from "./assistant-service";
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

  // Get user by ID
  apiRouter.get("/users/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(id);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      return res.status(200).json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    } catch (error) {
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

      // Get the role for each project and ensure proper field mapping
      const projectsWithRole = await Promise.all(
        projects.map(async (project) => {
          const members = await storage.getProjectMembers(project.id);
          const userMembership = members.find((m) => m.userId === userId);
          
          // Ensure we handle both camelCase and snake_case fields properly
          const rawProject = project as any;
          const createdAtValue = rawProject.createdAt || rawProject.created_at;
          
          return {
            id: rawProject.id,
            name: rawProject.name,
            description: rawProject.description || null,
            createdAt: createdAtValue ? (typeof createdAtValue === 'string' ? createdAtValue : createdAtValue.toISOString()) : null,
            createdBy: rawProject.createdBy || rawProject.created_by,
            salesforceLink: rawProject.salesforceLink || rawProject.salesforce_link || null,
            region: rawProject.region || null,
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
      console.log("[PROJECT CREATION] Received request body:", req.body);
      const projectData = insertProjectSchema.parse(req.body);
      console.log("[PROJECT CREATION] Parsed project data:", projectData);
      
      // Create the project first
      const newProject = await storage.createProject(projectData);
      console.log("[PROJECT CREATION] Created project:", newProject);
      
      // Create OpenAI thread for the project
      try {
        console.log("[PROJECT CREATION] Creating OpenAI thread...");
        console.log("[PROJECT CREATION] Assistant service available:", !!assistantService);
        
        const threadResult = await assistantService.createThread();
        console.log("[PROJECT CREATION] OpenAI thread created:", threadResult);
        
        // Store the thread information in project_threads table
        const threadData = {
          project_id: newProject.id,
          thread_id: threadResult.threadId,
          assistant_id: threadResult.assistantId
        };
        console.log("[PROJECT CREATION] Storing thread data with corrected field names:", threadData);
        
        const storedThread = await storage.createProjectThread(threadData);
        console.log("[PROJECT CREATION] Thread stored in database:", storedThread);
        
        console.log(`[PROJECT CREATION] Successfully created OpenAI thread ${threadResult.threadId} for project ${newProject.id}`);
      } catch (threadError) {
        console.error(`[PROJECT CREATION] Failed to create OpenAI thread for project ${newProject.id}:`, threadError);
        console.error(`[PROJECT CREATION] Thread error details:`, {
          name: threadError.name,
          message: threadError.message,
          stack: threadError.stack
        });
        // Don't fail the project creation if thread creation fails
        // The thread can be created later if needed
      }
      
      return res.status(201).json({ project: newProject });
    } catch (error) {
      console.error("[PROJECT CREATION] Error:", error);
      if (error instanceof z.ZodError) {
        console.error("[PROJECT CREATION] Validation error:", error.errors);
        return res.status(400).json({ message: error.errors[0].message });
      }
      return res.status(500).json({ message: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  });

  // Development endpoint to initialize Supabase data
  apiRouter.post(
    "/initialize-supabase-data",
    async (req: Request, res: Response) => {
      try {
        console.log("Initializing Supabase data...");
        
        // Create a test user in Supabase
        const { data: userData, error: userError } = await supabase
          .from('users')
          .upsert({
            id: '13f369a9-dbfb-46bc-9ef2-8cafa6a06b24',
            email: 'joao.guilherme@vtex.com',
            name: 'João Guilherme',
            access_granted: true,
            role: 'user'
          })
          .select()
          .single();
        
        console.log("User creation result:", { userData, userError });
        
        // Create a test project in Supabase
        const { data: projectData, error: projectError } = await supabase
          .from('projects')
          .upsert({
            id: '22222222-2222-2222-2222-222222222222',
            name: 'Test Project',
            created_by: '13f369a9-dbfb-46bc-9ef2-8cafa6a06b24'
          })
          .select()
          .single();
        
        console.log("Project creation result:", { projectData, projectError });
        
        // Create project permission in Supabase
        const { data: permissionData, error: permissionError } = await supabase
          .from('project_permissions')
          .upsert({
            id: 'perm-1111-1111-1111-111111111111',
            project_id: '22222222-2222-2222-2222-222222222222',
            user_id: '13f369a9-dbfb-46bc-9ef2-8cafa6a06b24',
            role: 'owner'
          })
          .select()
          .single();
        
        console.log("Permission creation result:", { permissionData, permissionError });
        
        return res.status(200).json({ 
          message: "Supabase data initialized successfully",
          user: userData,
          project: projectData,
          permission: permissionData
        });
      } catch (error) {
        console.error("Error initializing Supabase data:", error);
        return res.status(500).json({ message: "Failed to initialize Supabase data" });
      }
    },
  );

  // Project Permissions routes
  apiRouter.get(
    "/projects/:projectId/members",
    async (req: Request, res: Response) => {
      try {
        const projectId = req.params.projectId;

        if (!projectId) {
          return res
            .status(400)
            .json({ message: "Valid project ID is required" });
        }

        const members = await storage.getProjectMembers(projectId);
        return res.status(200).json({ members });
      } catch (error) {
        console.error("Error getting project members:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

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

        // Get all questions with their answers for this document
        const { data: questions, error: questionsError } = await supabase
          .from("rfp_questions")
          .select("*")
          .eq("rfp_document_id", documentId)
          .order("created_at", { ascending: true });

        if (questionsError) {
          console.error("Error fetching questions:", questionsError);
          return res
            .status(500)
            .json({ message: "Error fetching document questions" });
        }

        if (!questions || questions.length === 0) {
          return res
            .status(404)
            .json({ message: "No questions found for this document" });
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

        // Create a map of answers by question ID for efficient lookup
        const answersMap = new Map();
        (answers || []).forEach((answer: any) => {
          answersMap.set(answer.rfp_question_id, answer);
        });

        // Generate CSV content with the requested columns
        const csvHeader = "Requirement ID,Section,Subsection,Question,Compliance Answer,Answer\n";

        const csvRows = questions.map((question) => {
          const answer = answersMap.get(question.id);
          
          // Escape double quotes in fields by replacing with two double quotes
          const requirementId = question.requirement_id?.replace(/"/g, '""') || "";
          const section = question.section?.replace(/"/g, '""') || "";
          const subsection = question.subsection?.replace(/"/g, '""') || "";
          const questionText = question.question_text?.replace(/"/g, '""') || "";
          const complianceAnswer = answer?.compliance_answer?.replace(/"/g, '""') || "";
          const generatedAnswer = answer?.generated_answer?.replace(/"/g, '""') || "";

          // Wrap fields in double quotes and separate with commas
          return `"${requirementId}","${section}","${subsection}","${questionText}","${complianceAnswer}","${generatedAnswer}"`;
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

        // New approach: Always fetch questions first, then get user info separately
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
          `Found ${questionsData?.length || 0} questions for document`,
        );

        // Get unique user IDs from questions that have assignments
        const assignedUserIds = [...new Set(
          (questionsData || [])
            .filter(q => q.assigned_to)
            .map(q => q.assigned_to)
        )];

        // Fetch user information for assigned users
        let usersData = [];
        if (assignedUserIds.length > 0) {
          const { data: userData, error: userError } = await supabase
            .from("users")
            .select("id, email, name")
            .in("id", assignedUserIds);

          if (userError) {
            console.log(`Error fetching user data:`, userError);
          } else {
            usersData = userData || [];
          }
        }

        // Create a map of users by ID for efficient lookup
        const usersMap = new Map();
        usersData.forEach(user => {
          usersMap.set(user.id, user);
        });

        // Get corresponding answers if they exist - only latest version per question
        const { data: answersData, error: answersError } = await supabase
          .from("rfp_answers")
          .select("*")
          .eq("rfp_document_id", documentId)
          .order("created_at", { ascending: false });

        if (answersError) {
          console.log(`Error fetching answers:`, answersError);
          return res.status(500).json({
            message: `Failed to fetch answers: ${answersError.message}`,
          });
        }

        console.log(
          `Found ${answersData?.length || 0} answers for document`,
        );

        // Create a map of latest answers by question ID for efficient lookup
        const answersMap = new Map();
        (answersData || []).forEach((answer: any) => {
          const questionId = answer.rfp_question_id;
          // Only keep the latest answer per question (already sorted by created_at desc)
          if (!answersMap.has(questionId)) {
            answersMap.set(questionId, answer);
          }
        });

        // Transform questions with their answers and assignment info
        questionsWithAnswers = (questionsData || []).map((question: any) => {
          const answer = answersMap.get(question.id);
          
          let sourceChunks = [];
          if (answer && answer.source_chunks) {
            try {
              sourceChunks = JSON.parse(answer.source_chunks);
            } catch (e) {
              console.log(`Failed to parse source chunks for answer ${answer.id}:`, e);
            }
          }

          return {
            id: question.id,
            rfpDocumentId: question.rfp_document_id,
            questionText: question.question_text,
            requirementId: question.requirement_id,
            section: question.section,
            subsection: question.subsection,
            assignedTo: question.assigned_to,
            assignedUser: question.assigned_to ? usersMap.get(question.assigned_to) : null,
            reviewed: question.reviewed || false,
            createdAt: question.created_at,
            answer: answer ? {
              id: answer.id,
              rfpQuestionId: answer.rfp_question_id,
              complianceAnswer: answer.compliance_answer,
              generatedAnswer: answer.generated_answer,
              sourceChunks: sourceChunks,
              averageSimilarity: answer.average_similarity,
              confidenceLevel: answer.confidence_level,
              createdBy: answer.created_by,
              createdAt: answer.created_at,
            } : null,
          };
        });

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
      const { question, projectLanguage, hierarchicalContext } = req.body;

      if (!question || typeof question !== "string") {
        return res
          .status(400)
          .json({ message: "Valid question text is required" });
      }

      // Import the AI service
      const { answerQuestion } = await import("./ai-service");

      // Get answer from RAG engine with optional project language and hierarchical context
      const result = await answerQuestion(question, 3, projectLanguage, hierarchicalContext);

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

  // Create new answer version (for versioned editing)
  apiRouter.post("/rfp-answers", async (req: Request, res: Response) => {
    try {
      const { 
        rfpQuestionId, 
        rfpDocumentId, 
        complianceAnswer, 
        generatedAnswer,
        createdBy,
        sourceChunks = [],
        averageSimilarity = 0,
        confidenceLevel = 'low'
      } = req.body;
      
      if (!rfpQuestionId || !rfpDocumentId || !createdBy) {
        return res.status(400).json({ 
          message: "rfpQuestionId, rfpDocumentId, and createdBy are required" 
        });
      }
      
      // Create new answer version
      const { data: newAnswer, error } = await supabase
        .from("rfp_answers")
        .insert({
          rfp_question_id: rfpQuestionId,
          rfp_document_id: rfpDocumentId,
          compliance_answer: complianceAnswer,
          generated_answer: generatedAnswer,
          created_by: createdBy,
          source_chunks: JSON.stringify(sourceChunks),
          average_similarity: averageSimilarity,
          confidence_level: confidenceLevel
        })
        .select()
        .single();
      
      if (error) {
        console.error("Error creating answer version:", error);
        return res.status(500).json({ 
          message: "Failed to create answer version",
          error: error.message 
        });
      }
      
      return res.status(201).json(newAnswer);
    } catch (error) {
      console.error("Error in POST /rfp-answers:", error);
      return res.status(500).json({ 
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get version history for a question
  apiRouter.get("/rfp-questions/:questionId/versions", async (req: Request, res: Response) => {
    try {
      const { questionId } = req.params;
      
      if (!questionId) {
        return res.status(400).json({ message: "Valid question ID is required" });
      }
      
      // Get all versions for this question, ordered by creation date (newest first)
      const { data: versions, error } = await supabase
        .from("rfp_answers")
        .select("*")
        .eq("rfp_question_id", questionId)
        .order("created_at", { ascending: false });
      
      if (error) {
        console.error("Error fetching answer versions:", error);
        return res.status(500).json({ 
          message: "Failed to fetch answer versions",
          error: error.message 
        });
      }
      
      return res.status(200).json(versions || []);
    } catch (error) {
      console.error("Error in GET /rfp-questions/:questionId/versions:", error);
      return res.status(500).json({ 
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Answer Feedback routes
  apiRouter.get("/rfp-questions/:questionId/feedback", async (req: Request, res: Response) => {
    try {
      const { questionId } = req.params;
      
      if (!questionId) {
        return res.status(400).json({ message: "Valid question ID is required" });
      }
      
      const feedback = await storage.getAnswerFeedback(questionId);
      return res.status(200).json({ feedback });
    } catch (error) {
      console.error("Error getting answer feedback:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  apiRouter.post("/rfp-questions/:questionId/feedback", async (req: Request, res: Response) => {
    try {
      const { questionId } = req.params;
      const { rating, feedbackText } = req.body;
      const userEmail = req.headers.authorization;
      
      console.log("Feedback submission headers:", req.headers);
      console.log("User email from authorization header:", userEmail);
      
      if (!questionId) {
        return res.status(400).json({ message: "Valid question ID is required" });
      }
      
      if (!rating || !["good", "bad"].includes(rating)) {
        return res.status(400).json({ message: "Rating must be either 'good' or 'bad'" });
      }
      
      if (!userEmail) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Get user by email to get the user ID
      const user = await storage.getUserByEmail(userEmail);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const feedbackData = {
        rfpQuestionId: questionId,
        rating,
        feedbackText: feedbackText || null,
        createdBy: user.id
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

  apiRouter.patch("/rfp-questions/:questionId/feedback/:feedbackId", async (req: Request, res: Response) => {
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

  apiRouter.delete("/rfp-questions/:questionId/feedback/:feedbackId", async (req: Request, res: Response) => {
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

  // CSV Upload Progress endpoint
  apiRouter.post("/progress/csv-upload", async (req: Request, res: Response) => {
    try {
      const { documentId, current, total, percentage, message } = req.body;
      
      if (!documentId) {
        return res.status(400).json({ error: "Document ID is required" });
      }
      
      // Import progressTracker and emit progress update
      const { progressTracker } = await import('./progress-tracker');
      
      const progressUpdate = {
        documentId,
        questionIndex: current,
        totalQuestions: total,
        progress: percentage,
        status: message,
        completed: current >= total
      };
      
      console.log(`[CSV Progress] Updating progress for document ${documentId}:`, progressUpdate);
      progressTracker.updateProgress(progressUpdate);
      
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error updating CSV upload progress:", error);
      return res.status(500).json({ error: "Failed to update progress" });
    }
  });

  // Question assignment routes
  apiRouter.put(
    "/rfp-questions/:questionId/assign",
    async (req: Request, res: Response) => {
      try {
        const { questionId } = req.params;
        const { assignedTo } = req.body;
        
        console.log(`Assigning question ${questionId} to user ${assignedTo}`);
        
        const { data, error } = await supabase
          .from("rfp_questions")
          .update({ assigned_to: assignedTo })
          .eq("id", questionId)
          .select("*")
          .single();
          
        if (error) {
          console.error("Error assigning question:", error);
          return res.status(500).json({ error: "Failed to assign question" });
        }
        
        return res.status(200).json(data);
      } catch (error) {
        console.error("Error in question assignment:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // Section Assignment routes - assign/unassign all questions in a section/subsection
  apiRouter.post(
    "/rfp-documents/:documentId/assign-section",
    async (req: Request, res: Response) => {
      try {
        const { documentId } = req.params;
        const { section, subsection, assignedTo } = req.body;

        if (!section || !assignedTo) {
          return res.status(400).json({ message: "section and assignedTo are required" });
        }

        // Build the update query
        let updateQuery = supabase
          .from("rfp_questions")
          .update({ assigned_to: assignedTo })
          .eq("rfp_document_id", documentId)
          .eq("section", section);

        // Add subsection filter if provided
        if (subsection) {
          updateQuery = updateQuery.eq("subsection", subsection);
        }
        // If no subsection specified, update ALL questions in the section (don't filter by subsection)

        const { data, error } = await updateQuery.select("*");

        if (error) {
          console.error("Error assigning section:", error);
          return res.status(500).json({ message: "Internal server error" });
        }

        return res.status(200).json({ 
          message: `Successfully assigned ${data.length} questions`,
          updatedQuestions: data 
        });
      } catch (error) {
        console.error("Error assigning section:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  apiRouter.post(
    "/rfp-documents/:documentId/unassign-section",
    async (req: Request, res: Response) => {
      try {
        const { documentId } = req.params;
        const { section, subsection } = req.body;

        if (!section) {
          return res.status(400).json({ message: "section is required" });
        }

        // Build the update query
        let updateQuery = supabase
          .from("rfp_questions")
          .update({ assigned_to: null })
          .eq("rfp_document_id", documentId)
          .eq("section", section);

        // Add subsection filter if provided
        if (subsection) {
          updateQuery = updateQuery.eq("subsection", subsection);
        }
        // If no subsection specified, unassign ALL questions in the section (don't filter by subsection)

        const { data, error } = await updateQuery.select("*");

        if (error) {
          console.error("Error unassigning section:", error);
          return res.status(500).json({ message: "Internal server error" });
        }

        return res.status(200).json({ 
          message: `Successfully unassigned ${data.length} questions`,
          updatedQuestions: data 
        });
      } catch (error) {
        console.error("Error unassigning section:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  apiRouter.put(
    "/rfp-questions/:questionId/unassign",
    async (req: Request, res: Response) => {
      try {
        const { questionId } = req.params;
        
        console.log(`Unassigning question ${questionId}`);
        
        const { data, error } = await supabase
          .from("rfp_questions")
          .update({ assigned_to: null })
          .eq("id", questionId)
          .select("*")
          .single();
          
        if (error) {
          console.error("Error unassigning question:", error);
          return res.status(500).json({ error: "Failed to unassign question" });
        }
        
        return res.status(200).json(data);
      } catch (error) {
        console.error("Error in question unassignment:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // Assistants Migration - Project Documents API
  apiRouter.get("/projects/:projectId/documents", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const documents = await storage.getProjectDocuments(projectId);
      res.json({ documents });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.post("/projects/:projectId/documents", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const userEmail = req.headers.authorization;
      
      if (!userEmail) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const user = await storage.getUserByEmail(userEmail);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const documentData = {
        ...req.body,
        projectId,
        uploadedBy: user.id
      };
      
      const document = await storage.createProjectDocument(documentData);
      res.json({ document });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.delete("/projects/:projectId/documents/:documentId", async (req: Request, res: Response) => {
    try {
      const { documentId } = req.params;
      await storage.deleteProjectDocument(documentId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Assistants Migration - Project Thread API
  apiRouter.get("/projects/:projectId/thread", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const thread = await storage.getProjectThread(projectId);
      res.json({ thread });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.post("/projects/:projectId/thread", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { threadId, assistantId } = req.body;
      
      const thread = await storage.createProjectThread({
        projectId,
        threadId,
        assistantId
      });
      
      res.json({ thread });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Assistants Migration - Project Chat API
  apiRouter.get("/projects/:projectId/chat", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const messages = await storage.getProjectChatMessages(projectId);
      res.json({ messages });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.post("/projects/:projectId/chat", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { content, messageType } = req.body;
      const userEmail = req.headers.authorization;
      
      if (!userEmail) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      if (!content || !content.trim()) {
        return res.status(400).json({ error: "Message content is required" });
      }
      
      const user = await storage.getUserByEmail(userEmail);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Only handle user messages - assistant responses are generated automatically
      if (messageType !== 'user') {
        return res.status(400).json({ error: "Only user messages can be sent via this endpoint" });
      }
      
      // Get or create thread for this project
      let thread = await storage.getProjectThread(projectId);
      console.log('[CHAT] Retrieved thread from database:', thread);
      
      if (!thread) {
        // Create OpenAI assistant thread if it doesn't exist
        const threadResult = await assistantService.createThread();
        thread = await storage.createProjectThread({
          project_id: projectId,
          thread_id: threadResult.threadId,
          assistant_id: threadResult.assistantId
        });
      }
      
      // Store the user message
      const userMessage = await storage.createProjectChatMessage({
        project_id: projectId,
        thread_id: thread.thread_id,
        message_type: 'user',
        content,
        user_id: user.id
      });
      
      // Send message to OpenAI Assistant and get response
      let assistantMessage = null;
      try {
        const assistantResponse = await assistantService.sendMessage(thread.thread_id, content);
        
        // Store the assistant response
        assistantMessage = await storage.createProjectChatMessage({
          project_id: projectId,
          thread_id: thread.thread_id,
          message_type: 'assistant',
          content: assistantResponse.content,
          user_id: null
        });
        
        console.log(`Assistant responded to message in project ${projectId}`);
      } catch (assistantError) {
        console.error(`Failed to get assistant response for project ${projectId}:`, assistantError);
        
        // Store an error message from the assistant
        assistantMessage = await storage.createProjectChatMessage({
          project_id: projectId,
          thread_id: thread.thread_id,
          message_type: 'assistant',
          content: "I'm sorry, I'm having trouble responding right now. Please try again later.",
          user_id: null
        });
      }
      
      await storage.updateProjectThreadActivity(projectId);
      
      // Return both user message and assistant response
      res.json({ 
        userMessage,
        assistantMessage
      });
    } catch (error) {
      console.error("Error in chat endpoint:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Mark question as reviewed/unreviewed
  apiRouter.patch(
    "/rfp-questions/:questionId/reviewed",
    async (req: Request, res: Response) => {
      try {
        const { questionId } = req.params;
        const { reviewed } = req.body;

        if (typeof reviewed !== 'boolean') {
          return res.status(400).json({ message: "reviewed must be a boolean" });
        }

        const { data, error } = await supabase
          .from("rfp_questions")
          .update({ reviewed })
          .eq("id", questionId)
          .select("*")
          .single();

        if (error) {
          console.error("Error updating question reviewed status:", error);
          return res.status(500).json({ message: "Internal server error" });
        }

        return res.status(200).json({
          message: `Question marked as ${reviewed ? 'reviewed' : 'not reviewed'}`,
          question: data
        });
      } catch (error) {
        console.error("Error updating question reviewed status:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // Create the HTTP server
  const httpServer = createServer(app);
  
  // Setup WebSocket server for progress tracking
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');
    
    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message);
        console.log('WebSocket message received:', data);
        
        // Handle progress tracking registration
        if (data.type === 'register' && data.documentId) {
          console.log(`Registering client for document progress: ${data.documentId}`);
          import('./progress-tracker').then(({ progressTracker }) => {
            progressTracker.registerClient(data.documentId, ws);
            const response = { type: 'registered', documentId: data.documentId };
            console.log('Sending registration response:', response);
            ws.send(JSON.stringify(response));
          }).catch(error => {
            console.error('Error importing progress tracker:', error);
          });
        }
      } catch (error) {
        console.error('Invalid WebSocket message:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  // Store WebSocket server globally for access from other modules
  (global as any).wss = wss;
  
  return httpServer;
}
