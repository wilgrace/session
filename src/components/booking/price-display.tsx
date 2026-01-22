"use client"

import { cn } from "@/lib/utils"

interface PriceDisplayProps {
  /** Price in pence */
  dropInPrice: number
  /** Number of spots being booked */
  numberOfSpots?: number
  /** Whether to show the total calculation */
  showTotal?: boolean
  /** Additional CSS classes */
  className?: string
}

/**
 * Formats a price in pence to a GBP currency string
 */
export function formatPrice(priceInPence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(priceInPence / 100)
}

/**
 * Displays session pricing with optional total calculation
 */
export function PriceDisplay({
  dropInPrice,
  numberOfSpots = 1,
  showTotal = false,
  className,
}: PriceDisplayProps) {
  const total = dropInPrice * numberOfSpots

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Price per person</span>
        <span className="font-medium">{formatPrice(dropInPrice)}</span>
      </div>

      {showTotal && numberOfSpots > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{numberOfSpots} {numberOfSpots === 1 ? 'person' : 'people'}</span>
          <span>{formatPrice(dropInPrice)} × {numberOfSpots}</span>
        </div>
      )}

      {showTotal && (
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="font-medium">Total</span>
          <span className="text-lg font-semibold">{formatPrice(total)}</span>
        </div>
      )}
    </div>
  )
}

/**
 * Compact price badge for use in cards/lists
 */
export function PriceBadge({
  price,
  className,
}: {
  price: number
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary",
        className
      )}
    >
      {formatPrice(price)}
    </span>
  )
}
