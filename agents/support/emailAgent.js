import { getUnreadEmails } from "../../services/gmailService.js";
import { handleEmailFlow } from "../../orchestrator/ticketFlow.js";

// ✅ Track already processed emails in memory
const processedEmailIds = new Set();

export async function startEmailAgent() {
  console.log("📬 Email Agent started — polling every 2 minutes...");

  async function poll() {
    try {
      console.log("\n🔍 Checking for new emails...");
      const emails = await getUnreadEmails();

      if (emails.length === 0) {
        console.log("📭 No new emails");
        return;
      }

      for (const email of emails) {
        // ✅ Skip if already processed this session
        if (processedEmailIds.has(email.id)) {
          console.log(`⏭️ Already processed: ${email.id}`);
          continue;
        }

        // ✅ Skip if it's a reply to our own emails
        if (isReplyToOurEmail(email.subject)) {
          console.log(`⏭️ Skipping reply chain: ${email.subject}`);
          continue;
        }

        await handleEmailFlow(email);

        // ✅ Mark as processed
        processedEmailIds.add(email.id);
      }
    } catch (err) {
      console.error("❌ Email Agent error:", err.message);
    }
  }

  await poll();
  setInterval(poll, 2 * 60 * 1000);
}

// ✅ Skip emails that are replies to our ticket notifications
function isReplyToOurEmail(subject) {
  const ourReplies = [
    "ticket id",
    "support ticket",
    "re: re:",
    "ticket created",
    "your ticket"
  ];
  return ourReplies.some(s => subject.toLowerCase().includes(s));
}
