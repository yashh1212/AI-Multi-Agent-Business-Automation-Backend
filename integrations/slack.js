import dotenv from "dotenv";
dotenv.config();



export async function sendSlackMessage(message) {
  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message }),
  });
}

export async function sendTicketNotification(ticket, classification) {
     console.log("Slack URL:", process.env.SLACK_WEBHOOK_URL);

  if (!process.env.SLACK_WEBHOOK_URL) {
    throw new Error("SLACK_WEBHOOK_URL is missing in .env");
  }
  const payload = {
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🎫 *New Ticket Created: ${ticket.key}*`
        }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Category:*\n${classification.category}` },
          { type: "mrkdwn", text: `*Priority:*\n${classification.priority}` },
          { type: "mrkdwn", text: `*Summary:*\n${classification.summary}` },
        ]
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "👀 View in Jira" },
            url: `${process.env.JIRA_BASE_URL}/browse/${ticket.key}`
          }
        ]
      }
    ]
  };

  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}