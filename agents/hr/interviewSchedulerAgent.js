import { scheduleInterview } from "../../integrations/googleCalendar.js";

export async function scheduleInterviewForCandidate(candidate) {
  // Schedule interview 2 days from now at 10 AM
  const interviewDate = new Date();
  interviewDate.setDate(interviewDate.getDate() + 2);
  interviewDate.setHours(10, 0, 0, 0);

  const interview = await scheduleInterview(candidate, interviewDate);

  return {
    ...interview,
    scheduledAt: interviewDate.toDateString(),
  };
}