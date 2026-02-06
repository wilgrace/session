"use client"

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type BookingsView = "list" | "calendar"

interface BookingsViewStore {
  view: BookingsView
  searchQuery: string
  setView: (view: BookingsView) => void
  setSearchQuery: (query: string) => void
}

export const useBookingsView = create<BookingsViewStore>()(
  persist(
    (set) => ({
      view: "calendar",
      searchQuery: "",
      setView: (view) => set({ view }),
      setSearchQuery: (searchQuery) => set({ searchQuery })
    }),
    {
      name: "bookings-view",
      partialize: (state) => ({ view: state.view }) // Only persist view, not search query
    }
  )
)
