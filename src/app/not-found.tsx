import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold mb-4">404</h1>
      <p className="text-lg text-gray-600 mb-6">
        This organization could not be found.
      </p>
      <Link
        href="/sign-in"
        className="text-blue-600 hover:text-blue-500 underline"
      >
        Go to sign in
      </Link>
    </div>
  )
}
