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
router.post("/apply", upload.single("resume"), async (req, res) => {
  try {
    const { name, email, role, salary, startDate, phone, location, experience, education, notes, resumeText } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ error: "name, email, role are required" });
    }

    // Extract resume from file if uploaded
    let extractedResumeText = await extractResumeText(req);
    
    // Combine extracted file text and manually entered resume text
    const enteredResumeText = resumeText ? resumeText.trim() : "";
    const combinedResume = [extractedResumeText, enteredResumeText]
      .filter(text => text && text.trim())
      .join("\n\n--- Additional Details ---\n");

    // If no file uploaded but resume text provided, use it
    if (!extractedResumeText && !combinedResume.trim()) {
      return res.status(400).json({ error: "Resume is required — upload a PDF/TXT file or provide resume text" });
    }

    const result = await runScreeningFlow({
      name: name.trim(),
      email: email.trim(),
      role: role.trim(),
      salary: salary || "To be discussed",
      startDate: startDate || "March 1, 2026",
      resume: combinedResume || extractedResumeText,
      phone: phone || null,
      location: location || null,
      experience: experience || null,
      education: education || null,
    });

    // Determine status based on screening decision
    const screeningStatus = result.screening?.decision === "selected" ? "shortlisted" : "rejected";

    // Save candidate screening to DB - Update existing or create new
    const candidate = await Candidate.findOneAndUpdate(
      { email: email.trim() },
      {
        candidateName: name.trim(),
        email: email.trim(),
        jobRole: role.trim(),
        score: result.screening?.score ?? result.score ?? null,
        decision: result.screening?.decision || result.decision || null,
        scoringMethod: result.screening?.scoring_method || result.scoring_method || "none",
        source: "hr_apply",
        summary: result.screening?.summary || result.summary || `Applied for ${role}`,
        rawResult: result,
        phone: phone || null,
        position: role.trim(),
        location: location || null,
        experience: experience || null,
        education: education || null,
        resumeScore: result.screening?.score ?? result.score ?? null,
        status: screeningStatus,
        notes: notes || null,
      },
      { upsert: true, new: true }
    ).catch((e) => console.error("DB save error:", e.message));

    // Log activity
    ActivityLog.create({
      type: "apply",
      action: "Application Received",
      detail: `${name.trim()} applied for ${role.trim()}`,
      candidateId: candidate?._id || null,
    }).catch((e) => console.error("Activity log error:", e.message));

    res.json({ success: true, result });
  } catch (err) {
    console.error("Apply Error:", err);
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

    const result = await runInterviewFlow({
      name: req.body.name.trim(),
      email: req.body.email.trim(),
      role: req.body.role.trim(),
    });

    // Save interview scheduling to DB - Update existing candidate
    const candidate = await Candidate.findOneAndUpdate(
      { email: email.trim() },
      {
        candidateName: name.trim(),
        email: email.trim(),
        jobRole: role.trim(),
        source: "hr_interview",
        summary: `Interview scheduled for ${role}`,
        rawResult: result,
        phone: phone || null,
        position: role.trim(),
        location: location || null,
        experience: experience || null,
        education: education || null,
        status: "interview_scheduled",
        interviewDate: interviewDate || null,
        meetLink: meetLink || result.meetLink || null,
        notes: notes || null,
      },
      { upsert: true, new: true }
    ).catch((e) => console.error("DB save error:", e.message));

    // Log activity
    ActivityLog.create({
      type: "schedule",
      action: "Interview Scheduled",
      detail: `${name.trim()} — ${interviewDate || "TBD"}`,
      candidateId: candidate?._id || null,
    }).catch((e) => console.error("Activity log error:", e.message));

    res.json({ success: true, result });
  } catch (err) {
    console.error("Interview Error:", err.message);
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

    const result = await runHiringFlow({
      name: name.trim(),
      email: email.trim(),
      role: role.trim(),
      salary: salary || "To be discussed",
      startDate: startDate || "March 1, 2026",
      resume: req.body.resumeText || "Experienced professional",
    });

    // Save hiring decision to DB - Update existing candidate
    const candidate = await Candidate.findOneAndUpdate(
      { email: email.trim() },
      {
        candidateName: name.trim(),
        email: email.trim(),
        jobRole: role.trim(),
        decision: "selected",
        source: "hr_hire",
        summary: `Hired for ${role}`,
        rawResult: result,
        phone: phone || null,
        position: role.trim(),
        location: location || null,
        experience: experience || null,
        education: education || null,
        status: "hired",
        notes: notes || null,
      },
      { upsert: true, new: true }
    ).catch((e) => console.error("DB save error:", e.message));

    // Log activity
    ActivityLog.create({
      type: "hire",
      action: "Candidate Hired",
      detail: `${name.trim()} — Offer letter + onboarding plan sent`,
      candidateId: candidate?._id || null,
    }).catch((e) => console.error("Activity log error:", e.message));

    res.json({ success: true, result });
  } catch (err) {
    console.error("Hire Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/reject", async (req, res) => {
  try {
    const { name, email, role, phone, location, experience, education, notes } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ error: "name, email, role are required" });
    }

    const result = await runRejectionFlow({
      name:  name.trim(),
      email: email.trim(),
      role:  role.trim(),
    });

    // Save rejection to DB - Update existing candidate
    const candidate = await Candidate.findOneAndUpdate(
      { email: email.trim() },
      {
        candidateName: name.trim(),
        email: email.trim(),
        jobRole: role.trim(),
        decision: "rejected",
        source: "hr_reject",
        summary: `Rejected for ${role}`,
        rawResult: result,
        phone: phone || null,
        position: role.trim(),
        location: location || null,
        experience: experience || null,
        education: education || null,
        status: "rejected",
        notes: notes || null,
      },
      { upsert: true, new: true }
    ).catch((e) => console.error("DB save error:", e.message));

    // Log activity
    ActivityLog.create({
      type: "reject",
      action: "Candidate Rejected",
      detail: `${name.trim()} — ${role.trim()}`,
      candidateId: candidate?._id || null,
    }).catch((e) => console.error("Activity log error:", e.message));

    res.json({ success: true, result });
  } catch (err) {
    console.error("Rejection Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /hr/candidates — Retrieve all candidates with latest status ────────────

router.get("/candidates", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const skip = parseInt(req.query.skip) || 0;

    // Use aggregation to get the latest record per candidate (by email)
    // This handles cases where a candidate goes through multiple stages
    const pipeline = [
      {
        $match: {
          source: { $in: ["hr_apply", "hr_interview", "hr_hire", "hr_reject"] },
          email: { $exists: true, $ne: "" },
        },
      },
      // Optional: filter by status if provided
      ...(req.query.status
        ? [{ $match: { status: req.query.status } }]
        : []),
      // Optional: filter by job role if provided
      ...(req.query.role
        ? [{ $match: { jobRole: new RegExp(req.query.role, "i") } }]
        : []),
      // Sort by createdAt descending to get latest records first
      { $sort: { email: 1, createdAt: -1 } },
      // Group by email and keep the first (latest) record
      {
        $group: {
          _id: "$email",
          doc: { $first: "$$ROOT" },
        },
      },
      // Replace root to get back to document structure
      { $replaceRoot: { newRoot: "$doc" } },
      // Sort by creation time (newest first)
      { $sort: { createdAt: -1 } },
      // Pagination
      { $skip: skip },
      { $limit: limit },
      // Project only needed fields
      {
        $project: {
          _id: 1,
          candidateName: 1,
          email: 1,
          jobRole: 1,
          phone: 1,
          location: 1,
          experience: 1,
          education: 1,
          status: 1,
          resumeScore: 1,
          score: 1,
          summary: 1,
          decision: 1,
          interviewDate: 1,
          meetLink: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ];

    const candidates = await Candidate.aggregate(pipeline).allowDiskUse(true);

    // Rename _id to id for frontend compatibility
    const formattedCandidates = candidates.map((c) => ({
      ...c,
      id: c._id.toString(),
    }));

    // Get total count of unique candidates (for pagination)
    const countPipeline = [
      {
        $match: {
          source: { $in: ["hr_apply", "hr_interview", "hr_hire", "hr_reject"] },
          email: { $exists: true, $ne: "" },
        },
      },
      ...(req.query.status
        ? [{ $match: { status: req.query.status } }]
        : []),
      ...(req.query.role
        ? [{ $match: { jobRole: new RegExp(req.query.role, "i") } }]
        : []),
      { $sort: { email: 1, createdAt: -1 } },
      { $group: { _id: "$email" } },
      { $count: "total" },
    ];

    const countResult = await Candidate.aggregate(countPipeline);
    const totalCount = countResult[0]?.total || 0;

    res.json({
      success: true,
      count: formattedCandidates.length,
      total: totalCount,
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
