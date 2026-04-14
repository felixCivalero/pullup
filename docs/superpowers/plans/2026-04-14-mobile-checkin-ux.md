# Mobile Check-In UX Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize the mobile check-in experience for speed and clarity — new users should be able to check guests in with zero learning curve.

**Architecture:** All changes are in one file: `frontend/src/pages/EventGuestsPage.jsx`. Three areas: simplify mobile guest cards, streamline the check-in modal, and add auto-clear search flow. No backend changes.

**Tech Stack:** React (inline styles, existing patterns)

---

### Task 1: Simplify Mobile Guest Cards

**Files:**
- Modify: `frontend/src/pages/EventGuestsPage.jsx:1180-1341` (mobile card layout)

Strip cards down to: name, party size, arrival status. Remove email, status badges, dinner tags, edit buttons.

- [ ] **Step 1: Replace the mobile card rendering**

In `frontend/src/pages/EventGuestsPage.jsx`, find the mobile card list starting at line 1180 (`<div className="guests-mobile-list"`). Replace the entire `.map()` callback (lines 1181-1341, from `{sortedGuests.map((g) => {` through the closing `})}`) with:

```jsx
{sortedGuests.map((g) => {
  const isConfirmed = g.bookingStatus === "CONFIRMED" || g.status === "attending";
  const partySize = g.partySize || 1;
  const wantsDinner = g.wantsDinner || g.dinner?.enabled || false;
  const dinnerPartySize = g.dinnerPartySize || g.dinner?.partySize || 0;
  const plusOnes = g.plusOnes ?? 0;
  const cocktailsPulledUp = g.cocktailOnlyPullUpCount ?? g.pulledUpForCocktails ?? 0;
  const dinnerPulledUp = g.dinnerPullUpCount ?? g.pulledUpForDinner ?? 0;

  // DPCS pull-up totals
  const cocktailOnlyMax = wantsDinner ? plusOnes : partySize;
  const totalExpected = (wantsDinner ? dinnerPartySize : 0) + cocktailOnlyMax;
  const totalArrived = dinnerPulledUp + cocktailsPulledUp;
  const allPulledUp = totalArrived > 0 && totalArrived >= totalExpected;
  const hasPartial = totalArrived > 0 && !allPulledUp;

  return (
    <div
      key={g.id}
      onClick={(e) => {
        if (e.target.closest("button")) return;
        handleRowClick(g, e);
      }}
      style={{
        background: allPulledUp
          ? "rgba(16, 185, 129, 0.06)"
          : hasPartial
          ? "rgba(245, 158, 11, 0.04)"
          : "rgba(20, 16, 30, 0.5)",
        borderRadius: "16px",
        border: allPulledUp
          ? "1px solid rgba(16, 185, 129, 0.2)"
          : hasPartial
          ? "1px solid rgba(245, 158, 11, 0.15)"
          : "1px solid rgba(255,255,255,0.08)",
        padding: "16px",
        cursor: isConfirmed && !allPulledUp ? "pointer" : "default",
        WebkitTapHighlightColor: "transparent",
        transition: "all 0.15s ease",
        opacity: allPulledUp ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {/* Left: Name + party size */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 600,
            fontSize: "17px",
            color: "#fff",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginBottom: "2px",
          }}>
            {g.name || "Guest"}
          </div>
          <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)" }}>
            {partySize} {partySize === 1 ? "guest" : "guests"}
          </div>
        </div>

        {/* Right: Arrival status */}
        <div style={{ flexShrink: 0, marginLeft: "12px", textAlign: "right" }}>
          {allPulledUp && (
            <div style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "#10b981",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}>
              <Check size={16} /> arrived
            </div>
          )}
          {hasPartial && (
            <div style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "#f59e0b",
            }}>
              {totalArrived}/{totalExpected} arrived
            </div>
          )}
          {!allPulledUp && !hasPartial && isConfirmed && (
            <div style={{
              fontSize: "12px",
              color: "rgba(255,255,255,0.3)",
              fontStyle: "italic",
            }}>
              tap to check in
            </div>
          )}
        </div>
      </div>
    </div>
  );
})}
```

