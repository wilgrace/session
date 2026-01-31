"use client"

import { create } from 'zustand'

type AuthMode = 'sign-in' | 'sign-up' | null

interface AuthOverlayStore {
  isOpen: boolean
  mode: AuthMode
  initialEmail?: string
  onComplete?: () => void
  showProfileOverlay: boolean

  openSignIn: (options?: { onComplete?: () => void }) => void
  openSignUp: (options?: { initialEmail?: string; onComplete?: () => void }) => void
  close: () => void
  setShowProfileOverlay: (show: boolean) => void
  triggerOnComplete: () => void
}

export const useAuthOverlay = create<AuthOverlayStore>((set, get) => ({
  isOpen: false,
  mode: null,
  initialEmail: undefined,
  onComplete: undefined,
  showProfileOverlay: false,

  openSignIn: (options) => set({
    isOpen: true,
    mode: 'sign-in',
    initialEmail: undefined,
    onComplete: options?.onComplete
  }),

  openSignUp: (options) => set({
    isOpen: true,
    mode: 'sign-up',
    initialEmail: options?.initialEmail,
    onComplete: options?.onComplete
  }),

  close: () => {
    const { onComplete } = get()
    set({
      isOpen: false,
      mode: null,
      initialEmail: undefined,
      onComplete: undefined,
      showProfileOverlay: false
    })
  },

  setShowProfileOverlay: (show) => set({ showProfileOverlay: show }),

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
      showProfileOverlay: false
    })
  }
}))
