/**
 * Browser-side API client.
 *
 * Every call goes to `/api/backend/...` on this origin. The Next.js proxy
 * attaches the bearer token from the httpOnly session cookie, so no token is
 * ever present in JavaScript here.
 */

import type {
  AIStatus,
  Analysis,
  AnalysisDetail,
  Anomaly,
  ChatAskResponse,
  ChatSession,
  ChatSessionDetail,
  Dataset,
  DatasetDetail,
  FieldsResponse,
  Insight,
  InvestigationResponse,
  Notification,
  Overview,
  Page,
  Report,
  ReportDetail,
  SchemaConfirmResponse,
  SessionResponse,
  Workspace,
} from "@/types/api";

export interface ClientErrorPayload {
  code: string;
  message: string;
  hint?: string;
  details?: Record<string, unknown>;
}

export class ClientApiError extends Error {
  readonly status: number;
  readonly payload: ClientErrorPayload;

  constructor(status: number, payload: ClientErrorPayload) {
    super(payload.message);
    this.name = "ClientApiError";
    this.status = status;
    this.payload = payload;
  }

  get hint() {
    return this.payload.hint;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/backend${path}`, {
      ...init,
      headers:
        init.body instanceof FormData
          ? init.headers
          : { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    throw new ClientApiError(0, {
      code: "network_error",
      message: "We could not reach the server.",
      hint: "Check your connection and try again.",
    });
  }

  if (!response.ok) {
    let payload: ClientErrorPayload = {
      code: `http_${response.status}`,
      message: "That request could not be completed.",
    };
    try {
      const body = await response.json();
      if (body?.error) payload = body.error;
    } catch {
      // Non-JSON error body; the default message stands.
    }
    throw new ClientApiError(response.status, payload);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  // -- Session ------------------------------------------------------------
  session: () => request<SessionResponse>("/auth/session"),

  logout: async () => {
    await fetch("/api/auth/logout", { method: "POST" });
  },

  // -- Workspaces ---------------------------------------------------------
  workspaces: () => request<Workspace[]>("/workspaces"),

  createWorkspace: (body: { name: string; business_type?: string; currency?: string }) =>
    request<Workspace>("/workspaces", { method: "POST", body: json(body) }),

  updateWorkspace: (
    workspaceId: string,
    body: Partial<{
      name: string;
      business_type: string;
      currency: string;
      timezone: string;
      onboarding_step: number;
    }>,
  ) => request<Workspace>(`/workspaces/${workspaceId}`, { method: "PATCH", body: json(body) }),

  overview: (workspaceId: string) => request<Overview>(`/workspaces/${workspaceId}/overview`),

  notifications: (workspaceId: string) =>
    request<Notification[]>(`/workspaces/${workspaceId}/notifications`),

  markNotificationRead: (workspaceId: string, id: string) =>
    request<{ message: string }>(`/workspaces/${workspaceId}/notifications/${id}/read`, {
      method: "POST",
    }),

  // -- Datasets -----------------------------------------------------------
  datasets: (workspaceId: string) => request<Page<Dataset>>(`/workspaces/${workspaceId}/datasets`),

  dataset: (workspaceId: string, datasetId: string) =>
    request<DatasetDetail>(`/workspaces/${workspaceId}/datasets/${datasetId}`),

  uploadDataset: (workspaceId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<DatasetDetail>(`/workspaces/${workspaceId}/datasets`, {
      method: "POST",
      body: form,
    });
  },

  loadDemoDataset: (workspaceId: string) =>
    request<DatasetDetail>(`/workspaces/${workspaceId}/datasets/demo`, { method: "POST" }),

  datasetFields: (workspaceId: string, datasetId: string) =>
    request<FieldsResponse>(`/workspaces/${workspaceId}/datasets/${datasetId}/fields`),

  confirmSchema: (
    workspaceId: string,
    datasetId: string,
    body: {
      columns: { name: string; confirmed_role: string | null; is_included: boolean }[];
      grain?: string | null;
      start_analysis?: boolean;
    },
  ) =>
    request<SchemaConfirmResponse>(`/workspaces/${workspaceId}/datasets/${datasetId}/confirm`, {
      method: "POST",
      body: json(body),
    }),

  deleteDataset: (workspaceId: string, datasetId: string) =>
    request<{ message: string }>(`/workspaces/${workspaceId}/datasets/${datasetId}`, {
      method: "DELETE",
    }),

  // -- Analyses -----------------------------------------------------------
  analyses: (workspaceId: string) =>
    request<Page<Analysis>>(`/workspaces/${workspaceId}/analyses`),

  analysis: (workspaceId: string, analysisId: string) =>
    request<Analysis>(`/workspaces/${workspaceId}/analyses/${analysisId}`),

  analysisResults: (workspaceId: string, analysisId: string) =>
    request<AnalysisDetail>(`/workspaces/${workspaceId}/analyses/${analysisId}/results`),

  startAnalysis: (workspaceId: string, datasetId: string, grain?: string) =>
    request<Analysis>(`/workspaces/${workspaceId}/analyses`, {
      method: "POST",
      body: json({ dataset_id: datasetId, grain }),
    }),

  // -- Insights -----------------------------------------------------------
  insights: (workspaceId: string, params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return request<Page<Insight>>(
      `/workspaces/${workspaceId}/insights${query ? `?${query}` : ""}`,
    );
  },

  dismissInsight: (workspaceId: string, insightId: string) =>
    request<{ message: string }>(`/workspaces/${workspaceId}/insights/${insightId}/dismiss`, {
      method: "POST",
    }),

  explainInsight: (workspaceId: string, insightId: string) =>
    request<Insight>(`/workspaces/${workspaceId}/insights/${insightId}/explain`, {
      method: "POST",
    }),

  // -- Anomalies ----------------------------------------------------------
  anomalies: (workspaceId: string, params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return request<Page<Anomaly>>(
      `/workspaces/${workspaceId}/anomalies${query ? `?${query}` : ""}`,
    );
  },

  anomaly: (workspaceId: string, anomalyId: string) =>
    request<Anomaly>(`/workspaces/${workspaceId}/anomalies/${anomalyId}`),

  /**
   * Investigate one anomaly.
   *
   * `narrate: false` returns the deterministic investigation — every figure,
   * every piece of evidence — without waiting for a model to phrase it, which
   * on local CPU inference is the difference between one second and two
   * minutes. The page renders that, then calls again with `narrate: true` to
   * swap in the written version. The backend caches the prose, so the wait is
   * paid once per anomaly rather than once per visit.
   */
  investigate: (
    workspaceId: string,
    anomalyId: string,
    { refresh = false, narrate = true }: { refresh?: boolean; narrate?: boolean } = {},
  ) => {
    const params = new URLSearchParams();
    if (refresh) params.set("refresh", "true");
    if (!narrate) params.set("narrate", "false");
    const query = params.toString();
    return request<InvestigationResponse>(
      `/workspaces/${workspaceId}/anomalies/${anomalyId}/investigate${query ? `?${query}` : ""}`,
      { method: "POST" },
    );
  },

  acknowledgeAnomaly: (workspaceId: string, anomalyId: string) =>
    request<{ message: string }>(
      `/workspaces/${workspaceId}/anomalies/${anomalyId}/acknowledge`,
      { method: "POST" },
    ),

  // -- Chat ---------------------------------------------------------------
  ask: (workspaceId: string, body: { question: string; session_id?: string; dataset_id?: string }) =>
    request<ChatAskResponse>(`/workspaces/${workspaceId}/chat/ask`, {
      method: "POST",
      body: json(body),
    }),

  chatSuggestions: (workspaceId: string) =>
    request<string[]>(`/workspaces/${workspaceId}/chat/suggestions`),

  chatSessions: (workspaceId: string) =>
    request<ChatSession[]>(`/workspaces/${workspaceId}/chat/sessions`),

  chatSession: (workspaceId: string, sessionId: string) =>
    request<ChatSessionDetail>(`/workspaces/${workspaceId}/chat/sessions/${sessionId}`),

  deleteChatSession: (workspaceId: string, sessionId: string) =>
    request<{ message: string }>(`/workspaces/${workspaceId}/chat/sessions/${sessionId}`, {
      method: "DELETE",
    }),

  // -- Reports ------------------------------------------------------------
  reports: (workspaceId: string) => request<Page<Report>>(`/workspaces/${workspaceId}/reports`),

  report: (workspaceId: string, reportId: string) =>
    request<ReportDetail>(`/workspaces/${workspaceId}/reports/${reportId}`),

  createReport: (workspaceId: string, body: { analysis_id?: string; title?: string }) =>
    request<ReportDetail>(`/workspaces/${workspaceId}/reports`, {
      method: "POST",
      body: json(body),
    }),

  deleteReport: (workspaceId: string, reportId: string) =>
    request<{ message: string }>(`/workspaces/${workspaceId}/reports/${reportId}`, {
      method: "DELETE",
    }),

  // -- System -------------------------------------------------------------
  aiStatus: () => request<AIStatus>("/ai/status"),
};

/** Query keys, centralised so invalidation stays consistent. */
export const queryKeys = {
  session: ["session"] as const,
  workspaces: ["workspaces"] as const,
  overview: (workspaceId: string) => ["overview", workspaceId] as const,
  datasets: (workspaceId: string) => ["datasets", workspaceId] as const,
  dataset: (workspaceId: string, id: string) => ["dataset", workspaceId, id] as const,
  fields: (workspaceId: string, id: string) => ["fields", workspaceId, id] as const,
  analyses: (workspaceId: string) => ["analyses", workspaceId] as const,
  analysis: (workspaceId: string, id: string) => ["analysis", workspaceId, id] as const,
  analysisResults: (workspaceId: string, id: string) =>
    ["analysis-results", workspaceId, id] as const,
  insights: (workspaceId: string, params?: Record<string, string>) =>
    ["insights", workspaceId, params ?? {}] as const,
  anomalies: (workspaceId: string, params?: Record<string, string>) =>
    ["anomalies", workspaceId, params ?? {}] as const,
  anomaly: (workspaceId: string, id: string) => ["anomaly", workspaceId, id] as const,
  chatSessions: (workspaceId: string) => ["chat-sessions", workspaceId] as const,
  chatSession: (workspaceId: string, id: string) => ["chat-session", workspaceId, id] as const,
  chatSuggestions: (workspaceId: string) => ["chat-suggestions", workspaceId] as const,
  reports: (workspaceId: string) => ["reports", workspaceId] as const,
  report: (workspaceId: string, id: string) => ["report", workspaceId, id] as const,
  notifications: (workspaceId: string) => ["notifications", workspaceId] as const,
  aiStatus: ["ai-status"] as const,
};
