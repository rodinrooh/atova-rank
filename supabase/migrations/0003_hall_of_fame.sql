-- Create hall_of_fame table
CREATE TABLE IF NOT EXISTS public.hall_of_fame (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id),
  vc_id uuid NOT NULL REFERENCES public.vcs(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.hall_of_fame ENABLE ROW LEVEL SECURITY;

-- RLS Policies for hall_of_fame
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'hall_of_fame_select_anon' AND tablename = 'hall_of_fame') THEN
    CREATE POLICY hall_of_fame_select_anon ON public.hall_of_fame FOR SELECT TO anon USING (true);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'hall_of_fame_write_service_role' AND tablename = 'hall_of_fame') THEN
    CREATE POLICY hall_of_fame_write_service_role ON public.hall_of_fame FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END$$;

-- Revoke public access
REVOKE ALL ON public.hall_of_fame FROM public;
