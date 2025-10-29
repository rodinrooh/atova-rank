-- 0016_matchups_touch_updated_at.sql

-- 1) Ensure the column exists and is the expected type (defensive, no-op if already correct)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'matchups'
      AND column_name  = 'updated_at'
  ) THEN
    ALTER TABLE public.matchups
      ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END
$$;

-- 2) Drop any BEFORE UPDATE triggers on public.matchups that try to touch updated_at
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT t.tgname
    FROM pg_trigger t
    JOIN pg_class  c ON c.oid = t.tgrelid
    JOIN pg_proc   p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'matchups'
      AND t.tgenabled <> 'D'         -- not disabled
      AND t.tgtype & 1 = 1           -- BEFORE trigger
      AND p.proname ILIKE '%updated%' -- clearly "updated" flavored functions
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.matchups;', r.tgname);
  END LOOP;
END
$$;

-- 3) Drop any legacy updated_at helper functions named generically
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname IN ('set_updated_at','trigger_set_timestamp','matchups_set_updated_at')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I.%I() CASCADE;', r.nspname, r.proname);
  END LOOP;
END
$$;

-- 4) Create a table-specific function with a unique, unambiguous name
CREATE OR REPLACE FUNCTION public.matchups_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

-- 5) Create a single BEFORE UPDATE trigger that uses the table-specific function
CREATE TRIGGER matchups_touch_updated_at
BEFORE UPDATE ON public.matchups
FOR EACH ROW
EXECUTE FUNCTION public.matchups_touch_updated_at();
