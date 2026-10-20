"use client";

import { useMemo, useRef, useState } from "react";
import { toBlob, toPng } from "html-to-image";
import {
  Activity,
  Check,
  Copy,
  Download,
  Dumbbell,
  Flame,
  Footprints,
  GitCompareArrows,
  HeartPulse,
  Loader2,
  Mountain,
  Share2,
  Sparkles,
  Timer,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatActivityDate } from "@/components/ActivityPickerModal";
import type {
  AnalyzeResponse,
  CompareResponse,
  LoadedActivity,
  TelemetryPoint,
} from "@/lib/types";
import { cn, formatDuration, msToPace } from "@/lib/utils";

interface ShareableCardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "single" | "comparison";
  activity?: LoadedActivity | null;
  result?: AnalyzeResponse | null;
  comparison?: CompareResponse | null;
}

function buildSparklinePath(
  values: number[],
  width: number,
  height: number,
  padding = 6
): { linePath: string; areaPath: string } {
  if (!values.length) {
    return { linePath: "", areaPath: "" };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);

  const step = Math.max(1, Math.floor(values.length / 48));
  const sampled = values.filter((_, i) => i % step === 0 || i === values.length - 1);

  const pts = sampled.map((v, idx) => {
    const x =
      sampled.length === 1
        ? width / 2
        : padding + (idx / (sampled.length - 1)) * (width - padding * 2);
    const y =
      height - padding - ((v - min) / range) * (height - padding * 2);
    return [Number(x.toFixed(1)), Number(y.toFixed(1))] as const;
  });

  const linePath = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");
  const firstX = pts[0][0];
  const lastX = pts[pts.length - 1][0];
  const areaPath = `${linePath} L ${lastX} ${height} L ${firstX} ${height} Z`;

  return { linePath, areaPath };
}

function splitShortLabel(cls?: string): string {
  if (cls === "split_negativo") return "Split Negativo";
  if (cls === "decaimento_ritmo") return "Decaimento";
  return "Split Uniforme";
}

function truncateText(text: string, maxChars: number): string {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1).trimEnd() + "…";
}

const STATIONARY_SPORTS = new Set([
  "weighttraining",
  "workout",
  "crossfit",
  "hiit",
  "yoga",
  "pilates",
  "stairstepper",
  "elliptical",
]);

function checkIsStrengthOrStationary(
  sportType?: string,
  detectedType?: string,
  distanceMeters?: number,
  paceStr?: string
): boolean {
  const st = (sportType || "").toLowerCase().replace(/\s+/g, "");
  if (STATIONARY_SPORTS.has(st) || detectedType === "weight_training") {
    return true;
  }
  const noDistance = !distanceMeters || distanceMeters <= 15;
  const invalidPace = !paceStr || paceStr.startsWith("--");
  return noDistance && invalidPace;
}

