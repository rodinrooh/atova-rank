-- Function to seed quarterfinals atomically
CREATE OR REPLACE FUNCTION seed_quarterfinals(
  p_season_id uuid,
  p_pairs jsonb
) RETURNS void AS $$
DECLARE
  pair jsonb;
  match_num int;
  next_match_5_id uuid;
  next_match_6_id uuid;
  next_match_7_id uuid;
BEGIN
  -- Set season as active
  UPDATE seasons 
  SET active = true, start_date = now() 
  WHERE id = p_season_id;

  -- Process each quarterfinal pair
  FOR match_num IN 1..4 LOOP
    pair := p_pairs->(match_num - 1);
    
    -- Update VC conferences
    UPDATE vcs SET conference = (pair->>'left_right')::text 
    WHERE id = (pair->>'vc_a_id')::uuid AND season_id = p_season_id;
    
    UPDATE vcs SET conference = (pair->>'left_right')::text 
    WHERE id = (pair->>'vc_b_id')::uuid AND season_id = p_season_id;
    
    -- Upsert quarterfinal matchup
    INSERT INTO matchups (
      season_id, match_number, round, vc_a_id, vc_b_id,
      current_cp_a, current_cp_b, active, finished
    ) VALUES (
      p_season_id, match_num, 1,
      (pair->>'vc_a_id')::uuid, (pair->>'vc_b_id')::uuid,
      1000, 1000, false, false
    )
    ON CONFLICT (season_id, match_number) 
    DO UPDATE SET
      vc_a_id = EXCLUDED.vc_a_id,
      vc_b_id = EXCLUDED.vc_b_id,
      current_cp_a = 1000,
      current_cp_b = 1000,
      active = false,
      finished = false;
  END LOOP;

  -- Create semifinals and final (matches 5-7)
  INSERT INTO matchups (
    season_id, match_number, round, vc_a_id, vc_b_id,
    current_cp_a, current_cp_b, active, finished
  ) VALUES 
    (p_season_id, 5, 2, null, null, 1000, 1000, false, false),
    (p_season_id, 6, 2, null, null, 1000, 1000, false, false),
    (p_season_id, 7, 3, null, null, 1000, 1000, false, false)
  ON CONFLICT (season_id, match_number) 
  DO UPDATE SET
    vc_a_id = null,
    vc_b_id = null,
    current_cp_a = 1000,
    current_cp_b = 1000,
    active = false,
    finished = false;

  -- Get IDs for next match links
  SELECT id INTO next_match_5_id FROM matchups 
  WHERE season_id = p_season_id AND match_number = 5;
  
  SELECT id INTO next_match_6_id FROM matchups 
  WHERE season_id = p_season_id AND match_number = 6;
  
  SELECT id INTO next_match_7_id FROM matchups 
  WHERE season_id = p_season_id AND match_number = 7;

  -- Set next_match_id links: 1→5, 2→5, 3→6, 4→6, 5→7, 6→7
  UPDATE matchups SET next_match_id = next_match_5_id 
  WHERE season_id = p_season_id AND match_number IN (1, 2);
  
  UPDATE matchups SET next_match_id = next_match_6_id 
  WHERE season_id = p_season_id AND match_number IN (3, 4);
  
  UPDATE matchups SET next_match_id = next_match_7_id 
  WHERE season_id = p_season_id AND match_number IN (5, 6);

  -- Ensure no active matchups
  UPDATE matchups SET active = false WHERE season_id = p_season_id;
END;
$$ LANGUAGE plpgsql;

-- Function to start season atomically
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

-- Function to add admin event atomically
CREATE OR REPLACE FUNCTION add_admin_event(
  p_season_id uuid,
  p_matchup_id uuid,
  p_vc_id uuid,
  p_delta bigint,
  p_reason text,
  p_cutoff_seconds int
) RETURNS bigint AS $$
DECLARE
  matchup_active boolean;
  matchup_ends_at timestamptz;
  matchup_vc_a_id uuid;
  matchup_vc_b_id uuid;
  matchup_current_cp_a bigint;
  matchup_current_cp_b bigint;
  new_cp bigint;
BEGIN
  -- Get matchup details
  SELECT active, ends_at, vc_a_id, vc_b_id, current_cp_a, current_cp_b
  INTO matchup_active, matchup_ends_at, matchup_vc_a_id, matchup_vc_b_id, 
       matchup_current_cp_a, matchup_current_cp_b
  FROM matchups 
  WHERE id = p_matchup_id AND season_id = p_season_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'matchup_not_found';
  END IF;

  IF NOT matchup_active THEN
    RAISE EXCEPTION 'matchup_not_active';
  END IF;

  -- Validate vcId is in this matchup
  IF p_vc_id != matchup_vc_a_id AND p_vc_id != matchup_vc_b_id THEN
    RAISE EXCEPTION 'invalid_vc';
  END IF;

  -- Check event cutoff window
  IF now() >= (matchup_ends_at - (p_cutoff_seconds || ' seconds')::interval) THEN
    RAISE EXCEPTION 'window_closed';
  END IF;

  -- Insert event record
  INSERT INTO events (season_id, matchup_id, vc_id, delta, reason)
  VALUES (p_season_id, p_matchup_id, p_vc_id, p_delta, p_reason);

  -- Update CP and return new value
  IF p_vc_id = matchup_vc_a_id THEN
    new_cp := matchup_current_cp_a + p_delta;
    UPDATE matchups SET current_cp_a = new_cp WHERE id = p_matchup_id;
  ELSE
    new_cp := matchup_current_cp_b + p_delta;
    UPDATE matchups SET current_cp_b = new_cp WHERE id = p_matchup_id;
  END IF;

  RETURN new_cp;
END;
$$ LANGUAGE plpgsql;
