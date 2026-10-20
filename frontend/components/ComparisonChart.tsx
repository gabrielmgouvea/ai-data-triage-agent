"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Gauge, HeartPulse, Mountain } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { StravaActivityResponse, TelemetryPoint } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ComparisonChartProps {
  activityA: StravaActivityResponse;
  activityB: StravaActivityResponse;
  bothHaveHr: boolean;
}

interface NormalizedOverlayPoint {
  pct: number;
  speedA: number;
  speedB: number;
  paceA: string;
  paceB: string;
  hrA: number | null;
  hrB: number | null;
  efA: number | null;
  efB: number | null;
  altA: number;
  altB: number;
}

type MetricMode = "speed" | "hr" | "altitude";

function formatPaceFromMs(velMs: number): string {
  if (velMs <= 0.3) return "--:-- /km";
  const sPerKm = 1000 / velMs;
  const mins = Math.floor(sPerKm / 60);
  const secs = Math.floor(sPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, "0")} /km`;
}

function sampleAtPercent(points: TelemetryPoint[], pct: number): TelemetryPoint {
  if (points.length === 0) {
    return { time_s: 0, velocity_ms: 0, altitude_m: 0, heartrate_bpm: null };
  }
  const idx = Math.min(
    points.length - 1,
    Math.max(0, Math.round((pct / 100) * (points.length - 1)))
  );
  return points[idx];
}

export function ComparisonChart({
  activityA,
  activityB,
  bothHaveHr,
}: ComparisonChartProps) {
  const [metric, setMetric] = useState<MetricMode>("speed");

  const data = useMemo<NormalizedOverlayPoint[]>(() => {
    const pts: NormalizedOverlayPoint[] = [];
    for (let pct = 0; pct <= 100; pct += 1) {
      const pA = sampleAtPercent(activityA.telemetry, pct);
      const pB = sampleAtPercent(activityB.telemetry, pct);

      const hrA = pA.heartrate_bpm ?? null;
      const hrB = pB.heartrate_bpm ?? null;
      const efA =
        hrA != null && hrA > 0 && pA.velocity_ms > 0.3
          ? Number(((pA.velocity_ms / hrA) * 100).toFixed(2))
          : null;
      const efB =
        hrB != null && hrB > 0 && pB.velocity_ms > 0.3
          ? Number(((pB.velocity_ms / hrB) * 100).toFixed(2))
          : null;

      pts.push({
        pct,
        speedA: Number((pA.velocity_ms * 3.6).toFixed(2)),
        speedB: Number((pB.velocity_ms * 3.6).toFixed(2)),
        paceA: formatPaceFromMs(pA.velocity_ms),
        paceB: formatPaceFromMs(pB.velocity_ms),
        hrA,
        hrB,
        efA,
        efB,
        altA: Number((pA.altitude_m ?? 0).toFixed(1)),
        altB: Number((pB.altitude_m ?? 0).toFixed(1)),
      });
    }
    return pts;
  }, [activityA.telemetry, activityB.telemetry]);

  return (
    <Card className="border-zinc-800/80 bg-zinc-950/60">
      <CardHeader className="flex flex-col gap-4 border-b border-zinc-800/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
            <Activity className="h-5 w-5 text-[#FC4C02]" />
            Gráfico Sobreposto Normalizado (0% a 100% da Sessão)
          </CardTitle>
          <CardDescription className="mt-1">
            Linha tracejada: <span className="text-zinc-300 font-medium">Treino A ({activityA.activity_meta.name})</span> · Linha sólida:{" "}
            <span className="text-sky-400 font-medium">Treino B ({activityB.activity_meta.name})</span>
          </CardDescription>
        </div>

        {/* Seletor de Métrica */}
        <div className="inline-flex items-center rounded-xl border border-zinc-800 bg-zinc-900/90 p-1">
          <button
            type="button"
            onClick={() => setMetric("speed")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
              metric === "speed"
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Gauge className="h-3.5 w-3.5" />
            Pace / Velocidade
          </button>

          {bothHaveHr && (
            <button
              type="button"
              onClick={() => setMetric("hr")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                metric === "hr"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <HeartPulse className="h-3.5 w-3.5" />
              Frequência Cardíaca
            </button>
          )}

          <button
            type="button"
            onClick={() => setMetric("altitude")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
              metric === "altitude"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Mountain className="h-3.5 w-3.5" />
            Altimetria
          </button>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        {/* Legenda Visual */}
        <div className="mb-4 flex flex-wrap items-center gap-6 text-xs">
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="inline-block h-0.5 w-6 border-b-2 border-dashed border-zinc-400" />
            <span>Treino A (Referência): {activityA.activity_meta.name}</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-200">
            <span
              className={cn(
                "inline-block h-0.5 w-6",
                metric === "speed"
                  ? "bg-sky-400"
                  : metric === "hr"
                  ? "bg-rose-500"
                  : "bg-emerald-400"
              )}
            />
            <span>Treino B (Recente): {activityB.activity_meta.name}</span>
          </div>
        </div>

        <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="pct"
                tickFormatter={(v) => `${v}%`}
                stroke="#71717a"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#71717a"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                domain={metric === "hr" ? ["dataMin - 5", "dataMax + 5"] : ["auto", "auto"]}
                unit={metric === "speed" ? " km/h" : metric === "hr" ? " bpm" : " m"}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const pt = payload[0].payload as NormalizedOverlayPoint;
                  return (
                    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/95 p-3.5 text-xs text-zinc-100 shadow-2xl backdrop-blur-md">
                      <p className="mb-2 border-b border-zinc-800 pb-1.5 font-bold uppercase tracking-wider text-zinc-400">
                        Progresso da Sessão: {pt.pct}%
                      </p>
                      {metric === "speed" && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-6">
                            <span className="text-zinc-400">Treino A (Ref):</span>
                            <span className="font-mono text-zinc-200">
                              {pt.speedA} km/h ({pt.paceA})
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-6">
                            <span className="text-sky-400 font-medium">Treino B (Recente):</span>
                            <span className="font-mono font-semibold text-sky-300">
                              {pt.speedB} km/h ({pt.paceB})
                            </span>
                          </div>
                        </div>
                      )}
                      {metric === "hr" && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-6">
                            <span className="text-zinc-400">Treino A (Ref):</span>
                            <span className="font-mono text-zinc-200">
                              {pt.hrA != null ? `${pt.hrA} bpm` : "N/A"}
                              {pt.efA != null ? ` · EF ${pt.efA.toFixed(2)}` : ""}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-6">
                            <span className="text-rose-400 font-medium">Treino B (Recente):</span>
                            <span className="font-mono font-semibold text-rose-300">
                              {pt.hrB != null ? `${pt.hrB} bpm` : "N/A"}
                              {pt.efB != null ? ` · EF ${pt.efB.toFixed(2)}` : ""}
                            </span>
                          </div>
                        </div>
                      )}
                      {metric === "altitude" && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-6">
                            <span className="text-zinc-400">Treino A (Ref):</span>
                            <span className="font-mono text-zinc-200">{pt.altA} m</span>
                          </div>
                          <div className="flex items-center justify-between gap-6">
                            <span className="text-emerald-400 font-medium">Treino B (Recente):</span>
                            <span className="font-mono font-semibold text-emerald-300">{pt.altB} m</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }}
              />

              {/* Linha Tracejada: Treino A (Referência) */}
              <Line
                type="monotone"
                dataKey={metric === "speed" ? "speedA" : metric === "hr" ? "hrA" : "altA"}
                stroke="#a1a1aa"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                isAnimationActive={false}
                name="Treino A (Referência)"
              />

              {/* Linha Sólida: Treino B (Recente) */}
              <Line
                type="monotone"
                dataKey={metric === "speed" ? "speedB" : metric === "hr" ? "hrB" : "altB"}
                stroke={metric === "speed" ? "#38bdf8" : metric === "hr" ? "#f43f5e" : "#10b981"}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
                name="Treino B (Recente)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
