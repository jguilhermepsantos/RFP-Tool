import { createClient } from '@supabase/supabase-js';

// Directly use the Supabase URL and key since we have them in the environment
// This will be replaced with environment variables in production
const supabaseUrl = 'https://txgrhpmthibqetiephzp.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4Z3JocG10aGlicWV0aWVwaHpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0Mzc4MTk4MSwiZXhwIjoyMDU5MzU3OTgxfQ.McwNigKQADY2oG-d2Z2LfvOAaq6tK_sbqdGXYNT5nA4';

// Create the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Export types for use in other parts of the application
export type {
  User,
  UserResponse
} from '@supabase/supabase-js';
