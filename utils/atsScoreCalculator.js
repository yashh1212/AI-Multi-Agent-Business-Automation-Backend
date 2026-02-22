/**
 * Deterministic ATS Score Calculator
 * Analyzes resumes against job roles using keyword matching,
 * skill extraction, experience validation, and format scoring.
 */

// ─── Role-Specific Dictionaries ────────────────────────────────────────────────

const ROLE_KEYWORDS = {
  "software engineer": {
    required: ["software", "engineer", "development", "programming", "code", "application"],
    preferred: ["agile", "scrum", "ci/cd", "testing", "architecture", "microservices", "api", "rest", "git", "deployment"],
    skills: ["javascript", "python", "java", "c++", "c#", "typescript", "react", "node.js", "angular", "vue", "sql", "nosql", "mongodb", "postgresql", "docker", "kubernetes", "aws", "azure", "gcp", "html", "css", "graphql", "redis", "express", "spring", "django", "flask", "go", "rust", "swift"],
    minExperience: 2,
  },
  "data scientist": {
    required: ["data", "science", "analysis", "machine learning", "statistics", "model"],
    preferred: ["deep learning", "neural network", "nlp", "computer vision", "big data", "a/b testing", "feature engineering", "data pipeline"],
    skills: ["python", "r", "sql", "tensorflow", "pytorch", "scikit-learn", "pandas", "numpy", "matplotlib", "seaborn", "spark", "hadoop", "tableau", "power bi", "jupyter", "keras", "xgboost", "sas", "stata", "airflow"],
    minExperience: 2,
  },
  "product manager": {
    required: ["product", "management", "strategy", "roadmap", "stakeholder"],
    preferred: ["user research", "analytics", "prioritization", "launch", "go-to-market", "okr", "kpi", "sprint planning"],
    skills: ["jira", "confluence", "figma", "amplitude", "mixpanel", "sql", "tableau", "miro", "notion", "asana", "trello", "google analytics", "a/b testing", "wireframing"],
    minExperience: 3,
  },
  "designer": {
    required: ["design", "user experience", "ui", "ux", "visual", "interface"],
    preferred: ["design system", "prototyping", "user research", "accessibility", "responsive", "interaction design", "branding"],
    skills: ["figma", "sketch", "adobe xd", "photoshop", "illustrator", "invision", "zeplin", "framer", "principle", "after effects", "css", "html", "tailwind"],
    minExperience: 2,
  },
  "devops": {
    required: ["devops", "infrastructure", "deployment", "automation", "cloud"],
    preferred: ["monitoring", "logging", "incident response", "sre", "reliability", "scalability", "security"],
    skills: ["docker", "kubernetes", "terraform", "ansible", "jenkins", "github actions", "gitlab ci", "aws", "azure", "gcp", "linux", "bash", "python", "prometheus", "grafana", "elk", "nginx", "helm", "argocd", "cloudformation"],
    minExperience: 2,
  },
  "marketing": {
    required: ["marketing", "campaign", "brand", "growth", "content"],
    preferred: ["seo", "sem", "social media", "email marketing", "analytics", "conversion", "funnel", "retention"],
    skills: ["google analytics", "google ads", "facebook ads", "hubspot", "mailchimp", "semrush", "ahrefs", "canva", "hootsuite", "buffer", "salesforce", "marketo", "segment"],
    minExperience: 2,
  },
  "frontend developer": {
    required: ["frontend", "front-end", "ui", "web", "interface", "development"],
    preferred: ["responsive", "accessibility", "performance", "seo", "pwa", "spa", "component", "state management"],
    skills: ["javascript", "typescript", "react", "vue", "angular", "svelte", "html", "css", "sass", "tailwind", "webpack", "vite", "next.js", "nuxt", "redux", "graphql", "jest", "cypress", "storybook"],
    minExperience: 1,
  },
  "backend developer": {
    required: ["backend", "back-end", "server", "api", "database", "development"],
    preferred: ["microservices", "scalability", "security", "caching", "message queue", "authentication"],
    skills: ["node.js", "python", "java", "go", "rust", "c#", "express", "fastapi", "django", "spring", "postgresql", "mysql", "mongodb", "redis", "rabbitmq", "kafka", "docker", "graphql", "rest", "grpc"],
    minExperience: 2,
  },
  "fullstack developer": {
    required: ["fullstack", "full-stack", "full stack", "development", "web"],
    preferred: ["responsive", "api", "database", "deployment", "testing", "agile"],
    skills: ["javascript", "typescript", "react", "vue", "angular", "node.js", "express", "python", "django", "postgresql", "mongodb", "redis", "docker", "git", "html", "css", "graphql", "next.js", "aws"],
    minExperience: 2,
  },
};

