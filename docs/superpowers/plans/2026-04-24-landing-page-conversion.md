# Landing Page Conversion Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `frontend/src/pages/LandingPage.jsx` to convert Instagram mobile visitors into accounts — remove product-pitch showcase sections and the newsletter footer, add a dummy "scene" section and a sticky mobile CTA bar, and unify every CTA to "Create your account".

**Architecture:** Frontend-only change. Current `LandingPage.jsx` is 4522 lines — most of that volume is deleted. Two small new components (`LandingSceneSection`, `LandingStickyMobileCta`) are extracted as sibling files under `frontend/src/components/` (matching the flat component convention already in use). Placeholder event photos live in `frontend/public/landing/scene/` (matching the existing `public/*.png` convention for static landing assets).

**Tech Stack:** React 19, Vite 7, react-router-dom 7, lucide-react (already in use). No new dependencies. **No test framework is installed** — verification for this plan is dev-server visual inspection + `npm run lint` + `npm run build` + the manual checklist at the end. That is intentional and matches the codebase; do not add a test framework as part of this work.

**Reference:** Design spec at `docs/superpowers/specs/2026-04-24-landing-page-conversion-design.md`.

---

## File Structure

**Modified:**

- `frontend/src/pages/LandingPage.jsx` — large deletions (showcase sections, newsletter UI/state/handler/toast, mock components, `SHOWCASE_SECTIONS`, unused constants). Hero CTA label change. Final CTA copy + label change. New scroll-anchor link in hero. Imports and renders the two new components below.

**Created:**

- `frontend/src/components/LandingSceneSection.jsx` — dummy 6-card scene section with a desktop grid and a mobile horizontal snap-carousel. Non-clickable cards. Inline "Create your account" CTA at the bottom. Takes `onSignupClick` as a prop (calls `setShowAuth(true)` in the parent).
- `frontend/src/components/LandingStickyMobileCta.jsx` — mobile-only (via `window.matchMedia('(max-width: 720px)')` at mount) fixed bottom CTA bar. Hidden until the hero scrolls out of view (IntersectionObserver on a hero ref passed as a prop). Takes `heroRef` and `onSignupClick` as props.
- `frontend/public/landing/scene/` — directory containing 6 placeholder cover images (`scene-1.jpg` … `scene-6.jpg`), or skipped in favor of Unsplash URLs per Task 6's fallback path.

**Deleted (as part of modifying `LandingPage.jsx`):**

- `SHOWCASE_SECTIONS` array (line ~184).
- `EventMockup`, `EmailMockup`, `AnalyticsMockup`, `SocialMockup` component functions (lines ~371–1050).
- Newsletter state: `newsletterEmail`, `newsletterStatus`, `newsletterSubmitting`, `newsletterPopup` (lines ~2757–2761).
- Newsletter submit handler `handleNewsletterSubmit` (lines ~3009–3056).
- Three showcase JSX sections + "Yes it's free" divider (lines ~3481–3534).
- Entire newsletter footer section (lines ~3613–4142).
- Newsletter popup/toast JSX (lines ~4450–4500).
- Any constants left unused after the above (e.g. `CAPITAL_CITIES`, `INTEREST_OPTIONS`, and the newsletter-specific rotating-word helper) — discovered via `npm run lint` after Task 1.

Line numbers are from the pre-change state of the file; confirm by string match rather than relying on line numbers after earlier tasks shift them.

---

## Task 1: Delete newsletter UI, state, handler, and toast

**Files:**
- Modify: `frontend/src/pages/LandingPage.jsx`

- [ ] **Step 1: Read the file to confirm current state**

Run: `wc -l frontend/src/pages/LandingPage.jsx`
Expected: `4522` (or close to it; if very different, stop and re-map before proceeding)

- [ ] **Step 2: Delete the newsletter footer section JSX**

Open `LandingPage.jsx` and find the block that starts with the newsletter section wrapper. It is the `<section>` (or `<div>`) that contains `id="newsletter"` (approx line 3642) and runs through all the form UI (heading "Newsletter for …", tagline, city picker dropdown, interests pills, email input, subscribe button, consent checkbox). Delete the entire element — from its opening tag to its matching closing tag. Based on the structural map, this spans approximately lines 3613–4142.

