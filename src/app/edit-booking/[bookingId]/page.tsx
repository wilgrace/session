"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { use } from "react"
import { getBookingDetails } from "@/app/actions/session"

interface EditBookingPageProps {
  params: Promise<{ bookingId: string }>
}

export default function EditBookingPage({ params }: EditBookingPageProps) {
  const { bookingId } = use(params)
  const router = useRouter()

  useEffect(() => {
    async function redirectToBookingPage() {
      try {
        const result = await getBookingDetails(bookingId)
        if (!result.success) {
          throw new Error("Failed to load booking")
        }
        const { session, startTime } = (result as { success: true; data: any }).data
        const queryParams = new URLSearchParams({
          edit: 'true',
          bookingId: bookingId,
          start: startTime.toISOString()
        })

        router.replace(`/booking/${session.id}?${queryParams.toString()}`)
      } catch (error) {
        router.replace("/booking")
      }
    }

    redirectToBookingPage()
  }, [bookingId, router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
        <p className="text-gray-600">Redirecting to booking page...</p>
      </div>
    </div>
  )
} 