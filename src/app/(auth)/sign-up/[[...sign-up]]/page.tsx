import { SignUp } from "@clerk/nextjs";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>
}) {
  const { redirect_url } = await searchParams
  const fallbackRedirectUrl = redirect_url || "/"

  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp
        routing="path"
        path="/sign-up"
        fallbackRedirectUrl={fallbackRedirectUrl}
      />
    </div>
  );
}