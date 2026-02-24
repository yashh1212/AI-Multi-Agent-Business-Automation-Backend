import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Qualify a lead using BANT framework via Groq LLM.
 *
 * @param {object} lead - Lead info (name, email, company, interest, dealValue)
 * @param {object} bantResponses - Answers to BANT questions
 * @returns {object} { score, bant, suggestedStage, reasoning }
 */
export async function qualifyLead(lead, bantResponses = {}) {
  const prompt = `You are an expert B2B sales qualification specialist. Score this lead using the BANT framework.

Lead Information:
- Name: ${lead.name}
- Company: ${lead.company || "Unknown"}
- Interest: ${lead.interest || "Not specified"}
- Deal Value: $${lead.dealValue || "Unknown"}

BANT Responses from the lead:
- Budget: ${bantResponses.budget || "Not discussed"}
- Authority: ${bantResponses.authority || "Not discussed"}
- Need: ${bantResponses.need || "Not discussed"}
- Timeline: ${bantResponses.timeline || "Not discussed"}

Score each BANT dimension 0-25:
BUDGET: 25=confirmed allocated, 15=has but unconfirmed, 5=unclear/small, 0=none
AUTHORITY: 25=decision maker, 15=influencer, 5=end user, 0=unknown
NEED: 25=urgent clear problem, 15=problem not urgent, 5=vague interest, 0=no need
TIMELINE: 25=within 30 days, 15=within 90 days, 5=6+ months, 0=no timeline

Return JSON only:
{
  "budget": <0-25>,
  "authority": <0-25>,
  "need": <0-25>,
  "timeline": <0-25>,
  "totalScore": <0-100>,
  "suggestedStage": "qualified" | "nurture" | "cold",
  "reasoning": "<2-3 sentence explanation>"
}`;

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 500,
    });

    const result = JSON.parse(response.choices[0].message.content);

    return {
      score: result.totalScore || 0,
      bant: {
        budget: result.budget || 0,
        authority: result.authority || 0,
        need: result.need || 0,
        timeline: result.timeline || 0,
      },
      suggestedStage: result.suggestedStage || "nurture",
      reasoning: result.reasoning || "",
    };
  } catch (error) {
    console.error("Lead qualification LLM error:", error.message);

    // Fallback: simple scoring from raw BANT responses
    const fallbackScore = Object.values(bantResponses).reduce((sum, v) => {
      if (typeof v === "number") return sum + v;
      return sum + 10; // Default 10 per dimension if text provided
    }, 0);

    return {
      score: Math.min(fallbackScore, 100),
      bant: { budget: 10, authority: 10, need: 10, timeline: 10 },
      suggestedStage: fallbackScore >= 60 ? "qualified" : "nurture",
      reasoning: "Fallback scoring — LLM unavailable",
    };
  }
}
