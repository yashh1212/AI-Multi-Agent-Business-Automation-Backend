import { qualifyLead } from "../agents/sales/leadQualifierAgent.js";
import { craftEmail } from "../agents/sales/emailCraftAgent.js";
import { handleObjection } from "../agents/sales/objectionHandlerAgent.js";
import { sendEmail } from "../integrations/email.js";
import { scheduleInterview } from "../integrations/googleCalendar.js";
import Lead from "../models/Lead.js";
import SalesLog from "../models/SalesLog.js";

const MAX_AUTOMATED_FOLLOW_UPS = 3;
const FOLLOW_UP_DELAY_HOURS = parseInt(process.env.SALES_FOLLOW_UP_DELAY_HOURS || "24", 10);

function nextFollowUpDate(from = new Date()) {
  return new Date(from.getTime() + FOLLOW_UP_DELAY_HOURS * 60 * 60 * 1000);
}

function syncLeadLifecycle(lead, crmStatus) {
  lead.crmStatus = crmStatus;

  if (crmStatus === "new") {
    lead.stage = "new_lead";
    return;
  }

  if (crmStatus === "contacted") {
    lead.stage = ["demo_scheduled", "proposal_sent", "negotiation"].includes(lead.stage) ? lead.stage : "contacted";
    return;
  }

  if (crmStatus === "interested") {
    if (!["demo_scheduled", "proposal_sent", "negotiation", "closed_won"].includes(lead.stage)) {
      lead.stage = "qualified";
    }
    return;
  }

  if (crmStatus === "closed") {
    lead.stage = "closed_won";
    return;
  }

  if (crmStatus === "lost") {
    lead.stage = "closed_lost";
  }
}

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
    crmStatus: "new",
  });

  await logActivity("capture", "Lead Captured", `${name} from ${company || "unknown"} — interested in ${interest || "N/A"}`, lead._id, { source, dealValue });

  console.log(`✅ Lead captured: ${lead._id}`);
  return { leadId: lead._id, lead, stage: "new_lead" };
}

export async function runAutonomousLeadCaptureFlow({ name, email, course, company, phone, source, interest, dealValue }) {
  const capture = await runLeadCaptureFlow({
    name,
    email,
    company,
    phone,
    source,
    interest: interest || course,
    dealValue,
  });

  capture.lead.course = course?.trim() || null;
  capture.lead.interest = capture.lead.interest || course?.trim() || null;
  syncLeadLifecycle(capture.lead, "new");
  await capture.lead.save();

  const outreach = await runOutreachFlow(capture.lead._id);
  return {
    lead: outreach.lead,
    outreach: {
      subject: outreach.email.subject,
      emailId: outreach.emailId,
    },
  };
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
  syncLeadLifecycle(lead, qualification.score >= 60 ? "interested" : qualification.score >= 40 ? "contacted" : "new");
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
  syncLeadLifecycle(lead, "contacted");
  lead.lastContactedAt = new Date();
  lead.lastEmailId = sent.id;
  lead.lastEmailType = "cold_outreach";
  lead.firstContactSentAt = lead.firstContactSentAt || lead.lastContactedAt;
  lead.nextFollowUpAt = nextFollowUpDate(lead.lastContactedAt);
  lead.lastAutomationActionAt = new Date();
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

  if (followUpNumber > MAX_AUTOMATED_FOLLOW_UPS) {
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
  syncLeadLifecycle(lead, "contacted");
  lead.lastContactedAt = new Date();
  lead.lastEmailId = sent.id;
  lead.lastEmailType = emailType;
  lead.nextFollowUpAt = followUpNumber >= MAX_AUTOMATED_FOLLOW_UPS ? null : nextFollowUpDate(lead.lastContactedAt);
  lead.lastAutomationActionAt = new Date();
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
  syncLeadLifecycle(lead, "interested");
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
  syncLeadLifecycle(lead, "interested");
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
  syncLeadLifecycle(lead, "interested");
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
    syncLeadLifecycle(lead, "closed");
    lead.closedAt = new Date();
    lead.nextFollowUpAt = null;
    lead.automationEnabled = false;

    // Send welcome email
    const email = await craftEmail(lead, "welcome");
    await sendEmail({ to: lead.email, subject: email.subject, body: email.body });

    await logActivity("close", "Deal Closed — Won", `${lead.name} — $${lead.dealValue} revenue logged`, lead._id, { dealValue: lead.dealValue });

    console.log(`🎉 Deal WON — $${lead.dealValue} revenue`);
  } else {
    syncLeadLifecycle(lead, "lost");
    lead.lostReason = lostReason || "No reason provided";
    lead.closedAt = new Date();
    lead.nextFollowUpAt = null;
    lead.automationEnabled = false;

    await logActivity("close", "Deal Closed — Lost", `${lead.name} — Reason: ${lostReason || "N/A"}`, lead._id, { lostReason });

    console.log(`❌ Deal LOST — Reason: ${lostReason}`);
  }

  await lead.save();
  return { lead, status, dealValue: status === "won" ? lead.dealValue : 0 };
}

