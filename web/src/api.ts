/**
 * All HTTP calls to the companion.
 * Never use fetch() outside this file — always call these typed functions.
 */

import type {
  BindingConfig,
  BindingConfigureRequest,
  BindingConfigureResponse,
  ExecuteRequest,
  ExecuteResponse,
  HealthResponse,
  InputEvent,
  PlanRequest,
  PlanResponse,
} from "./types";

// VITE_COMPANION_URL is set in web/.env (e.g. http://127.0.0.1:8000)
const BASE = (import.meta.env.VITE_COMPANION_URL as string | undefined) ?? "http://127.0.0.1:8000";

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
    throw new ApiError("NETWORK_ERROR", `Network error: ${err}`);
  }

  if (!res.ok) {
    let body: { error?: { code?: string; message?: string; details?: unknown } } = {};
    try {
      body = await res.json();
    } catch {
      // ignore parse failures
    }
    const err = body.error ?? {};
    throw new ApiError(
      err.code ?? "HTTP_ERROR",
      err.message ?? `HTTP ${res.status}`,
      err.details,
    );
  }

  return res.json() as Promise<T>;
}

export async function health(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

export async function planFromNL(req: PlanRequest): Promise<PlanResponse> {
  return request<PlanResponse>("/plan", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function executePlan(req: ExecuteRequest): Promise<ExecuteResponse> {
  return request<ExecuteResponse>("/execute", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function executeFallback(): Promise<ExecuteResponse> {
  return request<ExecuteResponse>("/execute/fallback", {
    method: "POST",
    body: JSON.stringify({ use_fallback_file: true }),
  });
}

export async function getBindings(): Promise<BindingConfig> {
  return request<BindingConfig>("/bindings");
}

export async function configureBindings(
  req: BindingConfigureRequest,
): Promise<BindingConfigureResponse> {
  return request<BindingConfigureResponse>("/bindings/configure", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function deleteBinding(bindingId: string): Promise<void> {
  await request<void>(`/bindings/${encodeURIComponent(bindingId)}`, {
    method: "DELETE",
  });
}

export async function injectEvent(event: InputEvent): Promise<void> {
  await request<{ queued: boolean }>("/events", {
    method: "POST",
    body: JSON.stringify(event),
  });
}