Use editor search for `id="newsletter"` to find the start. To find the end, find the matching closing tag by indentation; the legal footer links (`Privacy`, `Terms`, `Cookies`, `Contact` at approx lines 4144–4186) stay and should be the next block after your deletion.

- [ ] **Step 3: Delete the newsletter popup/toast JSX**

Search for `newsletterPopup &&` in the render tree (approx line 4450). Delete the entire conditional block that renders the toast. It typically looks like `{newsletterPopup && (<div …>…</div>)}`. Stop at the closing `)}`.

- [ ] **Step 4: Delete the newsletter submit handler**

Search for `handleNewsletterSubmit`. Find the function definition (approx line 3009, preceded by a comment like `/* ─── newsletter ─── */`). Delete the whole function body through its closing brace (approx line 3056). Delete the comment line too if it only labels this removed block.

- [ ] **Step 5: Delete the newsletter state variables**

Search for `newsletterEmail`. You should find `useState` declarations for `newsletterEmail`, `newsletterStatus`, `newsletterSubmitting`, and `newsletterPopup` (approx lines 2757–2761). Delete those four `useState` lines.

- [ ] **Step 6: Run the dev server and verify the page still renders**

Run (in a terminal you will keep open for later tasks too):
```
cd frontend && npm run dev
```
Open the dev URL (typically `http://localhost:5173/`) and confirm:
- Page loads without a blank white screen.
- No red error overlay from Vite.
- Hero + 3 showcase sections + final CTA still render. Newsletter section no longer renders. Footer still has legal links.

If the page fails to compile, fix the errors before proceeding (usually: a leftover reference to one of the deleted identifiers — lint in Step 7 will also catch these).

- [ ] **Step 7: Run the linter**

Run: `cd frontend && npm run lint`
Expected: either clean, or only warnings about unused variables (e.g. `CAPITAL_CITIES`, `INTEREST_OPTIONS`, or any newsletter-only helper constants that are now unreferenced). Note which identifiers the linter flags — you'll remove them in Step 8.

- [ ] **Step 8: Remove any leftover unused identifiers the linter flagged**

For each unused-variable warning from Step 7, delete the corresponding definition in `LandingPage.jsx`. Common candidates:
- `CAPITAL_CITIES` array (approx line 228)
- `INTEREST_OPTIONS` array (approx line 174)
- Any newsletter-specific `Rotating…` sub-component used only in the deleted newsletter heading

Re-run `npm run lint` until it's clean (no unused-variable warnings from this file).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/LandingPage.jsx
git commit -m "remove newsletter form, state, handler, and toast from landing page"
```

---

## Task 2: Delete the three product-pitch showcase sections

**Files:**
- Modify: `frontend/src/pages/LandingPage.jsx`

- [ ] **Step 1: Locate the showcase render block**

In `LandingPage.jsx`, search for `SHOWCASE_SECTIONS` in the render tree (typically inside a `.map(...)` call). Based on the structural map, the three showcase sections render between approx lines 3481 and 3534, interleaved with a "Yes it's free" divider (one divider, placed after section 2).

- [ ] **Step 2: Delete the showcase map block**

Delete the entire `{SHOWCASE_SECTIONS.map(…)}` expression (or equivalent — it may be written as a loop or as three explicit sections, depending on the current file). Also delete the "Yes it's free" divider JSX that sits between sections 2 and 3. Use editor search for the text "yes it's free" (case-insensitive) to locate it.

What should remain: the hero section immediately flows into the final CTA section ("Yes. Start building." at line 3553 before any renames).

- [ ] **Step 3: Delete the `SHOWCASE_SECTIONS` data array**

Search for `const SHOWCASE_SECTIONS = [` at approx line 184. Delete the array literal from `const SHOWCASE_SECTIONS` through its closing `];`.

- [ ] **Step 4: Delete the four showcase mock components**

Search for `function EventMockup(`. Delete that function (through its closing `}`). Repeat for `EmailMockup`, `AnalyticsMockup`, and `SocialMockup`. Based on the structural map these four components span approx lines 371–1050 but may not be contiguous — delete each by name, not by line range.

Before deleting each, confirm no other file imports it:
```
grep -R "EventMockup\|EmailMockup\|AnalyticsMockup\|SocialMockup" frontend/src
```
Expected: all matches are inside `LandingPage.jsx`. If any other file imports these, stop and report — that is out of scope.

- [ ] **Step 5: Verify compilation and render**

Dev server (still running from Task 1, or `cd frontend && npm run dev`). Reload the page. Expected:
- Hero → Final CTA → Footer legal links. No showcase sections in between.
- No Vite error overlay.
- No red console errors.

Run: `cd frontend && npm run lint`
Expected: clean. Remove any additional unused imports the linter flags (e.g. lucide-react icons that were only used in the deleted mockups).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/LandingPage.jsx
git commit -m "remove product-pitch showcase sections and mock components"
```

