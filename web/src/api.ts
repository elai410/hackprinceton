import type {
  Binding,
  BindingConfig,
  ExecuteRequest,
  ExecuteResponse,
  HealthResponse,
  InputsResponse,
  Manifest,
  PlanRequest,
  PlanResponse,
  RecentEventsResponse,
} from "./types";

export const COMPANION_BASE_URL =
  (import.meta.env.VITE_COMPANION_URL as string | undefined) ??
  "http://127.0.0.1:8000";

const BASE = COMPANION_BASE_URL;

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch (err) {
    throw new ApiError("NETWORK_ERROR", `Cannot reach companion: ${err}`);
  }
  if (!res.ok) {
    let body: { error?: { code?: string; message?: string; details?: unknown } } = {};
    try {
      body = await res.json();
    } catch {
      /* ignore parse failures */
    }
    const err = body.error ?? {};
    throw new ApiError(
      err.code ?? "HTTP_ERROR",
      err.message ?? `HTTP ${res.status}`,
      err.details,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<HealthResponse>("/health"),
  manifest: () => request<Manifest>("/manifest"),
  inputs: () => request<InputsResponse>("/inputs"),
  plan: (req: PlanRequest) =>
    request<PlanResponse>("/plan", {
      method: "POST",
      body: JSON.stringify(req),
    }),
  execute: (req: ExecuteRequest) =>
    request<ExecuteResponse>("/execute", {
      method: "POST",
      body: JSON.stringify(req),
    }),
  bindings: () => request<BindingConfig>("/bindings"),
  addBinding: (binding: Binding) =>
    request<BindingConfig>("/bindings/add", {
      method: "POST",
      body: JSON.stringify(binding),
    }),
  deleteBinding: (bindingId: string) =>
    request<void>(`/bindings/${encodeURIComponent(bindingId)}`, {
      method: "DELETE",
    }),
  recentEvents: (eventLimit = 20, fireLimit = 10) =>
    request<RecentEventsResponse>(
      `/events/recent?events=${eventLimit}&fires=${fireLimit}`,
    ),
  setSpeechListening: (listening: boolean) =>
    request<{ listening: boolean }>("/inputs/speech", {
      method: "POST",
      body: JSON.stringify({ listening }),
    }),
};
