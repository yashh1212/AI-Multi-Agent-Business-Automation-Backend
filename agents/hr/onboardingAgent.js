import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function generateOnboardingPlan(candidate) {
  const prompt = `
Create a 5-day onboarding plan for a new ${candidate.role} at ${process.env.COMPANY_NAME}.

Return JSON only:
- day1, day2, day3, day4, day5 (each with title and tasks array)
- tools_to_setup (array)
- people_to_meet (array)
- documents_needed (array)
`;

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.5,
    max_tokens: 800,
  });

  return JSON.parse(response.choices[0].message.content);
}