/**
 * Mirrors of the backend response schemas.
 *
 * Hand-maintained rather than generated: the surface is small, and writing them
 * by hand keeps the names and optionality honest at the boundary where the two
 * halves of the product meet.
 */

export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type Direction = "up" | "down" | "flat";
export type Confidence = "low" | "moderate" | "high";
export type Grain = "day" | "week" | "month" | "quarter";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type DatasetStatus = "uploading" | "profiling" | "ready" | "confirmed" | "failed";
export type Unit = "currency" | "number" | "percent" | "count" | "ratio" | "days";

export interface User {
  id: string;
  email: string;
  full_name: string;
  onboarding_completed: boolean;
  created_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  business_type: string;
  currency: string;
  timezone: string;
  onboarding_step: number;
  created_at: string;
}

export interface SessionResponse {
  user: User;
  workspaces: Workspace[];
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** One verifiable figure. Everything the AI may cite appears as one of these. */
export interface Evidence {
  label: string;
  value: number | string | null;
  unit: Unit;
  kind: "observation" | "statistical" | "correlation" | "comparison" | "data_quality";
  calculation: string;
  column: string | null;
  period: string | null;
  row_count: number | null;
  detail: Record<string, unknown>;
}

export interface Capability {
  available: boolean;
  reason: string;
  required: string;
}

export interface QualityIssue {
  kind: string;
  severity: Severity;
  title: string;
  detail: string;
  column: string | null;
}

export interface DatasetProfile {
  row_count: number;
  column_count: number;
  duplicate_rows: number;
  missing_cells: number;
  missing_ratio: number;
  role_map: Record<string, string>;
  date_column: string | null;
  date_min: string | null;
  date_max: string | null;
  span_days: number;
  suggested_grain: Grain | null;
  available_grains: Grain[];
  capabilities: Record<string, Capability>;
  quality_issues: QualityIssue[];
  entities: Record<string, string | null>;
  warnings: string[];
}

export interface DatasetColumn {
  id: string;
  name: string;
  position: number;
  data_type: string;
  semantic_role: string;
  confirmed_role: string | null;
  role_confidence: number;
  is_included: boolean;
  null_count: number;
  unique_count: number;
  stats: Record<string, unknown>;
}

export interface Dataset {
  id: string;
  name: string;
  description: string;
  original_filename: string;
  file_format: string;
  file_size_bytes: number;
  row_count: number;
  column_count: number;
  duplicate_row_count: number;
  missing_cell_count: number;
  status: DatasetStatus;
  error_message: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface DatasetDetail extends Dataset {
  profile: DatasetProfile;
  semantic_map: Record<string, unknown>;
  preview_rows: Record<string, unknown>[];
  columns: DatasetColumn[];
}

export interface FieldOption {
  value: string;
  label: string;
}

export interface DetectedField {
  id: string;
  name: string;
  position: number;
  data_type: string;
  semantic_role: string;
  confirmed_role: string | null;
  effective_role: string;
  role_label: string;
  confidence: number;
  is_included: boolean;
  null_count: number;
  unique_count: number;
  stats: Record<string, unknown>;
}

export interface FieldsResponse {
  dataset_id: string;
  columns: DetectedField[];
  available_roles: FieldOption[];
  capabilities: Record<string, Capability>;
  quality_issues: QualityIssue[];
  suggested_grain: Grain | null;
  available_grains: Grain[];
  warnings: string[];
}

export interface AnalysisStage {
  key: string;
  label: string;
  status: "pending" | "running" | "done";
  started_at: string | null;
  finished_at: string | null;
}

export interface Analysis {
  id: string;
  dataset_id: string;
  kind: string;
  status: JobStatus;
  stage: string;
  progress: number;
  stages: AnalysisStage[];
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  error_code: string | null;
  error_message: string | null;
  error_hint: string | null;
  summary: AnalysisSummary;
  created_at: string;
}

export interface AnalysisSummary {
  headline?: string;
  current_period?: string;
  previous_period?: string;
  grain?: Grain;
  insight_count?: number;
  anomaly_count?: number;
  critical_count?: number;
  row_count?: number;
  primary_metric?: Metric;
  top_anomaly?: AnomalyPayload;
}

export interface AnalysisDetail extends Analysis {
  results: AnalysisSections;
}

export interface AnalysisSections {
  dataset?: DatasetSection;
  overview?: { metrics: Record<string, Metric> };
  comparison?: ComparisonSection;
  trends?: TrendsSection;
  segments?: SegmentsSection;
  customers?: CustomerSection;
  anomalies?: AnomaliesSection;
  insights?: InsightPayload[];
}

export interface DatasetSection {
  row_count: number;
  dataset_name: string;
  currency: string;
  grain: Grain;
  derivations: Record<string, string>;
  capabilities: Record<string, Capability>;
  quality_issues: QualityIssue[];
  date_min: string | null;
  date_max: string | null;
  span_days: number;
  dimensions: string[];
  measures: string[];
}

export interface Metric {
  key: string;
  label: string;
  value: number;
  unit: Unit;
  description?: string;
  previous_value: number | null;
  change_pct: number | null;
  direction: Direction | null;
  period_start?: string | null;
  period_end?: string | null;
  provenance: {
    column?: string | null;
    calculation?: string;
    rows_used?: number;
    rows_total?: number;
    comparison?: Record<string, unknown>;
  };
}

export interface ComparisonSection {
  available: boolean;
  reason?: string;
  current_period?: string;
  previous_period?: string;
  grain?: Grain;
  current_rows?: number;
  previous_rows?: number;
  metrics?: Record<string, Metric>;
}

export interface SeriesPoint {
  period: string;
  value: number;
  rows: number;
}

export interface TimeSeries {
  metric_key: string;
  metric_label: string;
  grain: Grain;
  unit: Unit;
  points: SeriesPoint[];
  moving_average: (number | null)[];
  sufficiency: { ok: boolean; reason: string; required: string };
  summary: {
    periods?: number;
    total?: number;
    average?: number;
    minimum?: number;
    maximum?: number;
    first_period?: string;
    last_period?: string;
    first_value?: number;
    last_value?: number;
    change_pct?: number | null;
    overall_change_pct?: number | null;
    peak_period?: string;
    trough_period?: string;
    trend?: string;
    trend_strength?: number;
    trend_description?: string;
    volatility_pct?: number | null;
  };
}

export interface Seasonality {
  available: boolean;
  reason?: string;
  cycle?: string;
  pattern?: { label: string; average: number; index: number; observations: number }[];
  spread_pct?: number;
  is_meaningful?: boolean;
  strongest?: string;
  weakest?: string;
  description?: string;
}

export interface TrendsSection {
  grain: Grain;
  series: Record<string, TimeSeries>;
  growth: Record<string, GrowthRow[]>;
  seasonality: Seasonality;
}

export interface GrowthRow {
  period: string;
  value: number;
  previous_value: number | null;
  change: number | null;
  change_pct: number | null;
  rows: number;
}

export interface SegmentRow {
  name: string;
  value: number;
  share_pct: number;
  previous_value: number | null;
  change: number | null;
  change_pct: number | null;
  contribution_pct: number | null;
  rows: number;
  is_other?: boolean;
  is_new?: boolean;
  is_lost?: boolean;
  segment_count?: number;
}

export interface Breakdown {
  dimension: string;
  dimension_column: string;
  metric_key: string;
  metric_label: string;
  unit: Unit;
  total: number;
  previous_total: number | null;
  rows: SegmentRow[];
  concentration: {
    segment_count?: number;
    top_1_share_pct?: number;
    top_3_share_pct?: number;
    top_5_share_pct?: number;
    hhi?: number;
    normalized_hhi?: number;
    level?: "low" | "moderate" | "high";
    note?: string;
    description?: string;
    total_change?: number;
    total_change_pct?: number | null;
    segments_up?: number;
    segments_down?: number;
    segments_new?: number;
    segments_lost?: number;
  };
}

export interface Movers {
  dimension: string;
  dimension_column: string;
  metric_key: string;
  metric_label: string;
  unit: Unit;
  min_baseline: number;
  growing: SegmentRow[];
  declining: SegmentRow[];
  new: SegmentRow[];
  lost: SegmentRow[];
}

export interface MarginRow {
  name: string;
  revenue: number;
  profit: number;
  margin_pct: number | null;
  rows: number;
}

export interface SegmentsSection {
  primary_metric: string;
  breakdowns: Record<string, Breakdown>;
  contributions: Record<string, Breakdown>;
  movers: Record<string, Movers>;
  margins: Record<
    string,
    {
      dimension: string;
      dimension_column: string;
      overall_margin_pct: number | null;
      rows: MarginRow[];
      highest_margin: MarginRow | null;
      lowest_margin: MarginRow | null;
    }
  >;
  uninformative_dimensions?: string[];
  matrix: {
    row_dimension: string;
    column_dimension: string;
    metric_key: string;
    columns: string[];
    rows: { name: string; values: (number | null)[] }[];
  } | null;
}

export interface CustomerSection {
  total_customers?: number;
  repeat_customers?: number;
  one_time_customers?: number;
  repeat_rate_pct?: number;
  avg_orders_per_customer?: number;
  customer_column?: string;
  top_10pct_revenue_share?: number;
  concentration_note?: string;
  top_customers?: { name: string; revenue: number; share_pct: number; orders: number }[];
}

export interface AnomalyPayload {
  period: string;
  occurred_at: string;
  metric_key: string;
  metric_label: string;
  observed: number;
  expected: number;
  lower_bound: number | null;
  upper_bound: number | null;
  deviation_pct: number;
  z_score: number | null;
  direction: Direction;
  severity: Severity;
  method: string;
  score: number;
  grain: Grain;
  context: Record<string, unknown> & {
    also_affected?: {
      metric_key: string;
      metric_label: string;
      observed: number;
      expected: number;
      deviation_pct: number;
    }[];
    explanation?: string;
  };
}

export interface AnomaliesSection {
  available: boolean;
  reason?: string;
  grain?: Grain;
  items: AnomalyPayload[];
  summary?: {
    count: number;
    by_severity?: Record<string, number>;
    drops?: number;
    spikes?: number;
    description: string;
  };
}

export interface InsightPayload {
  kind: string;
  severity: Severity;
  title: string;
  summary: string;
  metric_key: string | null;
  subject?: string;
  metric_value: number | null;
  comparison_value: number | null;
  change_pct: number | null;
  direction: Direction | null;
  unit: Unit;
  evidence: Evidence[];
  evidence_refs: Record<string, unknown>;
  score: number;
}

export interface Insight extends InsightPayload {
  id: string;
  analysis_id: string;
  dataset_id: string;
  narrative: string | null;
  is_dismissed: boolean;
  created_at: string;
}

export interface Anomaly {
  id: string;
  analysis_id: string;
  dataset_id: string;
  metric_key: string;
  metric_label: string;
  occurred_at: string;
  grain: Grain;
  observed_value: number;
  expected_value: number;
  lower_bound: number | null;
  upper_bound: number | null;
  deviation_pct: number;
  z_score: number | null;
  method: string;
  direction: Direction;
  severity: Severity;
  score: number;
  context: AnomalyPayload["context"];
  investigation: Investigation | null;
  investigated_at: string | null;
  is_acknowledged: boolean;
  created_at: string;
}

export interface Finding {
  kind: string;
  statement: string;
  evidence: Evidence[];
  weight: number;
}

export interface Investigation {
  headline: string;
  what_happened: Finding[];
  where_it_happened: Finding[];
  supporting_evidence: Finding[];
  possible_explanations: Finding[];
  recommended_checks: string[];
  confidence: Confidence;
  confidence_reason: string;
  explained_pct: number | null;
  charts: Record<string, unknown>;
  caveats: string[];
}

export interface InvestigationNarrative {
  headline: string;
  what_happened: string;
  where_it_happened: string;
  possible_explanations: string[];
  recommended_checks: string[];
  confidence: Confidence;
}

export interface InvestigationResponse {
  anomaly: Anomaly;
  investigation: Investigation;
  narrative: InvestigationNarrative;
  is_fallback: boolean;
  provider: string | null;
  model: string | null;
  error: string | null;
  /** A written narrative can still be produced for this investigation. */
  narrative_pending: boolean;
}

export interface PlanStep {
  operation: string;
  params: Record<string, unknown>;
  description: string;
}

export interface AnalysisPlan {
  question: string;
  intent: string;
  metric: string;
  dimension: string | null;
  grain: Grain;
  ranking_basis: string;
  steps: PlanStep[];
  confidence: number;
  unsupported_reason: string;
  suggestions: string[];
}

export interface StructuredAnswer {
  headline: string;
  summary: string;
  observations: { statement: string; evidence_labels: string[] }[];
  possible_explanations: string[];
  recommended_actions: string[];
  confidence: Confidence;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  plan: AnalysisPlan | null;
  evidence: {
    items: Evidence[];
    results: Record<string, unknown>;
    narrative_hint: string;
    insufficient: string[];
    dataset_id: string;
    dataset_name: string;
  } | null;
  structured: StructuredAnswer | null;
  confidence: Confidence | null;
  provider: string | null;
  model: string | null;
  latency_ms: number | null;
  is_fallback: boolean;
  error_message: string | null;
  created_at: string;
}

export interface ChatSession {
  id: string;
  title: string;
  dataset_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatSessionDetail extends ChatSession {
  messages: ChatMessage[];
}

export interface ChatAskResponse {
  session: ChatSession;
  message: ChatMessage;
  suggestions: string[];
}

export interface ReportSection {
  key: string;
  title: string;
  type: string;
  body?: string;
  key_points?: string[];
  recommended_focus?: string[];
  items?: Record<string, unknown>[];
  payload?: Record<string, unknown>;
}

export interface Report {
  id: string;
  title: string;
  period_label: string;
  executive_summary: string;
  generated_by: string;
  analysis_id: string | null;
  dataset_id: string | null;
  created_at: string;
}

export interface ReportDetail extends Report {
  sections: ReportSection[];
}

export interface Overview {
  workspace: Workspace;
  has_data: boolean;
  latest_analysis: Analysis | null;
  metrics: Metric[];
  insights: Insight[];
  anomalies: Anomaly[];
  trends: TrendsSection | Record<string, never>;
  top_segments: SegmentsSection | Record<string, never>;
  dataset_count: number;
  suggestions: string[];
}

export interface AIStatus {
  enabled: boolean;
  provider: string;
  model: string;
  available: boolean;
  detail: string;
  latency_ms: number | null;
  data_sent: string[];
  max_sample_rows: number;
}

export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface SchemaConfirmResponse {
  dataset: DatasetDetail;
  analysis: Analysis | null;
}
