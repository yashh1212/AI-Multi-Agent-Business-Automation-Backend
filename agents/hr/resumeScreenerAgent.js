import Groq from "groq-sdk";
import dotenv from "dotenv";
import { calculateATSScore } from "../../utils/atsScoreCalculator.js";
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SCORE_THRESHOLD = 60;

/**
 * Screen a resume using hybrid scoring: deterministic ATS + LLM qualitative analysis.
 *
 * @param {string} resumeText - Full resume text
 * @param {string} jobRole - Target job role
 * @param {object} [options] - Optional config
 * @param {string} [options.jobDescription] - Custom job description
 * @param {boolean} [options.skipLLM] - If true, return ATS-only score (no LLM call)
 * @returns {object} Comprehensive screening result
 */
export async function screenResume(resumeText, jobRole, options = {}) {
  // Step 1: Deterministic ATS scoring
  const atsResult = calculateATSScore(resumeText, jobRole, {
    jobDescription: options.jobDescription,
  });

  // If skipLLM is true, return deterministic-only result
  if (options.skipLLM) {
    return {
      score: atsResult.overallScore,
      decision: atsResult.decision,
      ats_score: atsResult.overallScore,
      llm_score: null,
      ats_breakdown: atsResult.breakdown,
      strengths: atsResult.breakdown.formatting.strengths || [],
      weaknesses: atsResult.recommendations.slice(0, 3),
      recommendations: atsResult.recommendations,
      key_skills: atsResult.breakdown.skills.matchedSkills,
      missing_skills: atsResult.breakdown.skills.missingSkills,
      experience_years: atsResult.breakdown.experience.detectedYears,
      keyword_matches: [
        ...atsResult.breakdown.keywords.requiredMatches,
        ...atsResult.breakdown.keywords.preferredMatches,
      ],
      summary: `ATS Score: ${atsResult.overallScore}/100 — ${atsResult.decision}`,
      scoring_method: "ats_only",
    };
  }

  // Step 2: LLM qualitative analysis (with ATS context)
  const truncated = resumeText.substring(0, 4000);

  const prompt = `You are an expert HR recruiter and ATS scoring specialist. Analyze this resume for the role of "${jobRole}".

A deterministic ATS system has already scored this resume:
- ATS Score: ${atsResult.overallScore}/100
- Keyword Match Score: ${atsResult.breakdown.keywords.score}/100
- Skills Match Score: ${atsResult.breakdown.skills.score}/100
- Experience Score: ${atsResult.breakdown.experience.score}/100 (detected ${atsResult.breakdown.experience.detectedYears} years)
- Matched Skills: ${atsResult.breakdown.skills.matchedSkills.join(", ") || "none"}
- Missing Skills: ${atsResult.breakdown.skills.missingSkills.slice(0, 10).join(", ") || "none"}

Resume:
${truncated}

Based on your expert analysis AND the ATS data above, return JSON only with:
- score (0-100, your independent qualitative assessment)
- decision ("selected" or "rejected", threshold is ${SCORE_THRESHOLD})
- strengths (array of 3 key strengths)
- weaknesses (array of 3 key weaknesses or improvement areas)
- summary (2-3 sentence professional summary of the candidate)
- experience_years (number, your assessment)
- key_skills (array of top skills identified)
- culture_fit_indicators (array of 2-3 soft skill or culture indicators)
- interview_focus_areas (array of 2-3 areas to probe in interview)`;

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 800,
    });

    const llmResult = JSON.parse(response.choices[0].message.content);
    const llmScore = llmResult.score || 50;

    // Hybrid score: 40% ATS + 60% LLM
    const finalScore = Math.round(atsResult.overallScore * 0.4 + llmScore * 0.6);
    const finalDecision = finalScore >= SCORE_THRESHOLD ? "selected" : "rejected";

    return {
      score: finalScore,
      decision: finalDecision,
      ats_score: atsResult.overallScore,
      llm_score: llmScore,
      ats_breakdown: atsResult.breakdown,
      strengths: llmResult.strengths || [],
      weaknesses: llmResult.weaknesses || [],
      recommendations: atsResult.recommendations,
      key_skills: llmResult.key_skills || atsResult.breakdown.skills.matchedSkills,
      missing_skills: atsResult.breakdown.skills.missingSkills,
      experience_years: llmResult.experience_years || atsResult.breakdown.experience.detectedYears,
      keyword_matches: [
        ...atsResult.breakdown.keywords.requiredMatches,
        ...atsResult.breakdown.keywords.preferredMatches,
      ],
      summary: llmResult.summary || "",
      culture_fit_indicators: llmResult.culture_fit_indicators || [],
      interview_focus_areas: llmResult.interview_focus_areas || [],
      scoring_method: "hybrid",
    };
  } catch (error) {
    // Fallback: return ATS-only scores if LLM fails
    console.error("LLM screening failed, falling back to ATS-only:", error.message);
    return {
      score: atsResult.overallScore,
      decision: atsResult.decision,
      ats_score: atsResult.overallScore,
      llm_score: null,
      ats_breakdown: atsResult.breakdown,
      strengths: atsResult.breakdown.formatting.strengths || [],
      weaknesses: atsResult.recommendations.slice(0, 3),
      recommendations: atsResult.recommendations,
      key_skills: atsResult.breakdown.skills.matchedSkills,
      missing_skills: atsResult.breakdown.skills.missingSkills,
      experience_years: atsResult.breakdown.experience.detectedYears,
      keyword_matches: [
        ...atsResult.breakdown.keywords.requiredMatches,
        ...atsResult.breakdown.keywords.preferredMatches,
      ],
      summary: `ATS Score: ${atsResult.overallScore}/100 — ${atsResult.decision} (LLM unavailable)`,
      scoring_method: "ats_only_fallback",
    };
  }
}