---

## Task 3: Rename CTA labels and final CTA headline

**Files:**
- Modify: `frontend/src/pages/LandingPage.jsx`

- [ ] **Step 1: Change the hero CTA button label**

Search for `Create your first event` in `LandingPage.jsx`. The first match (in the hero, approx line 3445) is the primary hero CTA button. Replace the button's visible text from `Create your first event` to `Create your account`. Keep the `<ArrowRight size={18} />` icon.

Before:
```jsx
Create your first event <ArrowRight size={18} />
```
After:
```jsx
Create your account <ArrowRight size={18} />
```

- [ ] **Step 2: Change the final CTA button label**

Search for the next occurrence of `Create your first event` (approx line 3608 — inside the final CTA section). Apply the same rename:

Before:
```jsx
Create your first event <ArrowRight size={18} />
```
After:
```jsx
Create your account <ArrowRight size={18} />
```

There should now be zero matches for `Create your first event` in the file. Verify:
```
grep -n "Create your first event" frontend/src/pages/LandingPage.jsx
```
Expected: no output.

- [ ] **Step 3: Change the final CTA headline**

Search for `Start building.` (approx line 3563). The final CTA headline currently renders as two pieces: `Yes.` and then `Start building.`. Replace `Start building.` with `Pullup.` so the headline reads `Yes. Pullup.`.

Before (approx):
```jsx
Yes.{" "}
…
<span …>
  Start building.
</span>
```
After:
```jsx
Yes.{" "}
…
<span …>
  Pullup.
</span>
```

- [ ] **Step 4: Verify**

Reload the dev server page. Hero button reads "Create your account". Scroll to the bottom section: headline reads "Yes. Pullup." with the final CTA button also "Create your account". Clicking either button should still open the auth modal (or navigate to `/events` if already logged in).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/LandingPage.jsx
git commit -m "unify landing page CTAs to Create your account and update final headline"
```

---

## Task 4: Add "see what's happening" secondary scroll link to the hero

**Files:**
- Modify: `frontend/src/pages/LandingPage.jsx`

- [ ] **Step 1: Locate the hero CTA button**

Search for the hero's `Create your account` button (approx line 3445 before earlier renames, now slightly shifted). Identify its parent `<div>` — the hero's CTA container. The new secondary link will sit directly below this button, inside the same container.

- [ ] **Step 2: Add the secondary link**

Immediately after the hero CTA button's closing `</button>`, add:

```jsx
<a
  href="#live-on-pullup"
  onClick={(e) => {
    e.preventDefault();
    document.getElementById("live-on-pullup")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }}
  style={{
    display: "inline-block",
    marginTop: 16,
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    textDecoration: "none",
    letterSpacing: "0.02em",
  }}
>
  see what's happening ↓
</a>
```

The anchor target `#live-on-pullup` will be added to the new `LandingSceneSection` component in Task 7. For now the link resolves to nothing — that's expected; we'll verify the full flow after Task 7.

- [ ] **Step 3: Verify**

