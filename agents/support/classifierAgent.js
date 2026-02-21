import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function classifyQuery(message) {
  // ✅ Truncate here too as safety net
  const truncated = message.length > 1500 
    ? message.substring(0, 1500) + "..." 
    : message;

  const prompt = `
Classify this client message into:
bug, feature, payment, general

Also return:
- summary (max 100 chars)
- priority (low, medium, high)

Message: ${truncated}

Return JSON only. No markdown, no backticks.
`;

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 200, // ✅ limit response tokens too
  });

  return JSON.parse(response.choices[0].message.content);
}