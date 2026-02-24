import express from "express";
import {
  runScreeningFlow,
  runInterviewFlow,
  runHiringFlow,
  runRejectionFlow
} from "../orchestrator/hrFlow.js";
import multer from "multer";
import Candidate from "../models/Candidate.js";
import ActivityLog from "../models/ActivityLog.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// STAGE 1: Apply & screen resume
router.post("/apply", upload.single("resume"), async (req, res) => {
  try {
    const { name, email, role, salary, startDate } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ error: "name, email, role are required" });
    }

    const resumeText = req.file
      ? req.file.buffer.toString("utf-8")
      : req.body.resumeText;

    if (!resumeText) {
      return res.status(400).json({ error: "resumeText is required" });
    }

    const result = await runScreeningFlow({
      name: name.trim(),
      email: email.trim(),
      role: role.trim(),
      salary: salary || "To be discussed",
      startDate: startDate || "March 1, 2026",
      resume: resumeText,
    });

    // Save candidate screening to DB
    const candidate = await Candidate.create({
      candidateName: name.trim(),
      email: email.trim(),
      jobRole: role.trim(),
      score: result.score ?? result.atsScore ?? null,
      decision: result.decision || null,
      scoringMethod: result.scoring_method || "none",
      source: "hr_apply",
      summary: result.summary || `Applied for ${role}`,
      rawResult: result,
      phone: req.body.phone || null,
      position: role.trim(),
      location: req.body.location || null,
      experience: req.body.experience || null,
      education: req.body.education || null,
      resumeScore: result.score ?? result.atsScore ?? null,
      status: "applied",
      notes: req.body.notes || null,
    }).catch((e) => console.error("DB save error:", e.message));

    // Log activity
    ActivityLog.create({
      type: "apply",
      action: "Application Received",
      detail: `${name.trim()} applied for ${role.trim()}`,
      candidateId: candidate?._id || null,
    }).catch((e) => console.error("Activity log error:", e.message));

    res.json({ success: true, result });
  } catch (err) {
    console.error("Apply Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// STAGE 2: Schedule interview (after screening passed)
router.post("/schedule-interview", async (req, res) => {
  try {
    const { name, email, role } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ error: "name, email, role are required" });
    }

    const result = await runInterviewFlow({
      name: req.body.name.trim(),
      email: req.body.email.trim(),
      role: req.body.role.trim(),
    });

    // Save interview scheduling to DB
    const candidate = await Candidate.create({
      candidateName: name.trim(),
      email: email.trim(),
      jobRole: role.trim(),
      source: "hr_interview",
      summary: `Interview scheduled for ${role}`,
      rawResult: result,
      phone: req.body.phone || null,
      position: role.trim(),
      location: req.body.location || null,
      experience: req.body.experience || null,
      education: req.body.education || null,
      status: "interview_scheduled",
      interviewDate: req.body.interviewDate || null,
      meetLink: req.body.meetLink || null,
      notes: req.body.notes || null,
    }).catch((e) => console.error("DB save error:", e.message));

    // Log activity
    ActivityLog.create({
      type: "schedule",
      action: "Interview Scheduled",
      detail: `${name.trim()} — ${req.body.interviewDate || "TBD"}`,
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
    const { name, email, role, salary, startDate } = req.body;

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

    // Save hiring decision to DB
    const candidate = await Candidate.create({
      candidateName: name.trim(),
      email: email.trim(),
      jobRole: role.trim(),
      decision: "selected",
      source: "hr_hire",
      summary: `Hired for ${role}`,
      rawResult: result,
      phone: req.body.phone || null,
      position: role.trim(),
      location: req.body.location || null,
      experience: req.body.experience || null,
      education: req.body.education || null,
      status: "hired",
      notes: req.body.notes || null,
    }).catch((e) => console.error("DB save error:", e.message));

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
    const { name, email, role } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ error: "name, email, role are required" });
    }

    const result = await runRejectionFlow({
      name:  name.trim(),
      email: email.trim(),
      role:  role.trim(),
    });

    // Save rejection to DB
    const candidate = await Candidate.create({
      candidateName: name.trim(),
      email: email.trim(),
      jobRole: role.trim(),
      decision: "rejected",
      source: "hr_reject",
      summary: `Rejected for ${role}`,
      rawResult: result,
      phone: req.body.phone || null,
      position: role.trim(),
      location: req.body.location || null,
      experience: req.body.experience || null,
      education: req.body.education || null,
      status: "rejected",
      notes: req.body.notes || null,
    }).catch((e) => console.error("DB save error:", e.message));

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
