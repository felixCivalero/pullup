import { colors } from "../theme/colors.js";

const s = {
  page: { minHeight: "100vh", background: colors.background, color: colors.text, padding: "80px clamp(16px, 5vw, 40px) 60px" },
  wrap: { maxWidth: 720, margin: "0 auto", lineHeight: 1.8 },
  h1: { fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 800, marginBottom: 8, color: colors.text },
  updated: { fontSize: 13, color: colors.textSubtle, marginBottom: 40 },
  h2: { fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 12, color: colors.text },
  h3: { fontSize: 16, fontWeight: 600, marginTop: 24, marginBottom: 8, color: colors.text },
  p: { fontSize: 14, color: colors.textMuted, marginBottom: 14 },
  ul: { fontSize: 14, color: colors.textMuted, paddingLeft: 24, marginBottom: 14 },
  li: { marginBottom: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, color: colors.textMuted, marginBottom: 20 },
  th: { textAlign: "left", padding: "8px 12px", borderBottom: `1px solid ${colors.borderStrong}`, color: colors.text, fontWeight: 600 },
  td: { padding: "8px 12px", borderBottom: `1px solid ${colors.border}` },
  back: { display: "inline-block", marginBottom: 24, fontSize: 13, color: colors.textSubtle, textDecoration: "none" },
  link: { color: colors.accent, textDecoration: "underline" },
};

