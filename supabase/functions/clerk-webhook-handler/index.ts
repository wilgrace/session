import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Webhook } from 'npm:svix@1.15.0';
import { corsHeaders } from '../_shared/cors.ts'; // Optional: manage CORS if needed

// Define expected Clerk event payload structure (adjust based on actual usage)
interface ClerkUserEventData {
  id: string;
  email_addresses: {
    email_address: string;
    id: string;
    verification: {
      status: string;
      strategy: string;
    };
  }[];
  first_name: string | null;
  last_name: string | null;
  created_at: number;
  updated_at: number;
  object: string;
}

interface ClerkOrganizationEventData {
  id: string;
  name: string;
  slug: string;
  created_at: number;
  updated_at: number;
  created_by: string;
  public_metadata: Record<string, any>;
  private_metadata: Record<string, any>;
}

interface ClerkEvent {
  type: 'user.created' | 'user.updated' | 'user.deleted' | 'organization.created' | 'organization.updated' | 'organization.deleted' | 'organizationMembership.updated' | string;
  data: ClerkUserEventData | ClerkOrganizationEventData | {
    id: string;
    organization_id: string;
    public_user_data: {
      user_id: string;
    };
    role: string;
  };
  object: 'event';
  timestamp: number;
  event_attributes?: {
    http_request: {
      client_ip: string;
      user_agent: string;
    };
  };
}

