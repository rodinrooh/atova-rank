# Start Season Trigger Error - Atova Rank

**Date:** October 25, 2025  
**Status:** ❌ BLOCKING - Cannot start tournament

---

## Problem Description

### Current Behavior
- Tournament creation (seeding quarterfinals) works ✅
- Starting the season fails with error ❌
- Error: `record "new" has no field "updated_at"`
- Error code: `42703` (PostgreSQL undefined column)

### Expected Behavior
- Admin clicks "Start Season" button
- First match (Match #1) becomes active
- `started_at` and `ends_at` timestamps are set
- Match runs for 72 hours

### Error Details
```
Start season RPC error: {
  code: '42703',
  details: null,
  hint: null,
  message: 'record "new" has no field "updated_at"'
}
POST /api/admin/start-season 500 in 828ms
```

---

## What Happens When User Clicks "Start Season"

### Frontend Call
**File:** `app/admin/page.tsx`
```typescript
const startSeason = async () => {
  const response = await fetch('/api/admin/start-season', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seasonId })
  })
  // ... error handling
}
```

### API Route
**File:** `app/api/admin/start-season/route.ts`
```typescript
export async function POST(req: NextRequest) {
  const { seasonId } = await req.json()
  
  // Call database RPC function
  const { data, error } = await supabaseAdmin.rpc('start_season', {
    p_season_id: seasonId
  })
  
  if (error) {
    console.error('Start season RPC error:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ ok: true, matchId: data })
}
```

### Database Function
**File:** `supabase/migrations/0002_seed_quarterfinals_function.sql`

```sql
create or replace function start_season(p_season_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_first_matchup_id uuid;
begin
  -- Find the first matchup in the bracket (match_number = 1, round = 1)
  select id into v_first_matchup_id
  from matchups
  where season_id = p_season_id
    and match_number = 1
    and round = 1
  limit 1;

  if v_first_matchup_id is null then
    raise exception 'No matchups found for season';
  end if;

  -- Activate the first matchup for 72 hours
  update matchups
  set 
    active = true,
    started_at = now(),
    ends_at = now() + interval '72 hours'
  where id = v_first_matchup_id;

  return v_first_matchup_id;
end;
$$;
```

**The Problem:** When this UPDATE runs, it triggers the `matchups_set_updated_at` trigger, which tries to set `NEW.updated_at`, but the trigger function is broken.

---

## Database Schema

### matchups table
```sql
CREATE TABLE matchups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  match_number INTEGER NOT NULL,
  round INTEGER NOT NULL,
  vc_a_id UUID REFERENCES vcs(id) ON DELETE SET NULL,
  vc_b_id UUID REFERENCES vcs(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  current_cp_a INTEGER DEFAULT 1000,
  current_cp_b INTEGER DEFAULT 1000,
  final_cp_a INTEGER,
  final_cp_b INTEGER,
  winner_id UUID REFERENCES vcs(id) ON DELETE SET NULL,
  active BOOLEAN DEFAULT false,
  finished BOOLEAN DEFAULT false,
  next_match_id UUID REFERENCES matchups(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()  -- ✅ COLUMN EXISTS
);
```

**The `updated_at` column DOES exist in the table.**

---

## Trigger History & Attempts to Fix

### Original Trigger (Migration 0014)
**File:** `supabase/migrations/0014_manual_progression.sql`

```sql
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
```

**Issue:** This uses lowercase `new.updated_at` and `new` (should be `NEW` in PL/pgSQL).

---

### Attempted Fix #1 (Manual SQL in Supabase)
```sql
DROP TRIGGER IF EXISTS matchups_set_updated_at ON matchups;
DROP FUNCTION IF EXISTS set_updated_at();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER matchups_set_updated_at
BEFORE UPDATE ON matchups
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
```

**Result:** Still fails with same error.

---

### Attempted Fix #2 (Migration 0015)
**File:** `supabase/migrations/0015_fix_trigger.sql`

```sql
-- Fix the updated_at trigger issue

-- Drop ALL existing triggers and functions that might conflict
DROP TRIGGER IF EXISTS matchups_set_updated_at ON public.matchups;
DROP TRIGGER IF EXISTS set_updated_at_trigger ON public.matchups;
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS set_updated_at() CASCADE;

-- Recreate the trigger function with correct syntax
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER matchups_set_updated_at
  BEFORE UPDATE ON public.matchups
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
```

**Result:** Migration applied successfully, but error STILL occurs.

---

## Current Database State

### Check if column exists:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'matchups' AND column_name = 'updated_at';
```
**Expected:** Returns 1 row (column exists)

### Check triggers:
```sql
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'matchups';
```
**Expected:** Should show `matchups_set_updated_at` trigger

### Check function:
```sql
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_name = 'set_updated_at';
```
**Expected:** Should show the trigger function

---

## Hypothesis

### Possible Causes:

1. **Multiple conflicting triggers** - There may be duplicate triggers from previous migrations that are interfering.

2. **Schema/search_path issue** - The trigger might be looking in the wrong schema for the column.

3. **OLD vs NEW confusion** - The trigger might be using `OLD.updated_at` instead of `NEW.updated_at` somewhere.

4. **Cached function definition** - Supabase might be using a cached/old version of the trigger function.

5. **RLS policy interference** - Row-level security policies might be blocking the UPDATE.

6. **Function search_path** - The `start_season` function might have a different search_path that doesn't include the schema where `updated_at` exists.

---

## Diagnostic Queries

### Find ALL triggers on matchups table:
```sql
SELECT 
  t.trigger_name,
  t.event_manipulation,
  t.action_timing,
  t.action_statement,
  p.prosrc as function_body
FROM information_schema.triggers t
LEFT JOIN pg_proc p ON p.proname = regexp_replace(t.action_statement, '.*EXECUTE FUNCTION ([^(]+).*', '\1')
WHERE t.event_object_table = 'matchups';
```

### Find ALL functions named set_updated_at:
```sql
SELECT 
  n.nspname as schema,
  p.proname as function_name,
  pg_get_functiondef(p.oid) as full_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname LIKE '%updated_at%';
```

### Check if trigger actually fires:
```sql
-- Manually test the update that start_season does
UPDATE matchups
SET active = true, started_at = now(), ends_at = now() + interval '1 minute'
WHERE match_number = 1
RETURNING id, updated_at;
```
**Expected:** Should return the row with `updated_at` set to NOW.  
**Actual:** Probably throws same error.

---

## Alternative Solutions

### Option 1: Remove the trigger entirely
```sql
-- Drop all triggers
DROP TRIGGER IF EXISTS matchups_set_updated_at ON public.matchups;
DROP TRIGGER IF EXISTS set_updated_at_trigger ON public.matchups;
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS set_updated_at() CASCADE;

-- Test start_season again
-- (updated_at won't auto-update, but that's OK - we can set it manually in queries)
```

### Option 2: Set updated_at explicitly in start_season function
```sql
create or replace function start_season(p_season_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_first_matchup_id uuid;
begin
  select id into v_first_matchup_id
  from matchups
  where season_id = p_season_id
    and match_number = 1
    and round = 1
  limit 1;

  if v_first_matchup_id is null then
    raise exception 'No matchups found for season';
  end if;

  -- Explicitly set updated_at in the UPDATE
  update matchups
  set 
    active = true,
    started_at = now(),
    ends_at = now() + interval '72 hours',
    updated_at = now()  -- ✅ EXPLICIT
  where id = v_first_matchup_id;

  return v_first_matchup_id;
end;
$$;
```

### Option 3: Use a different trigger syntax
```sql
-- Use OLD and NEW with proper quoting
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Option 4: Check for column in trigger
```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Safely check if column exists before setting
  IF TG_TABLE_NAME = 'matchups' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## What to Check Next

1. **Run diagnostic queries** to see all triggers and functions
2. **Test manual UPDATE** on matchups table to isolate trigger issue
3. **Check Supabase logs** for more detailed error info
4. **Try Option 1** (remove trigger) as quick fix
5. **Try Option 2** (explicit updated_at) if Option 1 works

---

## Expected Resolution

Once the trigger is fixed or removed:

1. Admin clicks "Start Season"
2. `POST /api/admin/start-season` succeeds
3. Match #1 becomes active:
   - `active = true`
   - `started_at = NOW()`
   - `ends_at = NOW() + 72 hours`
   - `updated_at = NOW()`
4. UI shows live match with countdown timer
5. User can proceed with testing

---

## Environment

- **Supabase Project:** `https://vmyrfpuzxtzglpayktmj.supabase.co`
- **Supabase CLI:** v2.51.0
- **PostgreSQL Version:** (check in Supabase dashboard)
- **Migrations Applied:**
  - 0001_init.sql ✅
  - 0002_seed_quarterfinals_function.sql ✅
  - 0003_hall_of_fame.sql ✅
  - 0014_manual_progression.sql ✅
  - 0015_fix_trigger.sql ✅

---

## Request for ChatGPT

Please provide:

1. **Root cause analysis** - Why is the trigger saying `updated_at` doesn't exist when it clearly does?

2. **SQL commands to diagnose** - Exact queries to run to see what's wrong

3. **Fix strategy** - Step-by-step SQL to resolve this permanently

4. **Verification steps** - How to confirm the fix works

5. **Prevention** - How to avoid this in future migrations

Provide production-ready SQL that can be run immediately in Supabase SQL Editor.
