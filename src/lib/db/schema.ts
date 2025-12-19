import { pgTable, text, timestamp, uuid, integer, boolean, date, time } from 'drizzle-orm/pg-core';

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  logoUrl: text('logo_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const clerkUsers = pgTable('clerk_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  isSuperAdmin: boolean('is_super_admin').notNull().default(false),
  email: text('email').notNull().unique(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  dateOfBirth: date('date_of_birth'),
  gender: text('gender'),
  ethnicity: text('ethnicity'),
  homePostalCode: text('home_postal_code'),
  clerkUserId: text('clerk_user_id').notNull().unique(),
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

export const sessionTemplates = pgTable('session_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),
  capacity: integer('capacity').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  isOpen: boolean('is_open').notNull().default(true),
  isRecurring: boolean('is_recurring').notNull().default(false),
  oneOffStartTime: time('one_off_start_time'),
  oneOffDate: date('one_off_date'),
  recurrenceStartDate: date('recurrence_start_date'),
  recurrenceEndDate: date('recurrence_end_date'),
  createdBy: uuid('created_by').notNull().references(() => clerkUsers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  timezone: text('timezone').notNull().default('UTC'),
});

export const sessionSchedules = pgTable('session_schedules', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionTemplateId: uuid('session_template_id').notNull().references(() => sessionTemplates.id),
  dayOfWeek: integer('day_of_week').notNull(), // 0-6
  time: time('time').notNull(),
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
  status: text('status').notNull().default('confirmed'), // Enforce allowed values in app logic
  numberOfSpots: integer('number_of_spots').notNull().default(1),
  notes: text('notes'),
  bookedAt: timestamp('booked_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Organization = typeof organizations.$inferSelect;
export type ClerkUser = typeof clerkUsers.$inferSelect;
export type Sauna = typeof saunas.$inferSelect;
export type SessionTemplate = typeof sessionTemplates.$inferSelect;
export type SessionSchedule = typeof sessionSchedules.$inferSelect;
export type SessionInstance = typeof sessionInstances.$inferSelect;
export type Booking = typeof bookings.$inferSelect; 