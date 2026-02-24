import { qualifyLead } from "../agents/sales/leadQualifierAgent.js";
import { craftEmail } from "../agents/sales/emailCraftAgent.js";
import { handleObjection } from "../agents/sales/objectionHandlerAgent.js";
import { sendEmail } from "../integrations/email.js";
import { scheduleInterview } from "../integrations/googleCalendar.js";
import Lead from "../models/Lead.js";
import SalesLog from "../models/SalesLog.js";

// ═══════════════════════════════════════
// Helper: log activity
// ═══════════════════════════════════════
async function logActivity(type, action, detail, leadId, metadata = {}) {
  return SalesLog.create({ type, action, detail, leadId, metadata }).catch((e) =>
    console.error("SalesLog error:", e.message)
  );
}

// ═══════════════════════════════════════
// CAPTURE: Create a new lead
// ═══════════════════════════════════════
export async function runLeadCaptureFlow({ name, email, company, phone, source, interest, dealValue }) {
  console.log(`\n🎯 Capturing new lead: ${name} (${company || "no company"})`);

  const lead = await Lead.create({
    name: name.trim(),
    email: email.trim(),
    company: company?.trim() || null,
    phone: phone || null,
    source: source || "other",
    interest: interest?.trim() || null,
    dealValue: dealValue || 0,
    stage: "new_lead",
  });

  await logActivity("capture", "Lead Captured", `${name} from ${company || "unknown"} — interested in ${interest || "N/A"}`, lead._id, { source, dealValue });

  console.log(`✅ Lead captured: ${lead._id}`);
  return { leadId: lead._id, lead, stage: "new_lead" };
}

// ═══════════════════════════════════════
// QUALIFY: Score lead using BANT
// ═══════════════════════════════════════
export async function runQualificationFlow(leadId, bantResponses = {}) {
  const lead = await Lead.findById(leadId);
  if (!lead) throw new Error("Lead not found");

  console.log(`\n📊 Qualifying lead: ${lead.name}`);
  const qualification = await qualifyLead(lead, bantResponses);

  // Determine new stage
  let newStage;
  if (qualification.score >= 60) {
    newStage = "qualified";
  } else if (qualification.score >= 40) {
    newStage = "contacted"; // nurture
  } else {
    newStage = "new_lead"; // cold
  }

  lead.qualificationScore = qualification.score;
  lead.bant = qualification.bant;
  lead.bantReasoning = qualification.reasoning;
  lead.stage = newStage;
  await lead.save();

  await logActivity("qualify", "Lead Qualified", `${lead.name} — Score: ${qualification.score}/100 → ${newStage}`, lead._id, qualification);

  console.log(`📊 Score: ${qualification.score}/100 → ${newStage}`);
  return { lead, qualification, newStage };
}

// ═══════════════════════════════════════
// OUTREACH: Send first email
// ═══════════════════════════════════════
export async function runOutreachFlow(leadId) {
  const lead = await Lead.findById(leadId);
  if (!lead) throw new Error("Lead not found");

  console.log(`\n📧 Sending outreach to: ${lead.name}`);
  const email = await craftEmail(lead, "cold_outreach");

  const sent = await sendEmail({
    to: lead.email,
    subject: email.subject,
    body: email.body,
  });

  lead.stage = "contacted";
  lead.lastContactedAt = new Date();
  lead.lastEmailId = sent.id;
  await lead.save();

  await logActivity("outreach", "Outreach Email Sent", `${lead.name} — ${email.subject}`, lead._id, { emailId: sent.id, subject: email.subject });

  console.log(`✅ Outreach sent to ${lead.email}`);
  return { lead, email, emailId: sent.id };
}

// ═══════════════════════════════════════
// FOLLOW-UP: Send follow-up email
// ═══════════════════════════════════════
export async function runFollowUpFlow(leadId, followUpNumber = 1) {
  const lead = await Lead.findById(leadId);
  if (!lead) throw new Error("Lead not found");

  if (followUpNumber > 3) {
    console.log(`⚠️ Max follow-ups (3) reached for ${lead.name}`);
    return { lead, maxReached: true };
  }

  const emailType = followUpNumber === 3 ? "follow_up_3" : followUpNumber === 2 ? "follow_up_2" : "follow_up";

  console.log(`\n📧 Follow-up #${followUpNumber} to: ${lead.name}`);
  const email = await craftEmail(lead, emailType, {
    followUpNumber,
    previousContext: `Follow-up #${followUpNumber} — previous emails unanswered`,
  });

  const sent = await sendEmail({
    to: lead.email,
    subject: email.subject,
    body: email.body,
  });

  lead.followUpCount = followUpNumber;
  lead.lastContactedAt = new Date();
  lead.lastEmailId = sent.id;
  await lead.save();

  await logActivity("followup", `Follow-up #${followUpNumber} Sent`, `${lead.name} — ${email.subject}`, lead._id, { followUpNumber, emailId: sent.id });

  console.log(`✅ Follow-up #${followUpNumber} sent`);
  return { lead, email, emailId: sent.id, followUpNumber };
}

