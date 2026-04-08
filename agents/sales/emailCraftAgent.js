import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const EMAIL_TEMPLATES = {
  cold_outreach: "a compelling first-touch cold outreach email to introduce our product/service",
  follow_up: "a professional follow-up email (light nudge with added value)",
  follow_up_2: "a second follow-up email with a different angle, asking a question",
  follow_up_3: "a breakup/last-attempt email — final follow-up before going cold",
  interested_details: "a personalized email for an interested lead with more details, benefits, and a clear next step",
  closing_confirmation: "a concise sales closing email confirming the customer is ready to move forward",
  re_engagement: "a warm re-engagement email to reconnect after 90+ days of silence",
  proposal: "a professional email delivering a pricing proposal with clear CTA",
  welcome: "a warm welcome email after a closed-won deal with onboarding next steps",
  interview_scheduled: "a confirmation email for a scheduled demo/discovery call",
  rejection: "a polite and professional deal-lost acknowledgment email",
};

/**
 * Generate a personalized sales email using Groq LLM.
 *
 * @param {object} lead - Lead info (name, email, company, interest, dealValue)
 * @param {string} emailType - One of the EMAIL_TEMPLATES keys
 * @param {object} [context] - Additional context (proposalDetails, meetingDate, etc.)
 * @returns {object} { subject, body }
 */
export async function craftEmail(lead, emailType, context = {}) {
  const templateDesc = EMAIL_TEMPLATES[emailType] || "a professional sales email";

  const prompt = `You are a senior B2B sales professional. Write ${templateDesc}.

Lead Information:
- Name: ${lead.name}
- Company: ${lead.company || "their company"}
- Interest: ${lead.interest || "our product/service"}
- Deal Value: ${lead.dealValue ? `$${lead.dealValue}` : "Not specified"}

${context.followUpNumber ? `This is follow-up #${context.followUpNumber}.` : ""}
${context.meetingDate ? `Meeting scheduled for: ${context.meetingDate}` : ""}
${context.meetingLink ? `Meeting link: ${context.meetingLink}` : ""}
${context.course ? `Course / interest focus: ${context.course}` : ""}
${context.proposalDetails ? `Proposal details: ${context.proposalDetails}` : ""}
${context.previousContext ? `Previous context: ${context.previousContext}` : ""}

Rules:
- Keep under 150 words (proposals can be longer)
- Professional, warm, concise tone — never robotic
- Must include a clear call to action
- Never start with "I hope this email finds you well"
- Always personalize with lead's name and company
- Sign off as the sales team

Return JSON only:
{
  "subject": "<email subject line>",
  "body": "<full email body text>"
}`;

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 600,
    });

    const result = JSON.parse(response.choices[0].message.content);

    return {
      subject: result.subject || `Regarding ${lead.interest || "our conversation"}`,
      body: result.body || "",
    };
  } catch (error) {
    console.error("Email craft LLM error:", error.message);

    // Fallback template
    return {
      subject: `Following up — ${lead.interest || "our conversation"}`,
      body: `Hi ${lead.name},\n\nThank you for your interest${lead.company ? ` at ${lead.company}` : ""}. I'd love to discuss how we can help with ${lead.interest || "your needs"}.\n\nWould you have time for a quick call this week?\n\nBest regards,\nSales Team`,
    };
  }
}
