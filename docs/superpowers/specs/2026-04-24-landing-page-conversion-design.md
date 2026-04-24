# Landing Page Conversion Optimization — Design

**Date:** 2026-04-24
**Owner:** Felix Civalero
**Scope:** `frontend/src/pages/LandingPage.jsx` (frontend-only)

## Goal

Drastically increase the conversion rate of Instagram mobile traffic into created accounts on `pullup.se`.

Current baseline (14d window, per `LANDING PAGE — PULLUP.SE` analytics):

- 108 views / 80 unique
- **56% mobile**, 44% desktop
- Source mix: direct 56%, instagram 33%, facebook 5%, pullup 5%, google 2.5%, bing 2.5%

The primary conversion event being optimized is **account creation** (not first-event creation). The auth modal itself is out of scope; this spec is purely about the landing page around it.

## Audience

The Instagram-sourced visitor is unclear but typically:

- Someone who saw `pullup.se` in Felix's or Stefansson's IG bio and is curious what it is, or
- Someone who already visited a public event page on `pullup.se` and navigated to the landing page from there.

Common to both: **they don't yet know what PullUp is.** The hero has to make sense cold.

## Positioning

Scene / culture angle, not product/tooling angle. The page sells **belonging to a cultural scene** rather than "a tool to throw events." Signup should feel like joining something, not adopting software.

The existing slogan — `Pullup for [people / life / culture / art]` (3D rotating word) and the sub-line `For the people who make cities worth living in.` — captures this perfectly and is kept as-is. The explaining work shifts to the scene section and CTA labels.

## Page Structure — After

```
┌─ NAV (unchanged, fixed)
│
├─ HERO (kept)
│    • 3D rotating word ("Pullup for [people/life/culture/art]")
│    • Particle canvas background
│    • Sub-line: "For the people who make cities worth living in." (kept)
│    • Primary CTA button: "Create your account"    ← label change
│    • Secondary link: "see what's happening ↓"     ← NEW, scrolls to scene section
│
├─ SCENE SECTION (NEW, dummy data)
│    • Small heading: "Live on PullUp"
│    • Desktop: 3×2 grid of 6 fake event cards
│    • Mobile:  horizontal snap-scroll carousel (one card visible + peek of next)
│    • Cards are NON-CLICKABLE (decorative proof only)
│    • Inline CTA below grid: "Create your account"
│
├─ FINAL CTA (kept, re-worded)
│    • Headline: "Yes. Pullup."
│    • Button: "Create your account"
│
└─ FOOTER
     • Legal links (Privacy / Terms / Cookies / Contact) — kept
     • Newsletter form — REMOVED

+ STICKY MOBILE CTA BAR (NEW)
     • Mobile only (width ≤ 720px)
     • Fixed to bottom of viewport
     • Hidden while hero is in view; fades in after hero scrolls out
     • Full-width gold button: "Create your account"
     • Respects env(safe-area-inset-bottom)
```

Every CTA on the page uses the same label: **"Create your account"**. Consistency reduces cognitive load and avoids the current "Create your first event" copy, which is host-coded and scares non-hosts.

## Deletions

Applied to `frontend/src/pages/LandingPage.jsx` only. Approximate line ranges are from the current 4522-line file; verify in-editor before deleting.

- The three showcase sections (Editor mockup, Analytics mockup, Email Campaigns mockup) and the "Yes it's free" divider between them. Approx. lines 3481–3534.
- The entire newsletter footer section: heading, tagline, form card, city picker, interests pills, email input, consent checkbox. Approx. lines 3613–4142.
- Newsletter success/error toast popup. Approx. lines 4450–4500.
- Newsletter state variables: `newsletterEmail`, `newsletterStatus`, `newsletterSubmitting`, `newsletterPopup`. Approx. lines 2757–2761.
- Newsletter submit handler `handleNewsletterSubmit`. Approx. lines 3009–3056.
- `SHOWCASE_SECTIONS` data array. Line 184.
- Showcase mock components `EventMockup`, `EmailMockup`, `AnalyticsMockup`, `SocialMockup`. Approx. lines 371–1050. Delete only if no other file in the codebase imports them — verify with a reference search before removing.
- Newsletter-only data/constants that become unused after the cut (e.g. `CAPITAL_CITIES`, `INTEREST_OPTIONS`, any newsletter-specific rotating-word component). Remove whatever the linter flags as unused after the first pass of deletions.

Footer legal links are kept. The `Reveal` / `useReveal` helpers are kept. The hero's 3D rotating-word and particle-canvas code is kept.

## New Components

### `SceneSection`

Renders a heading (`"Live on PullUp"`), a grid/carousel of 6 dummy event cards, and an inline `"Create your account"` CTA below the grid.

**Card visual**:

- Cover image fills ≈60% of card height.
- Event title — one line, CSS truncation on overflow.
- Meta line: `city · date` (e.g. `Stockholm · Fri`).
- Subtle gold accent (e.g. a small tag in a corner) consistent with the existing dark-UI / gold aesthetic.
- Cards are non-clickable; cursor stays default.

**Layout**:

- Desktop (> 720px): CSS grid, 3 columns × 2 rows.
- Mobile (≤ 720px): horizontal flex container with `scroll-snap-type: x mandatory` and `scroll-snap-align: center` on each card. First card fully visible; right edge of next card peeks to signal swipe affordance.

**Dummy event data** (hardcoded in the component):

