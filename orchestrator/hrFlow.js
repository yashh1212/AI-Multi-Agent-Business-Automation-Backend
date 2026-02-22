import { screenResume } from "../agents/hr/resumeScreenerAgent.js";
import { scheduleInterviewForCandidate } from "../agents/hr/interviewSchedulerAgent.js";
import { generateOfferLetter } from "../agents/hr/offerLetterAgent.js";
import { generateOnboardingPlan } from "../agents/hr/onboardingAgent.js";
import { sendEmail } from "../integrations/email.js";

// ═══════════════════════════════════════
// STAGE 1: Screen Resume
// POST /hr/apply
// ═══════════════════════════════════════
export async function runScreeningFlow(candidate) {
  console.log(`\n👤 Processing candidate: ${candidate.name}`);
  const result = { candidate };

  // Screen resume
  console.log("📄 Screening resume...");
  const screening = await screenResume(candidate.resume, candidate.role);
  result.screening = screening;
  console.log(`📊 Score: ${screening.score}/100 → ${screening.decision}`);

  if (screening.decision === "rejected") {
    // Send rejection email
    await sendEmail({
      to: candidate.email,
      subject: `Application Update - ${candidate.role}`,
      body: `
Dear ${candidate.name},

Thank you for applying for the ${candidate.role} position at ${process.env.COMPANY_NAME}.

After careful review, we regret to inform you that we will not be moving 
forward with your application at this time.

We appreciate your interest and wish you the best in your job search.

Best regards,
HR Team - ${process.env.COMPANY_NAME}
      `.trim(),
    });
    console.log("❌ Rejected — Rejection email sent");
    return { status: "rejected", ...result };
  }

  // Send screening passed email
  await sendEmail({
    to: candidate.email,
    subject: `Application Update - ${candidate.role} at ${process.env.COMPANY_NAME}`,
    body: `
Dear ${candidate.name},

Great news! Your resume has been shortlisted for the ${candidate.role} position.

📊 Your Profile Score: ${screening.score}/100
📝 Summary: ${screening.summary}

Our HR team will be in touch shortly to schedule your interview.

Best regards,
HR Team - ${process.env.COMPANY_NAME}
    `.trim(),
  });

  console.log("✅ Screening passed — Email sent");
  return { status: "screening_passed", ...result };
}

// ═══════════════════════════════════════
// STAGE 2: Schedule Interview
// POST /hr/schedule-interview
// ═══════════════════════════════════════
export async function runInterviewFlow(candidate) {
  console.log(`\n📅 Scheduling interview for: ${candidate.name}`);
  const result = { candidate };

  // Find free slot and schedule
  const interview = await scheduleInterviewForCandidate(candidate);
  result.interview = interview;
  console.log(`🗓️ Interview scheduled: ${interview.scheduledAt} at ${interview.scheduledTime}`);

  // Send interview confirmation email
  await sendEmail({
    to: candidate.email,
    subject: `Interview Scheduled - ${candidate.role} at ${process.env.COMPANY_NAME}`,
    body: `
Dear ${candidate.name},

Congratulations! We would like to invite you for an interview.

🎯 Role: ${candidate.role}
📅 Date: ${interview.scheduledAt}
🕐 Time: ${interview.scheduledTime} IST
🔗 Google Meet: ${interview.meetLink}

Please confirm your availability by replying to this email.

Best regards,
HR Team - ${process.env.COMPANY_NAME}
    `.trim(),
  });

  console.log("✅ Interview scheduled — Email sent");
  return { status: "interview_scheduled", ...result };
}

// ═══════════════════════════════════════
// STAGE 3: Offer Letter + Onboarding
// POST /hr/hire
// ═══════════════════════════════════════
export async function runHiringFlow(candidate) {
  console.log(`\n🎉 Hiring candidate: ${candidate.name}`);
  const result = { candidate };

  // Generate and send offer letter
  console.log("📝 Generating offer letter...");
  const offerLetter = await generateOfferLetter(candidate);
  result.offerLetter = offerLetter;

  await sendEmail({
    to: candidate.email,
    subject: `Offer Letter - ${candidate.role} at ${process.env.COMPANY_NAME}`,
    body: offerLetter,
  });
  console.log("💼 Offer letter sent");

  // Generate onboarding plan
  console.log("🚀 Generating onboarding plan...");
  const onboarding = await generateOnboardingPlan(candidate);
  result.onboarding = onboarding;

  // Safe access helper
  const getDay = (day) => {
    if (!day) return "Tasks planned";
    if (typeof day === "string") return day;
    return day.title || day.tasks?.[0] || "Tasks planned";
  };

  await sendEmail({
    to: candidate.email,
    subject: `Welcome to ${process.env.COMPANY_NAME} - Your Onboarding Plan`,
    body: `
Dear ${candidate.name},

Welcome to the team! 🎉

Here's your 5-day onboarding plan:

Day 1: ${getDay(onboarding.day1)}
Day 2: ${getDay(onboarding.day2)}
Day 3: ${getDay(onboarding.day3)}
Day 4: ${getDay(onboarding.day4)}
Day 5: ${getDay(onboarding.day5)}

🛠️ Tools to setup: ${onboarding.tools_to_setup?.join(", ") || "To be confirmed"}
👥 People to meet: ${onboarding.people_to_meet?.join(", ") || "To be confirmed"}
📄 Documents needed: ${onboarding.documents_needed?.join(", ") || "To be confirmed"}

See you on ${candidate.startDate}!

Best regards,
HR Team - ${process.env.COMPANY_NAME}
    `.trim(),
  });

  console.log("🎉 Onboarding plan sent");
  return { status: "hired", ...result };
}