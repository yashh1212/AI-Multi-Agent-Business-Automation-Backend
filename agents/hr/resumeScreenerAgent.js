import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function screenResume(resumeText, jobRole) {
  const truncated = resumeText.substring(0, 2000);

  const prompt = `
You are an expert HR recruiter. Screen this resume for the role of ${jobRole}.

Resume:
${truncated}

Return JSON only with:
- score (0-100)
- decision ("selected" or "rejected")
- strengths (array of 3 key strengths)
- weaknesses (array of 2 key weaknesses)
- summary (max 100 chars)
- experience_years (number)
- key_skills (array)
`;

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 500,
  });

  return JSON.parse(response.choices[0].message.content);
}