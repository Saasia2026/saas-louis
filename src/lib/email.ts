import "server-only";

// Emails transactionnels via Resend (API HTTP). Le domaine de l'expéditeur
// doit être vérifié chez Resend (enregistrements DNS de twinpost.video).
export function emailEnabled() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(input: { to: string; subject: string; html: string; text: string }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "TwinPost <alertes@twinpost.video>",
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend : ${response.status} ${body.slice(0, 200)}`);
  }
}

export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