// Skill aliases for fuzzy matching
const SKILL_ALIASES = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  "node": "node.js",
  node: "node.js",
  nodejs: "node.js",
  reactjs: "react",
  "react.js": "react",
  vuejs: "vue",
  "vue.js": "vue",
  angularjs: "angular",
  postgres: "postgresql",
  mongo: "mongodb",
  k8s: "kubernetes",
  tf: "terraform",
  "sci-kit learn": "scikit-learn",
  sklearn: "scikit-learn",
  "c sharp": "c#",
  csharp: "c#",
  cpp: "c++",
  "objective c": "objective-c",
  "react native": "react native",
  nextjs: "next.js",
  nuxtjs: "nuxt",
  expressjs: "express",
  fastify: "fastify",
  ".net": ".net",
  dotnet: ".net",
  gcloud: "gcp",
  "google cloud": "gcp",
  amazonwebservices: "aws",
  "amazon web services": "aws",
};

// Education levels ranked by weight
const EDUCATION_LEVELS = {
  phd: 1.0,
  doctorate: 1.0,
  "ph.d": 1.0,
  masters: 0.85,
  "m.s": 0.85,
  "m.sc": 0.85,
  mba: 0.85,
  "m.tech": 0.85,
  mtech: 0.85,
  "m.e": 0.85,
  bachelors: 0.7,
  "b.s": 0.7,
  "b.sc": 0.7,
  "b.tech": 0.7,
  btech: 0.7,
  "b.e": 0.7,
  bca: 0.65,
  bba: 0.65,
  associate: 0.5,
  diploma: 0.45,
  certification: 0.35,
  certificate: 0.35,
  bootcamp: 0.3,
  "self-taught": 0.25,
};

// Resume section headers to detect structure
const SECTION_HEADERS = [
  "experience", "work experience", "employment", "professional experience",
  "education", "academic", "qualifications",
  "skills", "technical skills", "core competencies",
  "projects", "personal projects", "portfolio",
  "certifications", "certificates", "licenses",
  "summary", "objective", "profile", "about",
  "achievements", "awards", "honors",
  "publications", "research",
  "references",
];

// ─── Core Scoring Functions ────────────────────────────────────────────────────

function normalizeText(text) {
  return text.toLowerCase().replace(/[^\w\s.+#/-]/g, " ").replace(/\s+/g, " ").trim();
}

function resolveAlias(skill) {
  const lower = skill.toLowerCase().trim();
  return SKILL_ALIASES[lower] || lower;
}

/**
 * Score keyword match against role requirements (0-100)
 */
function scoreKeywords(resumeText, roleConfig) {
  const normalized = normalizeText(resumeText);
  const { required, preferred } = roleConfig;

  let requiredHits = 0;
  const requiredMatches = [];
  for (const keyword of required) {
    if (normalized.includes(keyword.toLowerCase())) {
      requiredHits++;
      requiredMatches.push(keyword);
    }
  }

  let preferredHits = 0;
  const preferredMatches = [];
  for (const keyword of preferred) {
    if (normalized.includes(keyword.toLowerCase())) {
      preferredHits++;
      preferredMatches.push(keyword);
    }
  }

  const requiredScore = required.length > 0 ? (requiredHits / required.length) * 70 : 0;
  const preferredScore = preferred.length > 0 ? (preferredHits / preferred.length) * 30 : 0;

  return {
    score: Math.min(100, Math.round(requiredScore + preferredScore)),
    requiredMatches,
    preferredMatches,
    totalRequired: required.length,
    totalPreferred: preferred.length,
  };
}

/**
 * Score skills match (0-100)
 */
function scoreSkills(resumeText, roleConfig) {
  const normalized = normalizeText(resumeText);
  const { skills } = roleConfig;
  const matchedSkills = [];
  const missingSkills = [];

  for (const skill of skills) {
    const resolvedSkill = resolveAlias(skill);
    // Check both the original and resolved alias
    if (
      normalized.includes(resolvedSkill) ||
      normalized.includes(skill.toLowerCase())
    ) {
      matchedSkills.push(skill);
    } else {
      missingSkills.push(skill);
    }
  }

  const score = skills.length > 0
    ? Math.round((matchedSkills.length / skills.length) * 100)
    : 0;

  return { score, matchedSkills, missingSkills };
}

/**
 * Extract and score years of experience (0-100)
 */
function scoreExperience(resumeText, roleConfig) {
  const patterns = [
    /(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)/gi,
    /(?:experience|exp)\s*(?:of\s*)?(\d+)\+?\s*(?:years?|yrs?)/gi,
    /(\d+)\+?\s*(?:years?|yrs?)\s*(?:in|of|working)/gi,
  ];

  let maxYears = 0;
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(resumeText)) !== null) {
      const years = parseInt(match[1], 10);
      if (years > 0 && years < 50) {
        maxYears = Math.max(maxYears, years);
      }
    }
  }

  const required = roleConfig.minExperience || 2;
  let score;
  if (maxYears === 0) {
    score = 30; // Can't determine — give partial credit
  } else if (maxYears >= required * 2) {
    score = 100; // Well above requirement
  } else if (maxYears >= required) {
    score = 70 + Math.round((maxYears - required) / required * 30);
  } else {
    score = Math.round((maxYears / required) * 70);
  }

  return {
    score: Math.min(100, score),
    detectedYears: maxYears,
    requiredYears: required,
  };
}

