"use client";

import {
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  Compass,
  Database,
  Flame,
  Footprints,
  Gauge,
  GitCompareArrows,
  HeartPulse,
  Mountain,
  RefreshCw,
  Share2,
  Sparkles,
  Timer,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ComparisonChart } from "@/components/ComparisonChart";
import { formatActivityDate } from "@/components/ActivityPickerModal";
import type { CompareResponse, StravaActivityResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ComparisonViewProps {
  data: CompareResponse;
  onBack: () => void;
  onOpenPicker?: () => void;
  onRefreshCompare?: () => void;
  onShareCompare?: () => void;
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

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function splitLabel(cls: string): string {
  if (cls === "split_negativo") return "Split Negativo";
  if (cls === "decaimento_ritmo") return "Decaimento de Ritmo";
  return "Split Uniforme";
}

function WorkoutSummaryCard({
  tag,
  tagTone,
  act,
  pace,
  speedKmh,
  splitClass,
  splitDeltaPct,
  ef,
  decoupling,
}: {
  tag: string;
  tagTone: "reference" | "recent";
  act: StravaActivityResponse;
  pace: string;
  speedKmh: number;
  splitClass: string;
  splitDeltaPct: number;
  ef?: number | null;
  decoupling?: number | null;
}) {
  const meta = act.activity_meta;
  const isRecent = tagTone === "recent";

  return (
    <Card
      className={cn(
        "border bg-zinc-950/60 transition-all",
        isRecent
          ? "border-sky-500/40 shadow-lg shadow-sky-500/5"
          : "border-zinc-800/80"
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
              isRecent
                ? "border-sky-500/30 bg-sky-500/15 text-sky-300"
                : "border-zinc-700 bg-zinc-800/80 text-zinc-300"
            )}
          >
            {tag}
          </span>

          {act.has_heartrate ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
              <HeartPulse className="h-3 w-3" /> Com FC
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-400">
              <Footprints className="h-3 w-3" /> Cinemática
            </span>
          )}
        </div>

        <CardTitle className="mt-2 truncate text-lg text-zinc-100" title={meta.name}>
          {meta.name}
        </CardTitle>
        <CardDescription className="flex items-center gap-1.5 text-xs text-zinc-400">
          <Calendar className="h-3.5 w-3.5 text-zinc-500" />
          {formatActivityDate(meta.start_date)} · {meta.sport_type}
        </CardDescription>
      </CardHeader>

      <CardContent className="grid grid-cols-2 gap-2.5 pt-1 text-xs">
        <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/40 p-2.5">
          <span className="text-zinc-500">Pace / Velocidade</span>
          <p className="mt-1 font-mono text-sm font-bold text-zinc-100">{pace}</p>
          <p className="text-[11px] text-zinc-400">{speedKmh.toFixed(1)} km/h</p>
        </div>

        <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/40 p-2.5">
          <span className="text-zinc-500">Distância & Tempo</span>
          <p className="mt-1 font-mono text-sm font-bold text-zinc-100">
            {(meta.distance_meters / 1000).toFixed(2)} km
          </p>
          <p className="text-[11px] text-zinc-400">
            {formatDuration(meta.elapsed_time_seconds)}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/40 p-2.5">
          <span className="text-zinc-500">FC Média & Eficiência</span>
          <p className="mt-1 font-mono text-sm font-bold text-zinc-100">
            {meta.average_heartrate ? `${Math.round(meta.average_heartrate)} bpm` : "Sem Sensor FC"}
          </p>
          <p className="text-[11px] text-zinc-400">
            {ef != null
              ? `EF: ${ef.toFixed(2)} (m/s·bpm)`
              : `Deriva: ${decoupling != null ? `${decoupling > 0 ? "+" : ""}${decoupling} bpm` : "N/A"}`}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/40 p-2.5">
          <span className="text-zinc-500">Pacing & Altimetria</span>
          <p className="mt-1 text-xs font-bold text-zinc-100">{splitLabel(splitClass)}</p>
          <p className="text-[11px] text-zinc-400">
            Split {splitDeltaPct >= 0 ? `+${splitDeltaPct}%` : `${splitDeltaPct}%`} · +D{" "}
            {Math.round(meta.total_elevation_gain)}m
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function ComparisonView({
  data,
  onBack,
  onOpenPicker,
  onRefreshCompare,
  onShareCompare,
}: ComparisonViewProps) {
  const { activity_a, activity_b, deltas, report } = data;

  // Construção das Pílulas de Delta (Δ)
  const pills: Array<{
    label: string;
    detail: string;
    positive: boolean;
  }> = [];

  // 1. Eficiência (EF) se ambos têm FC
  if (deltas.delta_ef_percent != null) {
    const sign = deltas.delta_ef_percent >= 0 ? "+" : "";
    const efRange =
      deltas.ef_a != null && deltas.ef_b != null
        ? `EF: ${deltas.ef_a.toFixed(2)} → ${deltas.ef_b.toFixed(2)}`
        : "Relação Velocidade / FC Média";
    pills.push({
      label: `${sign}${deltas.delta_ef_percent.toFixed(2)}% Eficiência (EF)`,
      detail: efRange,
      positive: deltas.delta_ef_percent >= 0,
    });
  }

  // 2. Velocidade / Pace
  const speedSign = deltas.delta_speed_percent >= 0 ? "+" : "";
  pills.push({
    label: `${speedSign}${deltas.delta_speed_percent.toFixed(1)}% Velocidade`,
    detail:
      deltas.delta_pace_seconds_per_km != null
        ? `${deltas.delta_pace_seconds_per_km <= 0 ? "" : "+"}${deltas.delta_pace_seconds_per_km.toFixed(0)}s/km no Pace`
        : `${speedSign}${deltas.delta_speed_kmh.toFixed(1)} km/h`,
    positive: deltas.delta_speed_percent >= 0,
  });

  // 3. FC Média (quando ambos possuem FC)
  if (deltas.delta_avg_hr_bpm != null) {
    const hrSign = deltas.delta_avg_hr_bpm > 0 ? "+" : "";
    // FC menor com velocidade igual/maior é ganho fisiológico; FC menor em geral = menor custo cardíaco
    const isLowerCost = deltas.delta_avg_hr_bpm <= 0;
    pills.push({
      label: `${hrSign}${deltas.delta_avg_hr_bpm.toFixed(1)} bpm FC Média`,
      detail: isLowerCost ? "Menor custo cardiovascular" : "Maior exigência cardíaca",
      positive: isLowerCost,
    });
  }

  // 4. Deriva Cardíaca (Decoupling)
  if (deltas.delta_decoupling_bpm != null) {
    const decSign = deltas.delta_decoupling_bpm > 0 ? "+" : "";
    const betterDrift = deltas.delta_decoupling_bpm <= 0;
    pills.push({
      label: betterDrift ? `Deriva Estabilizada (${decSign}${deltas.delta_decoupling_bpm} bpm)` : `Deriva +Acentuada (${decSign}${deltas.delta_decoupling_bpm} bpm)`,
      detail: `1ª→2ª metade: ${deltas.decoupling_a_bpm ?? 0} vs ${deltas.decoupling_b_bpm ?? 0} bpm`,
      positive: betterDrift,
    });
  }

  // 5. Pacing / Consistência de Split
  const splitBetter = deltas.split_delta_pct_b >= deltas.split_delta_pct_a;
  pills.push({
    label: splitBetter ? "Pacing +Consistente" : "Maior Decaimento Final",
    detail: `2ª metade: ${deltas.split_delta_pct_a >= 0 ? "+" : ""}${deltas.split_delta_pct_a}% → ${
      deltas.split_delta_pct_b >= 0 ? "+" : ""
    }${deltas.split_delta_pct_b}%`,
    positive: splitBetter,
  });

  // 6. Altimetria (+D)
  const elevSign = deltas.delta_elevation_gain >= 0 ? "+" : "";
  pills.push({
    label: `${elevSign}${Math.round(deltas.delta_elevation_gain)}m Altimetria (+D)`,
    detail: `${Math.round(deltas.elevation_gain_a)}m vs ${Math.round(deltas.elevation_gain_b)}m`,
    positive: deltas.delta_elevation_gain >= 0,
  });

  const isPositiveEvolution = report.evolution_score >= 0;

  return (
    <div className="space-y-6">
      {/* 1. Cabeçalho da Comparação */}
      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-zinc-700/70 bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
        >
          <ArrowLeft className="h-4 w-4 text-zinc-400" />
          Voltar para Análise Única
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#FC4C02]/40 bg-[#FC4C02]/10 px-3.5 py-1 text-xs font-bold tracking-wide text-[#FC4C02]">
            <GitCompareArrows className="h-3.5 w-3.5" />
            [ Comparador Evolutivo Head-to-Head ]
          </span>

          {data.from_local_storage ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 font-mono text-[11px] font-medium text-emerald-300">
              <Database className="h-3.5 w-3.5 text-emerald-400" />
              [ Salvo Localmente · {formatCacheTimestamp(data.cached_at)} ]
            </span>
          ) : data.from_cache ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 font-mono text-[11px] font-medium text-emerald-300">
              <Database className="h-3.5 w-3.5 text-emerald-400" />
              [ Salvo no Banco · gerado em {formatCacheTimestamp(data.cached_at)} ]
            </span>
          ) : null}

          {onRefreshCompare && (
            <button
              type="button"
              onClick={onRefreshCompare}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-[#FC4C02]/50 hover:bg-zinc-800 hover:text-white"
            >
              <RefreshCw className="h-3.5 w-3.5 text-[#FC4C02]" />
              Refazer Diagnóstico com IA
            </button>
          )}

          {onShareCompare && (
            <button
              type="button"
              onClick={onShareCompare}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#FC4C02] px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-[#FC4C02]/20 transition-colors hover:bg-[#e04300]"
            >
              <Share2 className="h-3.5 w-3.5" />
              Compartilhar Comparativo
            </button>
          )}

          {onOpenPicker && (
            <button
              type="button"
              onClick={onOpenPicker}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
            >
              Trocar Treinos
            </button>
          )}
        </div>
      </div>

      {/* 2. Cards Lado a Lado (Treino A vs. Pílulas de Delta vs. Treino B) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-stretch">
        <div className="lg:col-span-4">
          <WorkoutSummaryCard
            tag="Treino A · Referência"
            tagTone="reference"
            act={activity_a}
            pace={deltas.pace_a}
            speedKmh={deltas.speed_kmh_a}
            splitClass={deltas.split_class_a}
            splitDeltaPct={deltas.split_delta_pct_a}
            ef={deltas.ef_a}
            decoupling={deltas.decoupling_a_bpm}
          />
        </div>

        {/* Coluna Central: Pílulas de Delta (Δ) */}
        <Card className="border-zinc-800/80 bg-zinc-950/80 lg:col-span-4 flex flex-col justify-center">
          <CardHeader className="pb-2 pt-4 text-center">
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-zinc-400">
              Deltas Determinísticos (Δ B vs. A)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-2 pb-4 sm:grid-cols-2 lg:grid-cols-1">
            {pills.map((pill, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs transition-all",
                  pill.positive
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                )}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {pill.positive ? (
                    <TrendingUp className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  )}
                  <span>{pill.label}</span>
                </div>
                <span className="text-[11px] opacity-80">{pill.detail}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="lg:col-span-4">
          <WorkoutSummaryCard
            tag="Treino B · Mais Recente"
            tagTone="recent"
            act={activity_b}
            pace={deltas.pace_b}
            speedKmh={deltas.speed_kmh_b}
            splitClass={deltas.split_class_b}
            splitDeltaPct={deltas.split_delta_pct_b}
            ef={deltas.ef_b}
            decoupling={deltas.decoupling_b_bpm}
          />
        </div>
      </div>

      {/* 3. Gráfico Sobreposto (0% a 100%) */}
      <ComparisonChart
        activityA={activity_a}
        activityB={activity_b}
        bothHaveHr={deltas.both_have_hr}
      />

      {/* 4. Card de Diagnóstico Comparativo da IA (Gemini) */}
      <Card className="border-zinc-800/90 bg-gradient-to-b from-zinc-900/80 to-zinc-950">
        <CardHeader className="border-b border-zinc-800/80 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FC4C02]/15 text-[#FC4C02]">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base text-zinc-100">
                  Diagnóstico Evolutivo PulseTriage AI
                </CardTitle>
                <CardDescription>
                  Análise longitudinal de condicionamento, eficiência e estratégia de ritmo
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold",
                  isPositiveEvolution
                    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                    : "border-amber-500/30 bg-amber-500/15 text-amber-300"
                )}
              >
                {isPositiveEvolution ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : (
                  <Flame className="h-3.5 w-3.5" />
                )}
                {report.headline_badge}
              </span>
              <span className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 font-mono text-xs font-bold text-zinc-200">
                Índice Evolutivo: {report.evolution_score > 0 ? `+${report.evolution_score}` : report.evolution_score}
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid grid-cols-1 gap-4 pt-5 md:grid-cols-2">
          {/* Veredito da Adaptação */}
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
              <TrendingUp className="h-4 w-4" />
              Veredito da Adaptação
            </div>
            <p className="text-sm leading-relaxed text-zinc-200">
              {report.adaptation_verdict}
            </p>
          </div>

          {/* Eficiência de Pacing e Distribuição de Energia */}
          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-400">
              <Gauge className="h-4 w-4" />
              Eficiência de Pacing e Distribuição de Energia
            </div>
            <p className="text-sm leading-relaxed text-zinc-200">
              {report.pacing_and_energy_analysis}
            </p>
          </div>

          {/* Eficiência Cardiovascular ou Sustentação Mecânica */}
          <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-400">
              <HeartPulse className="h-4 w-4" />
              {deltas.both_have_hr
                ? "Fator de Eficiência (EF) & Deriva Cardíaca"
                : "Sustentação Mecânica & Resposta ao Relevo"}
            </div>
            <p className="text-sm leading-relaxed text-zinc-200">
              {report.cardiovascular_or_mechanical_efficiency}
            </p>
          </div>

          {/* Diretriz para o Próximo Bloco */}
          <div className="rounded-2xl border border-[#FC4C02]/25 bg-[#FC4C02]/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#FC4C02]">
              <Compass className="h-4 w-4" />
              Diretriz para o Próximo Bloco
            </div>
            <p className="text-sm leading-relaxed text-zinc-200">
              {report.next_block_guidance}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
