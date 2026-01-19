-- Add composite indexes for performance optimization
-- These indexes target the most frequently used query patterns identified in the codebase

-- Index for bookings by user and status (used in getUserUpcomingBookings)
-- Supports queries: WHERE user_id = ? AND status = ? ORDER BY updated_at DESC
CREATE INDEX IF NOT EXISTS idx_bookings_user_status_updated
ON public.bookings (user_id, status, updated_at DESC);

-- Index for session instances by template and date range (used in getSessions, getPublicSessions)
-- Supports queries: WHERE template_id = ? AND start_time >= ? AND start_time <= ?
CREATE INDEX IF NOT EXISTS idx_session_instances_template_start_time
ON public.session_instances (template_id, start_time);

-- Index for session schedules by template and day (used in schedule lookups)
-- Supports queries: WHERE session_template_id = ? AND day_of_week = ?
CREATE INDEX IF NOT EXISTS idx_session_schedules_template_day
ON public.session_schedules (session_template_id, day_of_week);

-- Index for clerk_users by organization (used in RLS policies and org-scoped queries)
-- Supports queries: WHERE organization_id = ?
CREATE INDEX IF NOT EXISTS idx_clerk_users_organization
ON public.clerk_users (organization_id);

-- Index for clerk_users by clerk_user_id (used in authentication lookups)
-- Supports queries: WHERE clerk_user_id = ?
CREATE INDEX IF NOT EXISTS idx_clerk_users_clerk_user_id
ON public.clerk_users (clerk_user_id);

-- Index for session_templates by organization (used in org-scoped template queries)
-- Supports queries: WHERE organization_id = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_session_templates_org_created
ON public.session_templates (organization_id, created_at DESC);

-- Index for bookings by session_instance_id (used in instance capacity checks)
-- Supports queries: WHERE session_instance_id = ?
CREATE INDEX IF NOT EXISTS idx_bookings_session_instance
ON public.bookings (session_instance_id);

-- Partial index for active bookings only (excludes cancelled)
-- Optimizes capacity checking queries that filter out cancelled bookings
CREATE INDEX IF NOT EXISTS idx_bookings_active_instance
ON public.bookings (session_instance_id, user_id)
WHERE status != 'cancelled';

-- Index for session_instances by organization (used in RLS and org filtering)
CREATE INDEX IF NOT EXISTS idx_session_instances_organization
ON public.session_instances (organization_id);
