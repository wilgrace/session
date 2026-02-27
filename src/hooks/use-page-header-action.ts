"use client"

import { create } from 'zustand'

interface PageHeaderAction {
  label: string
  onClick: () => void
  loading?: boolean
}

interface PageHeaderActionStore {
  action: PageHeaderAction | null
  setAction: (action: PageHeaderAction | null) => void
}

export const usePageHeaderAction = create<PageHeaderActionStore>((set) => ({
  action: null,
  setAction: (action) => set({ action }),
}))
