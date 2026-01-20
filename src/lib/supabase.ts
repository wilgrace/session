import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment validation
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Default headers needed for Supabase queries (especially .single() and .maybeSingle())
const defaultHeaders = {
  'Prefer': 'return=representation'
};

// Validate environment for production
function validateEnvironment() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }
  if (supabaseUrl.includes('localhost') && process.env.NODE_ENV === 'production') {
    throw new Error('Supabase URL is pointing to localhost in production');
  }
}

// ============================================
// CLIENT-SIDE SUPABASE CLIENT (anon key)
// Use this in client components
// ============================================

/** Singleton client for client-side usage with anon key */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    headers: defaultHeaders
  }
});

/** Factory for client-side Supabase client with custom headers */
export function createSupabaseClient(customHeaders?: Record<string, string>) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
    },
    global: {
      headers: { ...defaultHeaders, ...customHeaders },
    },
  });
}

// ============================================
// SERVER-SIDE SUPABASE CLIENT (service role)
// Use this in server actions and API routes
// ============================================

/**
 * Create a server-side Supabase client with service role key.
 * This bypasses RLS - use only in server actions and API routes.
 */
export function createSupabaseServerClient(): SupabaseClient {
  validateEnvironment();

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: defaultHeaders
    }
  });
}

// Alias for backward compatibility
export const createSupabaseAdminClient = createSupabaseServerClient;

// ============================================
// USER CONTEXT HELPER
// Eliminates repeated auth check patterns
// ============================================

export interface UserContext {
  clerkUserId: string;
  supabaseUserId: string;
  organizationId: string;
}

type UserContextResult = {
  success: true;
  data: UserContext;
} | {
  success: false;
  error: string;
}

/**
 * Get the user context (Supabase user ID and organization ID) for a Clerk user.
 * Use this to avoid repeating the same auth lookup pattern everywhere.
 */
export async function getUserContext(clerkUserId: string): Promise<UserContextResult> {
  const supabase = createSupabaseServerClient();

  const { data: userData, error: userError } = await supabase
    .from("clerk_users")
    .select("id, organization_id")
    .eq("clerk_user_id", clerkUserId)
    .single();

  if (userError) {
    return {
      success: false,
      error: `Failed to get user context: ${userError.message}`
    };
  }

  if (!userData) {
    return {
      success: false,
      error: "User not found in database"
    };
  }

  return {
    success: true,
    data: {
      clerkUserId,
      supabaseUserId: userData.id,
      organizationId: userData.organization_id
    }
  };
}

/**
 * Get user context with Supabase client already attached.
 * Useful when you need both the context and a client.
 */
export async function getUserContextWithClient(clerkUserId: string): Promise<
  { success: true; data: UserContext; client: SupabaseClient } |
  { success: false; error: string }
> {
  const client = createSupabaseServerClient();

  const { data: userData, error: userError } = await client
    .from("clerk_users")
    .select("id, organization_id")
    .eq("clerk_user_id", clerkUserId)
    .single();

  if (userError) {
    return {
      success: false,
      error: `Failed to get user context: ${userError.message}`
    };
  }

  if (!userData) {
    return {
      success: false,
      error: "User not found in database"
    };
  }

  return {
    success: true,
    data: {
      clerkUserId,
      supabaseUserId: userData.id,
      organizationId: userData.organization_id
    },
    client
  };
}