export async function updateLeadLifecycleState(leadId, crmStatus, options = {}) {
  const lead = await Lead.findById(leadId);
  if (!lead) throw new Error("Lead not found");

  if (crmStatus === "interested") {
    const email = await craftEmail(lead, "interested_details", {
      course: lead.course || lead.interest,
      previousContext: "Lead replied positively and wants more information.",
    });
    const sent = await sendEmail({ to: lead.email, subject: email.subject, body: email.body });

    syncLeadLifecycle(lead, "interested");
    lead.replyStatus = "positive";
    lead.lastContactedAt = new Date();
    lead.lastEmailId = sent.id;
    lead.lastEmailType = "interested_details";
    lead.nextFollowUpAt = nextFollowUpDate(lead.lastContactedAt);

    await lead.save();
    await logActivity("stage_change", "Lead Marked Interested", `${lead.name} â€” detailed info sent`, lead._id, { crmStatus });
    return { lead, emailId: sent.id };
  }

  if (crmStatus === "closed") {
    return runCloseDealFlow(leadId, "won");
  }

  if (crmStatus === "lost") {
    return runCloseDealFlow(leadId, "lost", options.reason || "Marked lost manually");
  }

  throw new Error("Unsupported crmStatus transition");
}

export async function processSalesAutomationTick() {
  const now = new Date();
  const activeLeads = await Lead.find({
    automationEnabled: true,
    crmStatus: { $nin: ["closed", "lost"] },
  });

  const summary = {
    scanned: activeLeads.length,
    initialOutreachSent: 0,
    followUpsSent: 0,
    markedLost: 0,
  };

  for (const lead of activeLeads) {
    if (lead.crmStatus === "new") {
      await runOutreachFlow(lead._id);
      summary.initialOutreachSent += 1;
      continue;
    }

    if (lead.crmStatus !== "contacted" || lead.replyStatus !== "none") {
      continue;
    }

    const dueForFollowUp =
      (!lead.nextFollowUpAt && lead.lastContactedAt && now.getTime() - new Date(lead.lastContactedAt).getTime() >= FOLLOW_UP_DELAY_HOURS * 60 * 60 * 1000) ||
      (lead.nextFollowUpAt && lead.nextFollowUpAt <= now);

    if (!dueForFollowUp) {
      continue;
    }

    if ((lead.followUpCount || 0) >= MAX_AUTOMATED_FOLLOW_UPS) {
      syncLeadLifecycle(lead, "lost");
      lead.lostReason = "No reply after 3 automated follow-ups";
      lead.closedAt = now;
      lead.automationEnabled = false;
      lead.nextFollowUpAt = null;
      await lead.save();
      await logActivity("close", "Lead Marked Lost by Automation", `${lead.name} â€” no reply after ${MAX_AUTOMATED_FOLLOW_UPS} follow-ups`, lead._id, { reason: lead.lostReason });
      summary.markedLost += 1;
      continue;
    }

    await runFollowUpFlow(lead._id, (lead.followUpCount || 0) + 1);
    summary.followUpsSent += 1;
  }

  return summary;
}
