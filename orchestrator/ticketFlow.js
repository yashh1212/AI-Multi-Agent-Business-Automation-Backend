import { classifyQuery } from "../agents/support/classifierAgent.js";
import { createJiraTicket } from "../integrations/jira.js";
import { notifySlack } from "../agents/support/slackAgent.js";
import { replyToEmail, markAsRead } from "../services/gmailService.js";

export async function handleClientQuery(message) {
  const classification = await classifyQuery(message);
  const ticket = await createJiraTicket({
    summary: classification.summary,
    description: message,
  });
  await notifySlack(ticket, classification);

  return { ticketId: ticket.key, classification };
}

// NEW — full email flow
export async function handleEmailFlow(email) {
  console.log(`\n📧 Processing email from: ${email.from}`);

  // Step 1: Classify
  const classification = await classifyQuery(email.body);
  console.log("🤖 Classified:", classification);

  // Step 2: Create Jira ticket
  const ticket = await createJiraTicket({
    summary: classification.summary || email.subject,
    description: `From: ${email.from}\n\n${email.body}`,
  });
  console.log("🎫 Ticket created:", ticket.key);

  // Step 3: Notify Slack
  await notifySlack(ticket, classification);
  console.log("💬 Slack notified");

  // Step 4: Reply to email
  await replyToEmail(email.from, email.subject, ticket.key, classification);
  console.log("📧 Reply sent");

  // Step 5: Mark email as read
  await markAsRead(email.id);
  console.log("✅ Email marked as read");

  return { ticket, classification };
}