/**
 * Score education level (0-100)
 */
function scoreEducation(resumeText) {
  const normalized = normalizeText(resumeText);
  let highestWeight = 0;
  let detectedLevel = "none";

  for (const [level, weight] of Object.entries(EDUCATION_LEVELS)) {
    if (normalized.includes(level)) {
      if (weight > highestWeight) {
        highestWeight = weight;
        detectedLevel = level;
      }
    }
  }

  // Check for "computer science", "engineering" etc for relevance boost
  const relevantFields = [
    "computer science", "software engineering", "information technology",
    "data science", "mathematics", "statistics", "electrical engineering",
    "computer engineering", "information systems",
  ];

  let fieldRelevance = false;
  for (const field of relevantFields) {
    if (normalized.includes(field)) {
      fieldRelevance = true;
      break;
    }
  }

  let score = Math.round(highestWeight * 100);
  if (fieldRelevance && score > 0) {
    score = Math.min(100, score + 10);
  }

  return {
    score: score || 20, // Minimum 20 if no education detected
    detectedLevel,
    fieldRelevance,
  };
}

/**
 * Score resume formatting/structure (0-100)
 */
function scoreFormatting(resumeText) {
  const lines = resumeText.split("\n").filter((l) => l.trim().length > 0);
  const normalized = normalizeText(resumeText);
  let score = 0;
  const issues = [];
  const strengths = [];

  // 1. Length check (15 pts)
  const wordCount = resumeText.split(/\s+/).length;
  if (wordCount >= 150 && wordCount <= 1200) {
    score += 15;
    strengths.push("Good resume length");
  } else if (wordCount >= 80) {
    score += 8;
    issues.push("Resume could be more detailed");
  } else {
    score += 3;
    issues.push("Resume too short");
  }

  // 2. Section headers detected (30 pts)
  let sectionsFound = 0;
  for (const header of SECTION_HEADERS) {
    if (normalized.includes(header)) sectionsFound++;
  }
  const sectionScore = Math.min(30, Math.round((sectionsFound / 5) * 30));
  score += sectionScore;
  if (sectionsFound >= 4) {
    strengths.push(`${sectionsFound} sections detected`);
  } else {
    issues.push("Few structured sections found");
  }

  // 3. Contact information (20 pts)
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/;
  const phoneRegex = /[\+]?[\d\s\-().]{7,15}/;
  const linkedinRegex = /linkedin\.com/i;

  if (emailRegex.test(resumeText)) { score += 8; strengths.push("Email found"); }
  else issues.push("No email found");

  if (phoneRegex.test(resumeText)) { score += 6; strengths.push("Phone found"); }
  else issues.push("No phone number found");

  if (linkedinRegex.test(resumeText)) { score += 6; strengths.push("LinkedIn found"); }
  else issues.push("No LinkedIn profile found");

  // 4. Bullet points or structured items (15 pts)
  const bulletLines = lines.filter((l) => /^[\s]*[•\-\*\u2022\u25E6\u25AA]/.test(l));
  if (bulletLines.length >= 5) {
    score += 15;
    strengths.push("Well-structured with bullet points");
  } else if (bulletLines.length >= 2) {
    score += 8;
  } else {
    score += 3;
    issues.push("Consider using bullet points");
  }

  // 5. Numbers / metrics (20 pts) — quantifiable achievements
  const metricPatterns = /\d+%|\$\d+|#\d+|\d+\s*(?:users?|customers?|clients?|projects?|team|people|members?)/gi;
  const metrics = resumeText.match(metricPatterns);
  if (metrics && metrics.length >= 3) {
    score += 20;
    strengths.push("Quantifiable achievements found");
  } else if (metrics && metrics.length >= 1) {
    score += 10;
    issues.push("Add more quantifiable results");
  } else {
    score += 2;
    issues.push("No quantifiable achievements found");
  }

  return {
    score: Math.min(100, score),
    wordCount,
    sectionsFound,
    issues,
    strengths,
  };
}

