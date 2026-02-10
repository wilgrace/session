"use client"

import { useEffect } from "react"
import Script from "next/script"
import { useUser, useOrganization } from "@clerk/nextjs"

declare global {
  interface Window {
    Featurebase: any
  }
}

export function FeaturebaseMessenger() {
  const { user } = useUser()
  const { organization } = useOrganization()

  useEffect(() => {
    if (!user) return

    const win = window

    if (typeof win.Featurebase !== "function") {
      win.Featurebase = function () {
        // eslint-disable-next-line prefer-rest-params
        (win.Featurebase.q = win.Featurebase.q || []).push(arguments)
      }
    }

    win.Featurebase("boot", {
      appId: "698b4b040772a51956c84f4f",
      email: user.primaryEmailAddress?.emailAddress,
      name: user.fullName,
      userId: user.id,
      organization: organization?.name,
      createdAt: user.createdAt?.toISOString(),
      theme: "light",
      language: "en",
    })
  }, [user, organization])

  return (
    <Script
      src="https://do.featurebase.app/js/sdk.js"
      id="featurebase-sdk"
      strategy="afterInteractive"
    />
  )
}
