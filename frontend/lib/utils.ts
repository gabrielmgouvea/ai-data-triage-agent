import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Severity } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formata segundos em string legível (ex: "57min 0s") */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}min ${s}s`;
}

/** Formata segundos em string curta (ex: "57:00") */
export function formatTimeMMSS(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** Converte m/s para min/km (pace de corrida) */
export function msToPace(ms: number): string {
  if (ms <= 0) return "—";
  const secsPerKm = 1000 / ms;
  const min = Math.floor(secsPerKm / 60);
  const sec = Math.round(secsPerKm % 60);
  return `${min}:${sec.toString().padStart(2, "0")} /km`;
}

/** Retorna classes Tailwind baseadas na severidade do relatório */
export function severityConfig(severity: Severity): {
  label: string;
  color: string;
  bg: string;
  border: string;
  dot: string;
} {
  switch (severity) {
    case "Baixa":
      return {
        label: "Baixa",
        color: "text-emerald-400",
        bg: "bg-emerald-400/10",
        border: "border-emerald-400/30",
        dot: "bg-emerald-400",
      };
    case "Media":
      return {
        label: "Média",
        color: "text-yellow-400",
        bg: "bg-yellow-400/10",
        border: "border-yellow-400/30",
        dot: "bg-yellow-400",
      };
    case "Alta":
      return {
        label: "Alta",
        color: "text-orange-400",
        bg: "bg-orange-400/10",
        border: "border-orange-400/30",
        dot: "bg-orange-400",
      };
    case "Critica":
      return {
        label: "Crítica",
        color: "text-red-400",
        bg: "bg-red-400/10",
        border: "border-red-400/30",
        dot: "bg-red-400",
      };
  }
}

/** Retorna label e cor para tipo de incidente */
export function incidentConfig(type: string): { label: string; color: string } {
  switch (type) {
    case "sensor_noise":
      return { label: "Ruído de Sensor", color: "text-slate-400" };
    case "anaerobic_spike":
      return { label: "Pico Anaeróbico", color: "text-orange-400" };
    case "sustained_tachycardia":
      return { label: "Taquicardia Sustentada", color: "text-red-400" };
    case "cardiac_drift":
      return { label: "Cardiac Drift", color: "text-yellow-400" };
    default:
      return { label: type, color: "text-muted-foreground" };
  }
}
