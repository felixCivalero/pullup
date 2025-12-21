export function signupConfirmationEmail({
  name,
  eventTitle,
  date,
  isWaitlist = false,
}) {
  if (isWaitlist) {
    return `
    <div style="font-family: Inter, Arial, sans-serif; max-width:600px; margin:auto">
      <h2>You're on the waitlist ⏳</h2>
      <p>Hi ${name},</p>
      <p>You've been added to the waitlist for <strong>${eventTitle}</strong>.</p>
      <p><strong>Date:</strong> ${date}</p>

      <hr style="margin:24px 0"/>

      <p>If spots open up, you'll receive a link via SMS or email to confirm and complete payment (if applicable).</p>

      <p style="color:#666">
        Best regards,<br/>
        Pullup
      </p>
    </div>
    `;
  }

  return `
    <div style="font-family: Inter, Arial, sans-serif; max-width:600px; margin:auto">
      <h2>You're in 🎉</h2>
      <p>Hi ${name},</p>
      <p>Your spot for <strong>${eventTitle}</strong> is confirmed.</p>
      <p><strong>Date:</strong> ${date}</p>

      <hr style="margin:24px 0"/>

      <p style="color:#666">
        See you soon,<br/>
        Pullup
      </p>
    </div>
    `;
}

export function reminder8hEmail({ name, eventTitle, time }) {
  return `
    <div style="font-family: Inter, Arial, sans-serif; max-width:600px; margin:auto">
      <h2>Happening soon ⏰</h2>
      <p>Hi ${name},</p>
      <p>
        <strong>${eventTitle}</strong> starts in about 8 hours.
      </p>
      <p><strong>Start time:</strong> ${time}</p>

      <p style="margin-top:24px">
        See you there,<br/>
        Pullup
      </p>
    </div>
    `;
}
