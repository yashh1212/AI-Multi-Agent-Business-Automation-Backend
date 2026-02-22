import { google } from "googleapis";
import { scheduleInterview } from "../../integrations/googleCalendar.js";
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

// ✅ Fetch all busy slots for next 7 days
async function getBusySlots(startDate, endDate) {
  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      items: [{ id: "primary" }],
    },
  });

  return response.data.calendars.primary.busy || [];
}

// ✅ Check if a time slot is free
function isSlotFree(busySlots, slotStart, slotEnd) {
  return !busySlots.some((busy) => {
    const busyStart = new Date(busy.start);
    const busyEnd = new Date(busy.end);

    // Check if proposed slot overlaps with any busy slot
    return slotStart < busyEnd && slotEnd > busyStart;
  });
}

// ✅ Find next free 1-hour slot during working hours (10AM - 6PM)
async function findFreeSlot() {
  const now = new Date();
  const sevenDaysLater = new Date();
  sevenDaysLater.setDate(now.getDate() + 7);

  console.log("🔍 Checking calendar for free slots...");
  const busySlots = await getBusySlots(now, sevenDaysLater);
  console.log(`📅 Found ${busySlots.length} busy slots`);

  // Start checking from tomorrow
  const checkDate = new Date();
  checkDate.setDate(checkDate.getDate() + 1);

  // Check each day for next 7 days
  for (let day = 0; day < 7; day++) {
    const currentDay = new Date(checkDate);
    currentDay.setDate(checkDate.getDate() + day);

    // Skip weekends
    const dayOfWeek = currentDay.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log(`⏭️ Skipping weekend: ${currentDay.toDateString()}`);
      continue;
    }

    // Check slots from 10AM to 6PM in 1-hour blocks
    const workingHours = [10, 11, 12, 14, 15, 16, 17]; // skip 1PM (lunch)

    for (const hour of workingHours) {
      const slotStart = new Date(currentDay);
      slotStart.setHours(hour, 0, 0, 0);

      const slotEnd = new Date(slotStart);
      slotEnd.setHours(hour + 1, 0, 0, 0);

      // Skip past times
      if (slotStart < now) continue;

      if (isSlotFree(busySlots, slotStart, slotEnd)) {
        console.log(`✅ Free slot found: ${slotStart.toLocaleString()}`);
        return slotStart;
      } else {
        console.log(`❌ Busy: ${slotStart.toLocaleString()}`);
      }
    }
  }

  throw new Error("No free slots found in the next 7 days");
}

// ✅ Main function
export async function scheduleInterviewForCandidate(candidate) {
  console.log(`\n📅 Finding free slot for: ${candidate.name}`);

  // Find free slot
  const freeSlot = await findFreeSlot();

  // Schedule interview in that free slot
  const interview = await scheduleInterview(candidate, freeSlot);

  console.log(`🎯 Interview scheduled at: ${freeSlot.toLocaleString()}`);

  return {
    ...interview,
    scheduledAt: freeSlot.toDateString(),
    scheduledTime: freeSlot.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    }),
  };
}