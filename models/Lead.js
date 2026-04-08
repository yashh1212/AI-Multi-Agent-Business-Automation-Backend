import mongoose from "mongoose";

const leadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    company: { type: String, trim: true },
    phone: { type: String, trim: true },
    course: { type: String, trim: true },
    source: {
      type: String,
      enum: ["website", "referral", "linkedin", "cold_outreach", "event", "other"],
      default: "other",
    },
    interest: { type: String, trim: true },
    dealValue: { type: Number, default: 0 },

    // Pipeline stage
    stage: {
      type: String,
      enum: [
        "new_lead",
        "contacted",
        "qualified",
        "demo_scheduled",
        "proposal_sent",
        "negotiation",
        "closed_won",
        "closed_lost",
      ],
      default: "new_lead",
    },

    crmStatus: {
      type: String,
      enum: ["new", "contacted", "interested", "closed", "lost"],
      default: "new",
    },
    replyStatus: {
      type: String,
      enum: ["none", "positive", "negative"],
      default: "none",
    },

    // BANT qualification
    qualificationScore: { type: Number, min: 0, max: 100, default: null },
    bant: {
      budget: { type: Number, min: 0, max: 25, default: 0 },
      authority: { type: Number, min: 0, max: 25, default: 0 },
      need: { type: Number, min: 0, max: 25, default: 0 },
      timeline: { type: Number, min: 0, max: 25, default: 0 },
    },
    bantReasoning: { type: String },

    // Follow-up tracking
    followUpCount: { type: Number, default: 0 },
    lastContactedAt: { type: Date },
    lastEmailId: { type: String },
    lastEmailType: { type: String },
    firstContactSentAt: { type: Date },
    nextFollowUpAt: { type: Date },
    lastAutomationActionAt: { type: Date },
    automationEnabled: { type: Boolean, default: true },

    // Meeting
    meetingId: { type: String },
    meetingLink: { type: String },
    meetingScheduledAt: { type: Date },

    // Proposal
    proposalId: { type: String },
    proposalSentAt: { type: Date },

    // Closing
    lostReason: { type: String },
    closedAt: { type: Date },

    // Notes
    notes: [
      {
        text: { type: String, required: true },
        type: {
          type: String,
          enum: ["call", "meeting", "email", "internal"],
          default: "internal",
        },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    assignedTo: { type: String, default: "ai_agent" },
  },
  {
    timestamps: true,
  }
);

// Indexes
leadSchema.index({ stage: 1, createdAt: -1 });
leadSchema.index({ email: 1 });
leadSchema.index({ qualificationScore: -1 });
leadSchema.index({ company: 1 });
leadSchema.index({ crmStatus: 1, nextFollowUpAt: 1 });
leadSchema.index({ automationEnabled: 1, crmStatus: 1 });

const Lead = mongoose.model("Lead", leadSchema);

export default Lead;
