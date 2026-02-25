'use client'

import { useEffect, useRef } from 'react'
import { useSlug } from '@/lib/slug-context'
import { useAuthOverlay } from '@/hooks/use-auth-overlay'
import '@khmyznikov/pwa-install'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'pwa-install': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        'manifest-url'?: string
        'manual-apple'?: string
        'manual-chrome'?: string
        'use-local-storage'?: string
      }, HTMLElement>
    }
  }
}

export function PWAInstallWrapper() {
  const ref = useRef<HTMLElement & { showDialog: () => void }>(null)
  const slug = useSlug()
  const { shouldShowPWAPrompt, setShouldShowPWAPrompt } = useAuthOverlay()

  useEffect(() => {
    if (shouldShowPWAPrompt && ref.current) {
      setShouldShowPWAPrompt(false)
      const el = ref.current
      setTimeout(() => el.showDialog?.(), 1500)
    }
  }, [shouldShowPWAPrompt, setShouldShowPWAPrompt])

  return (
    <pwa-install
      ref={ref as React.RefObject<HTMLElement>}
      manifest-url={`/${slug}/manifest.webmanifest`}
      manual-apple=""
      manual-chrome=""
      use-local-storage=""
    />
  )
}
