import { SignUp } from "@clerk/nextjs";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>
}) {
  const { redirect_url } = await searchParams
  const fallbackRedirectUrl = redirect_url || "/onboarding"

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center">
        <SignUp
          routing="path"
          path="/sign-up"
          fallbackRedirectUrl={fallbackRedirectUrl}
        />
        <p className="mt-4 text-center text-xs text-slate-500 max-w-xs">
          By signing up, you agree to our{" "}
          <a href="/terms-of-service" className="underline hover:text-slate-700">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy-policy" className="underline hover:text-slate-700">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}