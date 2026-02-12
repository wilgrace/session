import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Community Sauna",
  description: "Book your sessions",
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
