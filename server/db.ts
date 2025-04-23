import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import { createClient } from '@supabase/supabase-js';

// Configure neon database
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Maintain compatibility with Supabase
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.warn(
    "SUPABASE_URL and SUPABASE_ANON_KEY not set. Authentication features will not work properly.",
  );
}

// Set up Drizzle with Neon Postgres
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });

// Maintain Supabase client for auth
export const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
);

// Export database types from schema
export type { 
  User, 
  Project, 
  ProjectPermission,
  RfpDocument,
  RfpQuestion,
  RfpAnswer,
  Document,
  Chunk,
  ComplianceMapping
} from '@shared/schema';