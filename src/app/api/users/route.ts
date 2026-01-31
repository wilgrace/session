import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServerClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized: Not logged in" }, { status: 401 });
    }

    // Get organization ID from query params or headers
    const organizationId = request.nextUrl.searchParams.get('organizationId') ||
      request.headers.get('x-organization-id');

    const supabase = createSupabaseServerClient();

    // Get the current user's data
    const { data: currentUser, error: userError } = await supabase
      .from("clerk_users")
      .select("id, organization_id, role")
      .eq("clerk_user_id", userId)
      .single();

    if (userError || !currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Use provided organizationId or fall back to user's primary org
    const orgId = organizationId || currentUser.organization_id;

    if (!orgId) {
      return NextResponse.json({ error: "No organization specified" }, { status: 400 });
    }

    // Check if user has admin access to this organization
    // Superadmins can access any org, admins can only access their own org
    const hasAccess =
      currentUser.role === 'superadmin' ||
      (currentUser.role === 'admin' && currentUser.organization_id === orgId);

    if (!hasAccess) {
      return NextResponse.json({ error: "Unauthorized: Admin access required" }, { status: 403 });
    }

    // Get users belonging to this organization with membership status
    const { data: users, error } = await supabase
      .from("clerk_users")
      .select(`
        id, clerk_user_id, email, first_name, last_name, role, organization_id, created_at,
        user_memberships!left(status, current_period_end)
      `)
      .eq("organization_id", orgId)
      .eq("user_memberships.organization_id", orgId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Map to user format with role labels and membership status
    const usersWithRoles = users.map((user: any) => {
      // Check if user has an active membership
      const membership = user.user_memberships?.[0];
      const now = new Date();
      const isMember = membership?.status === 'active' ||
        (membership?.status === 'cancelled' && membership?.current_period_end && new Date(membership.current_period_end) > now);

      return {
        id: user.id,
        clerk_user_id: user.clerk_user_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        organization_id: user.organization_id,
        role: user.role,
        roleLabel: user.role === 'superadmin' ? 'Super Admin' :
                   user.role === 'admin' ? 'Admin' :
                   user.role === 'user' ? 'User' : 'Guest',
        isMember,
        created_at: user.created_at,
      };
    });

    return NextResponse.json({ users: usersWithRoles });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}
