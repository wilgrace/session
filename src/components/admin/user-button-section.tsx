"use client"

import dynamic from 'next/dynamic'
import { useUser } from "@clerk/nextjs"

// Dynamically import UserButton with no SSR
const UserButton = dynamic(
  () => import('@clerk/nextjs').then((mod) => mod.UserButton),
  { ssr: false }
)

export function UserButtonSection() {
  const { isLoaded, user } = useUser()

  if (!isLoaded || !user) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse" />
          <div className="flex-1 min-w-0">
            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-32 bg-gray-100 rounded animate-pulse mt-1" />
          </div>
        </div>
      </div>
    )
  }

  const displayName = user.fullName || user.firstName || user.emailAddresses[0]?.emailAddress?.split('@')[0] || 'User'
  const email = user.emailAddresses[0]?.emailAddress || ''

  return (
    <div className="p-4 pt-2">
      <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-50 transition-colors">
        <UserButton afterSignOutUrl="/sign-in" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
          <p className="text-xs text-gray-500 truncate">{email}</p>
        </div>
      </div>
    </div>
  )
} 