1. "Vernissage: Colors of May" — Stockholm · Fri
2. "Rooftop listening session" — Stockholm · Sat
3. "Late dinner, Södermalm" — Stockholm · Sun
4. "Film screening + Q&A" — Göteborg · Thu
5. "Winter swim + sauna" — Malmö · Sat
6. "Studio opening" — Stockholm · Fri

**Images**:

- Preferred: 6 placeholder images bundled under `frontend/src/assets/landing/scene/` — no external fetch, no loading state, faster first paint.
- Acceptable fallback if bundled images are not ready in time: Unsplash source URLs (e.g. `https://images.unsplash.com/photo-…?w=640&q=70`) hardcoded into the component, lazy-loaded via `loading="lazy"`. The bundled path can replace these in a follow-up pass without changing the component's shape.

### `StickyMobileCta`

Fixed-position bottom bar, mobile-only, that becomes visible once the hero scrolls out of view.

- Rendered only when `window.matchMedia('(max-width: 720px)').matches` is true at mount.
- Uses an `IntersectionObserver` attached to the hero section's DOM node. When the hero stops intersecting the viewport, the bar fades in (CSS transition on `opacity`/`transform`). When the hero re-enters, the bar fades out.
- Full-width gold button with the same `"Create your account"` label; calls the same `setShowAuth(true)` as the hero CTA.
- `padding-bottom: env(safe-area-inset-bottom)` so the button clears the iOS home indicator.
- Subtle dark backdrop blur behind the button so it reads against any page content.
- Not rendered on desktop at all (never in the DOM when `matchMedia` returns false on mount); the existing fixed nav login button already covers desktop.

## File Shape After the Cut

The current `LandingPage.jsx` is 4522 lines. After deletions the file is estimated at 800–1200 lines. Target local structure:

```
LandingPage.jsx
├─ helpers: trackEvent, Reveal, useReveal
├─ hero assets: rotating-word data, 3D spin CSS, particle canvas setup
├─ SceneSection        (local component)
├─ StickyMobileCta     (local component)
└─ LandingPage         (default/named export)
```

If the file still feels too large after the cut (practical ceiling ≈ 800 lines for a focused page component), `SceneSection` and `StickyMobileCta` should be extracted to their own files under `frontend/src/components/landing/`. This decision is made after the cuts land, based on what the file actually looks like, not up front.

## Responsive Breakpoints

One mobile breakpoint at `width ≤ 720px`, matching the existing `@media (max-width: 720px)` already used at line 3176 of the current file. No new breakpoints introduced.

- Sticky mobile CTA: mobile-only.
- Scene section: grid → carousel at the same breakpoint.
- Nav, hero, final CTA, footer: unchanged responsive behavior.

## Out of Scope

- Deleting the newsletter backend endpoint, associated DB tables, or the `NewsletterPage.jsx` route. This spec is frontend-only removal from the landing page.
- Changes to the auth modal itself (layout, form, OAuth flows).
- Real event data or a Discover feed on the landing page. The scene section stays static and dummy.
- Localization / Swedish translation.
- Changes to `HomePage.jsx` (post-login view) or any non-landing page.
- Performance optimization of the hero 3D spin and particle canvas. Felix explicitly chose to keep these as-is.

## Verification Checklist

Before the PR is considered complete:

1. **Visual on an actual phone** (not just devtools): hero renders, scene cards swipe smoothly with snap, sticky CTA appears after scrolling past hero and disappears when hero re-enters, footer has no newsletter content.
2. **Every CTA opens auth**: hero primary button, scene-section inline button, final CTA button, sticky mobile bar button — all four call `setShowAuth(true)` and the resulting modal is usable on mobile (soft keyboard does not break layout).
3. **No console errors or warnings** on fresh page load: no unused-import warnings, no React key warnings from the scene grid, no `IntersectionObserver` errors on older browsers.
4. **Lighthouse mobile before/after** recorded in the PR description. Focus on LCP and Interaction-to-Next-Paint; treat as informational, not a hard gate.
5. **Analytics still flowing**: page view events still fire on landing page mount. Existing `trackEvent('landing_view', …)` (or equivalent) calls are preserved.
6. **Non-landing routes untouched**: `/discover`, `/events/new`, `/newsletter` (if that route exists), profile, settings, admin — all load unchanged. Newsletter backend endpoint still exists and still responds 200 (just no longer called from the landing page).

## Implementation Order

Intended as a guide for the implementation plan (written in a follow-up step via `writing-plans`).

1. Delete newsletter UI, state, handler, and toast from `LandingPage.jsx`. Verify page still renders.
2. Delete the three showcase sections and the "yes it's free" divider. Verify page still renders.
3. Delete the now-unused showcase mock components and `SHOWCASE_SECTIONS` data after a reference check. Verify no other file imports them.
4. Change primary hero CTA label to "Create your account". Change final CTA headline/button to match spec.
5. Add the "see what's happening ↓" secondary link that scrolls to the scene section anchor.
6. Build `SceneSection` with dummy data, grid layout, and inline CTA. Desktop only at first.
7. Add the mobile carousel layout for `SceneSection` with `scroll-snap`.
8. Build `StickyMobileCta` with `IntersectionObserver` hooked to the hero node. Mobile-only via `matchMedia`.
9. Bundle the 6 placeholder images under `frontend/src/assets/landing/scene/`.
10. Run the full verification checklist above on a real phone.
