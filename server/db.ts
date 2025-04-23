import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_ANON_KEY must be set. Did you forget to add these secrets?"
  );
}

// Create Supabase client
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
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