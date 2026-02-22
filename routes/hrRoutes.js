import express from "express";
import {
  runScreeningFlow,
  runInterviewFlow,
  runHiringFlow,
} from "../orchestrator/hrFlow.js";
import multer from "multer";

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

    res.json({ success: true, result });
  } catch (err) {
    console.error("Rejection Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});
export default router;
