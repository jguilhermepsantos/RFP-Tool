import express, { type Request, Response, NextFunction } from "express";
// Use registerRoutes from routes.ts
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

// Validate required environment variables at startup
function validateEnvironmentVariables() {
  const required = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const missing = required.filter(envVar => !process.env[envVar]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Check optional AI service variables
  const aiVariables = ['OPENAI_API_KEY', 'PINECONE_API_KEY'];
  const missingAI = aiVariables.filter(envVar => !process.env[envVar]);
  
  if (missingAI.length > 0) {
    log(`Warning: Missing AI service variables: ${missingAI.join(', ')} - AI features will be limited`);
  } else {
    log("All AI service variables are available");
  }
  
  log("Environment variables validated successfully");
}

const app = express();

// Add health check endpoint before other middleware
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Graceful shutdown handler
function setupGracefulShutdown(server: any) {
  const shutdown = (signal: string) => {
    log(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      log('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Main server startup function
async function startServer() {
  try {
    log("Starting server initialization...");
    
    // Validate environment variables first
    validateEnvironmentVariables();
    
    // Initialize vector database (non-blocking)
    try {
      log("Initializing vector database...");
      const { initializePineconeIndex } = await import('./ai-service');
      const pineconeInitialized = await initializePineconeIndex();
      log(`Vector database initialization ${pineconeInitialized ? 'succeeded' : 'failed'}`);
    } catch (error) {
      log(`Vector database initialization error: ${error instanceof Error ? error.message : String(error)}`);
      log("Continuing without vector database - RAG functionality will be limited");
    }
    
    // Register API routes
    log("Registering routes...");
    const server = await registerRoutes(app);

    // Global error handler (must be after routes)
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      
      log(`Error: ${message} (Status: ${status})`);
      res.status(status).json({ message });
    });

    // Setup frontend serving
    log("Setting up frontend...");
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Start listening
    const port = 5000;
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      log(`Server successfully started on port ${port}`);
      log(`Health check available at http://localhost:${port}/health`);
    });

    // Setup graceful shutdown
    setupGracefulShutdown(server);
    
    return server;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`Fatal server startup error: ${errorMessage}`);
    console.error('Server startup failed:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled promise rejection at: ${promise}, reason: ${reason}`);
  console.error('Unhandled promise rejection:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`);
  console.error('Uncaught exception:', error);
  process.exit(1);
});

// Start the server
startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
