"use client";

import {
  Area,
  AreaChart,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatTimeMMSS } from "@/lib/utils";
import type { TelemetryPoint, TriageIncident } from "@/lib/types";
import { Activity, Wind, Mountain, Footprints } from "lucide-react";

interface TelemetryChartProps {
  data: TelemetryPoint[];
  incidents: TriageIncident[];
  anaerobicThreshold: number;
  hasHeartrate?: boolean;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as TelemetryPoint;
    const paceStr =
      data.velocity_ms > 0.5
        ? `${Math.floor(1000 / data.velocity_ms / 60)}:${Math.floor((1000 / data.velocity_ms) % 60)
            .toString()
            .padStart(2, "0")} /km`
        : "--:-- /km";

    return (
      <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/90 backdrop-blur-md p-4 text-zinc-100 shadow-2xl">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-800 pb-2">
          {formatTimeMMSS(data.time_s)}
        </p>
        <div className="space-y-2 text-sm font-medium">
          {data.heartrate_bpm != null && data.heartrate_bpm > 0 && (
            <div className="flex items-center justify-between gap-6">
              <span className="text-zinc-400">Freq. Cardíaca</span>
              <span className="text-rose-400">{data.heartrate_bpm} bpm</span>
            </div>
          )}
          {data.heartrate_bpm != null && data.heartrate_bpm > 0 && data.velocity_ms > 0.5 && (
            <div className="flex items-center justify-between gap-6">
              <span className="text-zinc-400">Eficiência (EF)</span>
              <span className="text-indigo-300 font-mono">
                {((data.velocity_ms / data.heartrate_bpm) * 100).toFixed(2)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-6">
            <span className="text-zinc-400">Velocidade</span>
            <span className="text-sky-400">{(data.velocity_ms * 3.6).toFixed(1)} km/h</span>
          </div>
          <div className="flex items-center justify-between gap-6">
            <span className="text-zinc-400">Ritmo (Pace)</span>
            <span className="text-teal-300 font-mono">{paceStr}</span>
          </div>
          <div className="flex items-center justify-between gap-6">
            <span className="text-zinc-400">Altitude</span>
            <span className="text-emerald-400">{data.altitude_m.toFixed(1)} m</span>
          </div>
          {data.cadence_rpm != null && (
            <div className="flex items-center justify-between gap-6">
              <span className="text-zinc-400">Cadência</span>
              <span className="text-violet-400">{data.cadence_rpm} rpm</span>
            </div>
          )}
          {data.watts != null && (
            <div className="flex items-center justify-between gap-6">
              <span className="text-zinc-400">Potência</span>
              <span className="text-amber-400">{data.watts} W</span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

export function TelemetryChart({
  data,
  incidents,
  anaerobicThreshold,
  hasHeartrate,
}: TelemetryChartProps) {
  const hasHR =
    hasHeartrate ?? data.some((d) => d.heartrate_bpm != null && d.heartrate_bpm > 0);

  if (!hasHR) {
    return (
      <div className="space-y-6">
        <Card className="border-sky-500/20 bg-zinc-950/40">
          <CardHeader className="pb-4 border-b border-zinc-800/80">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-sky-500/10 text-sky-400">
                  <Wind className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-zinc-200">
                    Curva Cinemática & Perfil Altimétrico
                  </CardTitle>
                  <CardDescription className="text-xs text-zinc-400">
                    Velocidade (km/h) sobreposta ao relevo (altitude em metros)
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium">
                <span className="flex items-center gap-1.5 text-sky-400">
                  <span className="h-2 w-2 rounded-full bg-sky-400" /> Velocidade (km/h)
                </span>
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400/80" /> Altitude (m)
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAltKinematic" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="time_s"
                    tickFormatter={formatTimeMMSS}
                    stroke="#71717a"
                    fontSize={11}
                    tickMargin={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="speed"
                    orientation="left"
                    dataKey={(d) => d.velocity_ms * 3.6}
                    domain={[0, "dataMax + 2"]}
                    stroke="#38bdf8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    tickFormatter={(val) => Number(val).toFixed(1)}
                  />
                  <YAxis
                    yAxisId="altitude"
                    orientation="right"
                    dataKey="altitude_m"
                    domain={["dataMin - 5", "dataMax + 5"]}
                    stroke="#34d399"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    tickFormatter={(val) => Math.round(Number(val)).toString()}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#52525b", strokeWidth: 1, strokeDasharray: "4 4" }} />
                  <Area
                    yAxisId="altitude"
                    type="monotone"
                    dataKey="altitude_m"
                    stroke="#10b981"
                    strokeWidth={1.5}
                    fillOpacity={1}
                    fill="url(#colorAltKinematic)"
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="speed"
                    type="monotone"
                    dataKey={(d) => d.velocity_ms * 3.6}
                    stroke="#38bdf8"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, fill: "#38bdf8", stroke: "#18181b", strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  const renderIncidentAreas = () => {
    return incidents.map((inc, i) => {
      let color = "#ef4444"; // rose-500 equivalent for critical
      if (inc.incident_type === "cardiac_drift") {
        color = "#f59e0b"; // amber-500
      } else if (inc.incident_type === "sustained_tachycardia" || inc.incident_type === "anaerobic_spike") {
        color = "#f97316"; // orange-500
      }
      
      return (
        <ReferenceArea
          key={`incident-${i}`}
          x1={inc.time_start_s}
          x2={inc.time_end_s}
          fill={color}
          fillOpacity={0.05}
          stroke={color}
          strokeOpacity={0.5}
          strokeDasharray="4 4"
        />
      );
    });
  };

  return (
    <div className="space-y-6">
      {/* Gráfico de Frequência Cardíaca */}
      <Card>
        <CardHeader className="pb-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-rose-500/10 text-rose-500">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-zinc-200">Frequência Cardíaca</CardTitle>
              <CardDescription className="text-xs text-zinc-400">
                Monitoramento com zonas de esforço e anomalias
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} syncId="telemetry" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorHr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis 
                  dataKey="time_s" 
                  tickFormatter={formatTimeMMSS} 
                  stroke="#71717a" 
                  fontSize={11} 
                  tickMargin={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  domain={['dataMin - 10', 'dataMax + 10']} 
                  stroke="#71717a" 
                  fontSize={11} 
                  tickLine={false}
                  axisLine={false}
                  width={35}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#52525b', strokeWidth: 1, strokeDasharray: '4 4' }} />
                {renderIncidentAreas()}
                <ReferenceLine 
                  y={anaerobicThreshold} 
                  stroke="#fb923c" 
                  strokeDasharray="4 4" 
                  strokeOpacity={0.5}
                  label={{ position: 'insideBottomLeft', value: `Limiar Anaeróbico (${anaerobicThreshold})`, fill: '#fb923c', fontSize: 10, opacity: 0.8 }}
                />
                <Area 
                  type="monotone" 
                  dataKey="heartrate_bpm" 
                  stroke="#f43f5e" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorHr)" 
                  activeDot={{ r: 5, fill: "#f43f5e", stroke: "#18181b", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Gráfico de Velocidade */}
        <Card>
          <CardHeader className="pb-3 border-b border-zinc-800/80">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-md bg-sky-500/10 text-sky-500">
                <Wind className="h-3.5 w-3.5" />
              </div>
              <CardTitle className="text-sm font-semibold text-zinc-200">Velocidade (km/h)</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[140px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} syncId="telemetry" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="time_s" hide />
                  <YAxis 
                    dataKey={(d) => d.velocity_ms * 3.6}
                    domain={[0, 'dataMax + 2']} 
                    stroke="#71717a" 
                    fontSize={11} 
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    tickFormatter={(val) => Number(val).toFixed(1)}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#52525b', strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <Line 
                    type="monotone" 
                    dataKey={(d) => d.velocity_ms * 3.6}
                    stroke="#38bdf8" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "#38bdf8", stroke: "#18181b", strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Gráfico de Altitude */}
        <Card>
          <CardHeader className="pb-3 border-b border-zinc-800/80">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-500">
                <Mountain className="h-3.5 w-3.5" />
              </div>
              <CardTitle className="text-sm font-semibold text-zinc-200">Altitude (m)</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[140px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} syncId="telemetry" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAlt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="time_s" hide />
                  <YAxis 
                    domain={['dataMin - 5', 'dataMax + 5']} 
                    stroke="#71717a" 
                    fontSize={11} 
                    tickLine={false}
                    axisLine={false}
                    width={35}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#52525b', strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <Area 
                    type="monotone" 
                    dataKey="altitude_m" 
                    stroke="#34d399" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorAlt)" 
                    activeDot={{ r: 4, fill: "#34d399", stroke: "#18181b", strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
