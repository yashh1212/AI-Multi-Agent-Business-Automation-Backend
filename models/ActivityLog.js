import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["apply", "screen", "schedule", "hire", "reject", "email"],
      required: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    detail: {
      type: String,
      trim: true,
    },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for common queries
activityLogSchema.index({ type: 1 });
activityLogSchema.index({ createdAt: -1 });

const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);

export default ActivityLog;
