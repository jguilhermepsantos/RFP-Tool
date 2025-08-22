# RFP Assistant Tool

## Overview
The RFP Assistant Tool is a web application designed to help Solution Engineers streamline the process of responding to RFPs (Requests for Proposals). It uses a Retrieval-Augmented Generation (RAG) pipeline to provide AI-assisted answers by leveraging centralized project-specific documents and a knowledge management system. The project's vision is to significantly enhance the efficiency and accuracy of RFP responses, offering substantial market potential in enterprise proposal management.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript (Vite build tool)
- **UI Library**: Shadcn/UI components with Tailwind CSS
- **State Management**: React Query (TanStack Query) for server state
- **Routing**: Wouter for client-side routing
- **Authentication**: Supabase Auth integration

### Backend Architecture
- **Runtime**: Node.js with Express.js server
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Supabase Auth with custom user management
- **File Storage**: Supabase Storage (AWS S3 API compatible)
- **AI Services**: OpenAI GPT models for text generation and embeddings
- **Vector Database**: Pinecone for storing document embeddings
- **Real-time Communication**: WebSocket for progress updates

### Key Components
- **Authentication System**: Supabase-based, supporting email/password, role-based access control (admin, user), and project-level permissions (owner, collaborator, viewer).
- **Document Management**: Supports multi-format document upload (PDF, TXT, CSV), advanced text splitting for chunking, approval workflows for global knowledge documents, and version control.
- **RAG Pipeline**: Integrates document text extraction (PDF.js), intelligent token-based text chunking, OpenAI embeddings generation (text-embedding-3-small), Pinecone vector storage and similarity search, and context-aware answer generation.
- **Project Management**: Provides multi-tenant project organization, team collaboration features, RFP document processing workflows, and real-time progress tracking.
- **UI/UX Decisions**: Emphasizes clear hierarchical organization for RFP questions, smart sticky navigation, visual progress indicators, and a responsive design using Shadcn/UI and Tailwind CSS. The Prospect Discovery tab features a sidebar layout with documents in a 320px left sidebar and chat in the main viewport, optimized for viewport-constrained responsive design.

### System Design Choices
The application follows a monorepo structure with shared schema definitions and clear separation between client, server, and shared code. It supports scalability through microservice-style separation of concerns while maintaining development simplicity through a unified codebase. Hierarchical organization of RFP questions, including sections and subsections, is a core design decision, supporting multi-level assignments and detailed progress tracking. Optimistic UI updates and thread caching have been implemented for chat performance.

## Recent Changes
- **August 2025**: Fixed critical field naming issues between TypeScript (camelCase) and Supabase database (snake_case)
- **Security Fix**: Resolved document upload security concern by implementing proper thread-scoped file handling
- **Project Management**: Fixed project deletion permissions issue - changed from `member.userId` to `member.id` field access
- **Chat Integration**: Successfully deployed OpenAI Assistant integration with proper thread management for existing projects

## External Dependencies

### Core Services
- **Supabase**: Database, authentication, and file storage
- **OpenAI**: Language models and embeddings
- **Pinecone**: Vector database for similarity search
- **Neon Database**: PostgreSQL hosting

### Development Tools
- **Vite**: Frontend build tool and development server
- **Drizzle**: Database ORM and migrations
- **Shadcn/UI**: Component library
- **React Query**: Data fetching and caching