"use client"

import { create } from 'zustand'
import type { Waiver } from '@/lib/db/schema'

type AuthMode = 'sign-in' | 'sign-up' | null

interface AuthOverlayStore {
  isOpen: boolean
  mode: AuthMode
  initialEmail?: string
  onComplete?: () => void
  showProfileOverlay: boolean
  showWaiverOverlay: boolean
  pendingWaiver: Waiver | null
  organizationId?: string

  openSignIn: (options?: { onComplete?: () => void; organizationId?: string }) => void
  openSignUp: (options?: { initialEmail?: string; onComplete?: () => void; organizationId?: string }) => void
  close: () => void
  setShowProfileOverlay: (show: boolean) => void
  setShowWaiverOverlay: (show: boolean, waiver?: Waiver | null) => void
  triggerOnComplete: () => void
}

export const useAuthOverlay = create<AuthOverlayStore>((set, get) => ({
  isOpen: false,
  mode: null,
  initialEmail: undefined,
  onComplete: undefined,
  showProfileOverlay: false,
  showWaiverOverlay: false,
  pendingWaiver: null,
  organizationId: undefined,

  openSignIn: (options) => set({
    isOpen: true,
    mode: 'sign-in',
    initialEmail: undefined,
    onComplete: options?.onComplete,
    organizationId: options?.organizationId,
  }),

  openSignUp: (options) => set({
    isOpen: true,
    mode: 'sign-up',
    initialEmail: options?.initialEmail,
    onComplete: options?.onComplete,
    organizationId: options?.organizationId,
  }),

  close: () => {
    set({
      isOpen: false,
      mode: null,
      initialEmail: undefined,
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

  triggerOnComplete: () => {
    const { onComplete } = get()
    if (onComplete) {
      onComplete()
    }
    set({
      isOpen: false,
      mode: null,
      initialEmail: undefined,
      onComplete: undefined,
      showProfileOverlay: false,
      showWaiverOverlay: false,
      pendingWaiver: null,
      organizationId: undefined,
    })
  }
}))
