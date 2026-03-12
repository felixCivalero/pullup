import { useState, useEffect, useRef } from "react";
import { colors } from "../theme/colors.js";

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function isSameDay(a, b) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isInRange(day, start, end) {
  if (!start || !end) return false;
  const t = day.getTime();
  return t > start.getTime() && t < end.getTime();
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getMonthDays(year, month) {
  const firstDay = new Date(year, month, 1);
  // Monday = 0, Sunday = 6
  let startPad = firstDay.getDay() - 1;
  if (startPad < 0) startPad = 6;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];

  // Padding days from previous month
  for (let i = startPad - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, outside: true });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ date: new Date(year, month, i), outside: false });
  }

  // Padding to fill last row
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), outside: true });
    }
  }

  return days;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const QUICK_RANGES = [
  { label: "This week", getRange: () => {
    const now = new Date();
    const today = startOfDay(now);
    const day = today.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return [today > monday ? today : monday, sunday];
  }},
  { label: "Next week", getRange: () => {
    const now = new Date();
    const today = startOfDay(now);
    const day = today.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const nextMon = new Date(today);
    nextMon.setDate(today.getDate() + mondayOffset + 7);
    const nextSun = new Date(nextMon);
    nextSun.setDate(nextMon.getDate() + 6);
    return [nextMon, nextSun];
  }},
  { label: "Next 2 weeks", getRange: () => {
    const today = startOfDay(new Date());
    const end = new Date(today);
    end.setDate(today.getDate() + 14);
    return [today, end];
  }},
  { label: "This month", getRange: () => {
    const now = new Date();
    const today = startOfDay(now);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return [today, endOfMonth];
  }},
];

