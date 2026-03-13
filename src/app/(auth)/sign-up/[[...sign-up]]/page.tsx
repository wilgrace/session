import { SignUp } from "@clerk/nextjs";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>
}) {
  const { redirect_url } = await searchParams
  const fallbackRedirectUrl = redirect_url || "/onboarding"

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center">
        <div className="mb-5 max-w-[400px] rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Trying to book a session?</p>
          <p className="mt-1">
            You don&apos;t need to sign up here. Your provider will have sent you a booking link —
            it looks like <span className="font-mono text-xs">bookasession.org/their-name</span>.
            Visit that link to create an account and book directly.
          </p>
        </div>
        <SignUp
          routing="path"
          path="/sign-up"
          fallbackRedirectUrl={fallbackRedirectUrl}
        />
      </div>
    </div>
  );
}