-- Add update triggers to automatically set updated_at timestamps

-- Trigger for session_instances
DROP TRIGGER IF EXISTS on_session_instances_update ON public.session_instances;
CREATE TRIGGER on_session_instances_update
  BEFORE UPDATE ON public.session_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Trigger for session_templates
DROP TRIGGER IF EXISTS on_session_templates_update ON public.session_templates;
CREATE TRIGGER on_session_templates_update
  BEFORE UPDATE ON public.session_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
