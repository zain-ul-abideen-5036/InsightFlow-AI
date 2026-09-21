import type { AnalysisPlan } from "@/types/api";

/**
 * The dimensions the engine can break a result down by.
 *
 * Kept in step with `SemanticRole` in `backend/app/analytics/types.py`. A
 * follow-up offering a breakdown the engine cannot perform would be answered
 * with "the data cannot support that", which is worse than not offering it —
 * so the list is deliberately short and conservative.
 */
const BREAKDOWN_DIMENSIONS = ["product", "category", "region", "channel", "customer"] as const;

const DIMENSION_LABEL: Record<string, string> = {
  product: "product",
  category: "category",
  region: "region",
  channel: "channel",
  customer: "customer",
};

export interface FollowUp {
  /** What the button says. */
  label: string;
  /** The question actually asked when it is pressed. */
  question: string;
}

/**
 * What to ask next.
 *
 * The product could answer "why did revenue decline" and then leave the user
 * at a text box with no idea what it was capable of next — the single biggest
 * gap between this screen and an analyst you can actually talk to.
 *
 * Follow-ups are derived from the plan that just ran, so they are always
 * things this dataset can answer:
 *
 * - a breakdown by a dimension the answer has *not* already used
 * - a comparison against the preceding period
 * - a coarser or finer time grain
 * - anything the planner itself suggested
 *
 * Deterministic on purpose. Generating these with the model would put
 * unverifiable questions in front of the user at the exact point the product
 * is asking them to trust it.
 */
export function followUpsFor(
  plan: AnalysisPlan | null,
  { availableDimensions }: { availableDimensions?: readonly string[] } = {},
): FollowUp[] {
  if (!plan) return [];

  const followUps: FollowUp[] = [];
  const used = plan.dimension?.toLowerCase();
  const metric = (plan.metric ?? "revenue").replace(/_/g, " ");

  const candidates = (availableDimensions ?? BREAKDOWN_DIMENSIONS).filter(
    (dimension) => dimension.toLowerCase() !== used,
  );

  for (const dimension of candidates.slice(0, 2)) {
    const label = DIMENSION_LABEL[dimension] ?? dimension;
    followUps.push({
      label: `Break this down by ${label}`,
      question: `Break down ${metric} by ${label}.`,
    });
  }

  if (plan.intent !== "compare_periods") {
    followUps.push({
      label: "Compare with the previous period",
      question: `Compare ${metric} this period with the previous period.`,
    });
  }

  // A different time grain is a genuinely different view of the same figure,
  // and it is the question people ask second most often after "by what?".
  const coarser: Partial<Record<string, string>> = {
    daily: "weekly",
    weekly: "monthly",
    monthly: "quarterly",
  };
  const nextGrain = coarser[plan.grain];
  if (nextGrain) {
    followUps.push({
      label: `Show this ${nextGrain}`,
      question: `Show ${metric} ${nextGrain}.`,
    });
  }

  // The planner's own suggestions last: they are the least predictable, so
  // they read better as extras than as the first thing offered.
  for (const suggestion of plan.suggestions ?? []) {
    if (followUps.length >= 5) break;
    if (followUps.some((item) => item.question === suggestion)) continue;
    followUps.push({ label: suggestion, question: suggestion });
  }

  return followUps.slice(0, 5);
}
