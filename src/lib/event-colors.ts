export const EVENT_COLORS = {
  blue: { name: 'Blue', color500: '#0EA5E9', color700: '#0369A1' },
  green: { name: 'Green', color500: '#10B981', color700: '#047857' },
  yellow: { name: 'Yellow', color500: '#FDD34E', color700: '#92400D' },
  red: { name: 'Red', color500: '#F43F5E', color700: '#BE123C' },
  purple: { name: 'Purple', color500: '#8B5CF6', color700: '#6D28D9' },
} as const

export type EventColorKey = keyof typeof EVENT_COLORS

export const DEFAULT_EVENT_COLOR: EventColorKey = 'blue'

export function getEventColorValues(key: string | null | undefined) {
  const colorKey = normalizeEventColor(key)
  return EVENT_COLORS[colorKey]
}

export function normalizeEventColor(value: string | null | undefined): EventColorKey {
  if (!value) return DEFAULT_EVENT_COLOR

  // Already a valid key
  if (value in EVENT_COLORS) return value as EventColorKey

  // Check if it matches any 500 hex value
  for (const [key, colors] of Object.entries(EVENT_COLORS)) {
    if (colors.color500.toLowerCase() === value.toLowerCase()) {
      return key as EventColorKey
    }
  }

  // Legacy default
  if (value.toLowerCase() === '#3b82f6') return 'blue'

  // Fallback
  return DEFAULT_EVENT_COLOR
}
