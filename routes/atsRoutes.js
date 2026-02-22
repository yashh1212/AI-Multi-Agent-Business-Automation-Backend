import express from "express";
import multer from "multer";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
import { screenResume } from "../agents/hr/resumeScreenerAgent.js";
import { calculateATSScore, getSupportedRoles } from "../utils/atsScoreCalculator.js";
import Candidate from "../models/Candidate.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.mimetype === "text/plain") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and TXT files are accepted"), false);
    }
  },
});

/**
 * Extract text from uploaded file (PDF or plain text)
 */
async function extractResumeText(req) {
  if (req.file) {
    if (req.file.mimetype === "application/pdf") {
      const pdfData = await pdfParse(req.file.buffer);
      return pdfData.text;
    }
    return req.file.buffer.toString("utf-8");
  }
  return req.body.resumeText || "";
}

// ─── GET /ats/roles — List supported roles ─────────────────────────────────────

router.get("/roles", (req, res) => {
  res.json({
    success: true,
    roles: getSupportedRoles(),
  });
});

// ─── POST /ats/score — Full ATS analysis (deterministic + LLM) ─────────────────

router.post("/score", upload.single("resume"), async (req, res) => {
  try {
    const resumeText = await extractResumeText(req);
    const { jobRole, jobDescription } = req.body;

    if (!resumeText || !resumeText.trim()) {
      return res.status(400).json({
        success: false,
        error: "Resume text is required. Provide 'resumeText' in body or upload a PDF file.",
      });
    }

    if (!jobRole || !jobRole.trim()) {
      return res.status(400).json({
        success: false,
        error: "Job role is required. Provide 'jobRole' in the request body.",
      });
    }

    const result = await screenResume(resumeText, jobRole, { jobDescription });

    // Save to DB (fire-and-forget)
    Candidate.create({
      candidateName: req.body.candidateName || "Unknown",
      email: req.body.email,
      jobRole,
      score: result.score,
      decision: result.decision,
      scoringMethod: result.scoring_method || "hybrid",
      source: "ats_score",
      atsBreakdown: result.ats_breakdown,
      strengths: result.strengths,
      weaknesses: result.weaknesses,
      recommendations: result.recommendations,
      keySkills: result.key_skills,
      missingSkills: result.missing_skills,
      summary: result.summary,
      rawResult: result,
    }).catch((e) => console.error("DB save error:", e.message));

    res.json({
      success: true,
      data: {
        ...result,
        jobRole,
        analyzedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("ATS Score Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /ats/quick-score — Fast deterministic-only score (no LLM) ────────────

router.post("/quick-score", upload.single("resume"), async (req, res) => {
  try {
    const resumeText = await extractResumeText(req);
    const { jobRole, jobDescription } = req.body;

    if (!resumeText || !resumeText.trim()) {
      return res.status(400).json({
        success: false,
        error: "Resume text is required.",
      });
    }

    if (!jobRole || !jobRole.trim()) {
      return res.status(400).json({
        success: false,
        error: "Job role is required.",
      });
    }

    const result = calculateATSScore(resumeText, jobRole, { jobDescription });

    // Save to DB (fire-and-forget)
    Candidate.create({
      candidateName: req.body.candidateName || "Unknown",
      email: req.body.email,
      jobRole,
      score: result.overallScore,
      decision: result.decision,
      scoringMethod: "quick_score",
      source: "ats_quick_score",
      atsBreakdown: result.breakdown,
      recommendations: result.recommendations,
      keySkills: result.breakdown?.skills?.matchedSkills,
      missingSkills: result.breakdown?.skills?.missingSkills,
      summary: `Quick ATS Score: ${result.overallScore}/100 — ${result.decision}`,
      rawResult: result,
    }).catch((e) => console.error("DB save error:", e.message));

    res.json({
      success: true,
      data: {
        ...result,
        jobRole,
        analyzedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("Quick Score Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /ats/batch-score — Score multiple resumes against one role ────────────

router.post("/batch-score", async (req, res) => {
  try {
    const { resumes, jobRole, jobDescription } = req.body;

    if (!Array.isArray(resumes) || resumes.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Provide an array of 'resumes' with at least one entry.",
      });
    }

    if (!jobRole || !jobRole.trim()) {
      return res.status(400).json({
        success: false,
        error: "Job role is required.",
      });
    }

    if (resumes.length > 20) {
      return res.status(400).json({
        success: false,
        error: "Maximum 20 resumes per batch request.",
      });
    }

    // Process all resumes in parallel with deterministic scoring
    // (batch uses quick-score to avoid LLM rate limits)
    const results = await Promise.all(
      resumes.map(async (entry, index) => {
        const text = entry.resumeText || "";
        if (!text.trim()) {
          return {
            index,
            name: entry.name || `Resume ${index + 1}`,
            error: "Empty resume text",
          };
        }

        const score = calculateATSScore(text, jobRole, { jobDescription });
        return {
          index,
          name: entry.name || `Resume ${index + 1}`,
          ...score,
        };
      })
    );

    // Sort by score descending
    const ranked = results
      .filter((r) => !r.error)
      .sort((a, b) => b.overallScore - a.overallScore);

    const errors = results.filter((r) => r.error);

    // Save each scored resume to DB (fire-and-forget)
    const docsToSave = ranked.map((r) => ({
      candidateName: r.name,
      jobRole,
      score: r.overallScore,
      decision: r.decision,
      scoringMethod: "quick_score",
      source: "ats_batch",
      atsBreakdown: r.breakdown,
      recommendations: r.recommendations,
      keySkills: r.breakdown?.skills?.matchedSkills,
      missingSkills: r.breakdown?.skills?.missingSkills,
      summary: `Batch ATS Score: ${r.overallScore}/100 — ${r.decision}`,
      rawResult: r,
    }));
    if (docsToSave.length > 0) {
      Candidate.insertMany(docsToSave).catch((e) =>
        console.error("DB batch save error:", e.message)
      );
    }

    res.json({
      success: true,
      data: {
        jobRole,
        totalProcessed: resumes.length,
        totalSelected: ranked.filter((r) => r.decision === "selected").length,
        totalRejected: ranked.filter((r) => r.decision === "rejected").length,
        averageScore: ranked.length > 0
          ? Math.round(ranked.reduce((sum, r) => sum + r.overallScore, 0) / ranked.length)
          : 0,
        rankings: ranked,
        errors,
        analyzedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("Batch Score Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /ats/history — Retrieve all candidate screening history ────────────────

router.get("/history", async (req, res) => {
  try {
    const filter = {};
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
    console.error("History Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /ats/history/:id — Retrieve a single candidate record ──────────────────

router.get("/history/:id", async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id).lean();
    if (!candidate) {
      return res.status(404).json({ success: false, error: "Candidate not found" });
    }
    res.json({ success: true, data: candidate });
  } catch (err) {
    console.error("History Lookup Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
