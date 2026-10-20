"use client";

import {
  Heart,
  TrendingUp,
  Timer,
  AlertTriangle,
  Activity,
  Zap,
  Moon,
  ListChecks,
  CheckCircle2,
  Info,
  Footprints,
  Mountain,
  Wind,
  Sparkles,
  Gauge,
  Database,
  RefreshCw,
  Share2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AnalyzeResponse, SleepContext } from "@/lib/types";
import { cn, formatDuration, incidentConfig } from "@/lib/utils";

interface DiagnosticReportCardProps {
  result: AnalyzeResponse;
  sleepContext?: SleepContext | null;
  durationSeconds: number;
  onRefreshAnalysis?: () => void;
  onShareCard?: () => void;
}

function formatCacheTimestamp(iso?: string | null): string {
  if (!iso) return "recentemente";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DiagnosticReportCard({
  result,
  sleepContext,
  durationSeconds,
  onRefreshAnalysis,
  onShareCard,
}: DiagnosticReportCardProps) {
  const { triage, report } = result;
  const hasHR =
    triage.has_heartrate ??
    (triage.max_valid_heartrate_bpm != null && triage.max_valid_heartrate_bpm > 0);

  const anaerobicPercent = (
    (triage.time_in_anaerobic_zone_seconds / (durationSeconds || 1)) *
    100
  ).toFixed(0);

  return (
    <div className="space-y-6">
      {/* ── Barra Superior de Cache, Refresh & Exportação de Card ─────────── */}
      {(result.from_cache || result.from_local_storage || onRefreshAnalysis || onShareCard) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {result.from_local_storage ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 font-mono text-[11px] font-medium text-emerald-300">
                <Database className="h-3.5 w-3.5 text-emerald-400" />
                [ Salvo Localmente · {formatCacheTimestamp(result.cached_at)} ]
              </span>
            ) : result.from_cache ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 font-mono text-[11px] font-medium text-emerald-300">
                <Database className="h-3.5 w-3.5 text-emerald-400" />
                [ Salvo no Banco · gerado em {formatCacheTimestamp(result.cached_at)} ]
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/70 bg-zinc-800/60 px-3 py-1 font-mono text-[11px] text-zinc-400">
                <Sparkles className="h-3.5 w-3.5 text-[#FC4C02]" />
                [ Salvo Localmente · {formatCacheTimestamp(result.cached_at)} ]
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onRefreshAnalysis && (
              <button
                type="button"
                onClick={onRefreshAnalysis}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-[#FC4C02]/50 hover:bg-zinc-800 hover:text-white"
              >
                <RefreshCw className="h-3.5 w-3.5 text-[#FC4C02]" />
                Refazer Diagnóstico com IA
              </button>
            )}

            {onShareCard && (
              <button
                type="button"
                onClick={onShareCard}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#FC4C02] px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-[#FC4C02]/20 transition-colors hover:bg-[#e04300]"
              >
                <Share2 className="h-3.5 w-3.5" />
                Exportar Card
              </button>
            )}
          </div>
        </div>
      )}
      {/* ── Grid Modular do Diagnóstico da IA ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bloco 1: Resumo Fisiológico / Cinemático */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3 border-b border-zinc-800/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-zinc-800 text-zinc-300">
                  {hasHR ? <Activity className="h-4 w-4" /> : <Wind className="h-4 w-4 text-sky-400" />}
                </div>
                <CardTitle className="text-sm font-semibold text-zinc-200">
                  {hasHR ? "Resumo Fisiológico" : "Análise Cinemática & Pacing"}
                </CardTitle>
              </div>
              {hasHR ? (
                <Badge variant="outline" className={cn(
                  "font-medium tracking-wide text-[10px] uppercase",
                  triage.activity_type_detected === "weight_training" ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                )}>
                  {triage.activity_type_detected === "weight_training" ? "Musculação" : "Corrida"}
                </Badge>
              ) : (
                <div
                  className="group relative inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-[10px] font-semibold text-sky-400 cursor-help"
                  title="Análise focada em distribuição de ritmo, sustentação mecânica e altimetria."
                >
                  <span>Análise Cinemática & Pacing</span>
                  <Info className="h-3 w-3 text-sky-400/80 group-hover:text-sky-300" />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-4 flex-1 flex flex-col justify-between space-y-4">
            <p className="text-sm leading-relaxed text-zinc-400">
              {report.physiological_summary}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {hasHR ? (
                <>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/60 border border-zinc-700/50">
                    <Heart className="h-3.5 w-3.5 text-rose-500" />
                    <span className="text-xs font-medium text-zinc-300">
                      {triage.max_valid_heartrate_bpm} bpm máx
                    </span>
                  </div>
                  
                  {triage.activity_type_detected === "weight_training" ? (
                    <>
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/60 border border-zinc-700/50">
                        <Zap className="h-3.5 w-3.5 text-amber-500" />
                        <span className="text-xs font-medium text-zinc-300">
                          {triage.strength_sets_detected ?? 0} Séries
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/60 border border-zinc-700/50">
                        <Timer className="h-3.5 w-3.5 text-sky-400" />
                        <span className="text-xs font-medium text-zinc-300">
                          {triage.strength_avg_rest_seconds ?? 0}s Descanso Médio
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/60 border border-zinc-700/50">
                        <Timer className="h-3.5 w-3.5 text-amber-500" />
                        <span className="text-xs font-medium text-zinc-300">
                          {anaerobicPercent}% anaeróbico
                        </span>
                      </div>
                      {triage.cardiac_drift_detected && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
                          <TrendingUp className="h-3.5 w-3.5 text-amber-500" />
                          <span className="text-xs font-medium text-amber-500">
                            Drift: +{triage.drift_delta_bpm} bpm
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/10 border border-sky-500/20">
                    <Footprints className="h-3.5 w-3.5 text-sky-400" />
                    <span className="text-xs font-medium text-sky-300">
                      Pace: {triage.kinematics?.average_pace_min_km ?? "--:-- /km"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/60 border border-zinc-700/50">
                    <Timer className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-xs font-medium text-zinc-300">
                      {triage.kinematics?.split_classification === "split_negativo"
                        ? "Split Negativo (Acelerou)"
                        : triage.kinematics?.split_classification === "decaimento_ritmo"
                        ? "Decaimento de Ritmo"
                        : "Split Uniforme"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <Mountain className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-xs font-medium text-emerald-300">
                      +{triage.kinematics?.elevation_gain_meters ?? 0}m (+D)
                    </span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bloco 2: Impacto do Sono OU Carga Externa & Eficiência Mecânica */}
        {sleepContext ? (
          <Card className="flex flex-col">
            <CardHeader className="pb-3 border-b border-zinc-800/80">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-zinc-800 text-zinc-300">
                  <Moon className="h-4 w-4" />
                </div>
                <CardTitle className="text-sm font-semibold text-zinc-200">
                  Impacto do Sono & Prontidão
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-4 flex-1 flex flex-col justify-between space-y-4">
              <p className="text-sm leading-relaxed text-zinc-400">
                {report.correlation_with_sleep}
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/60 border border-zinc-700/50">
                  <span className="text-[10px] uppercase font-bold text-indigo-400">
                    Total
                  </span>
                  <span className="text-xs font-medium text-zinc-300">
                    {sleepContext.total_sleep_hours}h
                  </span>
                </div>
                {sleepContext.hrv_rmssd_ms && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/60 border border-zinc-700/50">
                    <span className="text-[10px] uppercase font-bold text-emerald-400">
                      HRV
                    </span>
                    <span className="text-xs font-medium text-zinc-300">
                      {sleepContext.hrv_rmssd_ms} ms
                    </span>
                  </div>
                )}
                {sleepContext.deep_sleep_hours && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/60 border border-zinc-700/50">
                    <span className="text-[10px] uppercase font-bold text-purple-400">
                      Profundo
                    </span>
                    <span className="text-xs font-medium text-zinc-300">
                      {sleepContext.deep_sleep_hours}h
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="flex flex-col border-sky-500/20 bg-gradient-to-br from-zinc-900/60 to-zinc-950/80">
            <CardHeader className="pb-3 border-b border-zinc-800/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-sky-500/10 text-sky-400">
                    <Gauge className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-sm font-semibold text-zinc-200">
                    Carga Externa & Eficiência Mecânica
                  </CardTitle>
                </div>
                <Badge variant="outline" className="font-medium tracking-wide text-[10px] uppercase bg-sky-500/10 text-sky-400 border-sky-500/20">
                  Telemetria Pura
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4 flex-1 flex flex-col justify-between space-y-4">
              <p className="text-sm leading-relaxed text-zinc-400">
                {report.correlation_with_sleep}
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                {hasHR ? (
                  <>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/60 border border-zinc-700/50">
                      <Heart className="h-3.5 w-3.5 text-rose-400" />
                      <span className="text-xs font-medium text-zinc-300">
                        {triage.avg_valid_heartrate_bpm ?? "--"} bpm méd
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/60 border border-zinc-700/50">
                      <Timer className="h-3.5 w-3.5 text-amber-400" />
                      <span className="text-xs font-medium text-zinc-300">
                        {anaerobicPercent}% anaeróbico
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/60 border border-zinc-700/50">
                      <Activity className="h-3.5 w-3.5 text-sky-400" />
                      <span className="text-xs font-medium text-zinc-300">
                        {triage.cardiac_drift_detected ? `Drift +${triage.drift_delta_bpm} bpm` : "FC Estável"}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/10 border border-sky-500/20">
                      <TrendingUp className="h-3.5 w-3.5 text-sky-400" />
                      <span className="text-xs font-medium text-sky-300">
                        Split Δ {triage.kinematics?.split_pace_delta_percent ? `${triage.kinematics.split_pace_delta_percent > 0 ? "+" : ""}${triage.kinematics.split_pace_delta_percent}%` : "0%"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/60 border border-zinc-700/50">
                      <Wind className="h-3.5 w-3.5 text-sky-400" />
                      <span className="text-xs font-medium text-zinc-300">
                        2ª Metade: {triage.kinematics?.split_second_half_avg_speed_kmh ?? "--"} km/h
                      </span>
                    </div>
                    {triage.kinematics?.grade_pace_impact_percent != null && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                        <Mountain className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-xs font-medium text-emerald-300">
                          Δ Subida {triage.kinematics.grade_pace_impact_percent}%
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bloco 2.5: Ganhos da Sessão */}
        <Card className="md:col-span-2 border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 to-zinc-900/60">
          <CardContent className="pt-5 pb-5 flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
              <TrendingUp className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-500">
                  Ganhos da Sessão
                </p>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  {!hasHR
                    ? "Foco: Sustentação Mecânica & Pacing"
                    : triage.activity_type_detected === "weight_training"
                    ? "Foco: Sobrecarga Muscular"
                    : "Foco: VO2 Máx & Limiar"}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-zinc-300">
                {report.training_benefit}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Bloco 3: Plano de Ação & Recuperação (ocupa 2 colunas no desktop) */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3 border-b border-zinc-800/80">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-zinc-800 text-zinc-300">
                <ListChecks className="h-4 w-4" />
              </div>
              <CardTitle className="text-sm font-semibold text-zinc-200">
                Plano de Ação & Recuperação (Próximas 24h)
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Recuperação Imediata
              </h4>
              <ul className="space-y-2">
                {report.recovery_recommendation
                  .split(".")
                  .filter((s) => s.trim().length > 0)
                  .map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-zinc-300">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                      <span>{item.trim()}</span>
                    </li>
                  ))}
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Orientação p/ Próximo Treino
              </h4>
              <div className="flex items-start gap-2 bg-zinc-800/40 p-3 rounded-xl border border-zinc-700/50">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-sm text-zinc-300 leading-relaxed">
                  {report.next_training_guidance}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Incidentes Detalhados da Triagem ──────────────────────────────── */}
      {triage.incidents.length > 0 && (
        <Card>
          <CardHeader className="pb-3 border-b border-zinc-800/80">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-zinc-200">
                Anomalias Identificadas no Filtro Determinístico
              </CardTitle>
              <Badge variant="outline" className="text-xs text-zinc-400 border-zinc-700">
                {triage.incidents.length} Registros
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {triage.incidents.map((inc, i) => {
              const cfg = incidentConfig(inc.incident_type);
              return (
                <div
                  key={i}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5 transition-colors hover:bg-zinc-800/60"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full",
                        inc.incident_type.includes("tachycardia") || inc.incident_type.includes("spike")
                          ? "bg-rose-500"
                          : inc.incident_type === "cardiac_drift"
                          ? "bg-amber-500"
                          : "bg-zinc-500"
                      )}
                    />
                    <div>
                      <p className={cn("text-sm font-semibold text-zinc-200")}>
                        {cfg.label}
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                        {inc.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    {inc.peak_heartrate_bpm && (
                      <div className="text-xs">
                        <p className="text-zinc-500 uppercase font-bold text-[10px]">Pico</p>
                        <p className="text-rose-400 font-medium">{inc.peak_heartrate_bpm} bpm</p>
                      </div>
                    )}
                    <div className="text-xs min-w-[80px]">
                      <p className="text-zinc-500 uppercase font-bold text-[10px]">Período</p>
                      <p className="text-zinc-300">
                        {formatDuration(inc.time_start_s)} - {formatDuration(inc.time_end_s)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Upgrade de Telemetria (quando sem monitor cardíaco) ─────────────── */}
      {!hasHR && (
        <Card className="border-indigo-500/20 bg-indigo-950/20 backdrop-blur-sm">
          <CardContent className="pt-4 pb-4 flex items-start sm:items-center gap-3.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <p className="text-xs text-indigo-200/90 leading-relaxed">
              <span className="font-semibold text-indigo-300">💡 Desbloqueie métricas fisiológicas:</span>{" "}
              Conectar um monitor cardíaco em treinos futuros adiciona triagem de deriva cardiovascular, fator de eficiência (EF) e carga interna.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
