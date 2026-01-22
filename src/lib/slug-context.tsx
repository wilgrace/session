"use client"

import { createContext, useContext, ReactNode } from "react"

interface SlugContextValue {
  slug: string
}

const SlugContext = createContext<SlugContextValue | null>(null)

export function SlugProvider({
  children,
  slug,
}: {
  children: ReactNode
  slug: string
}) {
  return (
    <SlugContext.Provider value={{ slug }}>
      {children}
    </SlugContext.Provider>
  )
}

export function useSlug(): string {
  const context = useContext(SlugContext)
  if (!context) {
    throw new Error("useSlug must be used within a SlugProvider")
  }
  return context.slug
}

export function useSlugOptional(): string | null {
  const context = useContext(SlugContext)
  return context?.slug ?? null
}
