import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServerClient } from '@/lib/supabase';

// Map role values to display labels
const ROLE_LABELS: Record<string, string> = {
  'org:super_admin': 'Super Admin',
  'org:admin': 'Admin',
  'org:user': 'User'
};

export async function GET() {
  try {
    const session = await auth();
    if (!session.orgId) {
      return NextResponse.json({ error: "Organization ID not configured" }, { status: 500 });
    }

    const supabase = createSupabaseServerClient();

    // Get users from Supabase (select only needed columns)
    const { data: supabaseUsers, error } = await supabase
      .from("clerk_users")
      .select("id, clerk_user_id, email, first_name, last_name, organization_id, created_at")
      .eq("organization_id", session.orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get organization memberships from Clerk
    const memberships = await clerkClient.organizations.getOrganizationMembershipList({
      organizationId: session.orgId
    });

    // Create a map of user IDs to their roles
    const roleMap = new Map(
      memberships.map(membership => [
        membership.publicUserData?.userId,
        membership.role
      ])
    );

    // Combine Supabase user data with Clerk roles
    const users = supabaseUsers.map(user => {
      const roleValue = roleMap.get(user.clerk_user_id) || 'org:user';
      return {
        ...user,
        role: roleValue,
        roleLabel: ROLE_LABELS[roleValue] || 'User'
      };
    });

    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
} 