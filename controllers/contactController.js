const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_FROM = process.env.EMAIL_FROM; // e.g. "Toyify <onboarding@resend.dev>"
const CONTACT_EMAIL = "info@toyify.co.uk";

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendEmail({ to, subject, html, replyTo }) {
  const result = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    html,
    ...(replyTo ? { reply_to: replyTo } : {}),
  });

  if (result?.error) {
    console.error("Contact email error FULL:", JSON.stringify(result.error, null, 2));
    throw new Error(result.error.message || "Failed to send email");
  }

  console.log("✅ Contact email sent:", { to, id: result?.data?.id });
  return result;
}

exports.sendContactMessage = async (req, res) => {
  try {
    const { email, message } = req.body;

    if (!email || !message) {
      return res.status(400).json({
        message: "Email and message are required",
      });
    }

    if (!process.env.RESEND_API_KEY || !EMAIL_FROM) {
      return res.status(500).json({
        message: "Email service is not configured properly",
      });
    }

    const safeEmail = escapeHtml(email);
    const safeMessage = escapeHtml(message).replace(/\n/g, "<br/>");

    const emailErrors = [];

    // 1) Send contact message to admin
    try {
      await sendEmail({
        to: CONTACT_EMAIL,
        subject: "New Contact Form Message - Toyify",
        replyTo: email,
        html: `
          <h2>New Contact Message</h2>
          <p><strong>From:</strong> ${safeEmail}</p>
          <p><strong>Message:</strong></p>
          <p>${safeMessage}</p>
        `,
      });
    } catch (e) {
      console.error("Admin contact email failed:", e?.message);
      emailErrors.push({ to: CONTACT_EMAIL, error: e?.message });
    }

    // 2) Auto-confirmation email to customer
    try {
      await sendEmail({
        to: email,
        subject: "We received your message - Toyify",
        html: `
          <h2>Thanks for contacting Toyify</h2>
          <p>We’ve received your message and our team will get back to you within 24 hours.</p>
          <p><strong>Your message:</strong></p>
          <p>${safeMessage}</p>
          <hr/>
          <p>Best regards,<br/>Toyify Team</p>
        `,
      });
    } catch (e) {
      console.error("Customer confirmation email failed:", e?.message);
      emailErrors.push({ to: email, error: e?.message });
    }

    if (emailErrors.length === 2) {
      return res.status(500).json({
        message: "Failed to send messages",
        emailErrors,
      });
    }

    return res.status(200).json({
      message: "Message sent successfully",
      emailErrors,
    });
  } catch (error) {
    console.error("Contact form error:", error);
    return res.status(500).json({
      message: "Server error",
      details: error?.message,
    });
  }
};