// The top of the Room holds ONE control: the host's Room access fold-down —
// nothing else. The Room should feel like a room, not an event dashboard, so
// the old Add-to-calendar / Live event-chrome was removed. `trailing` is the
// Room access node (host-only); a guest gets nothing here, so the row vanishes.
export function EventQuickActions({ trailing = null }) {
  if (!trailing) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {trailing}
    </div>
  );
}
