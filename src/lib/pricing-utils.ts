import type { UserMembership, Membership } from "@/lib/db/schema"

/**
 * Parameters for calculating member price
 */
export interface MemberPriceParams {
  /** Drop-in price in pence */
  dropInPrice: number
  /** Template-level member price override (in pence), null if not set */
  templateMemberPrice: number | null
  /** Organization-level pricing type */
  orgMemberPriceType: "discount" | "fixed" | null
  /** Organization-level discount percentage (e.g., 20 for 20% off) */
  orgMemberDiscountPercent: number | null
  /** Organization-level fixed member price in pence */
  orgMemberFixedPrice: number | null
}

/**
 * Calculate the member price for a session.
 *
 * Priority order:
 * 1. Template-level member price override (if set)
 * 2. Organization-level fixed price (if type = 'fixed')
 * 3. Organization-level discount percentage (if type = 'discount')
 * 4. Fall back to drop-in price (no member discount)
 *
 * @returns Member price in pence
 */
export function calculateMemberPrice(params: MemberPriceParams): number {
  const {
    dropInPrice,
    templateMemberPrice,
    orgMemberPriceType,
    orgMemberDiscountPercent,
    orgMemberFixedPrice,
  } = params

  // 1. Template override takes highest priority
  if (templateMemberPrice !== null && templateMemberPrice !== undefined) {
    return templateMemberPrice
  }

  // 2. Organization-level fixed price
  if (orgMemberPriceType === "fixed" && orgMemberFixedPrice !== null) {
    return orgMemberFixedPrice
  }

  // 3. Organization-level discount percentage
  if (orgMemberPriceType === "discount" && orgMemberDiscountPercent !== null) {
    const discountMultiplier = 1 - orgMemberDiscountPercent / 100
    return Math.round(dropInPrice * discountMultiplier)
  }

  // 4. No member pricing configured - return drop-in price
  return dropInPrice
}

/**
 * Check if a membership is currently active.
 *
 * A membership is active if:
 * - Status is 'active', OR
 * - Status is 'cancelled' but current_period_end is in the future
 *   (grace period - user can still use member benefits until period ends)
 *
 * @param membership The user's membership record, or null if no membership
 * @returns true if the user should receive member benefits
 */
export function isMembershipActive(membership: UserMembership | null | undefined): boolean {
  if (!membership) return false

  // Active status means currently paying member
  if (membership.status === "active") return true

  // Cancelled but still within the paid period
  if (membership.status === "cancelled" && membership.currentPeriodEnd) {
    const periodEnd = new Date(membership.currentPeriodEnd)
    return periodEnd > new Date()
  }

  return false
}

/**
 * Format a price in pence for display.
 *
 * @param priceInPence Price in pence (e.g., 1500 for £15.00)
 * @returns Formatted string (e.g., "£15.00" or "£15")
 */
export function formatPrice(priceInPence: number): string {
  const pounds = priceInPence / 100
  // Show whole pounds without decimals, otherwise show 2 decimal places
  if (pounds === Math.floor(pounds)) {
    return `£${pounds}`
  }
  return `£${pounds.toFixed(2)}`
}

/**
 * Calculate the total price for a booking.
 *
 * @param params Booking parameters
 * @returns Total price in pence
 */
export interface BookingPriceParams {
  /** Number of spots being booked */
  numberOfSpots: number
  /** Whether the booking user is an active member */
  isMember: boolean
  /** Whether this is a new membership purchase */
  isNewMembership: boolean
  /** Drop-in price in pence */
  dropInPrice: number
  /** Member price in pence */
  memberPrice: number
}

export interface BookingPriceBreakdown {
  /** Price for person 1 (member rate if applicable) */
  person1Price: number
  /** Price per additional person (always drop-in) */
  additionalPersonPrice: number
  /** Number of additional people (beyond person 1) */
  additionalPeople: number
  /** Subtotal for session (before membership fee) */
  sessionSubtotal: number
  /** Monthly membership fee (only if new membership) */
  membershipFee: number
  /** Total price */
  total: number
}

export function calculateBookingPrice(
  params: BookingPriceParams,
  monthlyMembershipPrice: number | null
): BookingPriceBreakdown {
  const { numberOfSpots, isMember, isNewMembership, dropInPrice, memberPrice } = params

  // Person 1 gets member rate if they're a member or signing up for membership
  const person1Price = isMember || isNewMembership ? memberPrice : dropInPrice

  // Additional people always pay drop-in
  const additionalPeople = Math.max(0, numberOfSpots - 1)
  const additionalPersonPrice = dropInPrice

  // Session subtotal
  const sessionSubtotal = person1Price + additionalPersonPrice * additionalPeople

  // Membership fee only applies for new membership signups
  const membershipFee = isNewMembership && monthlyMembershipPrice ? monthlyMembershipPrice : 0

  return {
    person1Price,
    additionalPersonPrice,
    additionalPeople,
    sessionSubtotal,
    membershipFee,
    total: sessionSubtotal + membershipFee,
  }
}

// ============================================
// Multi-Membership Pricing Functions
// ============================================

/**
 * Parameters for calculating member price for a specific membership
 */
export interface MembershipPriceParams {
  /** Drop-in price in pence */
  dropInPrice: number
  /** The membership to calculate price for */
  membership: Membership
  /** Per-session price override for this membership (in pence), null if not set */
  sessionOverridePrice?: number | null
}

/**
 * Calculate the session price for a specific membership.
 *
 * Priority order:
 * 1. Session-level override for this membership (from session_membership_prices)
 * 2. Membership-level fixed price (if memberPriceType = 'fixed')
 * 3. Membership-level discount percentage (if memberPriceType = 'discount')
 * 4. Fall back to drop-in price (no member discount)
 *
 * @returns Session price in pence for this membership
 */
export function calculateMembershipSessionPrice(params: MembershipPriceParams): number {
  const { dropInPrice, membership, sessionOverridePrice } = params

  // 1. Session-level override takes highest priority
  if (sessionOverridePrice !== null && sessionOverridePrice !== undefined) {
    return sessionOverridePrice
  }

  // 2. Membership-level fixed price
  if (membership.memberPriceType === "fixed" && membership.memberFixedPrice !== null) {
    return membership.memberFixedPrice
  }

  // 3. Membership-level discount percentage
  if (membership.memberPriceType === "discount" && membership.memberDiscountPercent !== null) {
    const discountMultiplier = 1 - membership.memberDiscountPercent / 100
    return Math.round(dropInPrice * discountMultiplier)
  }

  // 4. No member pricing configured - return drop-in price
  return dropInPrice
}

/**
 * Calculate session prices for all memberships
 */
export interface MembershipWithPrice {
  membership: Membership
  sessionPrice: number
  isUserMembership: boolean
}

export function calculateAllMembershipPrices(params: {
  dropInPrice: number
  memberships: Membership[]
  sessionOverrides: Record<string, number> // membershipId -> price in pence
  userMembershipId?: string | null
}): MembershipWithPrice[] {
  const { dropInPrice, memberships, sessionOverrides, userMembershipId } = params

  return memberships.map((membership) => ({
    membership,
    sessionPrice: calculateMembershipSessionPrice({
      dropInPrice,
      membership,
      sessionOverridePrice: sessionOverrides[membership.id] ?? null,
    }),
    isUserMembership: membership.id === userMembershipId,
  }))
}