Reload the page. Below the "Create your account" hero button you see a subtle "see what's happening ↓" text link. Clicking it does nothing yet (anchor doesn't exist) — that is fine for now.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/LandingPage.jsx
git commit -m "add see what's happening scroll cue below hero CTA"
```

---

## Task 5: Add placeholder event images

**Files:**
- Create: `frontend/public/landing/scene/scene-1.jpg` through `scene-6.jpg`

- [ ] **Step 1: Create the directory**

Run:
```
mkdir -p frontend/public/landing/scene
```

- [ ] **Step 2: Pick the image source**

**Preferred path:** If Felix has supplied 6 cover photos, save them as `scene-1.jpg`, `scene-2.jpg`, … `scene-6.jpg` into `frontend/public/landing/scene/`. Keep each image under ~150 KB. Target width 800px; JPEG quality ~75 for good-on-mobile size/quality balance.

**Fallback path:** If no images are supplied, skip this task entirely (do NOT commit empty files). In Task 7 you will use Unsplash source URLs hardcoded into the component instead. This is explicitly supported by the design spec. Mark this task complete with a note in the commit message: "no bundled images — using Unsplash URLs instead".

- [ ] **Step 3: Verify (only if bundled images were added)**

With dev server running, visit `http://localhost:5173/landing/scene/scene-1.jpg` directly. Expected: the image renders in the browser. Repeat spot-checks for `scene-3.jpg` and `scene-6.jpg`.

- [ ] **Step 4: Commit (only if bundled images were added)**

```bash
git add -f frontend/public/landing/scene/
git commit -m "add placeholder scene cover images for landing page"
```

The `-f` is because `public/` may or may not be gitignored in this repo; use `-f` defensively to ensure the new directory is included. If the commit is empty (fallback path was used), skip this step.

---

## Task 6: Build `LandingSceneSection` component (desktop grid)

**Files:**
- Create: `frontend/src/components/LandingSceneSection.jsx`

- [ ] **Step 1: Create the component file**

Create `frontend/src/components/LandingSceneSection.jsx` with the following full contents. The 6-card data is inline. If Task 5 used the fallback path (no bundled images), keep the `unsplashFallback` block as the live `image` value and delete the local-path line from each card. If Task 5 bundled real images, use `image: "/landing/scene/scene-1.jpg"` per card and remove the Unsplash URLs.

```jsx
import React from "react";

const EVENTS = [
  {
    title: "Vernissage: Colors of May",
    meta: "Stockholm · Fri",
    image: "/landing/scene/scene-1.jpg",
    unsplashFallback:
      "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&q=70",
  },
  {
    title: "Rooftop listening session",
    meta: "Stockholm · Sat",
    image: "/landing/scene/scene-2.jpg",
    unsplashFallback:
      "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&q=70",
  },
  {
    title: "Late dinner, Södermalm",
    meta: "Stockholm · Sun",
    image: "/landing/scene/scene-3.jpg",
    unsplashFallback:
      "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=70",
  },
  {
    title: "Film screening + Q&A",
    meta: "Göteborg · Thu",
    image: "/landing/scene/scene-4.jpg",
    unsplashFallback:
      "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&q=70",
  },
  {
    title: "Winter swim + sauna",
    meta: "Malmö · Sat",
    image: "/landing/scene/scene-5.jpg",
    unsplashFallback:
      "https://images.unsplash.com/photo-1540962351504-03099e0a754b?w=800&q=70",
  },
  {
    title: "Studio opening",
    meta: "Stockholm · Fri",
    image: "/landing/scene/scene-6.jpg",
    unsplashFallback:
      "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&q=70",
  },
];

// Toggle at runtime if bundled images aren't present — simpler than a build flag
const USE_UNSPLASH_FALLBACK = false;

function Card({ event }) {
  const src = USE_UNSPLASH_FALLBACK ? event.unsplashFallback : event.image;
  return (
    <div
      className="landing-scene-card"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          aspectRatio: "16 / 10",
          background: `url(${src}) center/cover no-repeat, rgba(255,255,255,0.04)`,
        }}
      />
      <div style={{ padding: "12px 14px 14px" }}>
        <div
          style={{
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {event.title}
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.55)",
            fontSize: 13,
            marginTop: 4,
          }}
        >
          {event.meta}
        </div>
      </div>
    </div>
  );
}

export default function LandingSceneSection({ onSignupClick }) {
  return (
    <section
      id="live-on-pullup"
      style={{
        padding: "80px 24px 96px",
        maxWidth: 1160,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          textAlign: "center",
          marginBottom: 36,
          color: "rgba(255,255,255,0.55)",
          fontSize: 13,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        ─── Live on PullUp ───
      </div>

      <div
        className="landing-scene-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
        }}
      >
        {EVENTS.map((e) => (
          <Card key={e.title} event={e} />
        ))}
      </div>

      <div style={{ textAlign: "center", marginTop: 48 }}>
        <button
          type="button"
          onClick={onSignupClick}
          style={{
            background: "#f4c24a",
            color: "#111",
            border: "none",
            padding: "16px 28px",
            fontSize: 16,
            fontWeight: 600,
            borderRadius: 999,
            cursor: "pointer",
            letterSpacing: "-0.01em",
          }}
        >
          Create your account →
        </button>
      </div>
    </section>
  );
}
```

If Task 5 succeeded with bundled images, leave `USE_UNSPLASH_FALLBACK = false`. If Task 5 fell back, set `USE_UNSPLASH_FALLBACK = true`.

- [ ] **Step 2: Wire it into the landing page**

Open `frontend/src/pages/LandingPage.jsx`. At the top of the file, add the import alongside other component imports:

```jsx
import LandingSceneSection from "../components/LandingSceneSection";
```

In the render tree, insert `<LandingSceneSection onSignupClick={() => (user ? navigate("/events") : setShowAuth(true))} />` immediately after the hero section's closing tag and immediately before the final CTA section ("Yes. Pullup.").

Search for where the hero ends — it's the tag that closes just before the final CTA section. The call signature for the signup click should mirror what the hero CTA button uses; if the hero uses a shared handler name like `handlePrimaryCta` or similar, pass that reference instead of re-declaring the inline arrow function.

- [ ] **Step 3: Verify**

Reload the page. Expected:
- Between hero and final CTA, a new section appears with heading "Live on PullUp" and 6 cards in a 3×2 grid on desktop.
- Card images render (bundled or Unsplash).
- Clicking any card does nothing (cards are non-clickable — deliberate).
- Clicking the "Create your account →" button below the grid opens the auth modal.
- Clicking the "see what's happening ↓" link in the hero (from Task 4) smooth-scrolls down to this new section.

If images are broken, check the `USE_UNSPLASH_FALLBACK` toggle and fix.

- [ ] **Step 4: Run lint**

Run: `cd frontend && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LandingSceneSection.jsx frontend/src/pages/LandingPage.jsx
git commit -m "add LandingSceneSection with 6 dummy event cards between hero and final CTA"
```

---

## Task 7: Add mobile carousel layout to `LandingSceneSection`

**Files:**
- Modify: `frontend/src/components/LandingSceneSection.jsx`

- [ ] **Step 1: Replace the grid with a responsive grid/carousel via CSS**

The quickest path that doesn't require a second React tree: use a `<style>` block inside the component with a `@media (max-width: 720px)` rule that flips the grid into a horizontal snap-scroll flex container.

At the top of the `LandingSceneSection.jsx` return (just inside the opening `<section …>`), add:

```jsx
<style>{`
  @media (max-width: 720px) {
    .landing-scene-grid {
      display: flex !important;
      grid-template-columns: unset !important;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      gap: 12px;
      padding: 0 16px;
      margin: 0 -24px;
      scrollbar-width: none;
    }
    .landing-scene-grid::-webkit-scrollbar { display: none; }
    .landing-scene-grid > * {
      flex: 0 0 80%;
      scroll-snap-align: center;
    }
  }
`}</style>
```

The `80%` flex-basis on each card makes the first card fill most of the viewport width with the right edge of the next card peeking — the "swipe for more" signal the spec calls for.

- [ ] **Step 2: Verify on desktop**

Reload the page on desktop width (> 720px). Expected: grid still renders as 3×2 — the media query only applies below 720px.

- [ ] **Step 3: Verify on mobile**

In Chrome DevTools, toggle device toolbar (Cmd+Shift+M) and pick a mobile preset like iPhone 14 Pro (390px wide). Reload. Expected:
- The section now shows cards in a horizontal row.
- First card is fully visible; right edge of the second card peeks.
- You can scroll/swipe horizontally and cards snap into place.

- [ ] **Step 4: Run lint**

Run: `cd frontend && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LandingSceneSection.jsx
git commit -m "make LandingSceneSection a horizontal snap-carousel on mobile"
```

---

## Task 8: Build `LandingStickyMobileCta` component

**Files:**
- Create: `frontend/src/components/LandingStickyMobileCta.jsx`
- Modify: `frontend/src/pages/LandingPage.jsx`

- [ ] **Step 1: Create the component file**

Create `frontend/src/components/LandingStickyMobileCta.jsx` with the following full contents:

```jsx
import React, { useEffect, useState } from "react";

function isMobileViewport() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 720px)").matches;
}

export default function LandingStickyMobileCta({ heroRef, onSignupClick }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isMobileViewport()) return;
    setMounted(true);

    const heroNode = heroRef?.current;
    if (!heroNode) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(!entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    observer.observe(heroNode);
    return () => observer.disconnect();
  }, [heroRef]);

  if (!mounted) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
        background: "rgba(10,10,10,0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        zIndex: 100,
        transform: visible ? "translateY(0)" : "translateY(120%)",
        opacity: visible ? 1 : 0,
        transition: "transform 220ms ease, opacity 220ms ease",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <button
        type="button"
        onClick={onSignupClick}
        style={{
          width: "100%",
          background: "#f4c24a",
          color: "#111",
          border: "none",
          padding: "15px 18px",
          fontSize: 16,
          fontWeight: 600,
          borderRadius: 999,
          cursor: "pointer",
          letterSpacing: "-0.01em",
        }}
      >
        Create your account →
      </button>
    </div>
  );
}
```

Notes:
- `mounted` is set only if mobile at mount time. This means rotating desktop → mobile in the same session won't spawn the bar, which is acceptable for landing-page traffic (users don't rotate mid-session).
- When there's no `heroRef.current` yet (e.g. during initial mount race), the bar defaults to visible — better to show than hide.

