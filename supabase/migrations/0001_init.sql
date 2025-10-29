-- Extensions needed for UUID generation
create extension if not exists pgcrypto;

-- 3.1 Tables

-- seasons
create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default false,
  start_date timestamptz not null default now()
);

-- Indexes for seasons
create index if not exists idx_seasons_active on public.seasons (active) where active = true;

-- vcs
create table if not exists public.vcs (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id),
  name text not null,
  color_hex text not null default '#999999',
  conference text not null check (conference in ('left','right')),
  eliminated boolean not null default false
);

-- Indexes for vcs
create index if not exists idx_vcs_season_conf on public.vcs (season_id, conference);

-- matchups
create table if not exists public.matchups (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id),
  match_number int2 not null check (match_number between 1 and 7),
  round int2 not null check (round in (1,2,3)),
  vc_a_id uuid references public.vcs(id),
  vc_b_id uuid references public.vcs(id),
  current_cp_a bigint not null default 1000,
  current_cp_b bigint not null default 1000,
  final_cp_a bigint,
  final_cp_b bigint,
  winner_id uuid references public.vcs(id),
  started_at timestamptz,
  ends_at timestamptz,
  active boolean not null default false,
  finished boolean not null default false,
  next_match_id uuid references public.matchups(id),
  tie_break_random boolean not null default false,
  constraint uniq_match_per_number unique (season_id, match_number)
);

-- Indexes for matchups
create index if not exists idx_match_active on public.matchups (active);
create index if not exists idx_match_due on public.matchups (finished, ends_at);

-- votes
create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id),
  matchup_id uuid not null references public.matchups(id),
  vc_id uuid not null references public.vcs(id),
  ip_hash text not null,
  created_at timestamptz not null default now(),
  constraint uniq_vote_per_ip_match unique (matchup_id, ip_hash)
);

-- Indexes for votes
create index if not exists idx_votes_match_time on public.votes (matchup_id, created_at);

-- events
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id),
  matchup_id uuid not null references public.matchups(id),
  vc_id uuid not null references public.vcs(id),
  delta bigint not null,
  reason text not null,
  created_at timestamptz not null default now()
);

-- Indexes for events
create index if not exists idx_events_match_time on public.events (matchup_id, created_at);

-- 3.2 RLS Policies
alter table public.seasons enable row level security;
alter table public.vcs enable row level security;
alter table public.matchups enable row level security;
alter table public.votes enable row level security;
alter table public.events enable row level security;

-- RLS Policies (using DO blocks to handle existence)
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'seasons_select_anon' and tablename = 'seasons') then
    create policy seasons_select_anon on public.seasons for select to anon using (true);
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'vcs_select_anon' and tablename = 'vcs') then
    create policy vcs_select_anon on public.vcs for select to anon using (true);
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'matchups_select_anon' and tablename = 'matchups') then
    create policy matchups_select_anon on public.matchups for select to anon using (true);
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'votes_select_anon' and tablename = 'votes') then
    create policy votes_select_anon on public.votes for select to anon using (true);
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'events_select_anon' and tablename = 'events') then
    create policy events_select_anon on public.events for select to anon using (true);
  end if;
end$$;

-- Service role write policies
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'seasons_write_service_role' and tablename = 'seasons') then
    create policy seasons_write_service_role on public.seasons for all to service_role using (true) with check (true);
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'vcs_write_service_role' and tablename = 'vcs') then
    create policy vcs_write_service_role on public.vcs for all to service_role using (true) with check (true);
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'matchups_write_service_role' and tablename = 'matchups') then
    create policy matchups_write_service_role on public.matchups for all to service_role using (true) with check (true);
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'votes_write_service_role' and tablename = 'votes') then
    create policy votes_write_service_role on public.votes for all to service_role using (true) with check (true);
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'events_write_service_role' and tablename = 'events') then
    create policy events_write_service_role on public.events for all to service_role using (true) with check (true);
  end if;
end$$;

-- Ensure no other roles have write access implicitly
revoke all on public.seasons from public;
revoke all on public.vcs from public;
revoke all on public.matchups from public;
revoke all on public.votes from public;
revoke all on public.events from public;


