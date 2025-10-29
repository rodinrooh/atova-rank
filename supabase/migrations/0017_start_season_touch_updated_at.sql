-- 0017_start_season_touch_updated_at.sql

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
    updated_at = now()          -- explicit touch (belt & suspenders)
  WHERE id = v_first_matchup_id;

  RETURN v_first_matchup_id;
END;
$$;

-- Optional: lock down search_path for the function to avoid cross-schema weirdness
ALTER FUNCTION public.start_season(uuid)
  SET search_path = public, pg_temp;
