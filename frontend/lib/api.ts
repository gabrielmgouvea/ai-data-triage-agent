/**
 * PulseTriage — Cliente de API para comunicação com o backend FastAPI.
 * - Em desenvolvimento local (localhost): utiliza http://localhost:8000 (ou NEXT_PUBLIC_API_URL)
 * - Em produção unificada na Vercel (*.vercel.app): utiliza caminho relativo "" (mesma origem)
 */

import type {
  AnalyzeRequest,
  AnalyzeResponse,
  CompareResponse,
  DemoActivityResponse,
  SleepCheckin,
  StravaActivityResponse,
  StravaActivitySummary,
  StravaTokenResponse,
} from "./types";

export function getApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:8000";
    }
    // Em produção na Vercel, o backend serverless responde na mesma origem (/api/*)
    return "";
  }
  return "http://localhost:8000";
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function fetchJson<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${getApiBase()}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    let message = text;
    try {
      const body = JSON.parse(text);
      if (typeof body?.detail === "string") message = body.detail;
    } catch {
      /* corpo não-JSON: mantém texto bruto */
    }
    throw new ApiError(`API ${res.status}: ${message}`, res.status);
  }

  return res.json() as Promise<T>;
}

/** Verifica se o backend FastAPI (local ou Vercel Serverless) está online. */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/health`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Demo ─────────────────────────────────────────────────────────────────────

/** Busca os dados de atividade de demonstração do backend. */
export async function fetchDemoActivity(demoType: "run" | "strength" = "run"): Promise<DemoActivityResponse> {
  return fetchJson<DemoActivityResponse>(`/api/v1/demo?type=${demoType}`);
}

// ── Analyze ──────────────────────────────────────────────────────────────────

/**
 * Dispara o pipeline de triagem + IA sobre os dados de demonstração.
 * Opcionalmente, recebe um check-in de sono para sobrescrever o contexto mock.
 */
export async function analyzeDemoActivity(
  sleepOverride?: SleepCheckin | null,
  demoType: "run" | "strength" = "run",
  omitSleep: boolean = false,
  forceRefresh: boolean = false
): Promise<AnalyzeResponse> {
  if (omitSleep) {
    const demo = await fetchDemoActivity(demoType);
    const payload: AnalyzeRequest = {
      activity_meta: demo.activity_meta,
      sleep_context: null,
      telemetry: demo.telemetry,
      activity_type: demoType === "strength" ? "weight_training" : "run",
      force_refresh: forceRefresh,
    };
    return fetchJson<AnalyzeResponse>("/api/v1/analyze", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  if (!sleepOverride) {
    // Sem override: usa os dados mock completos do backend
    return fetchJson<AnalyzeResponse>(
      `/api/v1/analyze/demo?type=${demoType}&force_refresh=${forceRefresh}`,
      {
        method: "POST",
      }
    );
  }

  // Com override: busca dados demo, aplica o check-in e envia para /analyze
  const demo = await fetchDemoActivity(demoType);
  const payload: AnalyzeRequest = {
    activity_meta: demo.activity_meta,
    sleep_context: {
      ...demo.sleep_context,
      total_sleep_hours: sleepOverride.total_sleep_hours,
      subjective_quality_1_to_5: sleepOverride.subjective_quality_1_to_5,
      subjective_fatigue_1_to_5: sleepOverride.subjective_fatigue_1_to_5,
      notes: sleepOverride.notes ?? demo.sleep_context.notes,
      source: "strava_user",
    },
    telemetry: demo.telemetry,
    activity_type: demoType === "strength" ? "weight_training" : "run",
    force_refresh: forceRefresh,
  };

  return fetchJson<AnalyzeResponse>("/api/v1/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Executa triagem determinística + Gemini sobre qualquer atividade (ex.: Strava). */
export async function analyzeActivity(
  payload: AnalyzeRequest
): Promise<AnalyzeResponse> {
  return fetchJson<AnalyzeResponse>("/api/v1/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── Strava (Fase 5) ──────────────────────────────────────────────────────────

export async function getStravaAuthUrl(): Promise<{ url: string; state: string }> {
  return fetchJson("/api/strava/auth-url");
}

export async function exchangeStravaToken(code: string): Promise<StravaTokenResponse> {
  return fetchJson<StravaTokenResponse>("/api/strava/exchange-token", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function refreshStravaToken(refreshToken: string): Promise<StravaTokenResponse> {
  return fetchJson<StravaTokenResponse>("/api/strava/refresh-token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export async function fetchStravaLatestActivity(
  accessToken: string,
  athleteAge = 30
): Promise<StravaActivityResponse> {
  return fetchJson<StravaActivityResponse>(
    `/api/strava/latest-activity?athlete_age=${athleteAge}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

export async function fetchStravaActivities(
  accessToken: string,
  page = 1,
  perPage = 15
): Promise<StravaActivitySummary[]> {
  return fetchJson<StravaActivitySummary[]>(
    `/api/strava/activities?page=${page}&per_page=${perPage}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

export async function fetchStravaActivityStreams(
  accessToken: string,
  activityId: number,
  athleteAge = 30
): Promise<StravaActivityResponse> {
  return fetchJson<StravaActivityResponse>(
    `/api/strava/activity/${activityId}/streams?athlete_age=${athleteAge}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

export async function compareStravaActivities(
  accessToken: string,
  activityIdA: number,
  activityIdB: number,
  athleteAge = 30,
  forceRefresh = false
): Promise<CompareResponse> {
  return fetchJson<CompareResponse>("/api/strava/compare", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      activity_id_a: activityIdA,
      activity_id_b: activityIdB,
      athlete_age: athleteAge,
      force_refresh: forceRefresh,
    }),
  });
}