- [ ] **Step 2: Wire it into the landing page with a hero ref**

Open `frontend/src/pages/LandingPage.jsx`.

At the top, alongside the other component imports:
```jsx
import LandingStickyMobileCta from "../components/LandingStickyMobileCta";
```

Inside the `LandingPage` component, near the other `useState`/`useRef` calls, add:
```jsx
const heroRef = useRef(null);
```

Make sure `useRef` is imported from React if it isn't already.

Find the hero `<section>` in the render tree (the one containing the 3D rotating word and the primary CTA button). Add `ref={heroRef}` to its opening tag. If the hero is a `<div>` rather than `<section>`, attach the ref to whatever the outermost hero wrapper is.

Finally, immediately after the landing page's outermost closing element (as a sibling of the auth modal — the sticky bar is a page-level fixed element, not nested inside the scroll content), render:

```jsx
<LandingStickyMobileCta
  heroRef={heroRef}
  onSignupClick={() => (user ? navigate("/events") : setShowAuth(true))}
/>
```

If the hero CTA already uses a shared handler, prefer passing that handler reference instead of re-declaring the inline arrow.

- [ ] **Step 3: Verify on desktop**

Reload on desktop width (> 720px). Expected: **no** sticky bar renders. `LandingStickyMobileCta` early-returns `null` because `isMobileViewport()` is false.

