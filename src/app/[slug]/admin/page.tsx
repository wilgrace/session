import { redirect } from "next/navigation"

export default async function AdminPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/${slug}/admin/home`)
} 