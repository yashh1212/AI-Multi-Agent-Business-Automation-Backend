import { sendTicketNotification } from "../integrations/slack.js";

export async function notifySlack(ticket, classification) {
  try {
    await sendTicketNotification(ticket, classification);
    console.log("✅ Slack notified");
  } catch (err) {
    console.error("❌ Slack notification failed:", err.message);
  }
}