-- 0014_manual_progression.sql

-- ================================
-- A) Clean up ANY cron artifacts
-- ================================

do $$
begin
  -- Unschedule named jobs if cron is present
  perform 1 from pg_extension where extname = 'pg_cron';
  if found then
    begin
      perform cron.unschedule('resolve-due-matchups');
    exception when others then
      -- ignore if job does not exist
      null;
    end;
    begin
      perform cron.unschedule('resolve-due-matchups-vault');
    exception when others then
      null;
    end;
  end if;
exception when others then
  null;
end$$;

-- Drop any stray scheduler schema/function if they exist
do $$
begin
  execute 'drop function if exists scheduler.invoke_resolve_due_matchups() cascade';
exception when undefined_function then
  null;
end$$;

do $$
begin
  execute 'drop schema if exists scheduler cascade';
exception when others then
  null;
end$$;

-- =====================================
-- B) (Optional) Helpful indexes
-- =====================================
-- Speeds up "current vs finished" queries
create index if not exists idx_matchups_active_finished_ends
  on public.matchups (active, finished, ends_at);

-- =====================================
-- C) Atomic Resolver (the single source of truth)
-- =====================================

create or replace function public.resolve_match(p_matchup_id uuid, p_source text default 'api')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m           matchups%rowtype;
  winner      uuid;
  final_a     integer;
  final_b     integer;
  next_id     uuid;
  vc_a_name   text;
  vc_b_name   text;
begin
  -- Lock the matchup row to prevent races
  select * into m
  from matchups
  where id = p_matchup_id
  for update;

  if not found then
    return jsonb_build_object('status','error','error','not-found','matchupId', p_matchup_id);
  end if;

  -- Idempotency / guardrails
  if coalesce(m.finished, false) = true then
    return jsonb_build_object('status','noop','reason','already-finished','matchupId', m.id);
  end if;

  if coalesce(m.active, false) = false then
    return jsonb_build_object('status','noop','reason','inactive','matchupId', m.id);
  end if;

  if m.ends_at > now() then
    return jsonb_build_object('status','noop','reason','not-yet-ended','matchupId', m.id, 'ends_at', m.ends_at);
  end if;

  final_a := coalesce(m.final_cp_a, m.current_cp_a);
  final_b := coalesce(m.final_cp_b, m.current_cp_b);

  -- Decide winner (random on tie)
  winner := case
    when final_a > final_b then m.vc_a_id
    when final_b > final_a then m.vc_b_id
    else (select id from vcs where id in (m.vc_a_id, m.vc_b_id) order by random() limit 1)
  end;

  update matchups
  set finished   = true,
      active     = false,
      winner_id  = winner,
      final_cp_a = final_a,
      final_cp_b = final_b,
      updated_at = now()
  where id = m.id;

  next_id := m.next_match_id;

  -- Slot winner into the next match if it exists (no auto-start)
  if next_id is not null then
    -- Prefer filling empty slot; do not override if already filled
    update matchups
    set vc_a_id = case when vc_a_id is null then winner else vc_a_id end,
        vc_b_id = case when vc_a_id is not null and vc_b_id is null and vc_a_id <> winner then winner else vc_b_id end,
        updated_at = now()
    where id = next_id;
  end if;

  select name into vc_a_name from vcs where id = m.vc_a_id;
  select name into vc_b_name from vcs where id = m.vc_b_id;

  return jsonb_build_object(
    'status', 'resolved',
    'source', p_source,
    'matchupId', m.id,
    'final', jsonb_build_object(
      'a', jsonb_build_object('id', m.vc_a_id, 'name', vc_a_name, 'cp', final_a),
      'b', jsonb_build_object('id', m.vc_b_id, 'name', vc_b_name, 'cp', final_b)
    ),
    'winnerId', winner,
    'next_match_id', next_id
  );
end
$$;

-- Limit who can call the resolver (service role only by default).
-- (Supabase service role bypasses RLS; do not grant to anon.)
revoke all on function public.resolve_match(uuid, text) from public;

-- =====================================
-- D) Safety: ensure updated_at auto tracks
-- (if you don't already have a trigger; skip if you do)
-- =====================================
do $$
begin
  perform 1
  from pg_trigger
  where tgname = 'matchups_set_updated_at';

  if not found then
    create or replace function public.set_updated_at()
    returns trigger
    language plpgsql
    as $f$
    begin
      new.updated_at := now();
      return new;
    end
    $f$;

    create trigger matchups_set_updated_at
    before update on public.matchups
    for each row
    execute function public.set_updated_at();
  end if;
end$$;
