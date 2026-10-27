export type ReviewItem = {
  id: string;
  category: "spelling" | "wording" | "detail" | "skills" | "experience" | "education" | "qualification" | "gap";
  title: string;
  section: string;
  explanation: string;
  steps: string[];
  excerpt: string | null;
  start: number | null;
  end: number | null;
  replacement: string | null;
  structure: string | null;
  job_requirement: string | null;
  priority: "required" | "preferred" | "unspecified";
};

export type ApplicantReview = {
  changes: ReviewItem[];
  gaps: ReviewItem[];
  covered: string[];
  notices: string[];
};

export type ReviewResponse = { analysis: { title: string | null }; review: ApplicantReview; score: number | null };

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object";
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");

function isItem(value: unknown): value is ReviewItem {
  return object(value) && typeof value.id === "string" && typeof value.title === "string" &&
    typeof value.section === "string" && typeof value.explanation === "string" && strings(value.steps) &&
    ["spelling", "wording", "detail", "skills", "experience", "education", "qualification", "gap"].includes(String(value.category)) &&
    ["required", "preferred", "unspecified"].includes(String(value.priority)) &&
    ["excerpt", "replacement", "structure", "job_requirement"].every(key => value[key] === null || typeof value[key] === "string") &&
    ["start", "end"].every(key => value[key] === null || (Number.isInteger(value[key]) && Number(value[key]) >= 0));
}

export function isReviewResponse(value: unknown, text: string): value is ReviewResponse {
  if (!object(value) || !object(value.review) || !object(value.analysis)) return false;
  if (!(value.score === null || typeof value.score === "number" && Number.isFinite(value.score) && value.score >= 0 && value.score <= 100)) return false;
  const plan = value.review;
  if (!(value.analysis.title === null || typeof value.analysis.title === "string") ||
    !Array.isArray(plan.changes) || !plan.changes.every(isItem) || !Array.isArray(plan.gaps) || !plan.gaps.every(isItem) ||
    !strings(plan.covered) || !strings(plan.notices)) return false;
  const changes = plan.changes as ReviewItem[];
  return changes.every(item => item.start !== null && item.end !== null && item.end > item.start &&
    item.end <= text.length && item.excerpt === text.slice(item.start, item.end)) &&
    (plan.gaps as ReviewItem[]).every(item => item.start === null && item.end === null && item.excerpt === null) &&
    new Set([...changes, ...plan.gaps as ReviewItem[]].map(item => item.id)).size === changes.length + plan.gaps.length;
}

export async function readResponse(response: Response): Promise<unknown> {
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    let detail = object(data) ? data.detail : null;
    if (Array.isArray(detail)) detail = detail.map(item => object(item) ? item.msg : "Invalid input").join(" ");
    throw new Error(typeof detail === "string" ? detail : "Your CV could not be reviewed. Please try again.");
  }
  return data;
}
