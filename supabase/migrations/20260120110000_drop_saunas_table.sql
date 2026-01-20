-- Drop unused saunas table (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'saunas') THEN
    DROP TRIGGER IF EXISTS on_saunas_update ON public.saunas;
    DROP TABLE public.saunas;
  END IF;
END $$;
