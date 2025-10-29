# VC Border Color Issue

## Problem Description

**Current Behavior:** The border around each VC box appears to be the same color as the VC's background color, making the border invisible or barely distinguishable.

**Expected Behavior:** The border should be 25% darker than the VC's background color to create a visible contrast and definition around each box.

## Current Implementation

### Code Location
File: `atova-rank/app/test/page.tsx`

### Current Border Implementation
```tsx
// Left box (VC A)
<div style={{ 
  width: '398px', 
  height: '272px', 
  backgroundColor: matchup?.vcA?.colorHex || matchup?.vc_a?.colorHex || 'red', 
  borderRadius: '10px',
  border: `3px solid ${matchup?.vcA?.colorHex || matchup?.vc_a?.colorHex || 'red'}80`,
  // ... other styles
}}>
  {matchup?.vcA?.name || matchup?.vc_a?.name || 'VC A'}
</div>

// Right box (VC B)
<div style={{ 
  width: '398px', 
  height: '272px', 
  backgroundColor: matchup?.vcB?.colorHex || matchup?.vc_b?.colorHex || 'red', 
  borderRadius: '10px',
  border: `3px solid ${matchup?.vcB?.colorHex || matchup?.vc_b?.colorHex || 'red'}80`,
  // ... other styles
}}>
  {matchup?.vcB?.name || matchup?.vc_b?.name || 'VC B'}
</div>
```

## Technical Details

### What We've Tried
1. **Original**: `border: '3px solid red'` - Worked but was always red
2. **First attempt**: `border: \`3px solid ${color}CC\`` - Added CC for 80% opacity (lighter)
3. **Second attempt**: `border: \`3px solid ${color}80\`` - Added 80 for 50% opacity (darker)

### The Issue
The problem is that we're appending hex opacity values (`CC` or `80`) to hex color codes, but this approach has limitations:

1. **Hex Color Format**: VC colors are likely in format `#RRGGBB` (e.g., `#FF5733`)
2. **Opacity Append**: Adding `80` creates `#FF573380` which should work for 50% opacity
3. **Browser Support**: Some browsers may not properly interpret 8-digit hex colors with alpha

### Data Structure
The matchup object structure (based on code):
```typescript
matchup: {
  vcA?: {
    colorHex?: string;  // e.g., "#FF5733"
    name?: string;
  };
  vcB?: {
    colorHex?: string;  // e.g., "#FF5733" 
    name?: string;
  };
  // Alternative snake_case fields:
  vc_a?: { colorHex?: string; name?: string; };
  vc_b?: { colorHex?: string; name?: string; };
}
```

## Possible Solutions

### Solution 1: Use RGBA with Color Conversion
Convert hex to RGB and apply opacity:
```tsx
const hexToRgba = (hex: string, opacity: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

// Usage:
border: `3px solid ${hexToRgba(matchup?.vcA?.colorHex || '#FF0000', 0.75)}`
```

### Solution 2: Use CSS Color-Mix
```tsx
border: `3px solid color-mix(in srgb, ${color} 75%, black)`
```

### Solution 3: Use CSS Custom Properties with Opacity
```tsx
style={{
  '--vc-color': matchup?.vcA?.colorHex || 'red',
  border: '3px solid rgba(from var(--vc-color) r g b / 0.75)'
}}
```

### Solution 4: Pre-calculate Darker Colors
Create a function to darken hex colors:
```tsx
const darkenColor = (hex: string, percent: number) => {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) - amt;
  const G = (num >> 8 & 0x00FF) - amt;
  const B = (num & 0x0000FF) - amt;
  return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
    (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
    (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
};
```

## Context Information

### Framework
- **Next.js 15** with App Router
- **React** with hooks (`useState`, `useEffect`)
- **TypeScript** (using `any` type for matchup state)

### Styling Approach
- **Inline styles** only (no CSS classes)
- **No external CSS libraries** for color manipulation
- **Client-side rendering** (`"use client"`)

### API Integration
- Fetches matchup data from `/api/current-matchup`
- Handles both camelCase (`vcA`, `vcB`) and snake_case (`vc_a`, `vc_b`) field names
- Real-time timer updates every second

## Expected Outcome

The border should be visually distinct from the background color, creating a clear outline around each VC box that enhances the visual hierarchy and makes the boxes more defined against the white page background.

## Debugging Steps

1. **Check browser DevTools** to see if the border is actually being applied
2. **Inspect computed styles** to verify the final border color value
3. **Test with hardcoded colors** to isolate if it's a color calculation issue
4. **Verify VC color format** by logging the actual colorHex values from the API
