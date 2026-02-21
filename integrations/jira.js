import dotenv from "dotenv";

dotenv.config();

export async function createJiraTicket(data) {
  const url = `${process.env.JIRA_BASE_URL}/rest/api/3/issue`;

  // ✅ ADD THIS DEBUG LOG
  console.log("=== JIRA DEBUG ===");
  console.log("URL:", url);
  console.log("Project Key:", `"${process.env.JIRA_PROJECT_KEY}"`);
  console.log("Email:", `"${process.env.JIRA_EMAIL}"`);
  console.log("Token exists:", !!process.env.JIRA_API_TOKEN);
  console.log("==================");

  const payload = {
    fields: {
      project: { key: process.env.JIRA_PROJECT_KEY },
      summary: data.summary,
      description: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: data.description || "No description provided",
              },
            ],
          },
        ],
      },
      issuetype: { name: "Task" },
    },
  };

  const auth = Buffer.from(
    `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
  ).toString("base64");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Jira Error: ${error}`);
  }

  return await response.json();
}