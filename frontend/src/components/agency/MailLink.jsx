import { useEffect, useRef, useState } from "react";
import { CONTACT } from "./agencyData.js";
import { useT } from "./i18n.js";

/* Felix's address as a link. A bare mailto: does nothing for visitors with no
   mail app set up (most webmail users) — reported 2026-10-21. So a click also
   copies the address and says so for a moment; the mail app still opens where
   there is one. */
export function MailLink({ className }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <a
      className={className}
      href={`mailto:${CONTACT}`}
      onClick={() => {
        navigator.clipboard?.writeText(CONTACT).then(
          () => {
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 2400);
          },
          () => {},
        );
      }}
    >
      <span aria-live="polite">{copied ? t("Address copied — paste it into your email") : CONTACT}</span>
    </a>
  );
}
