import { colors } from "../theme/colors.js";

const s = {
  page: { minHeight: "100vh", background: colors.background, color: "#fff", padding: "80px clamp(16px, 5vw, 40px) 60px" },
  wrap: { maxWidth: 720, margin: "0 auto", lineHeight: 1.7 },
  h1: { fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 800, marginBottom: 8 },
  updated: { fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 40 },
  h2: { fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 12 },
  p: { fontSize: 14, color: "rgba(255,255,255,0.7)", marginBottom: 14 },
  ul: { fontSize: 14, color: "rgba(255,255,255,0.7)", paddingLeft: 24, marginBottom: 14 },
  li: { marginBottom: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 20 },
  th: { textAlign: "left", padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.85)", fontWeight: 600 },
  td: { padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  back: { display: "inline-block", marginBottom: 24, fontSize: 13, color: "rgba(255,255,255,0.5)", textDecoration: "none" },
};

export function CookiesPage() {
  return (
    <div style={s.page}>
      <div style={s.wrap}>
        <a href="/" style={s.back}>&larr; Back to PullUp</a>
        <h1 style={s.h1}>Cookie & Data Storage Policy</h1>
        <p style={s.updated}>Last updated: March 10, 2026</p>

        <p style={s.p}>
          PullUp takes a minimal approach to client-side data storage. We do not use traditional HTTP cookies for tracking or advertising. This page explains exactly what data is stored in your browser.
        </p>

        <h2 style={s.h2}>1. What we use instead of cookies</h2>
        <p style={s.p}>
          PullUp uses <strong>browser local storage</strong> (not cookies) for a small number of essential functions. Local storage is similar to cookies but is not sent to our servers with every request — it stays in your browser.
        </p>

        <h2 style={s.h2}>2. What we store</h2>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Name</th>
              <th style={s.th}>Type</th>
              <th style={s.th}>Purpose</th>
              <th style={s.th}>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={s.td}>Supabase auth token</td>
              <td style={s.td}>Local storage</td>
              <td style={s.td}>Keeps you logged in between visits</td>
              <td style={s.td}>Until you log out</td>
            </tr>
            <tr>
              <td style={s.td}>pullup_visitor_id</td>
              <td style={s.td}>Local storage</td>
              <td style={s.td}>Anonymous visitor identifier for page view analytics. Not linked to your account.</td>
              <td style={s.td}>Persistent</td>
            </tr>
          </tbody>
        </table>

        <h2 style={s.h2}>3. What we do NOT use</h2>
        <ul style={s.ul}>
          <li style={s.li}>No advertising cookies</li>
          <li style={s.li}>No third-party tracking cookies (no Google Analytics, no Facebook Pixel)</li>
          <li style={s.li}>No cross-site tracking</li>
          <li style={s.li}>No fingerprinting</li>
        </ul>

        <h2 style={s.h2}>4. Third-party services</h2>
        <p style={s.p}>Some third-party services we use may set their own storage:</p>
        <ul style={s.ul}>
          <li style={s.li}><strong>Supabase:</strong> Authentication tokens stored in local storage to maintain your session.</li>
          <li style={s.li}><strong>Stripe:</strong> When processing payments, Stripe may use its own cookies and local storage as required for fraud prevention and payment processing. See <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.85)" }}>Stripe's privacy policy</a>.</li>
          <li style={s.li}><strong>Google Maps:</strong> When used for location autocomplete, Google may set cookies as described in <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.85)" }}>Google's privacy policy</a>.</li>
        </ul>

        <h2 style={s.h2}>5. Email tracking</h2>
        <p style={s.p}>
          Emails sent from PullUp (newsletters, invitations, reminders) may contain a small transparent tracking pixel and tracked links. These allow us to measure email open rates and click-through rates to improve our communications. This tracking does not use cookies and does not track you across other websites.
        </p>

        <h2 style={s.h2}>6. Managing your data</h2>
        <p style={s.p}>
          You can clear all PullUp data from your browser by clearing your local storage in your browser's developer tools or settings. This will log you out and reset your anonymous visitor ID.
        </p>
        <p style={s.p}>
          To unsubscribe from email tracking, use the unsubscribe link in any PullUp email.
        </p>

        <h2 style={s.h2}>7. Contact</h2>
        <p style={s.p}>
          Questions about our data practices? Email us at <strong>hello@pullup.se</strong>.
        </p>
      </div>
    </div>
  );
}