export function PrivacyPage() {
  return (
    <div style={s.page}>
      <div style={s.wrap}>
        <a href="/" style={s.back}>&larr; Back to PullUp</a>
        <h1 style={s.h1}>Privacy Policy</h1>
        <p style={s.updated}>Last updated: May 27, 2026</p>

        <p style={s.p}>
          PullUp ("we", "us", "our") operates the pullup.se platform. This policy describes what personal data we collect, why we collect it, and how we handle it. We are committed to protecting your privacy and complying with the EU General Data Protection Regulation (GDPR).
        </p>

        <h2 style={s.h2}>1. Who we are, and our two roles</h2>
        <p style={s.p}>
          PullUp is an event platform based in Stockholm, Sweden. If you have questions about your data, contact us at <strong>hello@pullup.se</strong>.
        </p>
        <p style={s.p}>
          Depending on the data, PullUp plays one of two roles under GDPR:
        </p>
        <ul style={s.ul}>
          <li style={s.li}><strong>We are the controller</strong> for your PullUp account, the events you create, and platform-wide analytics.</li>
          <li style={s.li}><strong>We are a processor</strong> for the guest lists and contact data a host builds on PullUp — the people who RSVP to that host's events, plus any tags or notes the host adds. The <strong>host is the controller</strong> of that data; we store and process it on the host's behalf and on their instructions. We do not sell it, and we do not reuse it for our own marketing.</li>
        </ul>

        <h2 style={s.h2}>2. If you attend an event (guests)</h2>
        <p style={s.p}>
          When you RSVP to an event, the organiser (host) receives the details you provide — name, email, phone or dietary info if you add them — into their own contact list on PullUp. <strong>That host is the controller of that data.</strong>
        </p>
        <p style={s.p}>
          The host may contact you about their <em>own</em> future events on the basis of legitimate interest: occasional, relevant messages, never a fixed-cadence newsletter, and with a one-click unsubscribe in every email. You can opt out at any time and the host will stop emailing you.
        </p>
        <p style={s.p}>
          We never sell your details, and we never share a host's contacts with other hosts or third parties for their marketing. PullUp's own newsletter is entirely separate — we only send it to people who explicitly sign up for it. RSVPing to an event does <strong>not</strong> subscribe you to PullUp's newsletter.
        </p>

        <h2 style={s.h2}>3. What data we collect</h2>

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
          <li style={s.li}>Guest information (name, email, phone if provided, dietary restrictions, answers to host questions)</li>
          <li style={s.li}>RSVP status and attendance records</li>
          <li style={s.li}>Event images you upload</li>
        </ul>

        <h3 style={s.h3}>Host CRM data</h3>
        <p style={s.p}>
          If you host events, PullUp builds a contact list from your guests so you can manage your community — this can include attendance history across your events, tags and notes you add, and (for paid events) lifetime spend derived from Stripe. As set out in section 1, you are the controller of this data; we process it for you.
        </p>

        <h3 style={s.h3}>Payment data</h3>
        <p style={s.p}>
          For paid events, payments are processed by <strong>Stripe</strong>. We do not store your card details. Stripe handles all payment information under their own privacy policy. We store transaction records (amount, status, receipt link) to manage your bookings.
        </p>

        <h3 style={s.h3}>Newsletter data</h3>
        <p style={s.p}>If you sign up for PullUp's newsletter, we collect your email address, selected cities, and interest categories (e.g. music, culture, arts). We only send our newsletter to people who explicitly opt in to it.</p>

        <h3 style={s.h3}>Automatically collected data</h3>
        <ul style={s.ul}>
          <li style={s.li}><strong>Page views:</strong> We track visits to event pages and our landing page using an anonymous visitor identifier stored in your browser's local storage. This is not a cookie.</li>
          <li style={s.li}><strong>Device and referrer information:</strong> Device type, referrer URL, and UTM campaign parameters for understanding how visitors find events.</li>
          <li style={s.li}><strong>Email engagement:</strong> When we send emails (event invitations, reminders, host communications, our newsletter), we may track whether emails are opened and which links are clicked. This helps us and hosts improve communications.</li>
          <li style={s.li}><strong>IP address and user agent:</strong> Recorded with email opens/clicks and page views for analytics and security purposes.</li>
        </ul>

        <h2 style={s.h2}>4. Why we collect your data</h2>
        <table style={s.table}>
          <thead>
            <tr><th style={s.th}>Purpose</th><th style={s.th}>Legal basis (GDPR)</th></tr>
          </thead>
          <tbody>
            <tr><td style={s.td}>Providing the platform (accounts, events, RSVPs)</td><td style={s.td}>Contract performance</td></tr>
            <tr><td style={s.td}>Processing payments</td><td style={s.td}>Contract performance</td></tr>
            <tr><td style={s.td}>Transactional emails (confirmations, reminders, receipts)</td><td style={s.td}>Contract performance</td></tr>
            <tr><td style={s.td}>A host emailing their own guests about the host's future events</td><td style={s.td}>Legitimate interest (with opt-out)</td></tr>
            <tr><td style={s.td}>PullUp's own newsletter and platform updates</td><td style={s.td}>Consent (you sign up voluntarily)</td></tr>
            <tr><td style={s.td}>Analytics, platform improvement, and relevant-event recommendations</td><td style={s.td}>Legitimate interest</td></tr>
            <tr><td style={s.td}>Email engagement tracking</td><td style={s.td}>Legitimate interest</td></tr>
            <tr><td style={s.td}>Fraud prevention and security</td><td style={s.td}>Legitimate interest</td></tr>
          </tbody>
        </table>

        <h2 style={s.h2}>5. How we improve PullUp</h2>
        <p style={s.p}>
          We analyse activity on the platform — such as which events get views and RSVPs, and aggregate engagement patterns — to improve PullUp and to surface events we think people will find relevant. This relies on legitimate interest. We do not sell personal data, we do not share a host's contacts with other hosts, and we do not use this analysis to send you marketing from anyone you haven't chosen to hear from.
        </p>

        <h2 style={s.h2}>6. Third-party services</h2>
        <p style={s.p}>We use the following services to operate PullUp:</p>
        <table style={s.table}>
          <thead>
            <tr><th style={s.th}>Service</th><th style={s.th}>Purpose</th><th style={s.th}>Data shared</th></tr>
          </thead>
          <tbody>
            <tr><td style={s.td}>Supabase (AWS, EU)</td><td style={s.td}>Database, authentication, file storage</td><td style={s.td}>All account and event data</td></tr>
            <tr><td style={s.td}>Stripe</td><td style={s.td}>Payment processing</td><td style={s.td}>Payment details, email, event metadata</td></tr>
            <tr><td style={s.td}>Amazon SES</td><td style={s.td}>Email delivery (newsletters, host campaigns)</td><td style={s.td}>Recipient email, email content</td></tr>
            <tr><td style={s.td}>Resend</td><td style={s.td}>Email delivery (transactional emails)</td><td style={s.td}>Recipient email, email content</td></tr>
            <tr><td style={s.td}>Anthropic</td><td style={s.td}>AI assistant and content suggestions for hosts</td><td style={s.td}>The minimum content needed to generate a response (e.g. event details, draft text)</td></tr>
            <tr><td style={s.td}>Google</td><td style={s.td}>OAuth sign-in, location autocomplete</td><td style={s.td}>Email (OAuth), location search queries</td></tr>
          </tbody>
        </table>
        <p style={s.p}>
          Anthropic processes data in the United States; such transfers are covered by standard contractual clauses, and content sent via its API is not used to train its models. <strong>We do not sell your data</strong> to any third party, and we do not use advertising trackers, Facebook pixels, or Google Analytics.
        </p>

        <h2 style={s.h2}>7. Data storage and security</h2>
        <p style={s.p}>
          Your data is stored on servers within the EU (AWS, Paris region). All data is encrypted in transit (TLS) and at rest. Passwords are hashed using industry-standard algorithms. We use role-based access controls and do not expose sensitive keys to the frontend. The one exception to EU storage is the AI sub-processor noted above, which processes limited content in the US under appropriate safeguards.
        </p>

        <h2 style={s.h2}>8. Data retention</h2>
        <p style={s.p}>
          We keep your account data for as long as your account is active. If you delete your account, we remove your personal data within 30 days. Anonymized analytics data (page views, aggregate stats) may be retained indefinitely. Payment records are retained as required by Swedish accounting law (7 years). If you are a guest, your data may also sit in a host's contact list — that host is the controller, so a deletion request may need to reach them too (we can help connect you).
        </p>

        <h2 style={s.h2}>9. Your rights</h2>
        <p style={s.p}>Under GDPR, you have the right to:</p>
        <ul style={s.ul}>
          <li style={s.li}><strong>Access</strong> your personal data</li>
          <li style={s.li}><strong>Correct</strong> inaccurate data</li>
          <li style={s.li}><strong>Delete</strong> your data ("right to be forgotten")</li>
          <li style={s.li}><strong>Export</strong> your data in a portable format</li>
          <li style={s.li}><strong>Object</strong> to processing based on legitimate interest (including host event emails)</li>
          <li style={s.li}><strong>Withdraw consent</strong> for PullUp's newsletter at any time</li>
        </ul>
        <p style={s.p}>To exercise any of these rights, email us at <strong>hello@pullup.se</strong>. We will respond within 30 days. Where a host is the controller of your data, we will pass your request to them or put you in touch.</p>

        <h2 style={s.h2}>10. Consent and opting out</h2>
        <p style={s.p}>
          We collect explicit consent before adding you to PullUp's own newsletter, and we record what you agreed to, the timestamp, and your selections. A host emailing you about their own events relies on legitimate interest, not consent — but you can stop it just as easily. Either way, you can opt out at any time by:
        </p>
        <ul style={s.ul}>
          <li style={s.li}>Clicking the unsubscribe link in any email</li>
          <li style={s.li}>Emailing us at <strong>hello@pullup.se</strong></li>
        </ul>
        <p style={s.p}>
          Transactional emails (RSVP confirmations, payment receipts, event reminders) are part of the service you use and do not require separate consent. These cannot be opted out of while you have an active booking or account.
        </p>

        <h2 style={s.h2}>11. Email tracking</h2>
        <p style={s.p}>
          Our emails may contain a small tracking pixel and redirected links to measure whether emails are opened and which links are clicked. We also record IP address and browser information with these events. This data is used to improve communications and is processed under legitimate interest. Unsubscribing from a sender's emails stops that tracking.
        </p>

        <h2 style={s.h2}>12. Children</h2>
        <p style={s.p}>PullUp is not intended for children under 16. We do not knowingly collect data from children.</p>

        <h2 style={s.h2}>13. Changes to this policy</h2>
        <p style={s.p}>We may update this policy from time to time. Significant changes will be communicated via email or a notice on the platform.</p>

        <h2 style={s.h2}>14. Contact</h2>
        <p style={s.p}>
          PullUp<br />
          Stockholm, Sweden<br />
          <strong>hello@pullup.se</strong>
        </p>
      </div>
    </div>
  );
}