- [ ] **Step 2: Filter out non-confirmed guests on mobile**

In `frontend/src/pages/EventGuestsPage.jsx`, the mobile card list iterates over `sortedGuests` (line 1181). The filtering already excludes cancelled guests (line 912-917), but waitlisted guests still show. For the mobile check-in view, we should only show confirmed guests. Find the mobile list `sortedGuests.map` and change it to filter:

```jsx
{sortedGuests.filter(g => g.bookingStatus === "CONFIRMED" || g.status === "attending").map((g) => {
```

Only change the mobile `.map()` — leave the desktop table's `.map()` unchanged.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/EventGuestsPage.jsx
git commit -m "feat: simplify mobile guest cards for check-in — name, party size, arrival status only"
```

---

### Task 2: Streamline the Check-In Modal

**Files:**
- Modify: `frontend/src/pages/EventGuestsPage.jsx:4044-4359` (PulledUpModal function)

Replace the current modal with a simpler version: name + party subtitle, single counter defaulting to remaining, one "Check in X" button.

- [ ] **Step 1: Replace the PulledUpModal function**

In `frontend/src/pages/EventGuestsPage.jsx`, replace the entire `PulledUpModal` function (lines 4044-4359) with:

```jsx
function PulledUpModal({ guest, event, onClose, onSave, onCheckInComplete }) {
  const [isMobileView] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);

  const totalGuests = guest.totalGuests ?? guest.partySize ?? 1;
  const dinnerPartySize = guest.dinner?.partySize ?? guest.dinnerPartySize ?? 0;
  const dinnerConfirmed =
    guest.dinner?.bookingStatus === "CONFIRMED" ||
    guest.dinnerStatus === "confirmed";
  const wantsDinner = guest.dinner?.enabled ?? guest.wantsDinner ?? false;
  const cocktailsMax =
    wantsDinner && dinnerConfirmed
      ? Math.max(0, totalGuests - dinnerPartySize)
      : totalGuests;
  const totalExpected = (wantsDinner && dinnerConfirmed ? dinnerPartySize : 0) + cocktailsMax;

  // Current arrival counts
  const alreadyCocktails = guest.cocktailOnlyPullUpCount ?? guest.pulledUpForCocktails ?? 0;
  const alreadyDinner = guest.dinnerPullUpCount ?? guest.pulledUpForDinner ?? 0;
  const alreadyArrived = alreadyCocktails + alreadyDinner;
  const remaining = Math.max(0, totalExpected - alreadyArrived);

  // Counter state — defaults to remaining (max out)
  const [checkInCount, setCheckInCount] = useState(remaining);
  const [loading, setLoading] = useState(false);

  async function handleCheckIn() {
    if (checkInCount <= 0) return;
    setLoading(true);

    try {
      // Distribute the check-in count across cocktails and dinner
      // Fill cocktails first, then dinner
      let toDistribute = checkInCount;
      let newCocktails = alreadyCocktails;
      let newDinner = alreadyDinner;

      if (wantsDinner && dinnerConfirmed) {
        // For dinner guests: fill dinner slots first, overflow to cocktails
        const dinnerRemaining = dinnerPartySize - alreadyDinner;
        const dinnerAdd = Math.min(toDistribute, dinnerRemaining);
        newDinner += dinnerAdd;
        toDistribute -= dinnerAdd;

        const cocktailRemaining = cocktailsMax - alreadyCocktails;
        const cocktailAdd = Math.min(toDistribute, cocktailRemaining);
        newCocktails += cocktailAdd;
      } else {
        // No dinner: all go to cocktails counter
        const cocktailRemaining = cocktailsMax - alreadyCocktails;
        newCocktails += Math.min(toDistribute, cocktailRemaining);
      }

      const success = await onSave(newDinner, newCocktails);
      if (success) {
        // Use onCheckInComplete (clears search + refocuses) instead of plain onClose
        if (onCheckInComplete) {
          onCheckInComplete();
        } else {
          onClose();
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const btnSize = isMobileView ? "60px" : "48px";
  const counterFontSize = isMobileView ? "32px" : "28px";
  const btnFontSize = isMobileView ? "28px" : "24px";

  return (
    <div
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0, 0, 0, 0.85)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: isMobileView ? "flex-end" : "center",
        justifyContent: "center",
        padding: isMobileView ? "0" : "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "rgba(12, 10, 18, 0.98)",
          backdropFilter: "blur(20px)",
          border: isMobileView ? "none" : "1px solid rgba(255,255,255,0.1)",
          borderRadius: isMobileView ? "24px 24px 0 0" : "24px",
          padding: isMobileView ? "24px 20px 36px" : "32px",
          maxWidth: isMobileView ? "100%" : "420px",
          width: "100%",
          boxShadow: "0 -10px 40px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag indicator for mobile */}
        {isMobileView && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
            <div style={{ width: "40px", height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.2)" }} />
          </div>
        )}

        {/* Guest name + party size */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div style={{
            fontSize: isMobileView ? "22px" : "20px",
            fontWeight: 700,
            color: "#fff",
            marginBottom: "4px",
          }}>
            {guest.name || "Guest"}
          </div>
          <div style={{
            fontSize: "14px",
            color: "rgba(255,255,255,0.45)",
          }}>
            {totalExpected} {totalExpected === 1 ? "guest" : "guests"}
            {alreadyArrived > 0 && ` · ${alreadyArrived} already arrived`}
          </div>
        </div>

        {/* Counter */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          marginBottom: "28px",
        }}>
          <button
            type="button"
            onClick={() => setCheckInCount(Math.max(0, checkInCount - 1))}
            disabled={checkInCount <= 0}
            style={{
              width: btnSize, height: btnSize,
              borderRadius: "14px",
              border: "none",
              background: checkInCount <= 0
                ? "rgba(255, 255, 255, 0.05)"
                : "rgba(255, 255, 255, 0.1)",
              color: checkInCount <= 0
                ? "rgba(255, 255, 255, 0.2)"
                : "#fff",
              fontSize: btnFontSize, fontWeight: 600,
              cursor: checkInCount <= 0 ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s ease",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            −
          </button>
          <div style={{
            fontSize: counterFontSize,
            fontWeight: 700,
            color: "#fff",
            minWidth: "60px",
            textAlign: "center",
          }}>
            {checkInCount}
          </div>
          <button
            type="button"
            onClick={() => setCheckInCount(Math.min(remaining, checkInCount + 1))}
            disabled={checkInCount >= remaining}
            style={{
              width: btnSize, height: btnSize,
              borderRadius: "14px",
              border: "none",
              background: checkInCount >= remaining
                ? "rgba(255, 255, 255, 0.05)"
                : "rgba(255, 255, 255, 0.1)",
              color: checkInCount >= remaining
                ? "rgba(255, 255, 255, 0.2)"
                : "#fff",
              fontSize: btnFontSize, fontWeight: 600,
              cursor: checkInCount >= remaining ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s ease",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            +
          </button>
        </div>

        {/* Check in button */}
        <button
          type="button"
          onClick={handleCheckIn}
          disabled={loading || checkInCount <= 0}
          style={{
            width: "100%",
            padding: isMobileView ? "18px" : "16px",
            borderRadius: "14px",
            border: "none",
            background: checkInCount <= 0
              ? "rgba(255, 255, 255, 0.05)"
              : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
            color: checkInCount <= 0
              ? "rgba(255, 255, 255, 0.3)"
              : "#fff",
            fontSize: isMobileView ? "17px" : "16px",
            fontWeight: 700,
            cursor: loading || checkInCount <= 0 ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
            WebkitTapHighlightColor: "transparent",
            transition: "all 0.15s ease",
          }}
        >
          {loading ? "Checking in..." : `Check in ${checkInCount}`}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/EventGuestsPage.jsx
git commit -m "feat: streamline check-in modal — single counter, one CTA, defaults to max"
```

---

### Task 3: Auto-Clear Search After Check-In

**Files:**
- Modify: `frontend/src/pages/EventGuestsPage.jsx` (search input + modal close flow)

After a successful check-in, clear the search field and keep it focused so the host can immediately type the next name.

- [ ] **Step 1: Add a ref for the search input**

Near the top of the `EventGuestsPage` component (around line 180, near other state declarations), add a ref:

```javascript
  const searchInputRef = useRef(null);
```

Make sure `useRef` is imported from React. Check the existing imports at the top of the file — it likely already imports `useRef`.

- [ ] **Step 2: Attach the ref to the search input**

Find the search input element (around line 1083). Add the ref:

```jsx
<input
  ref={searchInputRef}
  type="text"
  placeholder="Search guests by name or email..."
```

- [ ] **Step 3: Auto-focus search on page load (mobile)**

Add a useEffect near the other effects in the component:

```javascript
  // Auto-focus search on mobile for fast check-in flow
  useEffect(() => {
    if (window.innerWidth < 768 && searchInputRef.current) {
      // Small delay to ensure page is rendered
      setTimeout(() => searchInputRef.current?.focus(), 300);
    }
  }, [loading]); // Re-focus after initial load completes
```

- [ ] **Step 4: Clear search and refocus after check-in**

Find where `PulledUpModal` is rendered and its `onClose` callback. Search for `setPulledUpModalGuest(null)` — this is called when the modal closes. There should be a spot where the modal's `onSave` triggers `onClose`. 

The modal now calls `onClose()` immediately on success (no 600ms delay). We need to clear the search when the modal closes after a successful save. 

Find where `PulledUpModal` is used in the JSX (search for `<PulledUpModal` or `pulledUpModalGuest &&`). The `onClose` prop should stay as-is (just closes the modal). Add a new `onCheckInComplete` prop that also clears search and refocuses:

```jsx
onClose={() => setPulledUpModalGuest(null)}
onCheckInComplete={() => {
  setPulledUpModalGuest(null);
  setSearchQuery("");
  setTimeout(() => searchInputRef.current?.focus(), 100);
}}
```

This way, tapping the backdrop calls `onClose` (just dismisses), while a successful check-in calls `onCheckInComplete` (dismisses + clears search + refocuses for next guest).

- [ ] **Step 5: Add a clear button (X) inside the search input**

Wrap the search input in a relative container and add a clear button. Replace the search input `<div>` block (the one with `className="guests-search-sticky"`, around line 1076-1110) with:

```jsx
<div
  className="guests-search-sticky"
  style={{
    marginBottom: "24px",
    padding: "0 20px",
  }}
>
  <div style={{ position: "relative" }}>
    <input
      ref={searchInputRef}
      type="text"
      placeholder="Search guests by name..."
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      style={{
        width: "100%",
        padding: "14px 16px",
        paddingRight: searchQuery ? "44px" : "16px",
        borderRadius: "12px",
        border: "1px solid rgba(255,255,255,0.1)",
        background: "rgb(12 10 18 / 10%)",
        color: "#fff",
        fontSize: "16px",
        outline: "none",
        boxSizing: "border-box",
        transition: "all 0.2s ease",
        backdropFilter: "blur(10px)",
      }}
      onFocus={(e) => {
        e.target.style.borderColor = "rgba(192, 192, 192, 0.5)";
        e.target.style.background = "rgb(12 10 18 / 15%)";
      }}
      onBlur={(e) => {
        e.target.style.borderColor = "rgba(255,255,255,0.05)";
        e.target.style.background = "rgb(12 10 18 / 10%)";
      }}
    />
    {searchQuery && (
      <button
        type="button"
        onClick={() => {
          setSearchQuery("");
          searchInputRef.current?.focus();
        }}
        style={{
          position: "absolute",
          right: "8px",
          top: "50%",
          transform: "translateY(-50%)",
          background: "rgba(255,255,255,0.1)",
          border: "none",
          borderRadius: "8px",
          width: "32px",
          height: "32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: "rgba(255,255,255,0.5)",
          fontSize: "16px",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        ×
      </button>
    )}
  </div>
</div>
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/EventGuestsPage.jsx
git commit -m "feat: auto-clear search after check-in, add clear button, auto-focus on load"
```

---

### Task 4: Handle Fully-Arrived Guest Taps

**Files:**
- Modify: `frontend/src/pages/EventGuestsPage.jsx:733-748` (handleRowClick function)

When a fully-arrived guest is tapped, don't open the modal — there's nothing to do. The card already shows "arrived".

- [ ] **Step 1: Update handleRowClick to skip fully-arrived guests**

Replace the `handleRowClick` function (lines 733-748) with:

```javascript
  function handleRowClick(guest, e) {
    if (!canCheckIn) return;
    // Don't open modal if clicking on action buttons or inputs
    if (
      e.target.closest("button") ||
      e.target.closest("input") ||
      e.target.closest("select")
    ) {
      return;
    }
    // Only allow check-in for confirmed guests
    if (guest.bookingStatus !== "CONFIRMED" && guest.status !== "attending") {
      return;
    }
    // Skip if everyone already arrived
    const partySize = guest.partySize || 1;
    const wantsDinner = guest.wantsDinner || guest.dinner?.enabled || false;
    const dinnerPartySize = guest.dinnerPartySize || guest.dinner?.partySize || 0;
    const dinnerConfirmed = guest.dinner?.bookingStatus === "CONFIRMED" || guest.dinnerStatus === "confirmed";
    const plusOnes = guest.plusOnes ?? 0;
    const cocktailsMax = wantsDinner && dinnerConfirmed ? plusOnes : partySize;
    const totalExpected = (wantsDinner && dinnerConfirmed ? dinnerPartySize : 0) + cocktailsMax;
    const cocktailsPulledUp = guest.cocktailOnlyPullUpCount ?? guest.pulledUpForCocktails ?? 0;
    const dinnerPulledUp = guest.dinnerPullUpCount ?? guest.pulledUpForDinner ?? 0;
    const totalArrived = dinnerPulledUp + cocktailsPulledUp;
    if (totalArrived >= totalExpected) {
      return;
    }
    setPulledUpModalGuest(guest);
  }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/EventGuestsPage.jsx
git commit -m "feat: skip check-in modal for fully-arrived guests"
```

---

### Task 5: Build Verification

**Files:** None (testing only)

- [ ] **Step 1: Build the frontend**

```bash
cd /Users/felixcivalero/Projects/pullup/frontend && npx vite build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Visual check on mobile**

Start the dev server and open the guests page on a phone or mobile simulator:

1. Search filters as you type
2. Cards show name + party size + arrival status only
3. Tap a card → bottom sheet with counter defaulting to max
4. Tap "Check in X" → sheet closes, search clears, input focused
5. Tap an arrived guest → nothing happens (no modal)
6. Clear button (X) in search works

- [ ] **Step 3: Verify partial check-in flow**

1. Check in 2 of a party of 4
2. Card shows "2/4 arrived"
3. Tap card again → counter defaults to 2 (remaining)
4. Check in 2 more → card shows "arrived" with green check

- [ ] **Step 4: Verify desktop is unchanged**

Open the guests page on desktop (>768px). The full table should render exactly as before — no changes to desktop layout, columns, or behavior.