console.log('Clerk Webhook Handler Function Initializing');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const svix_id = req.headers.get('svix-id');
  const svix_timestamp = req.headers.get('svix-timestamp');
  const svix_signature = req.headers.get('svix-signature');
  const isTestEvent = !svix_id && !svix_timestamp && !svix_signature;

  if (!isTestEvent) {
    const webhookSecret = Deno.env.get('CLERK_WEBHOOK_SIGNING_SECRET');
    const supabaseUrl = Deno.env.get('DB_URL');
    const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY');
    const defaultOrgId = Deno.env.get('DEFAULT_ORGANIZATION_ID');
    if (!webhookSecret || !supabaseUrl || !supabaseServiceKey || !defaultOrgId) {
      console.error('Missing environment variables');
      return new Response('Internal Server Error: Missing configuration', { status: 500 });
    }
  }

  const supabaseUrl = Deno.env.get('DB_URL');
  const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY');
  const supabaseAdmin = createClient(supabaseUrl!, supabaseServiceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const body = await req.text();
  let event: ClerkEvent;

  if (isTestEvent) {
    try {
      event = JSON.parse(body) as ClerkEvent;
    } catch (err: any) {
      return new Response('Invalid JSON in test event', { status: 400 });
    }
  } else {
    const webhookSecret = Deno.env.get('CLERK_WEBHOOK_SIGNING_SECRET');
    if (!webhookSecret) {
      return new Response('Internal Server Error: Missing webhook secret', { status: 500 });
    }
    if (!svix_id || !svix_timestamp || !svix_signature) {
      return new Response('Webhook Error: Missing svix headers', { status: 400 });
    }
    const wh = new Webhook(webhookSecret);
    try {
      event = wh.verify(body, {
        'svix-id': svix_id,
        'svix-timestamp': svix_timestamp,
        'svix-signature': svix_signature,
      }) as ClerkEvent;
    } catch (err: any) {
      return new Response(`Webhook Error: ${err?.message || err}`, { status: 400 });
    }
  }

  try {
    switch (event.type) {
      case 'user.created': {
        const userData = event.data as ClerkUserEventData;
        const primaryEmail = userData.email_addresses?.[0]?.email_address;
        const defaultOrgIdFromEnv = Deno.env.get('DEFAULT_ORGANIZATION_ID');
        if (!defaultOrgIdFromEnv) {
          console.error('CRITICAL: DEFAULT_ORGANIZATION_ID environment variable is not set!');
          return new Response('Server Configuration Error: Default organization not set', { status: 500 });
        }
        if (!primaryEmail) {
          console.error('User created event missing primary email for Clerk ID:', userData.id);
          return new Response('Webhook Error: User created without primary email', { status: 400 });
        }
        // Check if user exists in clerk_users table
        const { data: existingClerkUser, error: checkClerkError } = await supabaseAdmin
          .from('clerk_users')
          .select('*')
          .eq('email', primaryEmail)
          .maybeSingle();
        if (checkClerkError && checkClerkError.code !== 'PGRST116') {
          console.error('Error checking for existing clerk user:', checkClerkError);
          throw checkClerkError;
        }
        if (existingClerkUser) {
          // Upgrade guest to full user
          const { error: updateError } = await supabaseAdmin
            .from('clerk_users')
            .update({
              clerk_user_id: userData.id,
              first_name: userData.first_name,
              last_name: userData.last_name,
              organization_id: defaultOrgIdFromEnv,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingClerkUser.id);
          if (updateError) {
            console.error('Error upgrading guest user:', updateError);
            throw updateError;
          }
          // Note: Clerk organization membership is managed separately from Supabase organizations
          // The DEFAULT_ORGANIZATION_ID is a Supabase org UUID, not a Clerk org ID
          // Skip Clerk org membership creation - not needed for booking flow

          return new Response(JSON.stringify({
            status: 'success',
            message: 'User upgraded and added to organization',
            userId: existingClerkUser.id
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        // If not found in clerk_users table, create new clerk user
        const { data: newUser, error: insertError } = await supabaseAdmin
          .from('clerk_users')
          .insert({
            clerk_user_id: userData.id,
            email: primaryEmail,
            first_name: userData.first_name,
            last_name: userData.last_name,
            organization_id: defaultOrgIdFromEnv
          })
          .select()
          .single();
        if (insertError) {
          console.error('Error inserting clerk user:', insertError);
          throw insertError;
        }
        // Note: Clerk organization membership is managed separately from Supabase organizations
        // The DEFAULT_ORGANIZATION_ID is a Supabase org UUID, not a Clerk org ID
        // Skip Clerk org membership creation - not needed for booking flow

        return new Response(JSON.stringify({
          status: 'success',
          message: 'Created new clerk user',
          userId: newUser.id
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'user.updated': {
        const userData = event.data as ClerkUserEventData;
        const primaryEmail = userData.email_addresses?.[0]?.email_address;

        if (!primaryEmail) {
          console.warn('User updated event missing primary email for Clerk ID:', userData.id, '- Skipping email update.');
          return new Response(JSON.stringify({ 
            status: 'warning',
            message: 'User updated without primary email'
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // First check if user exists by email (like in user.created)
        const { data: existingClerkUser, error: checkClerkError } = await supabaseAdmin
          .from('clerk_users')
          .select('*')
          .eq('email', primaryEmail)
          .maybeSingle();

        if (checkClerkError) {
          console.error('Error checking for existing clerk user:', checkClerkError);
          throw checkClerkError;
        }

        if (!existingClerkUser) {
          console.warn('User not found for update:', primaryEmail);
          return new Response(JSON.stringify({ 
            status: 'warning',
            message: 'User not found for update'
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const updateData: { email?: string; first_name?: string | null; last_name?: string | null; updated_at: string } = {
          updated_at: new Date().toISOString()
        };
        if (primaryEmail) updateData.email = primaryEmail;
        if (userData.hasOwnProperty('first_name')) updateData.first_name = userData.first_name;
        if (userData.hasOwnProperty('last_name')) updateData.last_name = userData.last_name;

        const { error: updateError } = await supabaseAdmin
          .from('clerk_users')
          .update(updateData)
          .eq('id', existingClerkUser.id);

        if (updateError) {
          console.error('Error updating clerk user:', updateError);
          throw updateError;
        }

        console.log('Successfully updated clerk user for email:', primaryEmail);
        return new Response(JSON.stringify({ 
          status: 'success',
          message: 'User updated successfully'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'user.deleted': {
        const userData = event.data as { id: string; deleted?: boolean }; // Simpler structure for delete
        console.log('Processing user.deleted event for Clerk ID:', userData.id);

        // --- !! WARNING: HARD DELETE !! ---
        // This will FAIL if the user has related records in tables with
        // ON DELETE RESTRICT constraints (bookings, memberships etc).
        // Consider a soft delete (setting an `is_active` flag or `deleted_at` timestamp)
        // on the `users` table instead, which requires schema changes.
        const { error: deleteError } = await supabaseAdmin
          .from('clerk_users')
          .delete()
          .eq('clerk_user_id', userData.id);

        if (deleteError) {
            // Log specific constraint violation errors differently
            if (deleteError.code === '23503') { // foreign_key_violation
                 console.error(`Cannot delete clerk user (Clerk ID: ${userData.id}) due to existing related records (foreign key violation). Consider soft delete. Error: ${deleteError.message}`);
                 // Return 200 OK here? Or 409 Conflict? Let's return 409
                 return new Response('Conflict: Clerk user cannot be deleted due to existing references', { status: 409 });
            } else if (deleteError.code !== 'PGRST116') { // Ignore 'user not found'
              console.error('Error deleting clerk user:', deleteError);
              throw deleteError;
            } else {
                 console.warn('Clerk user not found for deletion (Clerk ID:', userData.id, '), possibly already deleted.');
            }

        } else {
             console.log('Successfully deleted clerk user for Clerk ID:', userData.id);
        }
        break;
      }

      case 'organization.created': {
        console.log('Processing organization.created event for Clerk ID:', event.data.id);
        const orgData = event.data as ClerkOrganizationEventData;

        // Create organization in Supabase
        const { data: newOrg, error: insertError } = await supabaseAdmin
          .from('organizations')
          .insert({
            id: orgData.id, // Use Clerk's org ID as the primary key
            name: orgData.name,
            description: orgData.public_metadata?.description || null,
            logo_url: orgData.public_metadata?.logo_url || null,
            created_at: new Date(orgData.created_at).toISOString(),
            updated_at: new Date(orgData.updated_at).toISOString()
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error inserting organization:', insertError);
          throw insertError;
        }

        return new Response(JSON.stringify({ 
          status: 'success',
          message: 'Created new organization',
          organizationId: newOrg.id
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'organization.updated': {
        console.log('Processing organization.updated event for Clerk ID:', event.data.id);
        const orgData = event.data as ClerkOrganizationEventData;

        // Update organization in Supabase
        const { error: updateError } = await supabaseAdmin
          .from('organizations')
          .update({
            name: orgData.name,
            description: orgData.public_metadata?.description || null,
            logo_url: orgData.public_metadata?.logo_url || null,
            updated_at: new Date(orgData.updated_at).toISOString()
          })
          .eq('id', orgData.id);

        if (updateError) {
          console.error('Error updating organization:', updateError);
          throw updateError;
        }

        return new Response(JSON.stringify({ 
          status: 'success',
          message: 'Updated organization',
          organizationId: orgData.id
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'organization.deleted': {
        console.log('Processing organization.deleted event for Clerk ID:', event.data.id);
        const orgData = event.data as ClerkOrganizationEventData;

        // Delete organization in Supabase
        const { error: deleteError } = await supabaseAdmin
          .from('organizations')
          .delete()
          .eq('id', orgData.id);

        if (deleteError) {
          console.error('Error deleting organization:', deleteError);
          throw deleteError;
        }

        return new Response(JSON.stringify({ 
          status: 'success',
          message: 'Deleted organization',
          organizationId: orgData.id
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'organizationMembership.updated': {
        console.log('Processing organizationMembership.updated event:', event.data);
        const membershipData = event.data as {
          id: string;
          organization_id: string;
          public_user_data: {
            user_id: string;
          };
          role: string;
        };

        // Update the user's role in our database
        const { error: updateError } = await supabaseAdmin
          .from('clerk_users')
          .update({
            role: membershipData.role,
            updated_at: new Date().toISOString()
          })
          .eq('clerk_user_id', membershipData.public_user_data.user_id)
          .eq('organization_id', membershipData.organization_id);

        if (updateError) {
          console.error('Error updating clerk user after role change:', updateError);
          throw updateError;
        }

        console.log('Successfully processed role update for user:', membershipData.public_user_data.user_id);
        break;
      }

      default:
        console.log('Received unhandled event type:', event.type);
        // Optionally handle other event types if needed
    }

    // --- 5. Return Success ---
    console.log('Webhook processed successfully for event type:', event.type);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error processing webhook event:', error);
    return new Response(`Webhook Processing Error: ${error.message}`, {
      status: 500,
      headers: { ...corsHeaders },
    });
  }
});

// Optional: Define CORS headers if calling from browser or different origin needed
// Usually webhooks are server-to-server, but OPTIONS might be needed.
// supabase/functions/_shared/cors.ts
/*
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Or specific origin
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
*/