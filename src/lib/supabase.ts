import { createClient } from '@supabase/supabase-js';

// Singleton client for client-side usage
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Default headers needed for Supabase queries (especially .single() and .maybeSingle())
const defaultHeaders = {
  'Prefer': 'return=representation'
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    headers: defaultHeaders
  }
});

// Initialize the Supabase client (for custom headers, rarely needed on client)
export const createSupabaseClient = (customHeaders?: Record<string, string>) => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
    },
    global: {
      headers: { ...defaultHeaders, ...customHeaders },
    },
  });
};

// Client for server-side operations
export const createSupabaseServerClient = (authToken?: string) => {
  const headers: Record<string, string> = {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return createSupabaseClient(headers);
};

// Admin client with service role (use carefully, only on server)
export const createSupabaseAdminClient = () => {
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
    },
    global: {
      headers: defaultHeaders
    }
  });
};
