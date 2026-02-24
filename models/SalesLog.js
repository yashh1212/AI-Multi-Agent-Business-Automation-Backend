import mongoose from "mongoose";

const salesLogSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "capture",
        "qualify",
        "outreach",
        "followup",
        "schedule",
        "proposal",
        "objection",
        "close",
        "note",
        "stage_change",
      ],
      required: true,
    },
    action: { type: String, required: true, trim: true },
    detail: { type: String, trim: true },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
salesLogSchema.index({ type: 1 });
salesLogSchema.index({ leadId: 1 });
salesLogSchema.index({ createdAt: -1 });

const SalesLog = mongoose.model("SalesLog", salesLogSchema);

export default SalesLog;
