import { screenResume } from "../agents/hr/resumeScreenerAgent.js";
import { scheduleInterviewForCandidate } from "../agents/hr/interviewSchedulerAgent.js";
import { generateOfferLetter } from "../agents/hr/offerLetterAgent.js";
import { generateOnboardingPlan } from "../agents/hr/onboardingAgent.js";
import { sendEmail } from "../integrations/email.js";

export async function runHRFlow(candidate) {
  console.log(`\n👤 Processing candidate: ${candidate.name}`);
  const result = { candidate };

  // Step 1: Screen Resume
  console.log("📄 Screening resume...");
  const screening = await screenResume(candidate.resume, candidate.role);
  result.screening = screening;
  console.log(`📊 Score: ${screening.score}/100 → ${screening.decision}`);

  // Step 2: Rejected → Send rejection email
  if (screening.decision === "rejected") {
    await sendEmail({
      to: candidate.email,
      subject: `Application Update - ${candidate.role}`,
      body: `
Dear ${candidate.name},

Thank you for applying for the ${candidate.role} position at ${process.env.COMPANY_NAME}.

After careful review, we regret to inform you that we will not be moving forward with your application at this time.

We appreciate your interest and wish you the best in your job search.

Best regards,
HR Team - ${process.env.COMPANY_NAME}
      `.trim(),
    });
    console.log("❌ Rejected — Email sent");
    return result;
  }

  // Step 3: Selected → Schedule interview
  console.log("📅 Scheduling interview...");
  const interview = await scheduleInterviewForCandidate(candidate);
  result.interview = interview;

  // Step 4: Send interview confirmation email
  await sendEmail({
    to: candidate.email,
    subject: `Interview Scheduled - ${candidate.role} at ${process.env.COMPANY_NAME}`,
    body: `
Dear ${candidate.name},

Congratulations! We were impressed with your profile and would like to invite you for an interview.

🎯 Role: ${candidate.role}
📅 Date: ${interview.scheduledAt}
🕐 Time: 10:00 AM IST
🔗 Google Meet: ${interview.meetLink}

Please confirm your availability by replying to this email.

Best regards,
HR Team - ${process.env.COMPANY_NAME}
    `.trim(),
  });
  console.log("✅ Interview scheduled — Email sent");

  // Step 5: Generate offer letter (after interview — simulate hired)
  if (candidate.hired) {
    console.log("📝 Generating offer letter...");
    const offerLetter = await generateOfferLetter(candidate);
    result.offerLetter = offerLetter;

    await sendEmail({
      to: candidate.email,
      subject: `Offer Letter - ${candidate.role} at ${process.env.COMPANY_NAME}`,
      body: offerLetter,
    });
    console.log("💼 Offer letter sent");

    // Step 6: Generate onboarding plan
    console.log("🚀 Generating onboarding plan...");
    const onboarding = await generateOnboardingPlan(candidate);
    result.onboarding = onboarding;

    await sendEmail({
      to: candidate.email,
      subject: `Welcome to ${process.env.COMPANY_NAME} - Your Onboarding Plan`,
      body: `
Dear ${candidate.name},

Welcome to the team! Here's your 5-day onboarding plan:

Day 1: ${onboarding.day1.title}
Day 2: ${onboarding.day2.title}
Day 3: ${onboarding.day3.title}
Day 4: ${onboarding.day4.title}
Day 5: ${onboarding.day5.title}

Tools to setup: ${onboarding.tools_to_setup.join(", ")}
Documents needed: ${onboarding.documents_needed.join(", ")}

See you on ${candidate.startDate}!

Best regards,
HR Team
      `.trim(),
    });
    console.log("🎉 Onboarding plan sent");
  }

  return result;
}