'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSlug } from '@/lib/slug-context'
import type { PWAInstallElement } from '@khmyznikov/pwa-install'
import '@khmyznikov/pwa-install'

interface PWAInstallWrapperProps {
  orgName?: string
  slug?: string
}

export function PWAInstallWrapper({ orgName, slug: slugProp }: PWAInstallWrapperProps) {
  const ref = useRef<PWAInstallElement>(null)
  const slugFromContext = useSlug()
  const slug = slugProp ?? slugFromContext
  const searchParams = useSearchParams()
  const isConfirmationPage = searchParams.get('confirmed') === 'true'

  useEffect(() => {
    if (!isConfirmationPage) return
    const pending = sessionStorage.getItem('pwa-prompt-pending')
    if (pending && ref.current) {
      sessionStorage.removeItem('pwa-prompt-pending')
      const el = ref.current
      setTimeout(() => el.showDialog?.(), 1500)
    }
  }, [isConfirmationPage])

  return (
    <pwa-install
      ref={ref}
      manifest-url={`/${slug}/manifest.webmanifest`}
      name={orgName}
      description="Web App"
      icon={`/api/og/pwa-icon/${slug}?size=192`}
      install-description="This website works like an app when added to your Home Screen"
      manual-apple="true"
      manual-chrome="true"
      use-local-storage="true"
    />
  )
}
