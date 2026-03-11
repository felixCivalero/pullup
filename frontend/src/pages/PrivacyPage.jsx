import { colors } from "../theme/colors.js";

const s = {
  page: { minHeight: "100vh", background: colors.background, color: "#fff", padding: "80px clamp(16px, 5vw, 40px) 60px" },
  wrap: { maxWidth: 720, margin: "0 auto", lineHeight: 1.7 },
  h1: { fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 800, marginBottom: 8 },
  updated: { fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 40 },
  h2: { fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 12 },
  h3: { fontSize: 16, fontWeight: 600, marginTop: 24, marginBottom: 8 },
  p: { fontSize: 14, color: "rgba(255,255,255,0.7)", marginBottom: 14 },
  ul: { fontSize: 14, color: "rgba(255,255,255,0.7)", paddingLeft: 24, marginBottom: 14 },
  li: { marginBottom: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 20 },
  th: { textAlign: "left", padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.85)", fontWeight: 600 },
  td: { padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  back: { display: "inline-block", marginBottom: 24, fontSize: 13, color: "rgba(255,255,255,0.5)", textDecoration: "none" },
};

export function PrivacyPage() {
  return (
    <div style={s.page}>
      <div style={s.wrap}>
        <a href="/" style={s.back}>&larr; Back to PullUp</a>
        <h1 style={s.h1}>Privacy Policy</h1>
        <p style={s.updated}>Last updated: March 11, 2026</p>

        <p style={s.p}>
          PullUp ("we", "us", "our") operates the pullup.se platform. This policy describes what personal data we collect, why we collect it, and how we handle it. We are committed to protecting your privacy and complying with the EU General Data Protection Regulation (GDPR).
        </p>

        <h2 style={s.h2}>1. Who we are</h2>
        <p style={s.p}>
          PullUp is an event platform based in Stockholm, Sweden. If you have questions about your data, contact us at <strong>hello@pullup.se</strong>.
        </p>

        <h2 style={s.h2}>2. What data we collect</h2>

        <h3 style={s.h3}>Account data</h3>
        <p style={s.p}>When you create an account, we collect:</p>
        <ul style={s.ul}>
          <li style={s.li}>Email address</li>
          <li style={s.li}>Password (stored hashed, never in plain text)</li>
          <li style={s.li}>Name (optional, if you add it to your profile)</li>
          <li style={s.li}>Profile picture (optional)</li>
          <li style={s.li}>Social media links (optional, e.g. Instagram, Spotify)</li>
        </ul>
        <p style={s.p}>If you sign in with Google, we receive your email address and basic profile information from Google.</p>

        <h3 style={s.h3}>Event and RSVP data</h3>
        <p style={s.p}>When you create events or RSVP, we collect:</p>
        <ul style={s.ul}>
          <li style={s.li}>Event details (title, description, date, location)</li>
          <li style={s.li}>Guest information (name, email, phone if provided, dietary restrictions)</li>
          <li style={s.li}>RSVP status and attendance records</li>
          <li style={s.li}>Event images you upload</li>
        </ul>

        <h3 style={s.h3}>Payment data</h3>
        <p style={s.p}>
          For paid events, payments are processed by <strong>Stripe</strong>. We do not store your card details. Stripe handles all payment information under their own privacy policy. We store transaction records (amount, status, receipt link) to manage your bookings.
        </p>

        <h3 style={s.h3}>Newsletter data</h3>
        <p style={s.p}>If you subscribe to our newsletter, we collect your email address, selected cities, and interest categories (e.g. music, culture, arts). We only send marketing emails after you give explicit consent by checking the consent box on the signup form.</p>

        <h3 style={s.h3}>Automatically collected data</h3>
        <ul style={s.ul}>
          <li style={s.li}><strong>Page views:</strong> We track visits to event pages and our landing page using an anonymous visitor identifier stored in your browser's local storage. This is not a cookie.</li>
          <li style={s.li}><strong>Device and referrer information:</strong> Device type, referrer URL, and UTM campaign parameters for understanding how visitors find events.</li>
          <li style={s.li}><strong>Email engagement:</strong> When we send emails (newsletters, event invitations, reminders), we may track whether emails are opened and which links are clicked. This helps us improve our communications.</li>
          <li style={s.li}><strong>IP address and user agent:</strong> Recorded with email opens/clicks and page views for analytics and security purposes.</li>
        </ul>

        <h2 style={s.h2}>3. Why we collect your data</h2>
        <table style={s.table}>
          <thead>
            <tr><th style={s.th}>Purpose</th><th style={s.th}>Legal basis (GDPR)</th></tr>
          </thead>
          <tbody>
            <tr><td style={s.td}>Providing the platform (accounts, events, RSVPs)</td><td style={s.td}>Contract performance</td></tr>
            <tr><td style={s.td}>Processing payments</td><td style={s.td}>Contract performance</td></tr>
            <tr><td style={s.td}>Sending transactional emails (confirmations, reminders)</td><td style={s.td}>Contract performance</td></tr>
            <tr><td style={s.td}>Sending newsletters and event invitations</td><td style={s.td}>Consent (you subscribe voluntarily)</td></tr>
            <tr><td style={s.td}>Analytics and platform improvement</td><td style={s.td}>Legitimate interest</td></tr>
            <tr><td style={s.td}>Email engagement tracking</td><td style={s.td}>Legitimate interest</td></tr>
            <tr><td style={s.td}>Fraud prevention and security</td><td style={s.td}>Legitimate interest</td></tr>
          </tbody>
        </table>

        <h2 style={s.h2}>4. Third-party services</h2>
        <p style={s.p}>We use the following services to operate PullUp:</p>
        <table style={s.table}>
          <thead>
            <tr><th style={s.th}>Service</th><th style={s.th}>Purpose</th><th style={s.th}>Data shared</th></tr>
          </thead>
          <tbody>
            <tr><td style={s.td}>Supabase</td><td style={s.td}>Database, authentication, file storage</td><td style={s.td}>All account and event data</td></tr>
            <tr><td style={s.td}>Stripe</td><td style={s.td}>Payment processing</td><td style={s.td}>Payment details, email, event metadata</td></tr>
            <tr><td style={s.td}>Amazon SES</td><td style={s.td}>Email delivery</td><td style={s.td}>Recipient email, email content</td></tr>
            <tr><td style={s.td}>Google</td><td style={s.td}>OAuth sign-in, location autocomplete</td><td style={s.td}>Email (OAuth), location search queries</td></tr>
          </tbody>
        </table>
        <p style={s.p}>We do not sell your data to any third party. We do not use advertising trackers, Facebook pixels, or Google Analytics.</p>

        <h2 style={s.h2}>5. Data storage and security</h2>
        <p style={s.p}>
          Your data is stored on servers within the EU. All data is encrypted in transit (TLS) and at rest. Passwords are hashed using industry-standard algorithms. We use role-based access controls and do not expose sensitive keys to the frontend.
        </p>

        <h2 style={s.h2}>6. Data retention</h2>
        <p style={s.p}>
          We keep your account data for as long as your account is active. If you delete your account, we will remove your personal data within 30 days. Anonymized analytics data (page views, aggregate stats) may be retained indefinitely. Payment records are retained as required by Swedish accounting law (7 years).
        </p>

        <h2 style={s.h2}>7. Your rights</h2>
        <p style={s.p}>Under GDPR, you have the right to:</p>
        <ul style={s.ul}>
          <li style={s.li}><strong>Access</strong> your personal data</li>
          <li style={s.li}><strong>Correct</strong> inaccurate data</li>
          <li style={s.li}><strong>Delete</strong> your data ("right to be forgotten")</li>
          <li style={s.li}><strong>Export</strong> your data in a portable format</li>
          <li style={s.li}><strong>Object</strong> to processing based on legitimate interest</li>
          <li style={s.li}><strong>Withdraw consent</strong> for newsletters at any time</li>
        </ul>
        <p style={s.p}>To exercise any of these rights, email us at <strong>hello@pullup.se</strong>. We will respond within 30 days.</p>

        <h2 style={s.h2}>8. Consent</h2>
        <p style={s.p}>
          We collect explicit consent before sending you marketing emails. When you subscribe to our newsletter or opt in to event updates, we record what you agreed to, the timestamp, and your selections. You can withdraw consent at any time by:
        </p>
        <ul style={s.ul}>
          <li style={s.li}>Clicking the unsubscribe link in any email</li>
          <li style={s.li}>Emailing us at <strong>hello@pullup.se</strong></li>
        </ul>
        <p style={s.p}>
          Transactional emails (RSVP confirmations, payment receipts, event reminders) are sent as part of the service you use and do not require separate consent. These cannot be opted out of while you have an active booking or account.
        </p>

        <h2 style={s.h2}>9. Email tracking</h2>
        <p style={s.p}>
          Our emails may contain a small tracking pixel and redirected links to measure whether emails are opened and which links are clicked. We also record IP address and browser information with these events. This data is used to improve our communications and is processed under legitimate interest. You can opt out of all marketing emails at any time, which stops all tracking.
        </p>

        <h2 style={s.h2}>10. Children</h2>
        <p style={s.p}>PullUp is not intended for children under 16. We do not knowingly collect data from children.</p>

        <h2 style={s.h2}>11. Changes to this policy</h2>
        <p style={s.p}>We may update this policy from time to time. Significant changes will be communicated via email or a notice on the platform.</p>

        <h2 style={s.h2}>12. Contact</h2>
        <p style={s.p}>
          PullUp<br />
          Stockholm, Sweden<br />
          <strong>hello@pullup.se</strong>
        </p>
      </div>
    </div>
  );
}