export function DateRangePicker({ startDate, endDate, onChange, onClear, allowPast = false, blockFuture = false, quickRanges: customQuickRanges }) {
  const [open, setOpen] = useState(false);
  // Draft state — only committed on Apply
  const [draftStart, setDraftStart] = useState(startDate);
  const [draftEnd, setDraftEnd] = useState(endDate);
  const [selecting, setSelecting] = useState(null); // null | "start" | "end"
  const [hoveredDate, setHoveredDate] = useState(null);
  const [viewDate, setViewDate] = useState(() => {
    const base = startDate || new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });
  const ref = useRef(null);

  // Sync draft when opening
  function openPicker() {
    setDraftStart(startDate);
    setDraftEnd(endDate);
    setSelecting(null);
    setHoveredDate(null);
    const base = startDate || new Date();
    setViewDate({ year: base.getFullYear(), month: base.getMonth() });
    setOpen(true);
  }

  function closePicker() {
    setOpen(false);
    setSelecting(null);
    setHoveredDate(null);
  }

  function handleApply() {
    onChange(draftStart, draftEnd);
    closePicker();
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        closePicker();
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
    };
  }, [open]);

  const activeQuickRanges = customQuickRanges || QUICK_RANGES;

  function handleDayClick(date) {
    if (!allowPast && date < startOfDay(new Date())) return; // Can't select past dates
    if (blockFuture && date > startOfDay(new Date())) return; // Can't select future dates

    if (!selecting || selecting === "start" || (draftStart && draftEnd)) {
      // Starting a new selection
      setDraftStart(date);
      setDraftEnd(null);
      setSelecting("end");
    } else {
      // Picking end date
      if (date < draftStart) {
        setDraftStart(date);
        setDraftEnd(draftStart);
      } else {
        setDraftEnd(date);
      }
      setSelecting(null);
      setHoveredDate(null);
    }
  }

  function handleQuickRange(getRange) {
    const [s, e] = getRange();
    setDraftStart(s);
    setDraftEnd(e);
    setSelecting(null);
    setHoveredDate(null);
  }

  function prevMonth() {
    setViewDate((v) => {
      if (v.month === 0) return { year: v.year - 1, month: 11 };
      return { ...v, month: v.month - 1 };
    });
  }

  function nextMonth() {
    setViewDate((v) => {
      if (v.month === 11) return { year: v.year + 1, month: 0 };
      return { ...v, month: v.month + 1 };
    });
  }

  // Compute months to show (current + next)
  const month1 = getMonthDays(viewDate.year, viewDate.month);
  const nextMonthDate =
    viewDate.month === 11
      ? { year: viewDate.year + 1, month: 0 }
      : { year: viewDate.year, month: viewDate.month + 1 };
  const month2 = getMonthDays(nextMonthDate.year, nextMonthDate.month);

  const today = startOfDay(new Date());

  // Determine visual range for highlighting
  const visualEnd =
    selecting === "end" && hoveredDate && draftStart
      ? hoveredDate
      : draftEnd;

  function formatShort(d) {
    if (!d) return "";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  const hasRange = startDate && endDate;
  const label = hasRange
    ? `${formatShort(startDate)} – ${formatShort(endDate)}`
    : startDate
      ? `${formatShort(startDate)} – ...`
      : "Dates";

  function renderMonth(days, year, month) {
    return (
      <div style={{ flex: "1 1 0", minWidth: 0 }}>
        <div
          style={{
            textAlign: "center",
            fontSize: "13px",
            fontWeight: 600,
            color: "#fff",
            marginBottom: "12px",
          }}
        >
          {MONTH_NAMES[month]} {year}
        </div>

        {/* Day headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: "0",
            marginBottom: "4px",
          }}
        >
          {DAYS.map((d) => (
            <div
              key={d}
              style={{
                textAlign: "center",
                fontSize: "10px",
                color: colors.textFaded,
                fontWeight: 500,
                padding: "4px 0",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: "0",
          }}
        >
          {days.map(({ date, outside }, i) => {
            const isPast = !allowPast && date < today && !isSameDay(date, today);
            const isFuture = blockFuture && date > today && !isSameDay(date, today);
            const isStart = isSameDay(date, draftStart);
            const isEnd = isSameDay(date, visualEnd);
            const inRange = isInRange(
              date,
              draftStart,
              visualEnd
            );
            const isToday = isSameDay(date, today);

            return (
              <button
                key={i}
                onClick={() => !outside && !isPast && !isFuture && handleDayClick(date)}
                onMouseEnter={() => {
                  if (selecting === "end" && !outside && !isPast && !isFuture) {
                    setHoveredDate(date);
                  }
                }}
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "none",
                  cursor: outside || isPast || isFuture ? "default" : "pointer",
                  padding: 0,
                  fontSize: "13px",
                  fontWeight: isStart || isEnd ? 700 : 400,
                  transition: "all 0.1s ease",
                  borderRadius:
                    isStart && isEnd
                      ? "999px"
                      : isStart
                        ? "999px 0 0 999px"
                        : isEnd
                          ? "0 999px 999px 0"
                          : "0",
                  background:
                    isStart || isEnd
                      ? "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)"
                      : inRange
                        ? "rgba(192, 192, 192, 0.12)"
                        : "transparent",
                  color:
                    isStart || isEnd
                      ? "#05040a"
                      : outside || isPast || isFuture
                        ? "rgba(255,255,255,0.15)"
                        : inRange
                          ? "#fff"
                          : "rgba(255,255,255,0.8)",
                }}
              >
                {date.getDate()}
                {isToday && !isStart && !isEnd && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "3px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: "3px",
                      height: "3px",
                      borderRadius: "50%",
                      background: colors.silver,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      {/* Trigger button */}
      <button
        onClick={() => {
          if (open) closePicker();
          else openPicker();
        }}
        style={{
          padding: "7px 12px",
          borderRadius: "999px",
          border: "none",
          background: hasRange || startDate
            ? "rgba(192,192,192,0.12)"
            : "rgba(255,255,255,0.04)",
          color: hasRange || startDate ? colors.silverText : colors.textFaded,
          fontSize: "12px",
          fontWeight: hasRange ? 600 : 400,
          cursor: "pointer",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        {label}
      </button>

      {/* Dropdown calendar */}
      {open && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          {/* Backdrop */}
          <div
            onClick={closePicker}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(4px)",
            }}
          />

          {/* Calendar panel */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              background: "rgba(12, 10, 18, 0.97)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "20px",
              padding: "clamp(16px, 4vw, 24px)",
              width: "100%",
              maxWidth: "580px",
              maxHeight: "90vh",
              overflowY: "auto",
              animation: "calendarIn 0.2s ease",
            }}
          >
            {/* Header with nav */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "16px",
              }}
            >
              <button
                onClick={prevMonth}
                style={navBtnStyle}
              >
                ‹
              </button>
              <div style={{ fontSize: "11px", color: colors.textFaded, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {selecting === "end" ? "Select end date" : startDate && !endDate ? "Select end date" : "Select dates"}
              </div>
              <button
                onClick={nextMonth}
                style={navBtnStyle}
              >
                ›
              </button>
            </div>

            {/* Two month grid */}
            <div
              style={{
                display: "flex",
                gap: "clamp(12px, 3vw, 24px)",
                flexWrap: "wrap",
              }}
            >
              {renderMonth(month1, viewDate.year, viewDate.month)}
              {renderMonth(month2, nextMonthDate.year, nextMonthDate.month)}
            </div>

            {/* Quick ranges */}
            <div
              style={{
                display: "flex",
                gap: "6px",
                flexWrap: "wrap",
                marginTop: "16px",
                paddingTop: "16px",
                borderTop: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {activeQuickRanges.map((qr) => (
                <button
                  key={qr.label}
                  onClick={() => handleQuickRange(qr.getRange)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "999px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "transparent",
                    color: colors.textFaded,
                    fontSize: "11px",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    whiteSpace: "nowrap",
                  }}
                >
                  {qr.label}
                </button>
              ))}

              {(draftStart || draftEnd) && (
                <button
                  onClick={() => {
                    setDraftStart(null);
                    setDraftEnd(null);
                    setSelecting(null);
                    setHoveredDate(null);
                  }}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "999px",
                    border: "1px solid rgba(239,68,68,0.2)",
                    background: "rgba(239,68,68,0.06)",
                    color: "rgba(239,68,68,0.7)",
                    fontSize: "11px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Clear
                </button>
              )}

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* Apply button */}
              <button
                onClick={handleApply}
                style={{
                  padding: "8px 20px",
                  borderRadius: "999px",
                  border: "none",
                  background:
                    draftStart
                      ? "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)"
                      : "rgba(255,255,255,0.06)",
                  color: draftStart ? "#05040a" : colors.textFaded,
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: draftStart ? "pointer" : "default",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s ease",
                  boxShadow: draftStart
                    ? "0 4px 12px rgba(192, 192, 192, 0.3)"
                    : "none",
                }}
              >
                Apply
              </button>
            </div>
          </div>

          <style>{`
            @keyframes calendarIn {
              from { opacity: 0; transform: scale(0.95); }
              to { opacity: 1; transform: scale(1); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}

const navBtnStyle = {
  width: "32px",
  height: "32px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "transparent",
  color: "rgba(255,255,255,0.6)",
  fontSize: "18px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
