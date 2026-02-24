import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Handle a sales objection using Groq LLM.
 *
 * @param {object} lead - Lead info (name, company, interest, dealValue)
 * @param {string} objectionType - price | timing | features | competition | trust
 * @param {string} objectionText - What the lead said
 * @returns {object} { suggestedResponse, talkingPoints[], escalate }
 */
export async function handleObjection(lead, objectionType, objectionText) {
  const prompt = `You are an expert B2B sales closer. A lead has raised an objection. Craft a persuasive but respectful response.

Lead Information:
- Name: ${lead.name}
- Company: ${lead.company || "Unknown"}
- Interest: ${lead.interest || "our product"}
- Deal Value: $${lead.dealValue || "Unknown"}

Objection Type: ${objectionType}
What the lead said: "${objectionText}"

Objection handling guidelines:
- Price → Highlight ROI, offer payment plans or smaller tier
- Timing → Offer to reconnect at their timeline, send reminder
- Features → Clarify roadmap, offer workarounds, escalate if critical
- Competition → Focus on unique differentiators, NEVER trash competitors
- Trust → Share case studies, offer free trial or pilot

Return JSON only:
{
  "suggestedResponse": "<the email/message response to send to the lead>",
  "talkingPoints": ["<point 1>", "<point 2>", "<point 3>"],
  "escalate": true/false,
  "escalateReason": "<reason if escalate is true, empty string otherwise>",
  "recommendedAction": "<next recommended action: schedule_call | send_case_study | offer_trial | adjust_pricing | wait_and_follow_up>"
}`;

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.5,
      max_tokens: 700,
    });

    const result = JSON.parse(response.choices[0].message.content);

    return {
      suggestedResponse: result.suggestedResponse || "",
      talkingPoints: result.talkingPoints || [],
      escalate: result.escalate || false,
      escalateReason: result.escalateReason || "",
      recommendedAction: result.recommendedAction || "wait_and_follow_up",
    };
  } catch (error) {
    console.error("Objection handler LLM error:", error.message);

    return {
      suggestedResponse: `Thank you for sharing your concerns, ${lead.name}. I understand your perspective on ${objectionType}. Let me look into this and get back to you with a solution.`,
      talkingPoints: [
        "Acknowledge the concern",
        "Ask clarifying questions",
        "Propose a follow-up call",
      ],
      escalate: true,
      escalateReason: "LLM unavailable — needs human review",
      recommendedAction: "schedule_call",
    };
  }
}
