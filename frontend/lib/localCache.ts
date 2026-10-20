/**
 * PulseTriage — Persistência Resiliente no Frontend (localStorage).
 *
 * Como funções serverless na Vercel possuem armazenamento efêmero em /tmp,
 * este módulo persiste diagnósticos individuais e comparativos diretamente
 * no navegador do usuário indexados pelo ID da atividade.
 */

import type { AnalyzeResponse, CompareResponse } from "./types";

const DIAG_PREFIX = "pulsetriage.diag.v1.";
const COMPARE_PREFIX = "pulsetriage.compare.v1.";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function buildComparePairKey(idA: string | number, idB: string | number): string {
  const sorted = [String(idA), String(idB)].sort();
  return `${COMPARE_PREFIX}${sorted[0]}_${sorted[1]}`;
}

/** Salva um diagnóstico individual no localStorage indexado pelo ID da atividade. */
export function saveLocalDiagnostic(
  activityId: string | number,
  response: AnalyzeResponse
): void {
  if (!isBrowser() || !activityId) return;
  try {
    const payload: AnalyzeResponse = {
      ...response,
      cached_at: response.cached_at ?? new Date().toISOString(),
    };
    window.localStorage.setItem(
      `${DIAG_PREFIX}${String(activityId)}`,
      JSON.stringify(payload)
    );
  } catch {
    // Ignora erros de quota do localStorage silenciosamente
  }
}

/** Recupera um diagnóstico individual salvo no localStorage. */
export function getLocalDiagnostic(
  activityId: string | number
): AnalyzeResponse | null {
  if (!isBrowser() || !activityId) return null;
  try {
    const raw = window.localStorage.getItem(`${DIAG_PREFIX}${String(activityId)}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AnalyzeResponse;
    if (!parsed || !parsed.triage || !parsed.report) return null;
    return {
      ...parsed,
      from_cache: true,
      from_local_storage: true,
    };
  } catch {
    return null;
  }
}

/** Salva um relatório comparativo Head-to-Head no localStorage. */
export function saveLocalComparison(
  idA: string | number,
  idB: string | number,
  response: CompareResponse
): void {
  if (!isBrowser() || !idA || !idB) return;
  try {
    const payload: CompareResponse = {
      ...response,
      cached_at: response.cached_at ?? new Date().toISOString(),
    };
    window.localStorage.setItem(
      buildComparePairKey(idA, idB),
      JSON.stringify(payload)
    );
  } catch {
    // Ignora erros de quota do localStorage silenciosamente
  }
}

/** Recupera um relatório comparativo Head-to-Head salvo no localStorage. */
export function getLocalComparison(
  idA: string | number,
  idB: string | number
): CompareResponse | null {
  if (!isBrowser() || !idA || !idB) return null;
  try {
    const raw = window.localStorage.getItem(buildComparePairKey(idA, idB));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CompareResponse;
    if (!parsed || !parsed.deltas || !parsed.report) return null;
    return {
      ...parsed,
      from_cache: true,
      from_local_storage: true,
    };
  } catch {
    return null;
  }
}
