"use client"

import type React from "react"
import { useParams } from "next/navigation"
import { Sidebar } from "@/components/admin/sidebar"
import { Header } from "@/components/admin/header"
import { FeaturebaseMessenger } from "@/components/admin/featurebase-messenger"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const params = useParams()
  const slug = params.slug as string

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar slug={slug} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header slug={slug} />
        {children}
      </div>
      <FeaturebaseMessenger />
    </div>
  )
}
