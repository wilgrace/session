"use client"

import { useEffect, useState } from "react"
import Script from "next/script"
import { useUser } from "@clerk/nextjs"
import { getCurrentUserOrganizations } from "@/app/actions/user"

declare global {
  interface Window {
    Featurebase: any
  }
}

export function FeaturebaseMessenger({ slug }: { slug: string }) {
  const { user } = useUser()
  const [orgName, setOrgName] = useState<string>()

  useEffect(() => {
    async function fetchOrg() {
      const result = await getCurrentUserOrganizations()
      if (result.success && result.data) {
        const match = result.data.find((a) => a.organization.slug === slug)
        if (match) setOrgName(match.organization.name)
      }
    }
    fetchOrg()
  }, [slug])

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
      organization: orgName,
      createdAt: user.createdAt?.toISOString(),
      theme: "light",
      language: "en",
    })
  }, [user, orgName])

  return (
    <Script
      src="https://do.featurebase.app/js/sdk.js"
      id="featurebase-sdk"
      strategy="afterInteractive"
    />
  )
}