// ═══════════════════════════════════════
// SCHEDULE: Book a demo/meeting
// ═══════════════════════════════════════
export async function runScheduleMeetingFlow(leadId, meetingType = "demo", preferredDate = null) {
  const lead = await Lead.findById(leadId);
  if (!lead) throw new Error("Lead not found");

  console.log(`\n📅 Scheduling ${meetingType} for: ${lead.name}`);

  // Use preferred date or default to 2 days from now
  const meetingDate = preferredDate || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const meeting = await scheduleInterview(
    { name: lead.name, email: lead.email, role: meetingType },
    meetingDate
  );

  // Send confirmation email
  const email = await craftEmail(lead, "interview_scheduled", {
    meetingDate: new Date(meetingDate).toLocaleString(),
    meetingLink: meeting.meetLink,
  });

  await sendEmail({
    to: lead.email,
    subject: email.subject,
    body: email.body,
  });

  lead.stage = "demo_scheduled";
  lead.meetingId = meeting.eventId;
  lead.meetingLink = meeting.meetLink;
  lead.meetingScheduledAt = meetingDate;
  lead.lastContactedAt = new Date();
  await lead.save();

  await logActivity("schedule", "Meeting Scheduled", `${lead.name} — ${meetingType} on ${new Date(meetingDate).toDateString()}`, lead._id, meeting);

  console.log(`✅ ${meetingType} scheduled for ${lead.name}`);
  return { lead, meeting, email };
}

// ═══════════════════════════════════════
// PROPOSAL: Send pricing proposal
// ═══════════════════════════════════════
export async function runProposalFlow(leadId, proposalDetails = {}) {
  const lead = await Lead.findById(leadId);
  if (!lead) throw new Error("Lead not found");

  console.log(`\n💰 Sending proposal to: ${lead.name}`);
  const email = await craftEmail(lead, "proposal", {
    proposalDetails: JSON.stringify(proposalDetails),
  });

  const sent = await sendEmail({
    to: lead.email,
    subject: email.subject,
    body: email.body,
  });

  lead.stage = "proposal_sent";
  lead.proposalId = `PROP-${Date.now()}`;
  lead.proposalSentAt = new Date();
  lead.lastContactedAt = new Date();
  lead.lastEmailId = sent.id;
  await lead.save();

  await logActivity("proposal", "Proposal Sent", `${lead.name} — ${proposalDetails.planName || "Custom proposal"}`, lead._id, { ...proposalDetails, emailId: sent.id });

  console.log(`✅ Proposal sent to ${lead.email}`);
  return { lead, email, proposalId: lead.proposalId, emailId: sent.id };
}

// ═══════════════════════════════════════
// OBJECTION: Handle lead objection
// ═══════════════════════════════════════
export async function runObjectionFlow(leadId, objectionType, objectionText) {
  const lead = await Lead.findById(leadId);
  if (!lead) throw new Error("Lead not found");

  console.log(`\n🤔 Handling ${objectionType} objection from: ${lead.name}`);
  const result = await handleObjection(lead, objectionType, objectionText);

  lead.stage = "negotiation";
  lead.notes.push({
    text: `Objection (${objectionType}): ${objectionText}\nResponse: ${result.suggestedResponse}`,
    type: "internal",
  });
  await lead.save();

  await logActivity("objection", "Objection Handled", `${lead.name} — ${objectionType}: ${objectionText.substring(0, 100)}`, lead._id, result);

  if (result.escalate) {
    console.log(`⚠️ ESCALATION: ${result.escalateReason}`);
  }

  console.log(`✅ Objection handled — escalate: ${result.escalate}`);
  return { lead, objectionResult: result };
}

// ═══════════════════════════════════════
// CLOSE: Close deal (won or lost)
// ═══════════════════════════════════════
export async function runCloseDealFlow(leadId, status, lostReason = null) {
  const lead = await Lead.findById(leadId);
  if (!lead) throw new Error("Lead not found");

  console.log(`\n${status === "won" ? "🎉" : "❌"} Closing deal for: ${lead.name} — ${status}`);

  if (status === "won") {
    lead.stage = "closed_won";
    lead.closedAt = new Date();

    // Send welcome email
    const email = await craftEmail(lead, "welcome");
    await sendEmail({ to: lead.email, subject: email.subject, body: email.body });

    await logActivity("close", "Deal Closed — Won", `${lead.name} — $${lead.dealValue} revenue logged`, lead._id, { dealValue: lead.dealValue });

    console.log(`🎉 Deal WON — $${lead.dealValue} revenue`);
  } else {
    lead.stage = "closed_lost";
    lead.lostReason = lostReason || "No reason provided";
    lead.closedAt = new Date();

    await logActivity("close", "Deal Closed — Lost", `${lead.name} — Reason: ${lostReason || "N/A"}`, lead._id, { lostReason });

    console.log(`❌ Deal LOST — Reason: ${lostReason}`);
  }

  await lead.save();
  return { lead, status, dealValue: status === "won" ? lead.dealValue : 0 };
}
