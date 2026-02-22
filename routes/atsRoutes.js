import express from "express";
import multer from "multer";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
import { screenResume } from "../agents/hr/resumeScreenerAgent.js";
import { calculateATSScore, getSupportedRoles } from "../utils/atsScoreCalculator.js";

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

export default router;
