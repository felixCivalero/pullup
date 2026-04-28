export default function SegmentPanel({
  effectiveRecipientCount,
  excludedRecipientIds,
  setExcludedRecipientIds,
  segmentRecipients,
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: "10px",
        background: "rgba(34,197,94,0.08)",
        border: "1px solid rgba(34,197,94,0.25)",
        fontSize: "13px",
        marginBottom: "16px",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: "4px", display: "flex", alignItems: "baseline", gap: "8px" }}>
        <span
          style={{
            fontSize: "24px",
            fontWeight: 700,
            color: "#4ade80",
          }}
        >
          {effectiveRecipientCount.toLocaleString()}
        </span>
        <span style={{ fontSize: "13px", opacity: 0.7 }}>
          {effectiveRecipientCount === 1 ? "recipient" : "recipients"}{excludedRecipientIds.size > 0 ? ` (${excludedRecipientIds.size} excluded)` : ""}
        </span>
      </div>
      <div
        style={{
          marginTop: "10px",
          maxHeight: "140px",
          overflowY: "auto",
          paddingRight: "4px",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        {segmentRecipients.length === 0 ? (
          <div
            style={{
              fontSize: "12px",
              opacity: 0.7,
              fontStyle: "italic",
            }}
          >
            Loading recipients for this segment…
          </div>
        ) : (
          segmentRecipients
            .filter((p) => !excludedRecipientIds.has(p.id))
            .map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  borderRadius: "999px",
                  background: "rgba(12,10,18,0.9)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontSize: "12px",
                }}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    marginRight: "8px",
                  }}
                >
                  {p.email || "Unknown contact"}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExcludedRecipientIds((prev) => {
                      const next = new Set(prev);
                      next.add(p.id);
                      return next;
                    });
                  }}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: "none",
                    background: "rgba(239,68,68,0.25)",
                    color: "#fecaca",
                    fontSize: "11px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ×
                </button>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
