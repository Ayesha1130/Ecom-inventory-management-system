/**
 * Transactional email through Resend's HTTP API (no SDK). Without RESEND_API_KEY and EMAIL_FROM it does nothing
 * and says so in the logs; nothing here pretends an email was delivered.
 */
export async function sendEmail(msg: { to: string; subject: string; html: string; text: string }): Promise<{ sent: boolean }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.info(`[email] not sent (RESEND_API_KEY / EMAIL_FROM not set): "${msg.subject}"`);
    return { sent: false };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
  });
  if (!res.ok) throw new Error(`Email provider responded ${res.status}`);
  return { sent: true };
}
