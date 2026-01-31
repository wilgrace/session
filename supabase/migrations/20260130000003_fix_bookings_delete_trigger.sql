-- Drop the debug trigger that was blocking DELETE operations
-- The trigger used NEW.user_id which is NULL for DELETE operations (only OLD exists)
-- and RETURN NEW returns NULL for deletes, aborting the operation

DROP TRIGGER IF EXISTS log_rls_check_trigger ON bookings;

-- Optionally drop the debug function if no longer needed
DROP FUNCTION IF EXISTS log_rls_check();
