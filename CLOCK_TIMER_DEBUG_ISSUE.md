# Clock Timer Debug Issue - Atova Rank

**Date:** December 2024  
**Priority:** Critical - Clock shows "00:00:00" instead of actual time remaining  
**Status:** UNRESOLVED

---

## Issue Summary

The homepage clock timer is displaying "00:00:00" when it should show approximately "46:00:00" (46+ hours remaining). The admin page clock works perfectly and shows the correct time, but the homepage clock is broken.

---

## Current Behavior vs Expected Behavior

### ❌ Current Behavior (BROKEN)
- **Homepage clock**: Shows "00:00:00" (static, never updates)
- **Admin page clock**: Shows "46h 19m" (works perfectly)
- **Build**: Compiles successfully, no errors
- **Data**: Matchup data is loading correctly (vote counts show 1000, 1001)

### ✅ Expected Behavior (WORKING)
- **Homepage clock**: Should show "46:19:00" format (hours:minutes:seconds)
- **Admin page clock**: Already shows "46h 19m" (this is correct)
- **Updates**: Should countdown every second
- **Format**: Should match admin page logic but in HH:MM:SS format

---

## Technical Context

### Tech Stack
- **Framework**: Next.js 15 (App Router) + TypeScript
- **Database**: Supabase (Postgres)
- **Authentication**: Clerk
- **Styling**: Tailwind CSS

### File Structure
```
atova-rank/
├── app/
│   ├── (public)/
│   │   └── page.tsx                    # Homepage (BROKEN clock)
│   └── admin/
│       └── page.tsx                    # Admin page (WORKING clock)
├── src/
│   └── hooks/
│       └── useMatchExpiryWatcher.ts    # Custom hook (UNUSED now)
└── components/
    └── TournamentBracket.tsx          # Bracket component
```

---

## Code Analysis

### 1. Admin Page Clock (WORKS PERFECTLY)

**File:** `app/admin/page.tsx` (lines 433-480)

```tsx
{currentMatchup ? (
  (() => {
    const timeRemaining = new Date(currentMatchup.endsAt).getTime() - new Date().getTime()
    
    return (
      <div className="text-center mt-1 text-lg font-bold text-blue-600">
        Time Remaining: {Math.max(0, Math.floor(timeRemaining / (1000 * 60 * 60)))}h {Math.max(0, Math.floor(timeRemaining / (1000 * 60)) % 60)}m
      </div>
    )
  })()
) : null}
```

**Key Points:**
- Uses `currentMatchup.endsAt` directly
- Simple calculation: `new Date(endsAt).getTime() - new Date().getTime()`
- Shows format: "46h 19m"
- **WORKS PERFECTLY**

### 2. Homepage Clock (BROKEN)

**File:** `app/(public)/page.tsx` (lines 216-238)

```tsx
// Use the field your data actually has (ends_at, expiryTime, etc.)
const expiry = matchup?.endsAt ?? null

// Simple time calculation like admin page
const timeRemainingMs = expiry ? new Date(expiry).getTime() - new Date().getTime() : 0
const hours = Math.max(0, Math.floor(timeRemainingMs / (1000 * 60 * 60)))
const minutes = Math.max(0, Math.floor(timeRemainingMs / (1000 * 60)) % 60)
const seconds = Math.max(0, Math.floor(timeRemainingMs / 1000) % 60)
const pad = (n: number) => n.toString().padStart(2, "0")
const formatted = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`

