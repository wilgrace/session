"use client"

import { useEffect } from "react"
import { useAuthOverlay } from "@/hooks/use-auth-overlay"

interface BrandingProviderProps {
  logoUrl?: string
  brandColor?: string
  brandTextColor?: string
}

// Populates the auth overlay store with org branding so the Clerk sign-in/sign-up
// forms can be styled to match the current org (logo, button colour, text colour).
export function BrandingProvider({ logoUrl, brandColor, brandTextColor }: BrandingProviderProps) {
  const setOrgBranding = useAuthOverlay((s) => s.setOrgBranding)

  useEffect(() => {
    setOrgBranding({ logoUrl, brandColor, brandTextColor })
    return () => setOrgBranding(undefined)
  }, [logoUrl, brandColor, brandTextColor, setOrgBranding])

  return null
}
