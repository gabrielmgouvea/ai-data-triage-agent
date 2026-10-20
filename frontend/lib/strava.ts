/**
 * PulseTriage — Sessão Strava no navegador.
 *
 * Tokens ficam no localStorage (app local / single-user). O `state` OAuth fica
 * no sessionStorage e é conferido no callback para mitigar CSRF.
 */
import { refreshStravaToken } from "./api";
import type { StravaSession } from "./types";

const SESSION_KEY = "pulsetriage.strava.session";
const STATE_KEY = "pulsetriage.strava.oauth_state";

/** Margem antes da expiração para renovar proativamente (s). */
const REFRESH_MARGIN_S = 120;

export function loadStravaSession(): StravaSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StravaSession) : null;
  } catch {
    return null;
  }
}

export function saveStravaSession(session: StravaSession): void {
  // O refresh do Strava não devolve `athlete` — preserva o que já tínhamos.
  const previous = loadStravaSession();
  const merged: StravaSession = { ...session, athlete: session.athlete ?? previous?.athlete ?? null };
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(merged));
}

export function clearStravaSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
}

export function saveOAuthState(state: string): void {
  window.sessionStorage.setItem(STATE_KEY, state);
}

/** Confere e consome o state salvo antes do redirect. */
export function consumeOAuthState(received: string | null): boolean {
  const expected = window.sessionStorage.getItem(STATE_KEY);
  window.sessionStorage.removeItem(STATE_KEY);
  return !!expected && !!received && expected === received;
}

/** Retorna um access token válido, renovando-o se estiver perto de expirar. */
export async function getValidAccessToken(): Promise<string> {
  const session = loadStravaSession();
  if (!session) throw new Error("Strava não conectado.");

  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at - REFRESH_MARGIN_S > now) return session.access_token;

  const refreshed = await refreshStravaToken(session.refresh_token);
  saveStravaSession(refreshed);
  return refreshed.access_token;
}