- [ ] **Step 4: Verify on mobile**

In Chrome DevTools, toggle device toolbar, pick iPhone 14 Pro (390px), reload. Expected:
- At the top of the page, the sticky bar is NOT visible (hero is in view).
- Scroll down past the hero. As the hero leaves the viewport, the sticky bar fades in at the bottom with a slide-up transition.
- Scroll back up to the hero. The bar fades out and slides down.
- Tapping the sticky bar's button opens the same auth modal the hero CTA opens.

- [ ] **Step 5: Run lint and a full build**

Run: `cd frontend && npm run lint`
Expected: clean.

Run: `cd frontend && npm run build`
Expected: build succeeds with no TypeScript/JSX errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/LandingStickyMobileCta.jsx frontend/src/pages/LandingPage.jsx
git commit -m "add mobile-only sticky CTA bar that appears after hero scrolls out"
```

---

## Task 9: Final verification on a real phone

**Files:** no changes — this is a manual verification pass.

- [ ] **Step 1: Start the dev server bound to LAN**

Run: `cd frontend && npm run dev -- --host`

Note the LAN URL Vite prints (e.g. `http://192.168.1.42:5173/`).

- [ ] **Step 2: Open the LAN URL on an actual phone**

On a mobile device on the same network, open the printed URL in Safari (iOS) or Chrome (Android). Verify in order:

