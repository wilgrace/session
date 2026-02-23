import { UsersPage } from "@/components/admin/users-page";
import { requireTenantFromHeaders } from "@/lib/tenant-utils";
import { createSupabaseServerClient } from "@/lib/supabase";

export default async function Page() {
  const { organizationId } = await requireTenantFromHeaders();
  const supabase = createSupabaseServerClient();

  const { data: users } = await supabase
    .from("clerk_users")
    .select(`
      id, clerk_user_id, email, first_name, last_name, role, organization_id, created_at,
      user_memberships!left(status, current_period_end)
    `)
    .eq("organization_id", organizationId)
    .eq("user_memberships.organization_id", organizationId)
    .order("created_at", { ascending: false });

  const now = new Date();
  const mappedUsers = (users ?? []).map((user: any) => {
    const membership = user.user_memberships?.[0];
    const isMember =
      membership?.status === "active" ||
      (membership?.status === "cancelled" &&
        membership?.current_period_end &&
        new Date(membership.current_period_end) > now);

    return {
      id: user.id,
      clerk_user_id: user.clerk_user_id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      organization_id: user.organization_id,
      role: user.role,
      roleLabel:
        user.role === "superadmin" ? "Super Admin" :
        user.role === "admin" ? "Admin" :
        user.role === "user" ? "User" : "Guest",
      isMember,
      created_at: user.created_at,
    };
  });

  return <UsersPage initialUsers={mappedUsers} />;
}
