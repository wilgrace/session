import { createClient } from '@supabase/supabase-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// These should come from your environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const databaseUrl = process.env.DATABASE_URL!;

// Create the Supabase client with Prefer header for .single()/.maybeSingle() support
export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    headers: { 'Prefer': 'return=representation' }
  }
});

// Create the Drizzle client
const client = postgres(databaseUrl);
export const db = drizzle(client, { schema });

// Export the schema for type safety
export { schema }; 