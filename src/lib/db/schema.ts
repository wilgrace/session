import { pgTable, pgEnum, text, timestamp, uuid, integer, boolean, date, time } from 'drizzle-orm/pg-core';

// Role enum for user permissions
export const userRoleEnum = pgEnum('user_role', ['guest', 'user', 'admin', 'superadmin']);

// Membership status enum for subscription tracking
export const membershipStatusEnum = pgEnum('membership_status', ['none', 'active', 'expired', 'cancelled']);

// Billing period type (stored as text, not enum for flexibility)
export type BillingPeriod = 'monthly' | 'yearly' | 'one_time';

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  logoUrl: text('logo_url'),
  // Branding fields
  faviconUrl: text('favicon_url'),
  headerImageUrl: text('header_image_url'),
  defaultSessionImageUrl: text('default_session_image_url'),
  buttonColor: text('button_color').default('#6c47ff'),
  buttonTextColor: text('button_text_color').default('#ffffff'),
  // External links
  homepageUrl: text('homepage_url'),
  instagramUrl: text('instagram_url'),
  facebookUrl: text('facebook_url'),
  // Member pricing (org-level defaults)
  memberPriceType: text('member_price_type').default('discount'), // 'discount' | 'fixed'
  memberDiscountPercent: integer('member_discount_percent'), // e.g., 20 for 20% off
  memberFixedPrice: integer('member_fixed_price'), // fixed price in pence (if type='fixed')
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const clerkUsers = pgTable('clerk_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  role: userRoleEnum('role').notNull().default('admin'),
  email: text('email').notNull().unique(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  birthYear: integer('birth_year'),
  gender: text('gender'),
  ethnicity: text('ethnicity'),
  homePostalCode: text('home_postal_code'),
  // Community profile fields
  workSituation: text('work_situation'),
  housingSituation: text('housing_situation'),
  livesInCardiff: boolean('lives_in_cardiff'),
  cardiffNeighbourhood: text('cardiff_neighbourhood'),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Membership tracking for subscription-based pricing
export const userMemberships = pgTable('user_memberships', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => clerkUsers.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  membershipId: uuid('membership_id'), // Reference to specific membership tier (added later to avoid circular ref)
  status: membershipStatusEnum('status').notNull().default('none'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripeCustomerId: text('stripe_customer_id'),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }), // When user requested cancellation
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const saunas = pgTable('saunas', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  capacity: integer('capacity').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Session visibility enum
export const sessionVisibilityEnum = pgEnum('session_visibility', ['open', 'hidden', 'closed']);

export const sessionTemplates = pgTable('session_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),
  capacity: integer('capacity').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  visibility: text('visibility').notNull().default('open'), // 'open' | 'hidden' | 'closed'
  isRecurring: boolean('is_recurring').notNull().default(false),
  oneOffStartTime: time('one_off_start_time'),
  oneOffDate: date('one_off_date'),
  recurrenceStartDate: date('recurrence_start_date'),
  recurrenceEndDate: date('recurrence_end_date'),
  createdBy: uuid('created_by').notNull().references(() => clerkUsers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  timezone: text('timezone').notNull().default('UTC'),
  // Pricing fields
  pricingType: text('pricing_type').notNull().default('free'), // 'free' | 'paid'
  dropInPrice: integer('drop_in_price'), // Price in pence for non-members
  memberPrice: integer('member_price'), // Override org-level member pricing (if set)
  bookingInstructions: text('booking_instructions'), // Instructions shown on confirmation page
  // Image field
  imageUrl: text('image_url'), // Optional image URL for the session
  // Calendar display color
  eventColor: text('event_color').default('blue'), // Color key for calendar events (blue, green, yellow, red, purple)
});

export const sessionSchedules = pgTable('session_schedules', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionTemplateId: uuid('session_template_id').notNull().references(() => sessionTemplates.id),
  dayOfWeek: integer('day_of_week').notNull(), // 0-6
  time: time('time').notNull(),
  durationMinutes: integer('duration_minutes'), // Optional per-schedule duration; falls back to template duration
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  organizationId: text('organization_id').references(() => organizations.id),
});

export const sessionInstances = pgTable('session_instances', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  templateId: uuid('template_id').notNull().references(() => sessionTemplates.id),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('scheduled'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  clerkUserId: text('clerk_user_id'),
});

export const bookings = pgTable('bookings', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  sessionInstanceId: uuid('session_instance_id').notNull().references(() => sessionInstances.id),
  userId: uuid('user_id').notNull().references(() => clerkUsers.id),
  status: text('status').notNull().default('confirmed'), // 'pending_payment' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
  numberOfSpots: integer('number_of_spots').notNull().default(1),
  notes: text('notes'),
  bookedAt: timestamp('booked_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  // Payment fields
  paymentStatus: text('payment_status').default('not_required'), // 'not_required' | 'pending' | 'completed' | 'failed' | 'refunded'
  stripeCheckoutSessionId: text('stripe_checkout_session_id'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  amountPaid: integer('amount_paid'), // Total amount in pence
  // Price breakdown fields (for displaying on confirmation)
  unitPrice: integer('unit_price'), // First person price in pence
  discountAmount: integer('discount_amount'), // Discount applied in pence
});

export const stripeConnectAccounts = pgTable('stripe_connect_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id).unique(),
  stripeAccountId: text('stripe_account_id').notNull().unique(),
  accountType: text('account_type').notNull().default('standard'),
  detailsSubmitted: boolean('details_submitted').notNull().default(false),
  chargesEnabled: boolean('charges_enabled').notNull().default(false),
  payoutsEnabled: boolean('payouts_enabled').notNull().default(false),
  country: text('country').default('GB'),
  defaultCurrency: text('default_currency').default('gbp'),
  // Membership subscription product/price on Connected Account (DEPRECATED - use memberships table)
  membershipProductId: text('membership_product_id'),
  membershipPriceId: text('membership_price_id'),
  membershipMonthlyPrice: integer('membership_monthly_price'), // in pence
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Membership tiers that organizations can offer
export const memberships = pgTable('memberships', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),

  // Basic info
  name: text('name').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),

  // Subscription pricing
  price: integer('price').notNull().default(0), // in pence, 0 = free
  billingPeriod: text('billing_period').notNull().default('monthly'), // 'monthly' | 'yearly' | 'one_time'

  // Member session pricing
  memberPriceType: text('member_price_type').notNull().default('discount'), // 'discount' | 'fixed'
  memberDiscountPercent: integer('member_discount_percent'), // e.g., 20 for 20% off
  memberFixedPrice: integer('member_fixed_price'), // fixed price in pence

  // Visibility (legacy field, kept for backward compatibility)
  displayToNonMembers: boolean('display_to_non_members').notNull().default(true),
  // New visibility options
  showOnBookingPage: boolean('show_on_booking_page').notNull().default(true),
  showOnMembershipPage: boolean('show_on_membership_page').notNull().default(true),

  // Stripe IDs (null for free memberships)
  stripeProductId: text('stripe_product_id'),
  stripePriceId: text('stripe_price_id'),

  // Status
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Per-membership price overrides for sessions
export const sessionMembershipPrices = pgTable('session_membership_prices', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionTemplateId: uuid('session_template_id').notNull().references(() => sessionTemplates.id, { onDelete: 'cascade' }),
  membershipId: uuid('membership_id').notNull().references(() => memberships.id, { onDelete: 'cascade' }),
  overridePrice: integer('override_price').notNull(), // in pence
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Agreement type for waivers
export type AgreementType = 'checkbox' | 'signature';

// Waivers that organizations can require users to agree to
export const waivers = pgTable('waivers', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  summary: text('summary'),
  content: text('content').notNull(),
  agreementType: text('agreement_type').notNull().default('checkbox'), // 'checkbox' | 'signature'
  version: integer('version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// User waiver agreements (audit trail)
export const waiverAgreements = pgTable('waiver_agreements', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => clerkUsers.id, { onDelete: 'cascade' }),
  waiverId: uuid('waiver_id').notNull().references(() => waivers.id, { onDelete: 'cascade' }),
  waiverVersion: integer('waiver_version').notNull(),
  agreedAt: timestamp('agreed_at', { withTimezone: true }).defaultNow().notNull(),
  agreementType: text('agreement_type').notNull(), // 'checkbox' | 'signature'
  signatureData: text('signature_data'), // Base64 PNG for signature type
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Organization = typeof organizations.$inferSelect;
export type ClerkUser = typeof clerkUsers.$inferSelect;
export type Sauna = typeof saunas.$inferSelect;
export type SessionTemplate = typeof sessionTemplates.$inferSelect;
export type SessionSchedule = typeof sessionSchedules.$inferSelect;
export type SessionInstance = typeof sessionInstances.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type UserMembership = typeof userMemberships.$inferSelect;
export type StripeConnectAccount = typeof stripeConnectAccounts.$inferSelect;

// Insert types (for creating new records)
export type NewSessionTemplate = typeof sessionTemplates.$inferInsert;
export type NewSessionSchedule = typeof sessionSchedules.$inferInsert;
export type NewUserMembership = typeof userMemberships.$inferInsert;

// Membership types
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type SessionMembershipPrice = typeof sessionMembershipPrices.$inferSelect;
export type NewSessionMembershipPrice = typeof sessionMembershipPrices.$inferInsert;

// Role type for convenience
export type UserRole = 'guest' | 'user' | 'admin' | 'superadmin';
export type MembershipStatus = 'none' | 'active' | 'expired' | 'cancelled';
export type SessionVisibility = 'open' | 'hidden' | 'closed';

// Waiver types
export type Waiver = typeof waivers.$inferSelect;
export type NewWaiver = typeof waivers.$inferInsert;
export type WaiverAgreement = typeof waiverAgreements.$inferSelect;
export type NewWaiverAgreement = typeof waiverAgreements.$inferInsert; 