import express from "express";
import {
  runLeadCaptureFlow,
  runQualificationFlow,
  runOutreachFlow,
  runFollowUpFlow,
  runScheduleMeetingFlow,
  runProposalFlow,
  runObjectionFlow,
  runCloseDealFlow,
} from "../orchestrator/salesFlow.js";
import Lead from "../models/Lead.js";
import SalesLog from "../models/SalesLog.js";

const router = express.Router();

// ═══════════════════════════════════════
// POST /sales/capture — Capture a new lead
// ═══════════════════════════════════════
router.post("/capture", async (req, res) => {
  try {
    const { name, email, company, phone, source, interest, dealValue } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: "name and email are required" });
    }

    const result = await runLeadCaptureFlow({
      name, email, company, phone, source, interest, dealValue,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Capture Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// POST /sales/qualify — Qualify a lead (BANT)
// ═══════════════════════════════════════
router.post("/qualify", async (req, res) => {
  try {
    const { leadId, budget, authority, need, timeline } = req.body;

    if (!leadId) {
      return res.status(400).json({ error: "leadId is required" });
    }

    const result = await runQualificationFlow(leadId, {
      budget, authority, need, timeline,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Qualify Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// POST /sales/outreach — Send outreach email
// ═══════════════════════════════════════
router.post("/outreach", async (req, res) => {
  try {
    const { leadId } = req.body;

    if (!leadId) {
      return res.status(400).json({ error: "leadId is required" });
    }

    const result = await runOutreachFlow(leadId);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Outreach Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// POST /sales/followup — Send follow-up email
// ═══════════════════════════════════════
router.post("/followup", async (req, res) => {
  try {
    const { leadId, followUpNumber } = req.body;

    if (!leadId) {
      return res.status(400).json({ error: "leadId is required" });
    }

    const result = await runFollowUpFlow(leadId, followUpNumber || 1);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Follow-up Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// POST /sales/schedule — Schedule a meeting
// ═══════════════════════════════════════
router.post("/schedule", async (req, res) => {
  try {
    const { leadId, meetingType, preferredDate } = req.body;

    if (!leadId) {
      return res.status(400).json({ error: "leadId is required" });
    }

    const result = await runScheduleMeetingFlow(leadId, meetingType || "demo", preferredDate || null);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Schedule Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// POST /sales/proposal — Send a proposal
// ═══════════════════════════════════════
router.post("/proposal", async (req, res) => {
  try {
    const { leadId, planName, price, features, validUntil } = req.body;

    if (!leadId) {
      return res.status(400).json({ error: "leadId is required" });
    }

    const result = await runProposalFlow(leadId, {
      planName, price, features, validUntil,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Proposal Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// POST /sales/objection — Handle an objection
// ═══════════════════════════════════════
router.post("/objection", async (req, res) => {
  try {
    const { leadId, objectionType, objectionText } = req.body;

    if (!leadId || !objectionType || !objectionText) {
      return res.status(400).json({ error: "leadId, objectionType, objectionText are required" });
    }

    const result = await runObjectionFlow(leadId, objectionType, objectionText);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Objection Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// POST /sales/close — Close a deal
// ═══════════════════════════════════════
router.post("/close", async (req, res) => {
  try {
    const { leadId, status, lostReason } = req.body;

    if (!leadId || !status) {
      return res.status(400).json({ error: "leadId and status (won|lost) are required" });
    }

    if (!["won", "lost"].includes(status)) {
      return res.status(400).json({ error: "status must be 'won' or 'lost'" });
    }

    const result = await runCloseDealFlow(leadId, status, lostReason);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Close Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// GET /sales/lead/:id — Get lead profile
// ═══════════════════════════════════════
router.get("/lead/:id", async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id).lean();
    if (!lead) {
      return res.status(404).json({ success: false, error: "Lead not found" });
    }

    // Get activity timeline
    const timeline = await SalesLog.find({ leadId: lead._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ success: true, data: { ...lead, timeline } });
  } catch (err) {
    console.error("Lead Lookup Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════
// GET /sales/leads — List leads
// ═══════════════════════════════════════
router.get("/leads", async (req, res) => {
  try {
    const filter = {};
    if (req.query.stage) filter.stage = req.query.stage;
    if (req.query.source) filter.source = req.query.source;
    if (req.query.company) filter.company = new RegExp(req.query.company, "i");

    const leads = await Lead.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(req.query.limit) || 100)
      .lean();

    res.json({ success: true, count: leads.length, data: leads });
  } catch (err) {
    console.error("Leads List Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════
// GET /sales/stats — Pipeline statistics
// ═══════════════════════════════════════
router.get("/stats", async (req, res) => {
  try {
    // Total leads per stage
    const stageCounts = await Lead.aggregate([
      { $group: { _id: "$stage", count: { $sum: 1 }, totalValue: { $sum: "$dealValue" } } },
    ]);

    // Total pipeline value (active deals only)
    const activePipeline = await Lead.aggregate([
      { $match: { stage: { $nin: ["closed_won", "closed_lost"] } } },
      { $group: { _id: null, totalValue: { $sum: "$dealValue" }, count: { $sum: 1 } } },
    ]);

    // Closed deals
    const closedWon = await Lead.countDocuments({ stage: "closed_won" });
    const closedLost = await Lead.countDocuments({ stage: "closed_lost" });
    const totalLeads = await Lead.countDocuments();

    // Revenue
    const revenue = await Lead.aggregate([
      { $match: { stage: "closed_won" } },
      { $group: { _id: null, total: { $sum: "$dealValue" } } },
    ]);

    // Average deal size
    const avgDeal = await Lead.aggregate([
      { $match: { stage: "closed_won", dealValue: { $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: "$dealValue" } } },
    ]);

    // By source
    const sourceCounts = await Lead.aggregate([
      { $group: { _id: "$source", count: { $sum: 1 }, totalValue: { $sum: "$dealValue" } } },
    ]);

    const conversionRate = totalLeads > 0 ? ((closedWon / totalLeads) * 100).toFixed(1) : 0;

    res.json({
      success: true,
      data: {
        totalLeads,
        stageBreakdown: stageCounts,
        activePipeline: activePipeline[0] || { totalValue: 0, count: 0 },
        closedWon,
        closedLost,
        conversionRate: `${conversionRate}%`,
        totalRevenue: revenue[0]?.total || 0,
        averageDealSize: Math.round(avgDeal[0]?.avg || 0),
        sourceBreakdown: sourceCounts,
      },
    });
  } catch (err) {
    console.error("Stats Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════
// GET /sales/logs — Activity logs
// ═══════════════════════════════════════
router.get("/logs", async (req, res) => {
  try {
    const filter = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.leadId) filter.leadId = req.query.leadId;

    const logs = await SalesLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(req.query.limit) || 100)
      .lean();

    res.json({ success: true, count: logs.length, data: logs });
  } catch (err) {
    console.error("Sales Logs Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════
// PUT /sales/lead/:id/stage — Update lead stage
// ═══════════════════════════════════════
router.put("/lead/:id/stage", async (req, res) => {
  try {
    const { newStage, reason } = req.body;

    if (!newStage) {
      return res.status(400).json({ error: "newStage is required" });
    }

    const validStages = [
      "new_lead", "contacted", "qualified", "demo_scheduled",
      "proposal_sent", "negotiation", "closed_won", "closed_lost",
    ];

    if (!validStages.includes(newStage)) {
      return res.status(400).json({ error: `Invalid stage. Must be one of: ${validStages.join(", ")}` });
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, error: "Lead not found" });
    }

    const oldStage = lead.stage;
    lead.stage = newStage;
    if (newStage === "closed_won" || newStage === "closed_lost") {
      lead.closedAt = new Date();
    }
    await lead.save();

    await SalesLog.create({
      type: "stage_change",
      action: "Stage Updated",
      detail: `${lead.name} — ${oldStage} → ${newStage}${reason ? ` — ${reason}` : ""}`,
      leadId: lead._id,
      metadata: { oldStage, newStage, reason },
    });

    res.json({ success: true, data: lead });
  } catch (err) {
    console.error("Stage Update Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════
// POST /sales/lead/:id/note — Add a note
// ═══════════════════════════════════════
router.post("/lead/:id/note", async (req, res) => {
  try {
    const { text, type } = req.body;

    if (!text) {
      return res.status(400).json({ error: "text is required" });
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, error: "Lead not found" });
    }

    lead.notes.push({ text, type: type || "internal" });
    await lead.save();

    await SalesLog.create({
      type: "note",
      action: "Note Added",
      detail: `${lead.name} — ${text.substring(0, 100)}`,
      leadId: lead._id,
    });

    res.json({ success: true, data: lead });
  } catch (err) {
    console.error("Note Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
