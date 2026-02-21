import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "@/styles/globals.css"
import { ClerkProvider } from "@clerk/nextjs"
import { Toaster } from "@/components/ui/toaster"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Community Sauna",
  description: "Book your sessions",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sawna",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0ea5e9",
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ClerkProvider
          appearance={{
            variables: {
              colorPrimary: "#0ea5e9", // sky-500
              colorText: "#020617", // slate-950
              colorBackground: "#ffffff", // white
              colorInputBackground: "#ffffff", // white
              colorInputText: "#020617", // slate-950
            },
          }}
        >
          {children}
        </ClerkProvider>
        <Toaster />
      </body>
    </html>
  )
}
