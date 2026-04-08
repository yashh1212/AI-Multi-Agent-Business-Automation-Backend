import dotenv from "dotenv";
dotenv.config();



export async function sendSlackMessage(message) {
  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message }),
  });
}

function normalizeRoleKey(role = "") {
  return role.trim().toLowerCase();
}

function parseSlackRoleRecipients() {
  const raw = process.env.HR_POSITION_SLACK_RECIPIENTS;
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([role, recipient]) => [
        normalizeRoleKey(role),
        typeof recipient === "string" ? recipient.trim() : "",
      ]),
    );
  } catch (error) {
    console.error("Failed to parse HR_POSITION_SLACK_RECIPIENTS:", error.message);
    return {};
  }
}

export function getSlackRecipientForRole(role) {
  const mapping = parseSlackRoleRecipients();
  return mapping[normalizeRoleKey(role)] || process.env.DEFAULT_HR_SLACK_RECIPIENT || "";
}

export async function sendInterviewScheduledNotification({
  candidateName,
  candidateEmail,
  role,
  interviewDate,
  scheduledTime,
  meetLink,
}) {
  if (!process.env.SLACK_WEBHOOK_URL) {
    throw new Error("SLACK_WEBHOOK_URL is missing in .env");
  }

  const recipient = getSlackRecipientForRole(role);
  const intro = recipient
    ? `${recipient} interview scheduled for your role.`
    : `Interview scheduled for the ${role} role.`;

  const fields = [
    { type: "mrkdwn", text: `*Candidate:*\n${candidateName}` },
    { type: "mrkdwn", text: `*Role:*\n${role}` },
    { type: "mrkdwn", text: `*Email:*\n${candidateEmail}` },
    { type: "mrkdwn", text: `*Date:*\n${interviewDate || "TBD"}` },
  ];

  if (scheduledTime) {
    fields.push({ type: "mrkdwn", text: `*Time:*\n${scheduledTime}` });
  }

  const payload = {
    text: `${intro} Candidate: ${candidateName}, role: ${role}, date: ${interviewDate || "TBD"}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:spiral_calendar_pad: *${intro}*`,
        },
      },
      {
        type: "section",
        fields,
      },
      ...(meetLink
        ? [
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: { type: "plain_text", text: "Open Meet Link" },
                  url: meetLink,
                },
              ],
            },
          ]
        : []),
    ],
  };

  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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
