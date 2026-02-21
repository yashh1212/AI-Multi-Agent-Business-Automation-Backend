import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function generateOfferLetter(candidate) {
  const prompt = `
Generate a professional job offer letter for:
- Name: ${candidate.name}
- Role: ${candidate.role}
- Salary: ${candidate.salary}
- Start Date: ${candidate.startDate}
- Company: ${process.env.COMPANY_NAME}

Keep it professional, warm and concise. Plain text only.
`;

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.5,
    max_tokens: 800,
  });

  return response.choices[0].message.content;
}