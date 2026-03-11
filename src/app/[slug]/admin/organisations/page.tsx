import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { listOrganisations } from "@/app/actions/organisations";
import { OrganisationsPage } from "@/components/admin/organisations-page";

export default async function Page() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect("/sign-in");

  const supabase = createSupabaseServerClient();
  const { data: caller } = await supabase
    .from("clerk_users")
    .select("role")
    .eq("clerk_user_id", clerkUserId)
    .single();

  if (!caller || caller.role !== "superadmin") {
    redirect("/");
  }

  const { data: organisations } = await listOrganisations();

  return <OrganisationsPage initialOrganisations={organisations ?? []} />;
}
