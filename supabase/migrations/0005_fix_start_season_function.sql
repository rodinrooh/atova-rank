-- Fix ambiguous column reference in start_season function
CREATE OR REPLACE FUNCTION start_season(
  p_season_id uuid,
  p_match_duration_hours int,
  p_cp_start bigint
) RETURNS void AS $$
DECLARE
  matchup1_id uuid;
  matchup1_vc_a_id uuid;
  matchup1_vc_b_id uuid;
  start_time timestamptz;
  end_time timestamptz;
BEGIN
  -- Check if season exists
  IF NOT EXISTS (SELECT 1 FROM seasons WHERE id = p_season_id) THEN
    RAISE EXCEPTION 'season_not_found';
  END IF;

  -- Set season as active
  UPDATE seasons 
  SET active = true, start_date = now() 
  WHERE id = p_season_id;

  -- Ensure no other active matchups
  UPDATE matchups SET active = false WHERE season_id = p_season_id;

  -- Get matchup #1
  SELECT id, vc_a_id, vc_b_id 
  INTO matchup1_id, matchup1_vc_a_id, matchup1_vc_b_id
  FROM matchups 
  WHERE season_id = p_season_id AND match_number = 1;

  IF matchup1_id IS NULL THEN
    RAISE EXCEPTION 'matchup_not_found';
  END IF;

  IF matchup1_vc_a_id IS NULL OR matchup1_vc_b_id IS NULL THEN
    RAISE EXCEPTION 'matchup_not_ready';
  END IF;

  -- Calculate times
  start_time := now();
  end_time := start_time + (p_match_duration_hours || ' hours')::interval;

  -- Activate matchup #1
  UPDATE matchups SET
    started_at = start_time,
    ends_at = end_time,
    active = true,
    finished = false,
    current_cp_a = p_cp_start,
    current_cp_b = p_cp_start
  WHERE id = matchup1_id;
END;
$$ LANGUAGE plpgsql;
