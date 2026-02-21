import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config();

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.REFRESH_TOKEN,
});

const gmail = google.gmail({ version: "v1", auth: oauth2Client });

// Fetch unread emails
// Fetch unread emails with filters
// Fetch unread emails with filters
export async function getUnreadEmails() {
  const res = await gmail.users.messages.list({
    userId: "me",
    // ✅ Only fetch emails FROM your specific email
    q: "is:unread label:inbox from:yashdhokane12@gmail.com",
    maxResults: 5,
  });

  const messages = res.data.messages || [];
  const emails = [];

  for (const msg of messages) {
    const detail = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
    });

    const headers = detail.data.payload.headers;
    const subject = headers.find(h => h.name === "Subject")?.value || "";
    const from = headers.find(h => h.name === "From")?.value || "";
    const body = extractBody(detail.data.payload);

    emails.push({ id: msg.id, subject, from, body });
  }

  return emails;
}

// ✅ Filter function — skip automated emails
function shouldSkipEmail(subject, from) {
  const automatedSenders = [
    "noreply", "no-reply", "mailer-daemon",
    "notifications", "donotreply", "do-not-reply",
    "automated", "system", "alert", "newsletter",
    "support-noreply", "accounts.google.com",
    "google.com", "atlassian.net", "slack.com"
  ];

  const automatedSubjects = [
    "unsubscribe", "newsletter", "notification",
    "alert", "receipt", "invoice", "order confirmation",
    "verify your email", "confirm your email",
    "password reset", "security alert"
  ];

  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase();

  // Check sender
  if (automatedSenders.some(s => fromLower.includes(s))) return true;

  // Check subject
  if (automatedSubjects.some(s => subjectLower.includes(s))) return true;

  return false;
}

// Mark email as read
export async function markAsRead(messageId) {
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { removeLabelIds: ["UNREAD"] },
  });
}

// Reply to email with ticket info
export async function replyToEmail(to, subject, ticketKey, classification) {
  const replyBody = `
Hi,

Thank you for reaching out. We have received your message and created a support ticket.

🎫 Ticket ID: ${ticketKey}
📌 Category: ${classification.category}
⚡ Priority: ${classification.priority}
📝 Summary: ${classification.summary}

You can track your ticket here:
${process.env.JIRA_BASE_URL}/browse/${ticketKey}

We will get back to you shortly.

Best regards,
Support Team
  `.trim();

  const rawMessage = [
    `To: ${to}`,
    `Subject: Re: ${subject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    "",
    replyBody,
  ].join("\n");

  const encodedMessage = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodedMessage },
  });

  console.log(`📧 Reply sent to ${to}`);
}

// Helper to extract email body
function extractBody(payload) {
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
    }
  }
  return "No body content";
}