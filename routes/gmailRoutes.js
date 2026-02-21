const express = require("express");
const router = express.Router();

const gmail = require("../services/gmailService");
const { emailAgent } = require("../agents/emailAgent");


// GET EMAILS
router.get("/emails", async (req, res) => {
  try {
    const emails = await gmail.getEmails();
    res.json(emails);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GENERATE AI REPLY
router.post("/reply", async (req, res) => {
  try {
    const { emailText } = req.body;

    const result = await emailAgent(emailText);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;