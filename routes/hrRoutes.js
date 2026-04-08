import express from "express";
import {
  runScreeningFlow,
  runInterviewFlow,
  runHiringFlow,
  runRejectionFlow
} from "../orchestrator/hrFlow.js";
import multer from "multer";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const _pdf = require("pdf-parse");
const pdfParse = typeof _pdf === "function" ? _pdf : (_pdf.default ?? _pdf);
const PDFParser = require("pdf2json");
import Candidate from "../models/Candidate.js";
import ActivityLog from "../models/ActivityLog.js";
import { sendInterviewScheduledNotification } from "../integrations/slack.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.mimetype === "text/plain") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and TXT files are accepted"), false);
    }
  },
});

/**
 * Extract resume text from uploaded file (PDF or plain text) or body field
 */
async function extractResumeText(req) {
  if (req.file) {
    if (req.file.mimetype === "application/pdf") {
      return new Promise((resolve, reject) => {
        const parser = new PDFParser();
        parser.on("pdfParser_dataReady", (data) => {
          const text = data.Pages
            .flatMap((page) => page.Texts)
            .map((t) => decodeURIComponent(t.R.map((r) => r.T).join("")))
            .join(" ");
          resolve(text);
        });
        parser.on("pdfParser_dataError", reject);
        parser.parseBuffer(req.file.buffer);
      });
    }
    return req.file.buffer.toString("utf-8");
  }
  return req.body.resumeText || "";
}

// STAGE 1: Apply & screen resume
// router.post("/apply", upload.single("resume"), async (req, res) => {
//   try {
//     const { name, email, role, salary, startDate, phone, location, experience, education, notes, resumeText } = req.body;

//     // Validate required fields
//     if (!name || !email || !role) {
//       return res.status(400).json({ error: "name, email, role are required" });
//     }

//     // Extract resume from file if uploaded
//     let extractedResumeText = await extractResumeText(req);
    
//     // Combine extracted file text and manually entered resume text
//     const enteredResumeText = resumeText ? resumeText.trim() : "";
//     const combinedResume = [extractedResumeText, enteredResumeText]
//       .filter(text => text && text.trim())
//       .join("\n\n--- Additional Details ---\n");

//     // If no file uploaded but resume text provided, use it
//     if (!extractedResumeText && !combinedResume.trim()) {
//       return res.status(400).json({ error: "Resume is required — upload a PDF/TXT file or provide resume text" });
//     }

//     console.log("🔄 Processing application for:", email.trim());
    
//     const result = await runScreeningFlow({
//       name: name.trim(),
//       email: email.trim(),
//       role: role.trim(),
//       salary: salary || "To be discussed",
//       startDate: startDate || "March 1, 2026",
//       resume: combinedResume || extractedResumeText,
//       phone: phone || null,
//       location: location || null,
//       experience: experience || null,
//       education: education || null,
//     });

//     console.log("✅ Screening result:", {
//       score: result.screening?.score ?? result.score,
//       decision: result.screening?.decision || result.decision,
//       hasSummary: !!(result.screening?.summary || result.summary),
//     });

//     // Determine status based on screening decision
//     const screeningStatus = result.screening?.decision === "selected" ? "shortlisted" : "rejected";
    
//     // Extract score with fallback
//     const finalScore = result.screening?.score ?? result.score ?? null;
//     const finalDecision = result.screening?.decision || result.decision || null;
//     const finalSummary = result.screening?.summary || result.summary || `Applied for ${role}`;

//     console.log("💾 Saving to database with:", {
//       email: email.trim(),
//       score: finalScore,
//       decision: finalDecision,
//       status: screeningStatus,
//     });

//     // Save candidate screening to DB - Update existing or create new
//     const candidate = await Candidate.findOneAndUpdate(
//       { email: email.trim() },
//       {
//         $set: {
//           candidateName: name.trim(),
//           email: email.trim(),
//           jobRole: role.trim(),
//           position: role.trim(),
//           phone: phone || null,
//           location: location || null,
//           experience: experience || null,
//           education: education || null,
//           score: finalScore,
//           resumeScore: finalScore,
//           decision: finalDecision,
//           status: screeningStatus,
//           summary: finalSummary,
//           scoringMethod: result.screening?.scoring_method || result.scoring_method || "none",
//           source: "hr_apply",
//           updatedAt: new Date(),
//         },
//         $setOnInsert: {
//           rawResult: result,
//           notes: notes || null,
//           createdAt: new Date(),
//         }
//       },
//       { upsert: true, new: true }
//     ).catch((e) => {
//       console.error("❌ DB save error:", e.message);
//       console.error("Stack:", e.stack);
//       throw e;
//     });