export function ShareableCardModal({
  open,
  onOpenChange,
  mode,
  activity,
  result,
  comparison,
}: ShareableCardModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState<"4:5" | "1:1">("4:5");
  const [downloading, setDownloading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Sparkline para Análise Individual
  const singleSpark = useMemo(() => {
    if (!activity?.telemetry?.length) return { linePath: "", areaPath: "", isHr: false };
    const hasHr =
      (result?.triage.has_heartrate ?? activity.activity_meta.has_heartrate) &&
      activity.telemetry.some((p) => p.heartrate_bpm != null && p.heartrate_bpm > 0);
    const vals = hasHr
      ? activity.telemetry
          .map((p) => p.heartrate_bpm ?? 0)
          .filter((v) => v > 0)
      : activity.telemetry.map((p) => Number((p.velocity_ms * 3.6).toFixed(2)));
    return {
      ...buildSparklinePath(vals, 360, 68),
      isHr: Boolean(hasHr),
    };
  }, [activity, result]);

  // Sparkline dupla para Comparativo Head-to-Head
  const compareSpark = useMemo(() => {
    if (!comparison) return { pathA: "", pathB: "", areaB: "", useHr: false };
    const tA = comparison.activity_a.telemetry;
    const tB = comparison.activity_b.telemetry;
    const isStationaryComp =
      (comparison.deltas.distance_km_a <= 0.02 || comparison.deltas.distance_km_b <= 0.02) &&
      comparison.deltas.both_have_hr;

    const extractVal = (p: TelemetryPoint) =>
      isStationaryComp ? (p.heartrate_bpm ?? 0) : p.velocity_ms * 3.6;

    const valsA = tA.map(extractVal).filter((v) => v > 0);
    const valsB = tB.map(extractVal).filter((v) => v > 0);
    const all = [...valsA, ...valsB];
    const min = all.length ? Math.min(...all) : 0;
    const max = all.length ? Math.max(...all) : 1;
    const range = Math.max(max - min, 1);

    const buildNormalized = (pts: TelemetryPoint[]) => {
      if (!pts.length) return { line: "", area: "" };
      const count = 40;
      const coords: Array<[number, number]> = [];
      for (let i = 0; i <= count; i++) {
        const idx = Math.min(
          pts.length - 1,
          Math.round((i / count) * (pts.length - 1))
        );
        const v = extractVal(pts[idx]);
        const x = 6 + (i / count) * (360 - 12);
        const y = 64 - 6 - ((v - min) / range) * (64 - 12);
        coords.push([Number(x.toFixed(1)), Number(y.toFixed(1))]);
      }
      const line = coords
        .map(([x, y], idx) => `${idx === 0 ? "M" : "L"} ${x} ${y}`)
        .join(" ");
      const area = `${line} L ${coords[coords.length - 1][0]} 64 L ${coords[0][0]} 64 Z`;
      return { line, area };
    };

    const normA = buildNormalized(tA);
    const normB = buildNormalized(tB);
    return {
      pathA: normA.line,
      pathB: normB.line,
      areaB: normB.area,
      useHr: isStationaryComp,
    };
  }, [comparison]);

  const handleDownloadPng = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    setActionError(null);
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: "#09090b",
      });
      const link = document.createElement("a");
      const slug =
        mode === "comparison"
          ? "pulsetriage-head-to-head"
          : `pulsetriage-${(activity?.activity_meta.name || "treino")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")}`;
      link.download = `${slug}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Não foi possível exportar a imagem."
      );
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyImage = async () => {
    if (!cardRef.current) return;
    setCopying(true);
    setActionError(null);
    try {
      const blob = await toBlob(cardRef.current, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: "#09090b",
      });
      if (!blob) throw new Error("Falha ao gerar o blob da imagem.");
      if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
        throw new Error("Seu navegador não suporta cópia direta de imagem. Use 'Baixar Imagem (PNG)'.");
      }
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Falha ao copiar imagem para a área de transferência."
      );
    } finally {
      setCopying(false);
    }
  };

  // Dados calculados para modo "single"
  const singleMeta = activity?.activity_meta;
  const singleTriage = result?.triage;
  const singleReport = result?.report;
  const singleHasHr =
    singleTriage?.has_heartrate ??
    singleMeta?.has_heartrate ??
    Boolean(singleMeta?.average_heartrate && singleMeta.average_heartrate > 0);
  const singleAvgHr =
    singleTriage?.avg_valid_heartrate_bpm ?? singleMeta?.average_heartrate ?? null;
  const singleMaxHr =
    singleTriage?.max_valid_heartrate_bpm ?? singleMeta?.max_heartrate ?? null;
  const singleEf =
    singleHasHr && singleAvgHr && singleAvgHr > 0 && singleMeta?.average_speed
      ? ((singleMeta.average_speed / singleAvgHr) * 100).toFixed(2)
      : null;
  const singlePace =
    singleTriage?.kinematics?.average_pace_min_km ??
    (singleMeta ? msToPace(singleMeta.average_speed) : "--:-- /km");
  const singleElev =
    singleTriage?.kinematics?.elevation_gain_meters ??
    singleMeta?.total_elevation_gain ??
    0;

  const isStrengthWorkout = checkIsStrengthOrStationary(
    singleMeta?.sport_type,
    singleTriage?.activity_type_detected,
    singleMeta?.distance_meters,
    singlePace
  );

  // Cálculo de Densidade / Carga Interna para Musculação
  const strengthIntensityPct =
    singleAvgHr && singleMeta?.athlete_max_hr_estimated
      ? Math.round((singleAvgHr / singleMeta.athlete_max_hr_estimated) * 100)
      : null;
  const estimatedKcal =
    singleAvgHr && singleMeta?.elapsed_time_seconds
      ? Math.round(
          ((singleMeta.elapsed_time_seconds / 60) *
            (singleAvgHr * 0.6309 - 55.0969 + (singleMeta.athlete_age || 30) * 0.2017)) /
            4.184
        )
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="border-b border-zinc-800/80 px-5 pb-3.5 pt-5">
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Share2 className="h-4 w-4 text-[#FC4C02]" />
              {mode === "comparison"
                ? "Compartilhar Comparativo Head-to-Head"
                : "Exportar Card do Treino"}
            </DialogTitle>

            {/* Seletor de Proporção */}
            <div className="inline-flex items-center rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setAspect("4:5")}
                className={cn(
                  "rounded-md px-2 py-0.5 font-semibold transition-colors",
                  aspect === "4:5"
                    ? "bg-[#FC4C02] text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                4:5 Stories/Feed
              </button>
              <button
                type="button"
                onClick={() => setAspect("1:1")}
                className={cn(
                  "rounded-md px-2 py-0.5 font-semibold transition-colors",
                  aspect === "1:1"
                    ? "bg-[#FC4C02] text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                1:1 Quadrado
              </button>
            </div>
          </div>
          <DialogDescription>
            Prévia em alta resolução pronta para exportar em PNG ou copiar direto para WhatsApp/Instagram.
          </DialogDescription>
        </DialogHeader>

        {/* Área de Prévia do Card */}
        <div className="flex items-center justify-center bg-zinc-950/90 px-4 py-5 overflow-y-auto max-h-[68vh]">
          <div
            ref={cardRef}
            style={{ width: 400, minHeight: aspect === "4:5" ? 500 : 400 }}
            className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-zinc-800/90 bg-gradient-to-br from-zinc-950 via-zinc-900/95 to-zinc-950 p-6 text-zinc-100 shadow-2xl"
          >
            {/* Glow Decorativo Sutil */}
            <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[#FC4C02]/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 -left-16 h-44 w-44 rounded-full bg-sky-500/10 blur-3xl" />

            {/* ── MODO 1: ANÁLISE INDIVIDUAL ─────────────────────────────── */}
            {mode === "single" && singleMeta && singleReport && (
              <>
                {/* Cabeçalho */}
                <div className="relative z-10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FC4C02] text-white shadow-md shadow-[#FC4C02]/30">
                        <Activity className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="text-xs font-extrabold tracking-tight text-white">
                          PulseTriage
                        </span>
                        <span className="ml-1.5 rounded bg-zinc-800/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
                          Telemetria & IA
                        </span>
                      </div>
                    </div>

                    <div className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900/90 px-2.5 py-0.5 text-[10px] font-medium text-zinc-300">
                      {isStrengthWorkout ? (
                        <Dumbbell className="h-3 w-3 text-indigo-400" />
                      ) : (
                        <Footprints className="h-3 w-3 text-emerald-400" />
                      )}
                      <span>
                        {isStrengthWorkout && singleMeta.sport_type === "WeightTraining"
                          ? "Musculação"
                          : singleMeta.sport_type}
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-medium text-zinc-400">
                      {formatActivityDate(singleMeta.start_date)}
                    </p>
                    <h3 className="mt-0.5 line-clamp-1 text-xl font-bold tracking-tight text-white">
                      {singleMeta.name}
                    </h3>
                  </div>
                </div>

                {/* Bloco Central: Métricas-Chave Dinâmicas */}
                {isStrengthWorkout ? (
                  /* Layout dedicado para Musculação / Treino de Força (4 cards 2x2 sem Distância/Pace/EF vazios) */
                  <div className="relative z-10 my-3 grid grid-cols-2 gap-2.5">
                    {/* 1. Tempo Total */}
                    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-3 flex items-center justify-between">
                      <div>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                          Tempo Total
                        </span>
                        <p className="mt-0.5 font-mono text-lg font-bold text-white">
                          {formatDuration(singleMeta.elapsed_time_seconds)}
                        </p>
                      </div>
                      <Timer className="h-4 w-4 text-indigo-400/80" />
                    </div>

                    {/* 2. FC Média */}
                    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-3 flex items-center justify-between">
                      <div>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                          FC Média
                        </span>
                        <p className="mt-0.5 font-mono text-lg font-bold text-rose-400">
                          {singleAvgHr ? `${Math.round(singleAvgHr)} bpm` : "S/ Sensor"}
                        </p>
                      </div>
                      <HeartPulse className="h-4 w-4 text-rose-500/80" />
                    </div>

                    {/* 3. Pico Cardíaco */}
                    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-3 flex items-center justify-between">
                      <div>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                          Pico Cardíaco
                        </span>
                        <p className="mt-0.5 font-mono text-base font-bold text-amber-400">
                          {singleMaxHr ? `${singleMaxHr} bpm máx` : "--"}
                        </p>
                      </div>
                      <Flame className="h-4 w-4 text-amber-400/80" />
                    </div>

                    {/* 4. Densidade / Carga Interna */}
                    <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/10 p-3 flex items-center justify-between">
                      <div>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-300/80">
                          {singleTriage?.strength_sets_detected
                            ? "Densidade de Séries"
                            : "Carga Interna"}
                        </span>
                        <p className="mt-0.5 font-mono text-sm font-bold text-indigo-200">
                          {singleTriage?.strength_sets_detected
                            ? `${singleTriage.strength_sets_detected} séries · ${
                                singleTriage.strength_avg_rest_seconds ?? 60
                              }s`
                            : strengthIntensityPct
                            ? `${strengthIntensityPct}% FCmáx${
                                estimatedKcal && estimatedKcal > 20
                                  ? ` · ~${estimatedKcal} kcal`
                                  : ""
                              }`
                            : "Força & Tensão"}
                        </p>
                      </div>
                      <Zap className="h-4 w-4 text-indigo-400" />
                    </div>
                  </div>
                ) : (
                  /* Layout padrão para Esportes com Deslocamento (Corrida, Caminhada, Ciclismo) */
                  <div className="relative z-10 my-3 grid grid-cols-3 gap-2">
                    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-2.5">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                        Distância
                      </span>
                      <p className="mt-0.5 font-mono text-base font-bold text-white">
                        {(singleMeta.distance_meters / 1000).toFixed(2)}
                        <span className="ml-0.5 text-[10px] font-normal text-zinc-400">km</span>
                      </p>
                    </div>

                    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-2.5">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                        Pace Médio
                      </span>
                      <p className="mt-0.5 font-mono text-base font-bold text-sky-400">
                        {singlePace.replace(" /km", "")}
                        <span className="ml-0.5 text-[10px] font-normal text-zinc-400">/km</span>
                      </p>
                    </div>

                    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-2.5">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                        Tempo
                      </span>
                      <p className="mt-0.5 font-mono text-base font-bold text-white">
                        {formatDuration(singleMeta.elapsed_time_seconds)}
                      </p>
                    </div>

                    {singleHasHr ? (
                      <>
                        <div className="col-span-2 rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-2.5 flex items-center justify-between">
                          <div>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                              Frequência Cardíaca
                            </span>
                            <p className="mt-0.5 font-mono text-sm font-bold text-rose-400">
                              {singleAvgHr ? `${Math.round(singleAvgHr)} bpm méd` : "--"}
                              {singleMaxHr ? ` · ${singleMaxHr} máx` : ""}
                            </p>
                          </div>
                          <HeartPulse className="h-4 w-4 text-rose-500/80" />
                        </div>

                        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-2.5">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-300/80">
                            Eficiência (EF)
                          </span>
                          <p className="mt-0.5 font-mono text-base font-bold text-emerald-300">
                            {singleEf ?? "--"}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-2.5">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                            Desnível (+D)
                          </span>
                          <p className="mt-0.5 font-mono text-sm font-bold text-emerald-400">
                            +{Math.round(singleElev)} m
                          </p>
                        </div>

                        <div className="col-span-2 rounded-2xl border border-sky-500/25 bg-sky-500/10 p-2.5 flex items-center justify-between">
                          <div>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-sky-300/80">
                              Estratégia de Pacing
                            </span>
                            <p className="mt-0.5 text-xs font-bold text-sky-200">
                              {splitShortLabel(singleTriage?.kinematics?.split_classification)}{" "}
                              {singleTriage?.kinematics?.split_pace_delta_percent != null
                                ? `(${singleTriage.kinematics.split_pace_delta_percent >= 0 ? "+" : ""}${singleTriage.kinematics.split_pace_delta_percent}%)`
                                : ""}
                            </p>
                          </div>
                          <Mountain className="h-4 w-4 text-sky-400" />
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Mini Sparkline */}
                {singleSpark.linePath && (
                  <div className="relative z-10 rounded-2xl border border-zinc-800/70 bg-zinc-950/70 px-3 py-2">
                    <div className="mb-1 flex items-center justify-between text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                      <span>
                        {isStrengthWorkout && singleSpark.isHr
                          ? "Resposta Cardíaca · Picos de Séries & Recuperação"
                          : singleSpark.isHr
                          ? "Curva de Resposta Cardíaca (BPM)"
                          : "Curva de Sustentação de Ritmo (km/h)"}
                      </span>
                      <span className="text-zinc-400">0% → 100%</span>
                    </div>
                    <svg viewBox="0 0 360 68" className="h-12 w-full overflow-visible">
                      <defs>
                        <linearGradient id="pulseSparkGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="0%"
                            stopColor={singleSpark.isHr ? "#f43f5e" : "#38bdf8"}
                            stopOpacity="0.35"
                          />
                          <stop
                            offset="100%"
                            stopColor={singleSpark.isHr ? "#f43f5e" : "#38bdf8"}
                            stopOpacity="0.0"
                          />
                        </linearGradient>
                      </defs>
                      <path d={singleSpark.areaPath} fill="url(#pulseSparkGrad)" />
                      <path
                        d={singleSpark.linePath}
                        fill="none"
                        stroke={singleSpark.isHr ? "#f43f5e" : "#38bdf8"}
                        strokeWidth="2.2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                )}

                {/* Veredito da IA em Destaque */}
                <div className="relative z-10 mt-3 rounded-2xl border border-[#FC4C02]/30 bg-gradient-to-br from-[#FC4C02]/10 via-zinc-900/90 to-zinc-900/90 p-3.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#FC4C02]">
                      <Sparkles className="h-3 w-3" />
                      Veredito PulseTriage AI
                    </span>
                    <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-bold text-zinc-200">
                      Fadiga {singleReport.fatigue_risk_score}/100 · {singleReport.severity}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-zinc-200">
                    {truncateText(
                      singleReport.training_benefit || singleReport.physiological_summary,
                      aspect === "4:5" ? 185 : 130
                    )}
                  </p>
                </div>

                {/* Rodapé */}
                <div className="relative z-10 mt-3 flex items-center justify-between border-t border-zinc-800/80 pt-2.5 text-[10px] text-zinc-400">
                  <span className="font-semibold text-zinc-300">
                    {singleMeta.athlete_name}
                  </span>
                  <span className="font-mono font-semibold tracking-wider text-[#FC4C02]">
                    pulsetriage.app
                  </span>
                </div>
              </>
            )}

            {/* ── MODO 2: COMPARATIVO HEAD-TO-HEAD ───────────────────────── */}
            {mode === "comparison" && comparison && (
              <>
                {/* Cabeçalho */}
                <div className="relative z-10 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FC4C02] text-white shadow-md shadow-[#FC4C02]/30">
                        <GitCompareArrows className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="text-xs font-extrabold tracking-tight text-white">
                          PulseTriage
                        </span>
                        <span className="ml-1.5 rounded bg-[#FC4C02]/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#FC4C02]">
                          Head-to-Head
                        </span>
                      </div>
                    </div>

                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                      Índice{" "}
                      {comparison.report.evolution_score > 0
                        ? `+${comparison.report.evolution_score}`
                        : comparison.report.evolution_score}
                    </span>
                  </div>

                  {/* Duelo A vs B */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {(() => {
                      const isStrA = checkIsStrengthOrStationary(
                        comparison.activity_a.activity_meta.sport_type,
                        comparison.triage_a.activity_type_detected,
                        comparison.activity_a.activity_meta.distance_meters,
                        comparison.deltas.pace_a
                      );
                      const isStrB = checkIsStrengthOrStationary(
                        comparison.activity_b.activity_meta.sport_type,
                        comparison.triage_b.activity_type_detected,
                        comparison.activity_b.activity_meta.distance_meters,
                        comparison.deltas.pace_b
                      );
                      return (
                        <>
                          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-2.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                              Treino A · Referência
                            </span>
                            <p className="mt-0.5 truncate text-xs font-bold text-zinc-100">
                              {comparison.activity_a.activity_meta.name}
                            </p>
                            {isStrA ? (
                              <>
                                <p className="mt-1 font-mono text-xs font-semibold text-zinc-300">
                                  {formatDuration(
                                    comparison.activity_a.activity_meta.elapsed_time_seconds
                                  )}{" "}
                                  ·{" "}
                                  {comparison.deltas.avg_hr_a
                                    ? `${Math.round(comparison.deltas.avg_hr_a)} bpm méd`
                                    : "Força"}
                                </p>
                                <p className="mt-0.5 text-[10px] text-zinc-400">
                                  {comparison.triage_a.max_valid_heartrate_bpm
                                    ? `Pico ${comparison.triage_a.max_valid_heartrate_bpm} bpm`
                                    : "Sessão estacionária"}
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="mt-1 font-mono text-xs font-semibold text-zinc-300">
                                  {comparison.deltas.pace_a} · {comparison.deltas.distance_km_a} km
                                </p>
                                <p className="mt-0.5 text-[10px] text-zinc-400">
                                  {comparison.deltas.ef_a != null
                                    ? `EF ${comparison.deltas.ef_a.toFixed(2)} · ${Math.round(
                                        comparison.deltas.avg_hr_a ?? 0
                                      )} bpm`
                                    : `+D ${Math.round(comparison.deltas.elevation_gain_a)}m`}
                                </p>
                              </>
                            )}
                          </div>

                          <div className="rounded-2xl border border-sky-500/35 bg-sky-500/10 p-2.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-sky-300">
                              Treino B · Recente
                            </span>
                            <p className="mt-0.5 truncate text-xs font-bold text-white">
                              {comparison.activity_b.activity_meta.name}
                            </p>
                            {isStrB ? (
                              <>
                                <p className="mt-1 font-mono text-xs font-semibold text-sky-300">
                                  {formatDuration(
                                    comparison.activity_b.activity_meta.elapsed_time_seconds
                                  )}{" "}
                                  ·{" "}
                                  {comparison.deltas.avg_hr_b
                                    ? `${Math.round(comparison.deltas.avg_hr_b)} bpm méd`
                                    : "Força"}
                                </p>
                                <p className="mt-0.5 text-[10px] text-sky-200/80">
                                  {comparison.triage_b.max_valid_heartrate_bpm
                                    ? `Pico ${comparison.triage_b.max_valid_heartrate_bpm} bpm`
                                    : "Sessão estacionária"}
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="mt-1 font-mono text-xs font-semibold text-sky-300">
                                  {comparison.deltas.pace_b} · {comparison.deltas.distance_km_b} km
                                </p>
                                <p className="mt-0.5 text-[10px] text-sky-200/80">
                                  {comparison.deltas.ef_b != null
                                    ? `EF ${comparison.deltas.ef_b.toFixed(2)} · ${Math.round(
                                        comparison.deltas.avg_hr_b ?? 0
                                      )} bpm`
                                    : `+D ${Math.round(comparison.deltas.elevation_gain_b)}m`}
                                </p>
                              </>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Pílulas Centrais de Delta */}
                <div className="relative z-10 my-2.5 grid grid-cols-2 gap-2">
                  {compareSpark.useHr ? (
                    <>
                      <div className="flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-500/10 px-2.5 py-2 text-[11px] font-bold text-rose-300">
                        <span>Δ FC Média</span>
                        <span className="font-mono">
                          {comparison.deltas.delta_avg_hr_bpm != null
                            ? `${comparison.deltas.delta_avg_hr_bpm >= 0 ? "+" : ""}${comparison.deltas.delta_avg_hr_bpm.toFixed(1)} bpm`
                            : "--"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-2 text-[11px] font-bold text-indigo-300">
                        <span>Δ Duração</span>
                        <span className="font-mono">
                          {(() => {
                            const diffMin = Math.round(
                              (comparison.activity_b.activity_meta.elapsed_time_seconds -
                                comparison.activity_a.activity_meta.elapsed_time_seconds) /
                                60
                            );
                            return `${diffMin >= 0 ? "+" : ""}${diffMin} min`;
                          })()}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      {comparison.deltas.delta_ef_percent != null ? (
                        <div
                          className={cn(
                            "flex items-center justify-between rounded-xl border px-2.5 py-2 text-[11px] font-bold",
                            comparison.deltas.delta_ef_percent >= 0
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                              : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                          )}
                        >
                          <span>Δ Eficiência (EF)</span>
                          <span className="font-mono">
                            {comparison.deltas.delta_ef_percent >= 0 ? "+" : ""}
                            {comparison.deltas.delta_ef_percent.toFixed(2)}%
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between rounded-xl border border-sky-500/30 bg-sky-500/10 px-2.5 py-2 text-[11px] font-bold text-sky-300">
                          <span>Δ Altimetria (+D)</span>
                          <span className="font-mono">
                            {comparison.deltas.delta_elevation_gain >= 0 ? "+" : ""}
                            {Math.round(comparison.deltas.delta_elevation_gain)}m
                          </span>
                        </div>
                      )}

                      <div
                        className={cn(
                          "flex items-center justify-between rounded-xl border px-2.5 py-2 text-[11px] font-bold",
                          comparison.deltas.delta_speed_percent >= 0
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                        )}
                      >
                        <span>Δ Velocidade</span>
                        <span className="font-mono">
                          {comparison.deltas.delta_speed_percent >= 0 ? "+" : ""}
                          {comparison.deltas.delta_speed_percent.toFixed(1)}%
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Sparkline Sobreposta A vs B */}
                {compareSpark.pathB && (
                  <div className="relative z-10 rounded-2xl border border-zinc-800/70 bg-zinc-950/70 px-3 py-2">
                    <div className="mb-1 flex items-center justify-between text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                      <span>
                        {compareSpark.useHr
                          ? "FC Sobreposta (Tracejado A vs. Sólido B)"
                          : "Ritmo Sobreposto (Tracejado A vs. Sólido B)"}
                      </span>
                      <span className="text-sky-400">0% → 100%</span>
                    </div>
                    <svg viewBox="0 0 360 64" className="h-11 w-full overflow-visible">
                      <path
                        d={compareSpark.pathA}
                        fill="none"
                        stroke="#71717a"
                        strokeWidth="1.8"
                        strokeDasharray="4 4"
                      />
                      <path
                        d={compareSpark.pathB}
                        fill="none"
                        stroke={compareSpark.useHr ? "#f43f5e" : "#38bdf8"}
                        strokeWidth="2.2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                )}

                {/* Veredito da Adaptação */}
                <div className="relative z-10 mt-2.5 rounded-2xl border border-[#FC4C02]/30 bg-gradient-to-br from-[#FC4C02]/10 via-zinc-900/90 to-zinc-900/90 p-3.5">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#FC4C02]">
                      <Sparkles className="h-3 w-3" />
                      {comparison.report.headline_badge}
                    </span>
                    {comparison.report.evolution_score >= 0 ? (
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5 text-amber-400" />
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-zinc-200">
                    {truncateText(
                      comparison.report.adaptation_verdict,
                      aspect === "4:5" ? 180 : 125
                    )}
                  </p>
                </div>

                {/* Rodapé */}
                <div className="relative z-10 mt-3 flex items-center justify-between border-t border-zinc-800/80 pt-2.5 text-[10px] text-zinc-400">
                  <span className="font-semibold text-zinc-300">
                    {comparison.activity_b.activity_meta.athlete_name}
                  </span>
                  <span className="font-mono font-semibold tracking-wider text-[#FC4C02]">
                    pulsetriage.app
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Mensagem de erro se houver */}
        {actionError && (
          <div className="px-5 pb-2 text-center text-xs text-rose-400">
            {actionError}
          </div>
        )}

        {/* Rodapé com Botões de Ação */}
        <div className="flex items-center justify-end gap-2.5 border-t border-zinc-800/80 bg-zinc-950 px-5 py-3.5">
          <button
            type="button"
            onClick={handleCopyImage}
            disabled={copying || downloading}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-50"
          >
            {copying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : copied ? (
              <Check className="h-4 w-4 text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4 text-zinc-400" />
            )}
            {copied ? "Imagem Copiada!" : "Copiar Imagem"}
          </button>

          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={downloading || copying}
            className="inline-flex items-center gap-2 rounded-xl bg-[#FC4C02] px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-[#FC4C02]/25 transition-all hover:bg-[#e04300] disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Baixar Imagem (PNG)
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
