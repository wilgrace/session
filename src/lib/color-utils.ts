/**
 * Converts a hex color string to HSL space-separated format
 * that Tailwind CSS expects for CSS custom properties.
 *
 * Example: "#6c47ff" → "252 100% 64%"
 */
export function hexToHSL(hex: string): string {
  // Remove # if present
  hex = hex.replace(/^#/, "")

  // Parse hex values
  const r = parseInt(hex.substring(0, 2), 16) / 255
  const g = parseInt(hex.substring(2, 4), 16) / 255
  const b = parseInt(hex.substring(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) {
    // Achromatic
    return `0 0% ${Math.round(l * 100)}%`
  }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max - min)

  let h = 0
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6
      break
    case g:
      h = ((b - r) / d + 2) / 6
      break
    case b:
      h = ((r - g) / d + 4) / 6
      break
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

/**
 * Determines whether a color is "light" (needs dark text) or "dark" (needs light text).
 * Returns HSL for an appropriate foreground color.
 */
export function getForegroundHSL(hex: string): string {
  hex = hex.replace(/^#/, "")
  const r = parseInt(hex.substring(0, 2), 16) / 255
  const g = parseInt(hex.substring(2, 4), 16) / 255
  const b = parseInt(hex.substring(4, 6), 16) / 255

  // Relative luminance calculation
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b

  // Return white for dark backgrounds, dark for light backgrounds
  return luminance > 0.5 ? "0 0% 9%" : "0 0% 100%"
}
