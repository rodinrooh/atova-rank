-- === ONE-SHOT REPAIR SQL ===
-- Run this in Supabase SQL Editor RIGHT NOW

BEGIN;

-- A) Ensure the column exists
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

-- B) Drop conflicting BEFORE UPDATE triggers on public.matchups that reference "updated"
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
      AND t.tgtype & 1 = 1            -- BEFORE
      AND p.proname ILIKE '%updated%' -- any updated_at-ish function
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.matchups;', r.tgname);
  END LOOP;
END
$$;

-- C) Drop legacy updated_at helper functions
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

-- D) Recreate the canonical table-specific function + trigger
CREATE OR REPLACE FUNCTION public.matchups_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER matchups_touch_updated_at
BEFORE UPDATE ON public.matchups
FOR EACH ROW
EXECUTE FUNCTION public.matchups_touch_updated_at();

-- E) Ensure start_season explicitly touches updated_at (so Start Season works even if trigger breaks later)
CREATE OR REPLACE FUNCTION public.start_season(p_season_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_first_matchup_id uuid;
BEGIN
  SELECT id INTO v_first_matchup_id
  FROM public.matchups
  WHERE season_id = p_season_id
    AND match_number = 1
    AND round = 1
  LIMIT 1;

  IF v_first_matchup_id IS NULL THEN
    RAISE EXCEPTION 'No matchups found for season %', p_season_id;
  END IF;

  UPDATE public.matchups
  SET
    active     = true,
    started_at = now(),
    ends_at    = now() + interval '72 hours',
    updated_at = now()
  WHERE id = v_first_matchup_id;

  RETURN v_first_matchup_id;
END;
$$;

ALTER FUNCTION public.start_season(uuid)
  SET search_path = public, pg_temp;

COMMIT;

-- F) VERIFY: 1) Trigger exists and is correct  2) Manual update works
-- 1) Trigger check
SELECT
  t.tgname,
  n.nspname AS schema,
  c.relname AS table,
  pg_get_functiondef(t.tgfoid) AS trigger_function
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relname='matchups';

-- 2) Manual update dry-run (pick any existing row)
--    Expect: one row returned with a fresh updated_at (≈ NOW())
UPDATE public.matchups
SET active = active
WHERE id = (SELECT id FROM public.matchups LIMIT 1)
RETURNING id, updated_at, now() AS now_for_compare;
