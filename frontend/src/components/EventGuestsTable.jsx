// frontend/src/components/EventGuestsTable.jsx
// Presentational table for event guests list (host view)

import { CombinedStatusBadge } from "../pages/EventGuestsPage.jsx";
import { formatEventTime, formatEventDate } from "../lib/dateUtils.js";

function SortableHeader({
  column,
  label,
  sortColumn,
  sortDirection,
  onSort,
  align = "left",
}) {
  const isActive = sortColumn === column;
  const direction = isActive ? sortDirection : null;

  return (
    <th
      onClick={() => onSort(column)}
      style={{
        padding: "18px 24px",
        textAlign: align,
        fontSize: "11px",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        color: isActive ? "#fff" : "rgba(249, 250, 251, 0.8)",
      }}
    >
      <span>{label}</span>
      <span
        style={{
          marginLeft: "6px",
          opacity: isActive ? 1 : 0.6,
          fontSize: "10px",
        }}
      >
        {direction === "asc" && "▲"}
        {direction === "desc" && "▼"}
        {!direction && "⇅"}
      </span>
    </th>
  );
}

export function EventGuestsTable({
  event,
  sortedGuests,
  searchQuery,
  sortColumn,
  sortDirection,
  onSort,
  onRowClick,
}) {
  if (sortedGuests.length === 0) {
    return (
      <div
        style={{
          background: "rgb(12 10 18 / 10%)",
          padding: "40px 24px",
          borderRadius: "16px",
          textAlign: "center",
          border: "1px solid rgba(255,255,255,0.05)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div
          style={{
            fontSize: "48px",
            marginBottom: "16px",
            opacity: 0.5,
          }}
        >
          👥
        </div>
        <div style={{ fontSize: "16px", opacity: 0.7 }}>
          {searchQuery.trim()
            ? `No guests found matching "${searchQuery}"`
            : "No guests yet."}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "rgba(20, 16, 30, 0.5)",
        borderRadius: "20px",
        border: "1px solid rgba(255,255,255,0.08)",
        overflow: "hidden",
        overflowX: "auto",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          minWidth: "1000px",
        }}
      >
        <thead>
          <tr
            style={{
              background:
                "linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(236, 72, 153, 0.1) 100%)",
              borderBottom: "2px solid rgba(139, 92, 246, 0.3)",
            }}
          >
            <SortableHeader
              column="guest"
              label="Guest"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={onSort}
              align="left"
            />
            <SortableHeader
              column="status"
              label="Status"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={onSort}
              align="left"
            />
            {event.dinnerEnabled && (
              <>
                <SortableHeader
                  column="cocktailList"
                  label="Cocktail List"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={onSort}
                  align="center"
                />
                <SortableHeader
                  column="dinnerParty"
                  label="Dinner Party"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={onSort}
                  align="center"
                />
                <SortableHeader
                  column="totalAttending"
                  label="Total Attending"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={onSort}
                  align="center"
                />
                <SortableHeader
                  column="dinnerTime"
                  label="Dinner Time"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={onSort}
                  align="center"
                />
              </>
            )}
            {!event.dinnerEnabled && (
              <SortableHeader
                column="totalAttending"
                label="Total Guests"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                align="center"
              />
            )}
            <SortableHeader
              column="rsvpDate"
              label="RSVP Date"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={onSort}
              align="right"
            />
            <th
              style={{
                padding: "20px 24px",
                textAlign: "center",
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                opacity: 0.95,
                color: "#fff",
                width: "140px",
              }}
            >
              Pulled Up
            </th>
            <th
              style={{
                padding: "20px 24px",
                textAlign: "center",
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                opacity: 0.95,
                color: "#fff",
                width: "120px",
              }}
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedGuests.map((g, idx) => (
            <tr
              key={g.id}
              onClick={(e) => onRowClick(g, e)}
              style={{
                borderBottom:
                  idx < sortedGuests.length - 1
                    ? "1px solid rgba(255,255,255,0.06)"
                    : "none",
                transition: "all 0.2s ease",
                background:
                  idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(139, 92, 246, 0.08)";
                e.currentTarget.style.transform = "scale(1.002)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <td style={{ padding: "20px 24px" }}>
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: "6px",
                    fontSize: "15px",
                    color: "#fff",
                  }}
                >
                  {g.name || "—"}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    opacity: 0.7,
                    wordBreak: "break-word",
                    color: "#e5e7eb",
                  }}
                >
                  {g.email}
                </div>
              </td>
              <td style={{ padding: "20px 24px" }}>
                <CombinedStatusBadge guest={g} />
              </td>
              {event.dinnerEnabled && (
                <>
                  <td
                    style={{
                      padding: "20px 24px",
                      textAlign: "center",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {g.partySize || 1}
                  </td>
                  <td
                    style={{
                      padding: "20px 24px",
                      textAlign: "center",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {g.dinnerPartySize || 0}
                  </td>
                  <td
                    style={{
                      padding: "20px 24px",
                      textAlign: "center",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {g.totalGuests ?? g.partySize ?? 1}
                  </td>
                  <td
                    style={{
                      padding: "20px 24px",
                      textAlign: "center",
                      fontSize: "13px",
                      opacity: 0.85,
                    }}
                  >
                    {g.dinnerTimeSlot ? formatEventTime(g.dinnerTimeSlot) : "—"}
                  </td>
                </>
              )}
              {!event.dinnerEnabled && (
                <td
                  style={{
                    padding: "20px 24px",
                    textAlign: "center",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {g.totalGuests ?? g.partySize ?? 1}
                </td>
              )}
              <td
                style={{
                  padding: "20px 24px",
                  textAlign: "right",
                  fontSize: "13px",
                  opacity: 0.85,
                  whiteSpace: "nowrap",
                }}
              >
                {g.createdAt ? formatEventDate(g.createdAt) : "—"}
              </td>
              <td
                style={{
                  padding: "16px 24px",
                  textAlign: "center",
                }}
              >
                {/* Placeholder: pulled up controls remain managed in page for now */}
                {/* The actual controls are still in EventGuestsPage to avoid over-refactor in one step */}
              </td>
              <td
                style={{
                  padding: "16px 24px",
                  textAlign: "center",
                }}
              >
                {/* Placeholder: actions (edit, delete) remain in EventGuestsPage for now */}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
