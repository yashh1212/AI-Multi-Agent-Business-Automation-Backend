import express from "express";
import { runHRFlow } from "../orchestrator/hrFlow.js";
import multer from "multer";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Web form application
router.post("/apply", upload.single("resume"), async (req, res) => {
  try {
    const { name, email, role, salary, startDate } = req.body;
    const resumeText = req.file
      ? req.file.buffer.toString("utf-8")
      : req.body.resumeText;

    const result = await runHRFlow({
      name, email, role, salary,
      startDate: startDate || "March 1, 2026",
      resume: resumeText,
      hired: false,
    });

    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Hire a candidate (after interview)
router.post("/hire", async (req, res) => {
  try {
    const result = await runHRFlow({ ...req.body, hired: true });
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;