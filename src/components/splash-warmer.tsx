"use client"

import { useEffect } from "react"

/**
 * Pre-fetches the matching iOS splash screen image into the browser cache.
 * iOS only shows `apple-touch-startup-image` if the URL was already cached
 * from a previous Safari visit. This component detects the current device's
 * media query and triggers a background fetch so the splash shows on the
 * next Home Screen launch.
 */
export function SplashWarmer() {
  useEffect(() => {
    const links = document.querySelectorAll<HTMLLinkElement>(
      'link[rel="apple-touch-startup-image"]'
    )
    links.forEach((link) => {
      if (link.media && window.matchMedia(link.media).matches) {
        fetch(link.href, { cache: "force-cache" }).catch(() => {
          // Silent failure — non-critical prefetch
        })
      }
    })
  }, [])

  return null
}
