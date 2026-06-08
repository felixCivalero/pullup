// MessageStatusTicks — the WhatsApp-style delivery tick for an outbound Room
// bubble, unified across every channel:
//   sending   → a faint clock (optimistic, in flight)
//   sent      → one faint check
//   delivered → two faint checks
//   read      → two PINK checks (for email, "read" == they opened it)
//   failed    → a red "!" (didn't land — WhatsApp not reachable, email bounced)
//
// One language for WhatsApp, Instagram and email, so the host always knows,
// at a glance, whether their message actually got there.

import { Check, Clock, AlertCircle } from "lucide-react";

const LABEL = { sending: "Sending…", sent: "Sent", delivered: "Delivered", read: "Read", failed: "Not delivered" };

export default function MessageStatusTicks({ status, pink = "#ec178f", faint = "rgba(10,10,10,0.40)", size = 11 }) {
  if (!status) return null;
  const title = LABEL[status] || status;
  if (status === "failed") {
    return <AlertCircle size={size} title={title} style={{ color: "#dc2626" }} />;
  }
  if (status === "sending") {
    return <Clock size={size} title={title} style={{ color: faint }} />;
  }
  const color = status === "read" ? pink : faint;
  const doubled = status === "delivered" || status === "read";
  return (
    <span title={title} style={{ display: "inline-flex", alignItems: "center", color }}>
      <Check size={size} />
      {doubled && <Check size={size} style={{ marginLeft: -size * 0.55 }} />}
    </span>
  );
}