useEffect(() => {
  // Update time every second
  const interval = setInterval(() => {
    if (expiry) {
      const remaining = new Date(expiry).getTime() - new Date().getTime()
      const h = Math.max(0, Math.floor(remaining / (1000 * 60 * 60)))
      const m = Math.max(0, Math.floor(remaining / (1000 * 60)) % 60)
      const s = Math.max(0, Math.floor(remaining / 1000) % 60)
      setTimeRemaining(`${pad(h)}:${pad(m)}:${pad(s)}`)
    }
  }, 1000)
  return () => clearInterval(interval)
}, [expiry])
```

**Key Points:**
- Uses `matchup?.endsAt` (same data source as admin)
- Same calculation logic as admin page
- Has `useEffect` with `setInterval` for live updates
- **SHOWS "00:00:00" - BROKEN**

### 3. Data Loading

**File:** `app/(public)/page.tsx` (lines 249-264)

```tsx
const loadCurrentMatchup = async () => {
  try {
    const response = await fetch('/api/current-matchup')
    if (response.ok) {
      const json = await response.json()
      if (json?.matchup) {
        setMatchup(normalizeMatchup(json.matchup as MatchupWire))
      }
      setHasVoted(json.hasVoted || false)
    }
  } catch (error) {
    console.error('Failed to load current matchup:', error)
  } finally {
    setLoading(false)
  }
}
```

**Key Points:**
- Fetches from `/api/current-matchup`
- Uses `normalizeMatchup()` to handle API response
- Sets `matchup` state with normalized data
- **DATA IS LOADING** (vote counts show 1000, 1001)

### 4. Data Normalization

**File:** `app/(public)/page.tsx` (lines 45-59)

```tsx
function normalizeMatchup(w: MatchupWire): Matchup {
  const rawA = w.vcA ?? w.vc_a ?? null;
  const rawB = w.vcB ?? w.vc_b ?? null;
  return {
    id: w.id,
    vcA: normalizeVC(rawA),
    vcB: normalizeVC(rawB),
    endsAt: w.expiryTime ?? w.ends_at ?? null,
    status: w.status ?? 'upcoming',
  };
}
```

**Key Points:**
- Handles both `expiryTime` and `ends_at` fields
- Sets `endsAt` field in normalized `Matchup` object
- **Should preserve the expiry time correctly**

---

## Debugging Attempts Made

### 1. ✅ Fixed Naming Conflicts
- **Issue**: `timeRemaining` variable name conflicted with state
- **Fix**: Renamed to `timeRemainingMs`
- **Result**: Build errors resolved, but clock still shows "00:00:00"

### 2. ✅ Copied Admin Page Logic Exactly
- **Issue**: Complex `useMatchExpiryWatcher` hook was broken
- **Fix**: Replaced with exact same calculation as admin page
- **Result**: Same calculation, but still shows "00:00:00"

### 3. ✅ Removed Complex Hook
- **Issue**: Custom hook was causing issues
- **Fix**: Removed `useMatchExpiryWatcher` import and usage
- **Result**: Cleaner code, but clock still broken

### 4. ✅ Added Live Updates
- **Issue**: Clock wasn't updating every second
- **Fix**: Added `useEffect` with `setInterval`
- **Result**: Clock updates every second, but still shows "00:00:00"

---

## Data Flow Analysis

### Expected Data Flow:
1. **API Call**: `fetch('/api/current-matchup')` → returns matchup data
2. **Normalization**: `normalizeMatchup()` → extracts `endsAt` field
3. **State Update**: `setMatchup()` → stores normalized data
4. **Time Calculation**: `new Date(expiry).getTime() - new Date().getTime()` → calculates remaining time
5. **Display**: Shows formatted time in `XX:XX:XX` format

### Actual Data Flow:
1. **API Call**: ✅ Working (vote counts show 1000, 1001)
2. **Normalization**: ✅ Working (data is being processed)
3. **State Update**: ✅ Working (matchup state is set)
4. **Time Calculation**: ❌ **BROKEN** (always returns 0)
5. **Display**: ❌ Shows "00:00:00"

---

## Key Questions for Debugging

### 1. Data Source Issues
- **Q**: Is `matchup.endsAt` actually populated with a valid date?
- **Q**: Is the date format correct (ISO string vs timestamp)?
- **Q**: Is the timezone causing issues?

### 2. Calculation Issues
- **Q**: Is `new Date(expiry)` creating a valid Date object?
- **Q**: Is `new Date().getTime()` working correctly?
- **Q**: Is the subtraction returning the expected milliseconds?

### 3. State Issues
- **Q**: Is the `useEffect` dependency `[expiry]` triggering correctly?
- **Q**: Is `setTimeRemaining()` actually updating the state?
- **Q**: Is the component re-rendering with new time values?

### 4. Timing Issues
- **Q**: Is the `setInterval` running every second?
- **Q**: Is the calculation happening at the right time?
- **Q**: Are there race conditions between data loading and time calculation?

---

## Console Debugging Needed

### Add These Console Logs:

```tsx
// In the time calculation section
console.log('=== CLOCK DEBUG ===')
console.log('expiry:', expiry)
console.log('expiry type:', typeof expiry)
console.log('expiry valid:', expiry ? new Date(expiry).toString() : 'null')
console.log('current time:', new Date().toString())
console.log('timeRemainingMs:', timeRemainingMs)
console.log('hours:', hours, 'minutes:', minutes, 'seconds:', seconds)
console.log('formatted:', formatted)
console.log('timeRemaining state:', timeRemaining)
```

### Expected Console Output:
```
=== CLOCK DEBUG ===
expiry: "2024-12-28T04:24:18.000Z"
expiry type: string
expiry valid: "Sat Dec 28 2024 04:24:18 GMT+0000 (UTC)"
current time: "Thu Dec 26 2024 12:00:00 GMT+0000 (UTC)"
timeRemainingMs: 165618000  // ~46 hours in ms
hours: 46, minutes: 0, seconds: 0
formatted: "46:00:00"
timeRemaining state: "46:00:00"
```

### Actual Console Output (Suspected):
```
=== CLOCK DEBUG ===
expiry: null
expiry type: object
expiry valid: null
current time: "Thu Dec 26 2024 12:00:00 GMT+0000 (UTC)"
timeRemainingMs: 0
hours: 0, minutes: 0, seconds: 0
formatted: "00:00:00"
timeRemaining state: "00:00:00"
```

---

## API Response Analysis

### Expected API Response:
```json
{
  "matchup": {
    "id": "match-123",
    "vcA": { "name": "sequoia", "currentCp": 1000 },
    "vcB": { "name": "index vc", "currentCp": 1001 },
    "ends_at": "2024-12-28T04:24:18.000Z",
    "status": "active"
  },
  "hasVoted": false
}
```

### Possible Issues:
1. **Field Name**: API returns `ends_at` but code expects `endsAt`
2. **Date Format**: API returns string but code expects Date object
3. **Null Values**: API returns `null` for `ends_at`
4. **Timezone**: Date is in UTC but local timezone is different

---

## Quick Fixes to Try

### 1. Add Console Logging
```tsx
console.log('matchup:', matchup)
console.log('matchup.endsAt:', matchup?.endsAt)
console.log('expiry:', expiry)
```

### 2. Check API Response
```tsx
const loadCurrentMatchup = async () => {
  try {
    const response = await fetch('/api/current-matchup')
    if (response.ok) {
      const json = await response.json()
      console.log('API Response:', json) // ADD THIS
      if (json?.matchup) {
        setMatchup(normalizeMatchup(json.matchup as MatchupWire))
      }
      setHasVoted(json.hasVoted || false)
    }
  } catch (error) {
    console.error('Failed to load current matchup:', error)
  } finally {
    setLoading(false)
  }
}
```

### 3. Force Test Values
```tsx
// Temporarily hardcode a test date
const testExpiry = "2024-12-28T04:24:18.000Z"
const timeRemainingMs = new Date(testExpiry).getTime() - new Date().getTime()
console.log('Test calculation:', timeRemainingMs)
```

---

## Success Criteria

### ✅ Clock Working Correctly When:
1. **Shows actual time**: "46:19:00" instead of "00:00:00"
2. **Updates live**: Counts down every second
3. **Matches admin**: Same calculation logic as working admin page
4. **Handles edge cases**: Shows "00:00:00" when match is over
5. **No console errors**: Clean execution without warnings

### 🔍 Root Cause Likely:
- **Data issue**: `matchup.endsAt` is `null` or invalid
- **API issue**: `/api/current-matchup` not returning `ends_at` field
- **Normalization issue**: `normalizeMatchup()` not preserving expiry time
- **Timing issue**: Calculation happening before data is loaded

---

## Next Steps for ChatGPT

1. **Add console logging** to identify where the data flow breaks
2. **Check API response** to see if `ends_at` field is present
3. **Verify normalization** to ensure `endsAt` is preserved
4. **Test calculation** with hardcoded values to isolate the issue
5. **Compare with admin page** to see what's different in the data flow

The admin page works perfectly with the same data source, so the issue is likely in the homepage's data processing or state management, not in the core calculation logic.
