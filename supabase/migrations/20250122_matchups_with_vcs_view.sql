-- idempotent: drop then recreate
drop view if exists public.matchups_with_vcs;

create view public.matchups_with_vcs as
select
  m.id,
  m.season_id,
  m.match_number,
  m.round,
  m.started_at,
  m.ends_at,
  m.current_cp_a,
  m.current_cp_b,
  m.final_cp_a,
  m.final_cp_b,
  m.winner_id,
  m.active,
  m.finished,
  m.next_match_id,
  -- Force single-object JSON for each VC side
  json_build_object(
    'id', vc_a.id,
    'name', vc_a.name,
    'color_hex', vc_a.color_hex,
    'conference', vc_a.conference
  ) as vc_a,
  json_build_object(
    'id', vc_b.id,
    'name', vc_b.name,
    'color_hex', vc_b.color_hex,
    'conference', vc_b.conference
  ) as vc_b
from public.matchups m
left join public.vcs vc_a on vc_a.id = m.vc_a_id
left join public.vcs vc_b on vc_b.id = m.vc_b_id;

-- Ensure anon/authenticated can read the view (RLS on base tables still applies)
grant select on public.matchups_with_vcs to anon, authenticated;
