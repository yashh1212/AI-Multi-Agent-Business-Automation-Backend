import express from "express";
import {
  runScreeningFlow,
  runInterviewFlow,
  runHiringFlow,
} from "../orchestrator/hrFlow.js";
import multer from "multer";
import Candidate from "../models/Candidate.js";

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
    Candidate.create({
      candidateName: name.trim(),
      email: email.trim(),
      jobRole: role.trim(),
      score: result.score ?? result.atsScore ?? null,
      decision: result.decision || null,
      scoringMethod: result.scoring_method || "none",
      source: "hr_apply",
      summary: result.summary || `Applied for ${role}`,
      rawResult: result,
    }).catch((e) => console.error("DB save error:", e.message));

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
    Candidate.create({
      candidateName: name.trim(),
      email: email.trim(),
      jobRole: role.trim(),
      source: "hr_interview",
      summary: `Interview scheduled for ${role}`,
      rawResult: result,
    }).catch((e) => console.error("DB save error:", e.message));

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
    Candidate.create({
      candidateName: name.trim(),
      email: email.trim(),
      jobRole: role.trim(),
      decision: "selected",
      source: "hr_hire",
      summary: `Hired for ${role}`,
      rawResult: result,
    }).catch((e) => console.error("DB save error:", e.message));

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
    Candidate.create({
      candidateName: name.trim(),
      email: email.trim(),
      jobRole: role.trim(),
      decision: "rejected",
      source: "hr_reject",
      summary: `Rejected for ${role}`,
      rawResult: result,
    }).catch((e) => console.error("DB save error:", e.message));

    res.json({ success: true, result });
  } catch (err) {
    console.error("Rejection Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});
export default router;
