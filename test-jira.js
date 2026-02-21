// test-jira.js
import dotenv from "dotenv";
dotenv.config();

const auth = Buffer.from(
  `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
).toString("base64");

// Step 1: Get all projects
const res = await fetch(`${process.env.JIRA_BASE_URL}/rest/api/3/project`, {
  headers: {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
  },
});

const projects = await res.json();
console.log("Your projects:", JSON.stringify(projects, null, 2));