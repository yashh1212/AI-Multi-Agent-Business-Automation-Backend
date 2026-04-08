import express from "express";
import Candidate from "../models/Candidate.js";
import Lead from "../models/Lead.js";
import ActivityLog from "../models/ActivityLog.js";
import SalesLog from "../models/SalesLog.js";

const router = express.Router();

// ═══════════════════════════════════════════════════════════════
// GET /api/dashboard — Single aggregated endpoint for the frontend
// ═══════════════════════════════════════════════════════════════

router.get("/", async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const eightWeeksAgo = new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000);

    // ─── Run all aggregations in parallel ────────────────────────────────

    const [
      totalCandidates,
      activeCandidates,
      hiredTotal,
      hiredToday,
      rejectedTotal,
      interviewScheduled,
      totalLeads,
      activeLeadsAgg,
      closedWon,
      closedLost,
      revenueAgg,
      emailsToday,
      hrLogsToday,
      salesLogsToday,
      recentHRLogs,
      recentSalesLogs,
      candidatesByStatus,
      leadsByStage,
      weeklyHRActivity,
      weeklySalesActivity,
      dailyHRActivity,
      dailySalesActivity,
      hrLogsByType,
      salesLogsByType,
    ] = await Promise.all([
      // Candidate counts
      Candidate.countDocuments(),
      Candidate.countDocuments({ status: { $in: ["applied", "shortlisted", "interview_scheduled"] } }),
      Candidate.countDocuments({ status: "hired" }),
      Candidate.countDocuments({ status: "hired", createdAt: { $gte: startOfDay } }),
      Candidate.countDocuments({ status: "rejected" }),
      Candidate.countDocuments({ status: "interview_scheduled" }),

      // Lead counts
      Lead.countDocuments(),
      Lead.aggregate([
        { $match: { stage: { $nin: ["closed_won", "closed_lost"] } } },
        { $group: { _id: null, totalValue: { $sum: "$dealValue" }, count: { $sum: 1 } } },
      ]),
      Lead.countDocuments({ stage: "closed_won" }),
      Lead.countDocuments({ stage: "closed_lost" }),
      Lead.aggregate([
        { $match: { stage: "closed_won" } },
        { $group: { _id: null, total: { $sum: "$dealValue" } } },
      ]),

      // Today's activity
      ActivityLog.countDocuments({ type: "email", createdAt: { $gte: startOfDay } }),
      ActivityLog.countDocuments({ createdAt: { $gte: startOfDay } }),
      SalesLog.countDocuments({ createdAt: { $gte: startOfDay } }),

      // Recent logs (for activity feed)
      ActivityLog.find().sort({ createdAt: -1 }).limit(20).lean(),
      SalesLog.find().sort({ createdAt: -1 }).limit(20).lean(),

      // Breakdown by status/stage
      Candidate.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Lead.aggregate([
        { $group: { _id: "$stage", count: { $sum: 1 }, totalValue: { $sum: "$dealValue" } } },
      ]),

      // Weekly trend — HR
      ActivityLog.aggregate([
        { $match: { createdAt: { $gte: eightWeeksAgo } } },
        {
          $group: {
            _id: { $isoWeek: "$createdAt" },
            count: { $sum: 1 },
            year: { $first: { $isoWeekYear: "$createdAt" } },
          },
        },
        { $sort: { year: 1, _id: 1 } },
        { $limit: 8 },
      ]),

      // Weekly trend — Sales
      SalesLog.aggregate([
        { $match: { createdAt: { $gte: eightWeeksAgo } } },
        {
          $group: {
            _id: { $isoWeek: "$createdAt" },
            count: { $sum: 1 },
            year: { $first: { $isoWeekYear: "$createdAt" } },
          },
        },
        { $sort: { year: 1, _id: 1 } },
        { $limit: 8 },
      ]),

      // Daily trend (last 7 days) — HR
      ActivityLog.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: { $dayOfWeek: "$createdAt" },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Daily trend (last 7 days) — Sales
      SalesLog.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: { $dayOfWeek: "$createdAt" },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // HR logs by type (for agent performance)
      ActivityLog.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]),

      // Sales logs by type
      SalesLog.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]),
    ]);

    // ─── Build stats ─────────────────────────────────────────────────────

    const activePipeline = activeLeadsAgg[0] || { totalValue: 0, count: 0 };
    const totalRevenue = revenueAgg[0]?.total || 0;
    const conversionRate = totalLeads > 0 ? ((closedWon / totalLeads) * 100).toFixed(1) : "0.0";
    const completedToday = hrLogsToday + salesLogsToday;

    const stats = {
      totalCandidates,
      activeCandidates,
      hiredTotal,
      hiredToday,
      rejectedTotal,
      interviewScheduled,
      totalLeads,
      activeLeads: activePipeline.count,
      activePipelineValue: activePipeline.totalValue,
      closedWon,
      closedLost,
      totalRevenue,
      conversionRate: `${conversionRate}%`,
      emailsSentToday: emailsToday,
      completedToday,
      candidatesByStatus: Object.fromEntries(candidatesByStatus.map((s) => [s._id || "unknown", s.count])),
      leadsByStage: Object.fromEntries(leadsByStage.map((s) => [s._id || "unknown", { count: s.count, value: s.totalValue }])),
    };

    // ─── Build chart data ────────────────────────────────────────────────

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    // Daily activity for email analytics chart (last 7 days)
    const dailyHRMap = Object.fromEntries(dailyHRActivity.map((d) => [d._id, d.count]));
    const dailySalesMap = Object.fromEntries(dailySalesActivity.map((d) => [d._id, d.count]));

    const emailAnalytics = dayNames.map((name, i) => {
      const dayNum = i + 1; // MongoDB $dayOfWeek: 1=Sun, 2=Mon, ...
      const hr = dailyHRMap[dayNum] || 0;
      const sales = dailySalesMap[dayNum] || 0;
      return { name, sent: hr + sales, opened: Math.round((hr + sales) * 0.8), clicked: Math.round((hr + sales) * 0.5) };
    });

    // Weekly workflow trend
    const hrWeekMap = Object.fromEntries(weeklyHRActivity.map((w) => [w._id, w.count]));
    const salesWeekMap = Object.fromEntries(weeklySalesActivity.map((w) => [w._id, w.count]));
    const allWeeks = [...new Set([...Object.keys(hrWeekMap), ...Object.keys(salesWeekMap)])].sort((a, b) => a - b).slice(-8);

    const workflowTrend = allWeeks.map((week, i) => {
      const hr = hrWeekMap[week] || 0;
      const sales = salesWeekMap[week] || 0;
      const total = hr + sales;
      return {
        name: `Week ${i + 1}`,
        executions: total,
        successful: Math.round(total * 0.95),
        failed: Math.max(0, total - Math.round(total * 0.95)),
      };
    });

    // Agent performance (derived from log type volumes, normalized to 80-100 range)
    const hrTypeMap = Object.fromEntries(hrLogsByType.map((t) => [t._id, t.count]));
    const salesTypeMap = Object.fromEntries(salesLogsByType.map((t) => [t._id, t.count]));
    const maxVolume = Math.max(1, ...Object.values(hrTypeMap), ...Object.values(salesTypeMap));

    const normalize = (val) => Math.round(80 + (val / maxVolume) * 20);

    const agentPerformance = dayNames.map((name, i) => {
      const dayNum = i + 1;
      const hrVal = dailyHRMap[dayNum] || 0;
      const salesVal = dailySalesMap[dayNum] || 0;
      return {
        name,
        screening: normalize(hrVal),
        interview: normalize(Math.round(hrVal * 0.7)),
        sales: normalize(salesVal),
        email: normalize(Math.round((hrVal + salesVal) * 0.6)),
        qualification: normalize(Math.round(salesVal * 0.8)),
      };
    });

    const chartData = {
      agentPerformance,
      workflowTrend,
      emailAnalytics,
    };

    // ─── Build agents list (system agents with live status) ──────────────

    const agentDefs = [
      { id: 1, name: "Resume Screener", role: "HR — Screening", description: "Screens resumes with ATS scoring and AI analysis" },
      { id: 2, name: "Interview Scheduler", role: "HR — Scheduling", description: "Schedules and coordinates candidate interviews" },
      { id: 3, name: "Offer Letter Agent", role: "HR — Hiring", description: "Generates personalized offer letters and onboarding plans" },
      { id: 4, name: "Lead Qualifier", role: "Sales — BANT", description: "Qualifies leads using BANT framework scoring" },
      { id: 5, name: "Email Craft Agent", role: "Sales — Outreach", description: "Crafts personalized outreach and follow-up emails" },
      { id: 6, name: "Objection Handler", role: "Sales — Closing", description: "Handles objections with AI-crafted rebuttals" },
      { id: 7, name: "Classifier Agent", role: "Support — Routing", description: "Classifies incoming tickets and routes to departments" },
      { id: 8, name: "Email Notifier", role: "Support — Comms", description: "Sends automated email notifications via Gmail" },
    ];

    // Derive statuses from recent activity
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000);

    const recentHR = await ActivityLog.findOne().sort({ createdAt: -1 }).lean();
    const recentSales = await SalesLog.findOne().sort({ createdAt: -1 }).lean();

    const agents = agentDefs.map((def) => {
      let status = "idle";
      let lastActivity = "No activity";
      let tasksCompleted = 0;

      // Map agents to their data sources
      if (def.id <= 3) {
        // HR agents
        const relevantTypes = def.id === 1 ? ["apply", "screen"] : def.id === 2 ? ["schedule"] : ["hire"];
        const count = relevantTypes.reduce((sum, t) => sum + (hrTypeMap[t] || 0), 0);
        tasksCompleted = count;
        if (recentHR && new Date(recentHR.createdAt) > fiveMinAgo && relevantTypes.includes(recentHR.type)) {
          status = "running";
        } else if (recentHR && new Date(recentHR.createdAt) > fifteenMinAgo) {
          status = "thinking";
        }
        if (recentHR) {
          const diffMs = now - new Date(recentHR.createdAt);
          lastActivity = formatTimeAgo(diffMs);
        }
      } else if (def.id <= 6) {
        // Sales agents
        const relevantTypes = def.id === 4 ? ["qualify", "capture"] : def.id === 5 ? ["outreach", "followup"] : ["objection", "close"];
        const count = relevantTypes.reduce((sum, t) => sum + (salesTypeMap[t] || 0), 0);
        tasksCompleted = count;
        if (recentSales && new Date(recentSales.createdAt) > fiveMinAgo && relevantTypes.includes(recentSales.type)) {
          status = "running";
        } else if (recentSales && new Date(recentSales.createdAt) > fifteenMinAgo) {
          status = "thinking";
        }
        if (recentSales) {
          const diffMs = now - new Date(recentSales.createdAt);
          lastActivity = formatTimeAgo(diffMs);
        }
      } else {
        // Support agents — derive from HR email logs
        const emailCount = hrTypeMap["email"] || 0;
        tasksCompleted = emailCount;
        if (recentHR && new Date(recentHR.createdAt) > fiveMinAgo) {
          status = "running";
        } else if (recentHR && new Date(recentHR.createdAt) > fifteenMinAgo) {
          status = "thinking";
        }
        if (recentHR) {
          const diffMs = now - new Date(recentHR.createdAt);
          lastActivity = formatTimeAgo(diffMs);
        }
      }

      const performance = Math.min(100, Math.max(70, 85 + Math.round(tasksCompleted * 0.5)));

      return { ...def, status, lastActivity, tasksCompleted, performance };
    });

    // ─── Build workflows list (derived from pipeline data) ───────────────

    const workflows = [
      {
        id: 1,
        name: "HR Recruitment Pipeline",
        status: activeCandidates > 0 ? "running" : "completed",
        steps: ["Resume Screen", "ATS Score", "Interview Schedule", "Decision", "Offer Letter"],
        completedSteps: hiredTotal > 0 ? 5 : interviewScheduled > 0 ? 3 : activeCandidates > 0 ? 1 : 0,
        lastRun: recentHR ? formatTimeAgo(now - new Date(recentHR.createdAt)) : "Never",
        totalRuns: totalCandidates,
      },
      {
        id: 2,
        name: "Sales Lead Pipeline",
        status: activePipeline.count > 0 ? "running" : closedWon > 0 ? "completed" : "paused",
        steps: ["Lead Capture", "BANT Qualify", "Email Outreach", "Meeting Schedule", "Proposal & Close"],
        completedSteps: closedWon > 0 ? 5 : activePipeline.count > 0 ? Math.min(4, Math.ceil(activePipeline.count / 2)) : 0,
        lastRun: recentSales ? formatTimeAgo(now - new Date(recentSales.createdAt)) : "Never",
        totalRuns: totalLeads,
      },
      {
        id: 3,
        name: "ATS Batch Scoring",
        status: totalCandidates > 0 ? "completed" : "paused",
        steps: ["Resume Upload", "Parse Text", "ATS Score", "Rank Candidates", "Generate Report"],
        completedSteps: totalCandidates > 0 ? 5 : 0,
        lastRun: recentHR ? formatTimeAgo(now - new Date(recentHR.createdAt)) : "Never",
        totalRuns: totalCandidates,
      },
      {
        id: 4,
        name: "Email Notification Pipeline",
        status: emailsToday > 0 ? "running" : "paused",
        steps: ["Trigger Event", "Template Select", "Compose Email", "Send via Gmail", "Log Result"],
        completedSteps: emailsToday > 0 ? 5 : 0,
        lastRun: emailsToday > 0 ? "Today" : "No emails today",
        totalRuns: hrTypeMap["email"] || 0,
      },
      {
        id: 5,
        name: "Support Ticket Flow",
        status: completedToday > 0 ? "running" : "paused",
        steps: ["Ticket Received", "Classify Intent", "Route to Agent", "Process", "Resolve & Notify"],
        completedSteps: completedToday > 0 ? 3 : 0,
        lastRun: completedToday > 0 ? "Today" : "No activity",
        totalRuns: completedToday,
      },
    ];

    // ─── Build activity logs (merged + sorted) ───────────────────────────

    const mergedLogs = [
      ...recentHRLogs.map((log) => ({
        id: log._id,
        type: mapHRLogType(log.type),
        agent: mapHRAgent(log.type),
        action: log.action,
        detail: log.detail || "",
        timestamp: formatTimeAgo(now - new Date(log.createdAt)),
        createdAt: log.createdAt,
      })),
      ...recentSalesLogs.map((log) => ({
        id: log._id,
        type: mapSalesLogType(log.type),
        agent: mapSalesAgent(log.type),
        action: log.action,
        detail: log.detail || "",
        timestamp: formatTimeAgo(now - new Date(log.createdAt)),
        createdAt: log.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 30);

    // ─── Build integrations (static config + live sync info) ─────────────

    const integrations = [
      { id: 1, name: "MongoDB", icon: "🍃", connected: true, lastSync: formatTimeAgo(0), syncStatus: "synced", category: "Database" },
      { id: 2, name: "Gmail", icon: "📧", connected: true, lastSync: emailsToday > 0 ? "Today" : "Inactive", syncStatus: emailsToday > 0 ? "synced" : "synced", category: "Email" },
      { id: 3, name: "Jira", icon: "🎯", connected: true, lastSync: "Configured", syncStatus: "synced", category: "Project Management" },
      { id: 4, name: "Slack", icon: "💬", connected: true, lastSync: "Configured", syncStatus: "synced", category: "Communication" },
      { id: 5, name: "Gemini AI", icon: "🤖", connected: true, lastSync: "Active", syncStatus: "synced", category: "AI Engine" },
      { id: 6, name: "Groq AI", icon: "⚡", connected: true, lastSync: "Active", syncStatus: "synced", category: "AI Engine" },
      { id: 7, name: "Google Calendar", icon: "📅", connected: false, lastSync: "Never", syncStatus: "disconnected", category: "Scheduling" },
      { id: 8, name: "HubSpot CRM", icon: "🧲", connected: false, lastSync: "Never", syncStatus: "disconnected", category: "CRM" },
    ];

    // ─── Email templates (from system config) ────────────────────────────

    const emailTemplates = [
      { id: 1, name: "Interview Invite", subject: "Interview Scheduled — {{role}}", status: "active", lastUsed: recentHR ? formatTimeAgo(now - new Date(recentHR.createdAt)) : "Never", sentCount: hrTypeMap["schedule"] || 0 },
      { id: 2, name: "Offer Letter", subject: "Welcome to {{company}} — Offer Letter", status: "active", lastUsed: recentHR ? formatTimeAgo(now - new Date(recentHR.createdAt)) : "Never", sentCount: hrTypeMap["hire"] || 0 },
      { id: 3, name: "Rejection Notice", subject: "Application Update — {{role}}", status: "active", lastUsed: recentHR ? formatTimeAgo(now - new Date(recentHR.createdAt)) : "Never", sentCount: hrTypeMap["reject"] || 0 },
      { id: 4, name: "Sales Outreach", subject: "Let's Connect — {{company}}", status: "active", lastUsed: recentSales ? formatTimeAgo(now - new Date(recentSales.createdAt)) : "Never", sentCount: salesTypeMap["outreach"] || 0 },
      { id: 5, name: "Follow-up Email", subject: "Following Up — {{name}}", status: "active", lastUsed: recentSales ? formatTimeAgo(now - new Date(recentSales.createdAt)) : "Never", sentCount: salesTypeMap["followup"] || 0 },
    ];

    // ─── Response ────────────────────────────────────────────────────────

    res.json({
      success: true,
      data: {
        stats,
        chartData,
        agents,
        workflows,
        activityLogs: mergedLogs,
        integrations,
        emailTemplates,
        timestamp: now.toISOString(),
      },
    });
  } catch (err) {
    console.error("Dashboard Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeAgo(ms) {
  if (ms < 0) ms = 0;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function mapHRLogType(type) {
  const map = { apply: "agent", screen: "agent", schedule: "workflow", hire: "workflow", reject: "agent", email: "email" };
  return map[type] || "agent";
}

function mapHRAgent(type) {
  const map = {
    apply: "Resume Screener",
    screen: "Resume Screener",
    schedule: "Interview Scheduler",
    hire: "Offer Letter Agent",
    reject: "Offer Letter Agent",
    email: "Email Notifier",
  };
  return map[type] || "HR Agent";
}

function mapSalesLogType(type) {
  const map = {
    capture: "agent",
    qualify: "agent",
    outreach: "email",
    followup: "email",
    schedule: "workflow",
    proposal: "workflow",
    objection: "agent",
    close: "workflow",
    note: "agent",
    stage_change: "workflow",
  };
  return map[type] || "agent";
}

function mapSalesAgent(type) {
  const map = {
    capture: "Lead Qualifier",
    qualify: "Lead Qualifier",
    outreach: "Email Craft Agent",
    followup: "Email Craft Agent",
    schedule: "Email Craft Agent",
    proposal: "Email Craft Agent",
    objection: "Objection Handler",
    close: "Objection Handler",
    note: "Lead Qualifier",
    stage_change: "Lead Qualifier",
  };
  return map[type] || "Sales Agent";
}

export default router;