// ─── Main ATS Calculator ───────────────────────────────────────────────────────

/**
 * Calculate comprehensive ATS score for a resume against a job role.
 *
 * @param {string} resumeText - The full resume text
 * @param {string} jobRole - The target job role
 * @param {object} [options] - Optional config
 * @param {string} [options.jobDescription] - Custom job description for keyword extraction
 * @returns {object} Detailed ATS score breakdown
 */
export function calculateATSScore(resumeText, jobRole, options = {}) {
  const normalizedRole = jobRole.toLowerCase().trim();

  // Find the best matching role config
  let roleConfig = ROLE_KEYWORDS[normalizedRole];
  if (!roleConfig) {
    // Try partial matching
    const roleKey = Object.keys(ROLE_KEYWORDS).find(
      (key) => normalizedRole.includes(key) || key.includes(normalizedRole)
    );
    roleConfig = roleKey
      ? ROLE_KEYWORDS[roleKey]
      : {
          // Fallback generic config
          required: normalizedRole.split(/\s+/),
          preferred: ["experience", "team", "project", "leadership"],
          skills: [],
          minExperience: 2,
        };
  }

  // If custom job description provided, extract additional keywords
  if (options.jobDescription) {
    const descWords = normalizeText(options.jobDescription)
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const uniqueWords = [...new Set(descWords)];
    roleConfig = {
      ...roleConfig,
      preferred: [...new Set([...roleConfig.preferred, ...uniqueWords.slice(0, 15)])],
    };
  }

  // Calculate individual scores
  const keywords = scoreKeywords(resumeText, roleConfig);
  const skills = scoreSkills(resumeText, roleConfig);
  const experience = scoreExperience(resumeText, roleConfig);
  const education = scoreEducation(resumeText);
  const formatting = scoreFormatting(resumeText);

  // Weighted final score
  const weights = {
    keywords: 0.30,
    skills: 0.25,
    experience: 0.20,
    education: 0.15,
    formatting: 0.10,
  };

  const weightedScore = Math.round(
    keywords.score * weights.keywords +
    skills.score * weights.skills +
    experience.score * weights.experience +
    education.score * weights.education +
    formatting.score * weights.formatting
  );

  // Generate recommendations
  const recommendations = [];
  if (skills.missingSkills.length > 3) {
    recommendations.push(`Add missing skills: ${skills.missingSkills.slice(0, 5).join(", ")}`);
  }
  if (formatting.issues.length > 0) {
    recommendations.push(...formatting.issues.slice(0, 3));
  }
  if (experience.detectedYears === 0) {
    recommendations.push("Clearly state your years of experience");
  }
  if (education.detectedLevel === "none") {
    recommendations.push("Include your educational qualifications");
  }
  if (keywords.requiredMatches.length < keywords.totalRequired / 2) {
    recommendations.push("Include more role-relevant keywords in your resume");
  }

  // Decision based on score
  const decision = weightedScore >= 60 ? "selected" : "rejected";

  return {
    overallScore: weightedScore,
    decision,
    breakdown: {
      keywords: { ...keywords, weight: weights.keywords },
      skills: { ...skills, weight: weights.skills },
      experience: { ...experience, weight: weights.experience },
      education: { ...education, weight: weights.education },
      formatting: { ...formatting, weight: weights.formatting },
    },
    recommendations,
    matchedRole: normalizedRole,
  };
}

/**
 * Get list of supported roles
 */
export function getSupportedRoles() {
  return Object.keys(ROLE_KEYWORDS);
}
