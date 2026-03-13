"use client"

import { create } from 'zustand'
import type { Waiver } from '@/lib/db/schema'

type AuthMode = 'sign-in' | 'sign-up' | null

interface OrgBranding {
  logoUrl?: string
  brandColor?: string
  brandTextColor?: string
}

interface AuthOverlayStore {
  isOpen: boolean
  mode: AuthMode
  initialEmail?: string
  contextMessage?: string
  onComplete?: () => void
  showProfileOverlay: boolean
  showWaiverOverlay: boolean
  pendingWaiver: Waiver | null
  organizationId?: string
  orgBranding?: OrgBranding

  openSignIn: (options?: { onComplete?: () => void; organizationId?: string; initialEmail?: string }) => void
  openSignUp: (options?: { initialEmail?: string; contextMessage?: string; onComplete?: () => void; organizationId?: string }) => void
  close: () => void
  setShowProfileOverlay: (show: boolean) => void
  setShowWaiverOverlay: (show: boolean, waiver?: Waiver | null) => void
  setOrgBranding: (branding: OrgBranding | undefined) => void
  triggerOnComplete: () => void
}

export const useAuthOverlay = create<AuthOverlayStore>((set, get) => ({
  isOpen: false,
  mode: null,
  initialEmail: undefined,
  contextMessage: undefined,
  onComplete: undefined,
  showProfileOverlay: false,
  showWaiverOverlay: false,
  pendingWaiver: null,
  organizationId: undefined,
  orgBranding: undefined,

  openSignIn: (options) => set({
    isOpen: true,
    mode: 'sign-in',
    initialEmail: options?.initialEmail,
    contextMessage: undefined,
    onComplete: options?.onComplete,
    organizationId: options?.organizationId,
  }),

  openSignUp: (options) => set({
    isOpen: true,
    mode: 'sign-up',
    initialEmail: options?.initialEmail,
    contextMessage: options?.contextMessage,
    onComplete: options?.onComplete,
    organizationId: options?.organizationId,
  }),

  close: () => {
    set({
      isOpen: false,
      mode: null,
      initialEmail: undefined,
      contextMessage: undefined,
      onComplete: undefined,
      showProfileOverlay: false,
      showWaiverOverlay: false,
      pendingWaiver: null,
      organizationId: undefined,
    })
  },

  setShowProfileOverlay: (show) => set({ showProfileOverlay: show }),

  setShowWaiverOverlay: (show, waiver = null) => set({
    showWaiverOverlay: show,
    pendingWaiver: waiver,
  }),

  setOrgBranding: (branding) => set({ orgBranding: branding }),

  triggerOnComplete: () => {
    const { onComplete, mode } = get()
    const wasSignUp = mode === 'sign-up'
    if (onComplete) {
      onComplete()
    }
    if (wasSignUp) {
      sessionStorage.setItem('pwa-prompt-pending', '1')
    }
    set({
      isOpen: false,
      mode: null,
      initialEmail: undefined,
      contextMessage: undefined,
      onComplete: undefined,
      showProfileOverlay: false,
      showWaiverOverlay: false,
      pendingWaiver: null,
      organizationId: undefined,
    })
  }
}))
