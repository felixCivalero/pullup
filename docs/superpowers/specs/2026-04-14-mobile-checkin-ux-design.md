# Mobile Check-In UX Optimization

**Date:** 2026-04-14
**Status:** Approved
**Event context:** "Hallon spritz lanseringsfest" on Sunday — 270+ guests, new staff doing check-in on phones

## Problem

The current check-in UI was built as a general-purpose guest management page. It works, but it's not optimized for the high-speed, phone-in-hand, door-of-the-venue use case. New users who've never seen the app need to pick up a phone and instantly check people in with zero learning curve.

Current friction points:
- Guest cards show too much info (email, status badges, RSVP date, edit buttons, dinner columns)
- Check-in modal has competing CTAs: "Check in all", two separate counters, Cancel, Save
- After check-in, user has to manually clear search and refocus — breaks the flow
- "Cocktails" terminology is confusing — should be "list" or "guests"

## Solution

Strip the mobile check-in experience down to its core loop: **type name → tap card → tap "Check in X" → typing next name**. Continuous flow, no dead states.

## Scope

Mobile view only (under 768px breakpoint). Desktop table view stays unchanged. No backend changes — same API, same data model. This is pure frontend UX.

## Design

### 1. Guest Card (Mobile)

Each card shows only what matters at the door:

- **Name** — large, bold, readable in dim lighting
- **Party size** — e.g. "3 guests"
- **Arrival status** — either subtle "not arrived" or highlighted "2/3 arrived"
- Entire card is one tap target — no competing buttons

**Removed from the mobile card:**
- Email address
- Status badges (CONFIRMED/WAITLIST/CANCELLED)
- RSVP date
- Edit buttons
- Dinner columns
- Any other metadata

Waitlisted and cancelled guests should not appear in the check-in list at all — only CONFIRMED guests. The edit functionality stays accessible from the desktop view or a separate admin flow, not the door check-in.

**Visual states:**
- **Not arrived:** Default card style, subtle
- **Partially arrived:** Highlighted with arrival count (e.g. "2/3 arrived"), amber/warm tone
- **Fully arrived:** Green tint, shows "arrived" or checkmark — visually done, pushed to bottom or dimmed

### 2. Check-In Modal (Bottom Sheet)

Slides up from bottom on tap. Dead simple, top to bottom:

**Header:**
- Guest name (large)
- "3 guests" subtitle
- No close button — tap outside or swipe down to dismiss

**Counter (single CTA):**
- Big centered number: `[ - ]  3  [ + ]`
- Large tap-friendly buttons (56px+)
- **Defaults to the full remaining count** — if 3 guests and none arrived, starts at 3. If 1 of 3 already arrived, starts at 2 (the remaining).
- Min = 0, Max = remaining guests not yet checked in
- This replaces both the old "Check in all" button (redundant — counter already defaults to max) and the two separate counters (no dinner)

**Confirm button:**
- Single full-width button at bottom: **"Check in 3"** (dynamic label with count)
- When count is 0: button disabled/grayed
- Green styling, impossible to miss

**Removed from modal:**
- "Check in all" button — redundant, counter defaults to max
- Cancel button — swipe/tap-outside handles dismissal
- Two separate counters — no dinner means one counter
- "Save" label — "Check in X" is the action verb
- Email display
- Generic info box

### 3. Post Check-In Flow

After tapping "Check in X":

1. Sheet dismisses instantly
2. Card in the list flashes green briefly (~300ms) as visual confirmation
3. Card updates to show new arrival status
4. **Search field clears automatically**
5. **Search field stays focused** — keyboard ready for next name
6. No toast notification, no "Saved!" overlay, no delay

The updated card IS the confirmation.

### 4. Search Bar

- Sticky at top, always visible
- **Auto-focused on page load** — keyboard opens immediately when entering the page
- Large input, easy to tap
- Clear button (X) inside the input when text is present
- Results filter instantly as-you-type (existing behavior, unchanged)

### 5. Terminology

Replace "cocktail" / "cocktails" with "guests" or just the count in all user-facing check-in UI. This is internal terminology that means nothing to reception staff.

- "Cocktail List" column → not shown on mobile (removed)
- Counter label in modal → no label needed, just the number
- Any reference to "cocktails-only" in the check-in flow → "guests"

## What Does NOT Change

- Desktop table view — untouched
- Backend API — same endpoints, same data model
- The `cocktailOnlyPullUpCount` / `dinnerPullUpCount` data fields — kept as-is in the API, only the UI labels change
- Partial pull-up logic — still works: check in some now, more later
- Search/filter logic — same algorithm, just auto-clear after check-in
- Sort behavior — unchanged
- Edit guest functionality — still accessible from desktop, just not cluttering mobile check-in cards

## Edge Cases

| Scenario | Behavior |
|---|---|
| Solo guest (party of 1) | Counter shows 1, button says "Check in 1", one tap to confirm |
| Group of 5, 3 arrive now | Counter defaults to 5 (remaining), host taps - twice to get to 3, confirms |
| Same group, 2 more arrive later | Open card again, counter defaults to 2 (remaining), confirm |
| Fully arrived guest | Card shows "arrived" state, tapping it does nothing or shows "already checked in" |
| Guest not on list | Search shows no results — existing behavior, no change needed |
| Party of 1 already arrived | Card shows arrived, no action needed |
