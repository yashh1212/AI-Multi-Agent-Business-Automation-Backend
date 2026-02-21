import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config();

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.REFRESH_TOKEN,
});

const calendar = google.calendar({ version: "v3", auth: oauth2Client });

export async function scheduleInterview(candidate, dateTime) {
  const startTime = new Date(dateTime);
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour

  const event = {
    summary: `Interview - ${candidate.name}`,
    description: `Interview for ${candidate.role} position.\nCandidate: ${candidate.email}`,
    start: {
      dateTime: startTime.toISOString(),
      timeZone: "Asia/Kolkata",
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: "Asia/Kolkata",
    },
    attendees: [
      { email: candidate.email },
      { email: process.env.HR_EMAIL },
    ],
    conferenceData: {
      createRequest: {
        requestId: `interview-${Date.now()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };

  const response = await calendar.events.insert({
    calendarId: "primary",
    resource: event,
    conferenceDataVersion: 1,
    sendUpdates: "all",
  });

  return {
    eventId: response.data.id,
    meetLink: response.data.hangoutLink,
    startTime: startTime.toISOString(),
  };
}