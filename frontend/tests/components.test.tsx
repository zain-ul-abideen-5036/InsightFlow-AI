import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Unavailable } from "@/components/states/unavailable";
import { KpiCard } from "@/features/dashboard/kpi-card";
import { EvidenceList } from "@/features/insights/evidence-panel";
import { InsightCard } from "@/features/insights/insight-card";
import type { Evidence, Insight, Metric } from "@/types/api";

const metric: Metric = {
  key: "revenue",
  label: "Revenue",
  value: 193032.93,
  unit: "currency",
  previous_value: 224075.84,
  change_pct: -13.85,
  direction: "down",
  provenance: { calculation: "sum(revenue)", rows_used: 980, column: "revenue" },
};

const evidence: Evidence[] = [
  {
    label: "Revenue in Aug 2026",
    value: 193032.93,
    unit: "currency",
    kind: "observation",
    calculation: "sum(revenue)",
    column: "revenue",
    period: "Aug 2026",
    row_count: 980,
    detail: {},
  },
  {
    label: "Revenue change",
    value: -13.85,
    unit: "percent",
    kind: "comparison",
    calculation: "(current - previous) / |previous| x 100",
    column: null,
    period: "Jul 2026 to Aug 2026",
    row_count: null,
    detail: {},
  },
];

const insight: Insight = {
  id: "insight-1",
  analysis_id: "analysis-1",
  dataset_id: "dataset-1",
  kind: "product",
  severity: "critical",
  title: "Nova Air Purifier fell 44.5%",
  summary:
    "Revenue for Nova Air Purifier moved from USD 43,142 in Jul 2026 to USD 23,949 in Aug 2026.",
  narrative: null,
  metric_key: "revenue",
  metric_value: 23949,
  comparison_value: 43142,
  change_pct: -44.5,
  direction: "down",
  unit: "currency",
  evidence,
  evidence_refs: {},
  score: 0.91,
  is_dismissed: false,
  created_at: "2026-09-01T10:00:00Z",
};

describe("KpiCard", () => {
  it("shows the value and the signed change", () => {
    render(<KpiCard metric={metric} currency="USD" comparisonLabel="Jul 2026" />);
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("$193K")).toBeInTheDocument();
    expect(screen.getByText("-13.9%")).toBeInTheDocument();
    expect(screen.getByText("vs Jul 2026")).toBeInTheDocument();
  });

  it("explains that no comparison exists rather than showing 0%", () => {
    render(
      <KpiCard
        metric={{ ...metric, previous_value: null, change_pct: null, direction: null }}
      />,
    );
    expect(screen.getByText(/No comparison period available/i)).toBeInTheDocument();
  });

  it("exposes how the figure was calculated", () => {
    render(<KpiCard metric={metric} />);
    expect(
      screen.getByRole("button", { name: /How Revenue is calculated/i }),
    ).toBeInTheDocument();
  });
});

describe("InsightCard", () => {
  it("renders the computed summary, not only a narrative", () => {
    render(<InsightCard insight={insight} currency="USD" />);
    expect(screen.getByText(insight.title)).toBeInTheDocument();
    expect(screen.getByText(/Revenue for Nova Air Purifier moved/)).toBeInTheDocument();
  });

  it("labels severity in text, not only in colour", () => {
    render(<InsightCard insight={insight} />);
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("opens the evidence dialog", async () => {
    const user = userEvent.setup();
    render(<InsightCard insight={insight} currency="USD" />);

    await user.click(screen.getByRole("button", { name: /View evidence/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Revenue in Aug 2026")).toBeInTheDocument();
    expect(within(dialog).getByText("sum(revenue)")).toBeInTheDocument();
  });

  it("can be dismissed", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<InsightCard insight={insight} onDismiss={onDismiss} />);

    await user.click(screen.getByRole("button", { name: /Dismiss insight/i }));
    expect(onDismiss).toHaveBeenCalledWith("insight-1");
  });

  it("shows an AI narrative in addition to the summary, never instead of it", () => {
    render(<InsightCard insight={{ ...insight, narrative: "A written explanation." }} />);
    expect(screen.getByText(/Revenue for Nova Air Purifier moved/)).toBeInTheDocument();
    expect(screen.getByText("A written explanation.")).toBeInTheDocument();
  });
});

describe("EvidenceList", () => {
  it("shows the calculation, column, period and row count for each figure", () => {
    render(<EvidenceList evidence={evidence} currency="USD" />);
    expect(screen.getByText("Revenue in Aug 2026")).toBeInTheDocument();
    expect(screen.getByText("$193,032.93")).toBeInTheDocument();
    expect(screen.getByText("sum(revenue)")).toBeInTheDocument();
    expect(screen.getByText("980 rows")).toBeInTheDocument();
  });

  it("labels the epistemic kind of each figure", () => {
    render(<EvidenceList evidence={evidence} />);
    expect(screen.getByText("Measured")).toBeInTheDocument();
    expect(screen.getByText("Compared")).toBeInTheDocument();
  });

  it("says so plainly when there is no evidence", () => {
    render(<EvidenceList evidence={[]} />);
    expect(screen.getByText(/No supporting figures/i)).toBeInTheDocument();
  });
});

describe("state components", () => {
  it("an empty state explains what to do next", () => {
    render(
      <EmptyState
        title="No anomalies detected yet"
        description="An anomaly is a period outside what your data predicts."
        action={<button type="button">Upload data</button>}
      />,
    );
    expect(screen.getByText("No anomalies detected yet")).toBeInTheDocument();
    expect(screen.getByText(/An anomaly is a period/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload data" })).toBeInTheDocument();
  });

  it("an error state is announced and offers a retry", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ErrorState
        message="We could not analyse this dataset."
        hint="No date column was detected."
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("No date column was detected.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("an unavailable analysis states the reason and what is required", () => {
    render(
      <Unavailable
        title="Forecast not available"
        reason="This dataset contains only 15 monthly periods."
        required="At least 30 time periods."
      />,
    );
    expect(screen.getByText("Forecast not available")).toBeInTheDocument();
    expect(screen.getByText(/only 15 monthly periods/)).toBeInTheDocument();
    expect(screen.getByText("At least 30 time periods.")).toBeInTheDocument();
  });
});
