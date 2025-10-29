# Clock Display Size Issue

## Problem Statement

The clock timer on the public page is displaying too small and appears to be hugging the top of the page, with insufficient padding/space above it.

### Current Behavior
- Clock displays "27:45:28" in the expected `HH:MM:SS` format
- Clock is too small visually
- Clock is positioned too close to the top edge
- The white content area appears small and hugs the top of the screen, leaving large black space below

### Expected Behavior
- Clock should be large and prominent
- Clock should have adequate spacing from the top edge
- Content should be properly centered with appropriate padding

## Technical Context

### Framework
- **Framework**: Next.js 15 (App Router) with TypeScript
- **Styling**: Tailwind CSS with some custom CSS classes

### Current Implementation

**File**: `atova-rank/app/(public)/page.tsx`

```typescript
export default function PublicPage() {
  const [matchup, setMatchup] = useState<Matchup | null>(null)
  const [loading, setLoading] = useState(true)
  const [voting, setVoting] = useState<string | null>(null)
  const [hasVoted, setHasVoted] = useState(false)
  const [tournamentData, setTournamentData] = useState<Bracket>(DEFAULT_BRACKET)

  // Timer state and effect
  const [timeRemaining, setTimeRemaining] = useState<string>('00:00:00');
  const pad = (n: number) => n.toString().padStart(2, '0');

  useEffect(() => {
    const expiryISO = matchup?.endsAt ?? null;
    if (!expiryISO) {
      setTimeRemaining('00:00:00');
      return;
    }

    const target = new Date(expiryISO);
    if (Number.isNaN(target.getTime())) {
      setTimeRemaining('00:00:00');
      return;
    }

    const tick = () => {
      const now = Date.now();
      const diff = target.getTime() - now;
      const clamped = Math.max(0, diff);

      const h = Math.floor(clamped / (1000 * 60 * 60));
      const m = Math.floor((clamped / (1000 * 60)) % 60);
      const s = Math.floor((clamped / 1000) % 60);

      setTimeRemaining(`${pad(h)}:${pad(m)}:${pad(s)}`);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [matchup?.endsAt]);

  // ... data loading logic ...

  // Render
  return (
    <div className="min-h-screen bg-[#f6f6f6]">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center">
          <div className="text-5xl font-black">{timeRemaining}</div>
        </div>
      </div>
    </div>
  )
}
```

### Global CSS

**File**: `atova-rank/app/globals.css`

```css
/* Timer display - MASSIVE and BOLD */
.timer-display {
  font-size: 5rem !important;
  font-weight: 900 !important;
  line-height: 1 !important;
  color: #000000 !important;
}
```

## Issue Analysis

### Problems Identified

1. **CSS Class Not Applied**: The current markup uses `text-5xl font-black` instead of the `timer-display` class that has the `!important` overrides
2. **Size Inconsistency**: The `.timer-display` class defines `font-size: 5rem !important` but the component uses `text-5xl` which may not be applying correctly
3. **Spacing**: The `py-12` may not be providing enough vertical spacing from the top

### Root Cause

The page is using Tailwind classes (`text-5xl font-black`) but there's a custom CSS class (`.timer-display`) defined in `globals.css` with `!important` rules. The markup is not using that class, so the `!important` rules aren't being applied.

Additionally, `text-5xl` in Tailwind is `3rem` (48px), but the custom `.timer-display` class uses `5rem` (80px) with `!important`, which would override if the class were used.

## Attempted Solutions

- Changed from `text-8xl` to `text-5xl` to make smaller
- Added container with `max-w-4xl mx-auto px-4 py-12` for spacing
- Added `min-h-screen bg-[#f6f6f6]` to ensure page background

None of these fully resolved the issue - the clock remains too small and hugged to the top.

## Proposed Solution

The issue is that the custom `.timer-display` class exists with `!important` rules, but the markup is not using it. The solution is to:

1. **Either**: Use the `timer-display` class from CSS
2. **Or**: Remove the custom CSS class and use Tailwind's size utilities with proper sizing

**Option A - Use the CSS class:**
```html
<div className="timer-display">{timeRemaining}</div>
```

**Option B - Increase Tailwind size and spacing:**
```html
<div className="text-8xl font-black pt-24">{timeRemaining}</div>
```

Also need to increase the overall container padding/spacing to push content down from the top.

## Additional Context

### Related Files
- `atova-rank/app/globals.css` - Contains timer-display CSS class
- `atova-rank/app/(public)/page.tsx` - Main page component
- Timer logic is working correctly - displaying proper countdown

### Previous Related Issues
- Previously had issues with clock showing "00:00:00" - this was fixed
- Now the issue is purely visual - size and positioning

## Success Criteria

The clock should:
1. Be visually large and prominent
2. Have adequate spacing from the top edge (not hugging the top)
3. Be centered horizontally
4. Display the countdown correctly in HH:MM:SS format

