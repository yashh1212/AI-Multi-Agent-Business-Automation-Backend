import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function generateOnboardingPlan(candidate) {
  const role    = candidate.role    || "the position";
  const company = process.env.COMPANY_NAME || "Our Company";

  const prompt = `
Create a 5-day onboarding plan for a new ${role} at ${company}.

Return JSON only with EXACTLY this structure:
{
  "day1": { "title": "string", "tasks": ["task1", "task2"] },
  "day2": { "title": "string", "tasks": ["task1", "task2"] },
  "day3": { "title": "string", "tasks": ["task1", "task2"] },
  "day4": { "title": "string", "tasks": ["task1", "task2"] },
  "day5": { "title": "string", "tasks": ["task1", "task2"] },
  "tools_to_setup": ["tool1", "tool2"],
  "people_to_meet": ["person1", "person2"],
  "documents_needed": ["doc1", "doc2"]
}

No extra fields. No markdown. JSON only.
`;

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 800,
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  console.log("Onboarding plan:", JSON.stringify(parsed, null, 2));
  return parsed;
}