- Hero renders. The 3D rotating word spins. Particle canvas is visible. Primary CTA reads "Create your account". Below it, "see what's happening ↓" text link.
- Tapping "see what's happening ↓" smooth-scrolls to the scene section.
- Scene section: heading "Live on PullUp". 6 cards laid out as a horizontal carousel. Swiping reveals each card with snap. First card fully visible + next card peeking on the right. Cards are not clickable.
- "Create your account →" button at the bottom of the scene section opens the auth modal. Modal is usable: soft keyboard appears, layout does not collapse, inputs are typable.
- Final CTA section: "Yes. Pullup." headline. "Create your account" button. Opens the same auth modal.
- Footer: legal links only (Privacy, Terms, Cookies, Contact). NO newsletter form anywhere on the page.
- Sticky bar: while hero is in view, the bar is hidden. Scroll down so the hero exits the viewport — bar fades in at the bottom. Scroll back up — bar fades out.
- Sticky bar button opens the same auth modal.

- [ ] **Step 3: Open DevTools over USB and check the console**

iOS: connect to Mac Safari's Develop menu. Android: `chrome://inspect` in desktop Chrome.

Expected: no red console errors. Warnings about third-party analytics pixels or React DevTools are acceptable if they existed before.

- [ ] **Step 4: Lighthouse mobile run**

In Chrome DevTools → Lighthouse tab, run a Mobile Performance audit against the dev server page. Record the scores (Performance, Accessibility, Best Practices, SEO) and LCP / Interaction-to-Next-Paint values in the PR description. These numbers are informational, not a pass/fail gate.

- [ ] **Step 5: Confirm analytics still fire**

In the dev server tab, open DevTools → Network → filter by the analytics endpoint your backend uses for `trackEvent` (check a previous landing-page session's network log if unsure — it's the request fired on mount with a `landing_view`-style name). Reload the landing page. Expected: one page-view event fires on mount. No newsletter-related events fire (those handlers were deleted).

- [ ] **Step 6: Regression spot-check other routes**

In the same browser session:
- `/discover` loads.
- `/events/new` (or whatever the event-creation route is) loads.
- Log in, `/events` and `/settings` load.
- Log out, return to `/`. Everything still works.

- [ ] **Step 7: Final commit (only if changes were made during verification)**

If any small fixes were needed during verification (a copy tweak, a style fix), commit them individually with descriptive messages. Otherwise, no commit is needed — this task is a verification gate, not a change set.

---

## Spec Coverage Check (for plan author only — not an execution step)

Cross-referencing the spec sections against tasks above:

- Scene angle hero copy kept as-is → no task needed (already correct in current file).
- CTA label unified to "Create your account" → Task 3.
- "see what's happening ↓" scroll link → Task 4.
- Scene section with 6 dummy cards → Task 6.
- Scene section mobile carousel → Task 7.
- Sticky mobile CTA bar with hero-based IntersectionObserver and safe-area inset → Task 8.
- Delete 3 showcase sections + "yes it's free" divider → Task 2.
- Delete newsletter footer + state + handler + toast → Task 1.
- Delete `SHOWCASE_SECTIONS` + 4 mock components → Task 2.
- Delete unused constants flagged by linter → Task 1 Step 8.
- Bundle 6 placeholder images in `public/landing/scene/` (with Unsplash fallback) → Task 5 + Task 6 toggle.
- Final CTA headline "Yes. Pullup." → Task 3.
- Verification: real phone, every CTA opens auth, no console errors, Lighthouse, analytics still flow, routes unaffected → Task 9.

Every spec requirement maps to at least one task.