//     if (!candidate) {
//       console.error("❌ Candidate not saved (returned null)");
//       return res.status(500).json({ error: "Failed to save candidate to database" });
//     }

//     console.log("✅ Candidate saved successfully:", {
//       id: candidate._id,
//       email: candidate.email,
//       score: candidate.score,
//       status: candidate.status,
//     });

//     // Log activity
//     ActivityLog.create({
//       type: "apply",
//       action: "Application Received",
//       detail: `${name.trim()} applied for ${role.trim()}`,
//       candidateId: candidate?._id || null,
//     }).catch((e) => console.error("Activity log error:", e.message));

//     res.json({ 
//       success: true, 
//       result,
//       saved: {
//         candidateName: candidate.candidateName,
//         email: candidate.email,
//         score: candidate.score,
//         decision: candidate.decision,
//         status: candidate.status,
//       }
//     });
//   } catch (err) {
//     console.error("❌ Apply Error:", err.message);
//     console.error("Stack:", err.stack);
//     res.status(500).json({ error: err.message, type: err.name });
//   }
// });

router.post("/apply", upload.single("resume"), async (req, res) => {
  try {
    const { name, email, role, salary, startDate, phone, location, experience, education, notes, resumeText } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ error: "name, email, role are required" });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 🚨 CHECK IF ALREADY EXISTS
    const existingCandidate = await Candidate.findOne({ email: cleanEmail });

    if (existingCandidate) {
      return res.status(409).json({
        success: false,
        error: "Candidate already applied with this email",
      });
    }

    // Extract resume
    let extractedResumeText = await extractResumeText(req);

    const enteredResumeText = resumeText ? resumeText.trim() : "";
    const combinedResume = [extractedResumeText, enteredResumeText]
      .filter(text => text && text.trim())
      .join("\n\n--- Additional Details ---\n");

    if (!extractedResumeText && !combinedResume.trim()) {
      return res.status(400).json({
        error: "Resume is required — upload a PDF/TXT file or provide resume text",
      });
    }

    console.log("🔄 Processing application for:", cleanEmail);

    const result = await runScreeningFlow({
      name: name.trim(),
      email: cleanEmail,
      role: role.trim(),
      salary: salary || "To be discussed",
      startDate: startDate || "March 1, 2026",
      resume: combinedResume || extractedResumeText,
      phone: phone || null,
      location: location || null,
      experience: experience || null,
      education: education || null,
    });


    const screeningStatus =
      result.screening?.decision === "selected" ? "shortlisted" : "rejected";

    const finalScore = result.screening?.score ?? result.score ?? null;
    const finalDecision = result.screening?.decision || result.decision || null;
    const finalSummary =
      result.screening?.summary || result.summary || `Applied for ${role}`;

    // ✅ CREATE NEW ONLY (NO UPDATE)
    const candidate = await Candidate.create({
      candidateName: name.trim(),
      email: cleanEmail,
      jobRole: role.trim(),
      position: role.trim(),
      phone: phone || null,
      location: location || null,
      experience: experience || null,
      education: education || null,
      score: finalScore,
      resumeScore: finalScore,
      decision: finalDecision,
      status: screeningStatus,
      summary: finalSummary,
      scoringMethod:
        result.screening?.scoring_method || result.scoring_method || "none",
      source: "hr_apply",
      rawResult: result,
      notes: notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log("✅ Candidate saved:", candidate.email);

    await ActivityLog.create({
      type: "apply",
      action: "Application Received",
      detail: `${name.trim()} applied for ${role.trim()}`,
      candidateId: candidate._id,
    });

    res.json({
      success: true,
      result,
      saved: {
        candidateName: candidate.candidateName,
        email: candidate.email,
        score: candidate.score,
        decision: candidate.decision,
        status: candidate.status,
      },
    });
  } catch (err) {
    console.error("❌ Apply Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});
// STAGE 2: Schedule interview (after screening passed)
router.post("/schedule-interview", async (req, res) => {
  try {
    const { name, email, role, phone, location, experience, education, notes, interviewDate, meetLink } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ error: "name, email, role are required" });
    }

    console.log("🔄 Scheduling interview for:", email.trim());

    const result = await runInterviewFlow({
      name: req.body.name.trim(),
      email: req.body.email.trim(),
      role: req.body.role.trim(),
    });


    const scheduledInterviewDate = interviewDate || result.interview?.scheduledAt || null;
    const scheduledMeetLink = meetLink || result.interview?.meetLink || result.meetLink || null;
    const scheduledTime = result.interview?.scheduledTime || null;

    console.log("✅ Interview flow result:", {
      hasLink: !!scheduledMeetLink,
      status: 'interview_scheduled',
    });

    // Save interview scheduling to DB - Update existing candidate
    // Use $set to properly merge fields without losing existing data
    const candidate = await Candidate.findOneAndUpdate(
      { email: email.trim() },
      {
        $set: {
          candidateName: name.trim(),
          email: email.trim(),
          jobRole: role.trim(),
          position: role.trim(),
          status: "interview_scheduled",
          interviewDate: scheduledInterviewDate,
          meetLink: scheduledMeetLink,
          source: "hr_interview",
          updatedAt: new Date(),
        },
        // Use $setOnInsert to preserve these on upsert only
        $setOnInsert: {
          summary: `Interview scheduled for ${role}`,
          rawResult: result,
          phone: phone || null,
          location: location || null,
          experience: experience || null,
          education: education || null,
          notes: notes || null,
          createdAt: new Date(),
        }
      },
      { upsert: true, new: true }
    ).catch((e) => {
      console.error("❌ DB save error:", e.message);
      throw e;
    });

    if (!candidate) {
      console.error("❌ Candidate not saved to database");
      return res.status(500).json({ error: "Failed to save interview scheduling" });
    }

    console.log("✅ Interview scheduled successfully:", {
      email: candidate.email,
      status: candidate.status,
      interviewDate: candidate.interviewDate,
    });

    try {
      await sendInterviewScheduledNotification({
        candidateName: name.trim(),
        candidateEmail: email.trim(),
        role: role.trim(),
        interviewDate: scheduledInterviewDate,
        scheduledTime,
        meetLink: scheduledMeetLink,
      });
      console.log("Interview Slack notification sent");
    } catch (slackError) {
      console.error("Interview Slack notification failed:", slackError.message);
    }


    // Log activity
    ActivityLog.create({
      type: "schedule",
      action: "Interview Scheduled",
      detail: `${name.trim()} — ${scheduledInterviewDate || "TBD"}`,
      candidateId: candidate?._id || null,
    }).catch((e) => console.error("Activity log error:", e.message));

    res.json({ success: true, result });
  } catch (err) {
    console.error("❌ Interview Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// STAGE 3: Hire candidate (after interview accepted)
router.post("/hire", async (req, res) => {
  try {
    const { name, email, role, salary, startDate, phone, location, experience, education, notes } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ error: "name, email, role are required" });
    }

    console.log("🔄 Processing hire for:", email.trim());

    const result = await runHiringFlow({
      name: name.trim(),
      email: email.trim(),
      role: role.trim(),
      salary: salary || "To be discussed",
      startDate: startDate || "March 1, 2026",
      resume: req.body.resumeText || "Experienced professional",
    });

    console.log("✅ Hiring flow result:", {
      offerGenerated: !!result.offerLetter,
      onboardingGenerated: !!result.onboardingPlan,
    });

    // Save hiring decision to DB - Update existing candidate
    // Use $set to update status and preserve all previous screening/interview data
    const candidate = await Candidate.findOneAndUpdate(
      { email: email.trim() },
      {
        $set: {
          candidateName: name.trim(),
          email: email.trim(),
          jobRole: role.trim(),
          position: role.trim(),
          status: "hired",
          decision: "selected",
          salary: salary || null,
          startDate: startDate || null,
          source: "hr_hire",
          updatedAt: new Date(),
        },
        $setOnInsert: {
          summary: `Hired for ${role}`,
          rawResult: result,
          phone: phone || null,
          location: location || null,
          experience: experience || null,
          education: education || null,
          notes: notes || null,
          createdAt: new Date(),
        }
      },
      { upsert: true, new: true }
    ).catch((e) => {
      console.error("❌ DB save error:", e.message);
      throw e;
    });

    if (!candidate) {
      console.error("❌ Candidate not saved to database");
      return res.status(500).json({ error: "Failed to save hire decision" });
    }

    console.log("✅ Candidate hired successfully:", {
      email: candidate.email,
      status: candidate.status,
      salary: candidate.salary,
    });

    // Log activity
    ActivityLog.create({
      type: "hire",
      action: "Candidate Hired",
      detail: `${name.trim()} — Offer letter + onboarding plan sent`,
      candidateId: candidate?._id || null,
    }).catch((e) => console.error("Activity log error:", e.message));

    res.json({ success: true, result });
  } catch (err) {
    console.error("❌ Hire Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/reject", async (req, res) => {
  try {
    const { name, email, role } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ error: "name, email, role are required" });
    }

    const cleanEmail = email.trim().toLowerCase();

    console.log("🔄 Processing rejection for:", cleanEmail);

    const result = await runRejectionFlow({
      name: name.trim(),
      email: cleanEmail,
      role: role.trim(),
    });

    // ❌ REMOVE upsert
    const candidate = await Candidate.findOneAndUpdate(
      { email: cleanEmail },
      {
        $set: {
          candidateName: name.trim(),
          jobRole: role.trim(),
          position: role.trim(),
          status: "rejected",
          decision: "rejected",
          source: "hr_reject",
          updatedAt: new Date(),
        },
      },
      { new: true } // only return updated doc
    );

    // ✅ If not found → handle properly
    if (!candidate) {
      return res.status(404).json({
        error: "Candidate not found. Cannot reject non-existing candidate.",
      });
    }

    console.log("✅ Candidate rejected:", candidate.email);

    await ActivityLog.create({
      type: "reject",
      action: "Candidate Rejected",
      detail: `${name.trim()} — ${role.trim()}`,
      candidateId: candidate._id,
    });

    res.json({ success: true, result });
  } catch (err) {
    console.error("❌ Rejection Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /hr/candidates — Retrieve all candidates with latest status ────────────

router.get("/candidates", async (req, res) => {
  try {
    let filter = {
      source: { $in: ["hr_apply", "hr_interview", "hr_hire", "hr_reject"] },
      email: { $exists: true, $ne: "" },
    };

    // Optional filters
    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.role) {
      filter.jobRole = new RegExp(req.query.role, "i");
    }

    const candidates = await Candidate.find(filter)
      .sort({ createdAt: -1 }); // latest first

    const formattedCandidates = candidates.map((c) => ({
      ...c._doc,
      id: c._id.toString(),
    }));

    res.json({
      success: true,
      count: formattedCandidates.length,
      data: formattedCandidates,
    });
  } catch (err) {
    console.error("Candidates Fetch Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /hr/history — Retrieve HR pipeline candidate history ───────────────────

router.get("/history", async (req, res) => {
  try {
    const filter = {
      source: { $in: ["hr_apply", "hr_interview", "hr_hire", "hr_reject"] },
    };
    if (req.query.role) filter.jobRole = req.query.role.toLowerCase();
    if (req.query.decision) filter.decision = req.query.decision.toLowerCase();
    if (req.query.source) filter.source = req.query.source;

    const candidates = await Candidate.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(req.query.limit) || 100)
      .lean();

    res.json({
      success: true,
      count: candidates.length,
      data: candidates,
    });
  } catch (err) {
    console.error("HR History Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /hr/history/:id — Retrieve a single HR candidate record ────────────────

router.get("/history/:id", async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id).lean();
    if (!candidate) {
      return res.status(404).json({ success: false, error: "Candidate not found" });
    }
    res.json({ success: true, data: candidate });
  } catch (err) {
    console.error("HR History Lookup Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /hr/logs — Retrieve activity logs ──────────────────────────────────────

router.get("/logs", async (req, res) => {
  try {
    const filter = {};
    if (req.query.type) filter.type = req.query.type;

    const logs = await ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(req.query.limit) || 100)
      .lean();

    res.json({ success: true, count: logs.length, data: logs });
  } catch (err) {
    console.error("Activity Logs Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /hr/logs/:id — Retrieve a single activity log ──────────────────────────

router.get("/logs/:id", async (req, res) => {
  try {
    const log = await ActivityLog.findById(req.params.id).lean();
    if (!log) {
      return res.status(404).json({ success: false, error: "Log not found" });
    }
    res.json({ success: true, data: log });
  } catch (err) {
    console.error("Activity Log Lookup Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
