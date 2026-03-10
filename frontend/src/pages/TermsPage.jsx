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
  back: { display: "inline-block", marginBottom: 24, fontSize: 13, color: "rgba(255,255,255,0.5)", textDecoration: "none" },
};

export function TermsPage() {
  return (
    <div style={s.page}>
      <div style={s.wrap}>
        <a href="/" style={s.back}>&larr; Back to PullUp</a>
        <h1 style={s.h1}>Terms of Service</h1>
        <p style={s.updated}>Last updated: March 10, 2026</p>

        <p style={s.p}>
          These terms govern your use of the PullUp platform at pullup.se. By creating an account or using the platform, you agree to these terms.
        </p>

        <h2 style={s.h2}>1. The platform</h2>
        <p style={s.p}>
          PullUp is a free event management platform that lets you create events, manage guest lists, send invitations, and handle ticketing. We provide the tools — you create the experiences.
        </p>

        <h2 style={s.h2}>2. Your account</h2>
        <p style={s.p}>You are responsible for keeping your login credentials secure. You must provide accurate information when creating your account. You may not create accounts for others without their consent or use the platform for illegal purposes.</p>

        <h2 style={s.h2}>3. Events and content</h2>
        <p style={s.p}>When you create events on PullUp, you retain ownership of your content (descriptions, images, etc.). By posting content, you grant PullUp a license to display it on the platform and in communications related to your events (e.g. email invitations).</p>
        <p style={s.p}>You are responsible for ensuring your events comply with local laws and regulations. PullUp is not the organizer of your events — you are.</p>
        <p style={s.p}>You may not use PullUp to:</p>
        <ul style={s.ul}>
          <li style={s.li}>Promote illegal activities</li>
          <li style={s.li}>Post content that is discriminatory, threatening, or harassing</li>
          <li style={s.li}>Spam or send unsolicited communications</li>
          <li style={s.li}>Scrape data or interfere with the platform's operation</li>
        </ul>

        <h2 style={s.h2}>4. Guest data and privacy</h2>
        <p style={s.p}>
          As an event host, you may collect guest information (names, emails, dietary restrictions, etc.) through PullUp. You are responsible for handling this data in accordance with applicable privacy laws, including GDPR. You may not use guest data for purposes unrelated to your events without their consent.
        </p>

        <h2 style={s.h2}>5. Payments and tickets</h2>
        <p style={s.p}>Paid ticketing is processed by Stripe. When you sell tickets:</p>
        <ul style={s.ul}>
          <li style={s.li}>You must connect a Stripe account to receive payouts</li>
          <li style={s.li}>PullUp charges a platform fee of 3% on paid tickets</li>
          <li style={s.li}>Stripe's own processing fees apply in addition</li>
          <li style={s.li}>You are responsible for any tax obligations on ticket revenue</li>
        </ul>

        <h2 style={s.h2}>6. Refunds</h2>
        <p style={s.p}>
          Event hosts are responsible for their own refund policies. PullUp provides tools for hosts to issue full or partial refunds. If a host fails to fulfill an event, guests may contact us at hello@pullup.se for assistance.
        </p>

        <h2 style={s.h2}>7. Email communications</h2>
        <p style={s.p}>
          By using PullUp, you agree to receive transactional emails related to your account and events (confirmations, reminders, updates). Newsletter communications are optional and require separate consent.
        </p>
        <p style={s.p}>
          As a host, when you send emails through PullUp's email tools, you must comply with anti-spam laws. You may only email guests who have a legitimate relationship with your events.
        </p>

        <h2 style={s.h2}>8. Free platform</h2>
        <p style={s.p}>
          PullUp is free to use for creating events, managing guests, and sending communications. We reserve the right to introduce optional paid features in the future, but existing free features will remain free.
        </p>

        <h2 style={s.h2}>9. Availability and liability</h2>
        <p style={s.p}>
          We aim to keep PullUp available at all times, but we do not guarantee uninterrupted access. We are not liable for any losses resulting from platform downtime, data loss, or event cancellations.
        </p>
        <p style={s.p}>
          PullUp is provided "as is" without warranties of any kind. Our total liability to you for any claims related to the platform is limited to the amount you have paid us (which, for most users, is zero).
        </p>

        <h2 style={s.h2}>10. Termination</h2>
        <p style={s.p}>
          You can delete your account at any time. We may suspend or terminate accounts that violate these terms. Upon termination, your events will be deactivated and your personal data will be deleted within 30 days.
        </p>

        <h2 style={s.h2}>11. Governing law</h2>
        <p style={s.p}>
          These terms are governed by Swedish law. Any disputes will be resolved in the courts of Stockholm, Sweden.
        </p>

        <h2 style={s.h2}>12. Changes</h2>
        <p style={s.p}>
          We may update these terms from time to time. Continued use of the platform after changes constitutes acceptance of the updated terms. Significant changes will be communicated via email.
        </p>

        <h2 style={s.h2}>13. Contact</h2>
        <p style={s.p}>
          PullUp<br />
          Stockholm, Sweden<br />
          <strong>hello@pullup.se</strong>
        </p>
      </div>
    </div>
  );
}
