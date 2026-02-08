"use client"

import { useUser } from "@clerk/nextjs"
import { useParams } from "next/navigation"
import { UserDropdown } from "@/components/booking/user-dropdown"

export function UserButtonSection() {
  const { isLoaded, user } = useUser()
  const params = useParams()
  const slug = params.slug as string

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

  return (
    <div className="p-4 pt-2">
      <UserDropdown slug={slug} variant="sidebar" />
    </div>
  )
}
