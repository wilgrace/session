"use client"

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { View } from 'react-big-calendar'

type CalendarView = "list" | "calendar"

interface CalendarViewStore {
  view: CalendarView
  date: Date
  setDate: (date: Date) => void
  setView: (view: CalendarView) => void
}

export const useCalendarView = create<CalendarViewStore>()(
  persist(
    (set) => ({
      view: "list",
      date: new Date(),
      setDate: (date) => set({ date }),
      setView: (view) => set({ view })
    }),
    {
      name: "calendar-view"
    }
  )
)
