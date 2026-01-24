import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServerClient } from '@/lib/supabase';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized: Not logged in" }, { status: 401 });
    }

    const supabase = createSupabaseServerClient();

    // Get the current user's organization from clerk_users
    const { data: currentUser, error: userError } = await supabase
      .from("clerk_users")
      .select("organization_id, is_super_admin")
      .eq("clerk_user_id", userId)
      .single();

    if (userError || !currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Only super admins can view users
    if (!currentUser.is_super_admin) {
      return NextResponse.json({ error: "Unauthorized: Admin access required" }, { status: 403 });
    }

    // Get users from Supabase for the same organization
    const { data: users, error } = await supabase
      .from("clerk_users")
      .select("id, clerk_user_id, email, first_name, last_name, organization_id, is_super_admin, created_at")
      .eq("organization_id", currentUser.organization_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Map users with role labels based on is_super_admin
    const usersWithRoles = users.map(user => ({
      ...user,
      role: user.is_super_admin ? 'super_admin' : 'user',
      roleLabel: user.is_super_admin ? 'Super Admin' : 'User'
    }));

    return NextResponse.json({ users: usersWithRoles });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
} 