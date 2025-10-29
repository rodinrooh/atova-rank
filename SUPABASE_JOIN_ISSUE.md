# Supabase Join Issue: Arrays Instead of Single Objects

## Problem Summary

**Current Behavior:** Supabase PostgREST is returning arrays for joined VC data instead of single objects, causing TypeScript errors when trying to access properties like `color_hex` and `conference`.

**Expected Behavior:** The join should return single VC objects that can be accessed directly (e.g., `matchup.vc_a.color_hex`).

**Error Message:**
```
Property 'conference' does not exist on type '{ id: any; name: any; color_hex: any; conference: any; }[]'.
```

## Database Schema

### Tables Structure

**`matchups` table:**
```sql
create table public.matchups (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id),
  match_number int2 not null check (match_number between 1 and 7),
  round int2 not null check (round in (1,2,3)),
  vc_a_id uuid references public.vcs(id),  -- Foreign key to vcs.id
  vc_b_id uuid references public.vcs(id),  -- Foreign key to vcs.id
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
```

**`vcs` table:**
```sql
create table public.vcs (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id),
  name text not null,
  color_hex text not null default '#999999',
  conference text not null check (conference in ('left','right')),
  eliminated boolean not null default false
);
```

### Foreign Key Relationships

- `matchups.vc_a_id` → `vcs.id` (one-to-one relationship)
- `matchups.vc_b_id` → `vcs.id` (one-to-one relationship)

## Current Code Implementation

### File: `app/api/current-matchup/route.ts`

**Current Supabase Query:**
```typescript
const { data: activeMatchup, error } = await supabase
  .from('matchups')
  .select(`
    id,
    match_number,
    round,
    season_id,
    started_at,
    ends_at,
    current_cp_a,
    current_cp_b,
    vc_a_id,
    vc_b_id,
    vc_a:vcs!matchups_vc_a_id_fkey (
      id,
      name,
      color_hex,
      conference
    ),
    vc_b:vcs!matchups_vc_b_id_fkey (
      id,
      name,
      color_hex,
      conference
    )
  `)
  .eq('active', true)
  .eq('finished', false)
  .single()
```

**Current Data Access (Causing Errors):**
```typescript
vcA: {
  id: activeMatchup.vc_a.id,                    // ❌ Error: vc_a is array
  name: activeMatchup.vc_a.name,                 // ❌ Error: vc_a is array
  colorHex: activeMatchup.vc_a.color_hex,        // ❌ Error: vc_a is array
  conference: activeMatchup.vc_a.conference,     // ❌ Error: vc_a is array
  currentCp: activeMatchup.current_cp_a
},
vcB: {
  id: activeMatchup.vc_b.id,                     // ❌ Error: vc_b is array
  name: activeMatchup.vc_b.name,                 // ❌ Error: vc_b is array
  colorHex: activeMatchup.vc_b.color_hex,        // ❌ Error: vc_b is array
  conference: activeMatchup.vc_b.conference,     // ❌ Error: vc_b is array
  currentCp: activeMatchup.current_cp_b
}
```

## TypeScript Error Details

**Error Type:** `Property 'conference' does not exist on type '{ id: any; name: any; color_hex: any; conference: any; }[]'`

**Root Cause:** TypeScript is inferring `vc_a` and `vc_b` as arrays (`[]`) instead of single objects, indicating that Supabase PostgREST is treating the foreign key relationships as one-to-many instead of one-to-one.

## Attempted Fixes (All Failed)

### Fix 1: Basic Join Syntax
```typescript
vc_a:vcs!vc_a_id (...)
vc_b:vcs!vc_b_id (...)
```
**Result:** Still returned arrays.

### Fix 2: Explicit Foreign Key Names
```typescript
vc_a:vcs!matchups_vc_a_id_fkey (...)
vc_b:vcs!matchups_vc_b_id_fkey (...)
```
**Result:** Still returned arrays.

## Expected Response Format

**Target API Response:**
```json
{
  "ok": true,
  "matchup": {
    "id": "uuid",
    "matchNumber": 1,
    "round": 1,
    "seasonId": "uuid",
    "startedAt": "2025-10-15T00:00:00Z",
    "endsAt": "2025-10-18T00:00:00Z",
    "vcA": {
      "id": "uuid",
      "name": "Sequoia",
      "colorHex": "#E3B341",
      "conference": "left",
      "currentCp": 1320
    },
    "vcB": {
      "id": "uuid",
      "name": "YC",
      "colorHex": "#7777FF",
      "conference": "left",
      "currentCp": 980
    }
  }
}
```

## Environment Details

- **Framework:** Next.js 15 (App Router)
- **Database:** Supabase (PostgreSQL)
- **Client:** Supabase JavaScript client v2
- **Authentication:** Anonymous client for public API
- **RLS:** Enabled on all tables with anon select policies

## Key Questions for Debugging

1. **Why is PostgREST treating one-to-one foreign keys as one-to-many relationships?**
2. **What is the correct Supabase join syntax for one-to-one relationships?**
3. **Are there missing foreign key constraints or indexes that would help PostgREST understand the relationship?**
4. **Should we use a different approach (e.g., separate queries, RPC functions, or different join syntax)?**

## Additional Context

- The `matchups` table has exactly one `vc_a_id` and one `vc_b_id` per row
- Each `vc_a_id` and `vc_b_id` references exactly one `vcs.id`
- This is a classic one-to-one relationship that should return single objects, not arrays
- The issue persists regardless of the join syntax used
- RLS policies are properly configured for anonymous read access
- The database schema is exactly as defined in the PRD

## Files Involved

- **Main file:** `app/api/current-matchup/route.ts`
- **Schema:** `supabase/migrations/0001_init.sql`
- **Supabase client:** `src/lib/supabase.ts`

## Next Steps Needed

1. Identify the correct Supabase PostgREST syntax for one-to-one joins
2. Verify foreign key constraint names and relationships
3. Test alternative approaches (separate queries, RPC functions, etc.)
4. Ensure the solution works with RLS policies enabled
