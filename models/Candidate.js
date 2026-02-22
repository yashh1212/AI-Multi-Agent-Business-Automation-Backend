import mongoose from "mongoose";

const candidateSchema = new mongoose.Schema(
  {
    candidateName: {
      type: String,
      default: "Unknown",
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    jobRole: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    score: {
      type: Number,
      min: 0,
      max: 100,
    },
    decision: {
      type: String,
      enum: ["selected", "rejected"],
    },
    scoringMethod: {
      type: String,
      enum: ["hybrid", "ats_only", "ats_only_fallback", "quick_score", "none"],
      default: "none",
    },
    source: {
      type: String,
      enum: [
        "ats_score",
        "ats_quick_score",
        "ats_batch",
        "hr_apply",
        "hr_hire",
        "hr_interview",
        "hr_reject",
      ],
      required: true,
    },
    atsBreakdown: {
      type: mongoose.Schema.Types.Mixed,
    },
    strengths: [String],
    weaknesses: [String],
    recommendations: [String],
    keySkills: [String],
    missingSkills: [String],
    summary: String,
    rawResult: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Index for common queries
candidateSchema.index({ jobRole: 1, createdAt: -1 });
candidateSchema.index({ decision: 1 });
candidateSchema.index({ email: 1 });

const Candidate = mongoose.model("Candidate", candidateSchema);

export default Candidate;
