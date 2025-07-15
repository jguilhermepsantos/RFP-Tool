# RFP Assistant Tool

## Overview

The RFP Assistant Tool is a comprehensive web application designed to help Solution Engineers streamline the process of responding to RFPs (Requests for Proposals). The system utilizes a Retrieval-Augmented Generation (RAG) pipeline to provide AI-assisted answers by leveraging centralized project-specific documents and a knowledge management system.

## Recent Changes

- **Versioned Answer System (July 15, 2025)**: Implemented comprehensive versioned answer system with carousel-based version history:
  - Replaced last_reviewed_by/last_reviewed_at fields with created_by field tracking answer authorship
  - Complete audit trail preserves all AI-generated and human-edited answer versions
  - New API endpoints for creating answer versions and retrieving version history
  - Carousel-based version history component with user name resolution
  - Enhanced editing workflow creates new versions instead of overwriting existing answers
  - Version history displays proper user names/emails with fallback to user ID
- **Question Number Field Removal (July 14, 2025)**: Completely removed question_number field from codebase after confirming requirement ID-based system works correctly. User will delete column from Supabase database.
- **CSV Export Enhancement (July 14, 2025)**: Updated CSV export for completed RFP documents to include comprehensive columns: requirement ID, section, subsection, question, compliance answer, and answer
- **Display and Ordering Improvements (July 14, 2025)**: Enhanced hierarchical organization to display requirement IDs instead of question numbers, and preserve CSV upload order for both sections and subsections
- **Simplified Section Assignment System (July 14, 2025)**: Streamlined assignment approach by removing separate section_assignments table and directly updating assigned_to field in rfp_questions table
- **Hierarchical Organization System (July 14, 2025)**: Implemented comprehensive hierarchical organization with sections and subsections for RFP questions, including:
  - Multi-level assignment system (individual questions, subsections, entire sections)
  - Enhanced CSV import supporting requirement_id, section, and subsection fields
  - Hierarchical UI components with collapsible sections and progress tracking
  - Backend API integration for hierarchical fields in question responses
- **Assignment System Enhancement (July 10, 2025)**: Extended question assignment functionality to include "processed" status RFP documents, enabling team members to assign questions across all workflow stages (unprocessed, under review, and processed)
- **Supabase Integration**: Successfully implemented pure Supabase storage for all database operations, ensuring consistent data access across the platform
- **Project Member Management**: Implemented robust project member fetching system using Supabase's project_permissions table for accurate team collaboration

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: Shadcn/UI components with Tailwind CSS for styling
- **State Management**: React Query (TanStack Query) for server state management
- **Routing**: Wouter for client-side routing
- **Authentication**: Supabase Auth integration with custom auth provider

### Backend Architecture
- **Runtime**: Node.js with Express.js server
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Supabase Auth with custom user management
- **File Storage**: Supabase Storage with AWS S3 API compatibility
- **AI Services**: OpenAI GPT models for text generation and embeddings
- **Vector Database**: Pinecone for storing document embeddings
- **Real-time Communication**: WebSocket for progress updates

## Key Components

### Authentication System
- Supabase-based authentication with email/password
- Role-based access control (admin, user roles)
- Project-level permissions (owner, collaborator, viewer)
- Access control for document approval workflows

### Document Management
- Multi-format document upload (PDF, TXT, CSV)
- Document chunking using advanced text splitting strategies
- Approval workflow for global knowledge documents
- Version control and metadata tracking

### RAG Pipeline
- Document text extraction using PDF.js
- Intelligent text chunking with token-based strategies
- OpenAI embeddings generation (text-embedding-3-small)
- Pinecone vector storage and similarity search
- Context-aware answer generation

### Project Management
- Multi-tenant project organization
- Team collaboration features
- RFP document processing workflows
- Progress tracking with real-time updates

## Data Flow

1. **Document Upload**: Users upload documents through the frontend, which are stored in Supabase Storage
2. **Document Processing**: Files are processed server-side for text extraction and chunking
3. **Embedding Generation**: Text chunks are converted to embeddings using OpenAI
4. **Vector Storage**: Embeddings are stored in Pinecone with metadata
5. **Query Processing**: User questions are embedded and matched against the vector database
6. **Answer Generation**: Retrieved context is used to generate AI-powered responses
7. **Feedback Loop**: User feedback is collected to improve answer quality

## External Dependencies

### Core Services
- **Supabase**: Database, authentication, and file storage
- **OpenAI**: Language models and embeddings
- **Pinecone**: Vector database for similarity search
- **Neon Database**: PostgreSQL hosting (via Drizzle config)

### Development Tools
- **Vite**: Frontend build tool and development server
- **Drizzle**: Database ORM and migrations
- **Shadcn/UI**: Component library
- **React Query**: Data fetching and caching

### Optional Integrations
- **AWS S3**: Alternative file storage (S3-compatible with Supabase)
- **WebSocket**: Real-time progress updates

## Deployment Strategy

### Development
- Vite development server for frontend hot reloading
- Express server with TypeScript compilation
- Database migrations through Drizzle Kit
- Environment variable configuration for service APIs

### Production
- Static frontend build served by Express
- Compiled TypeScript server bundle
- Database connection via connection pooling
- Environment-based configuration for different stages

### Configuration Requirements
- Database URL for PostgreSQL connection
- Supabase credentials for auth and storage
- OpenAI API key for AI services
- Pinecone API key for vector search
- Optional AWS credentials for S3 storage

The application follows a monorepo structure with shared schema definitions and clear separation between client, server, and shared code. The architecture supports scalability through microservice-style separation of concerns while maintaining development simplicity through the unified codebase.