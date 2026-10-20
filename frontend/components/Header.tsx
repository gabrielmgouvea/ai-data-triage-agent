"use client";

import { Activity, Wifi, WifiOff, ArrowLeft, Loader2, LogOut } from "lucide-react";
import type { AppMode, StravaAthlete } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HeaderProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  backendOnline: boolean;
  onReset?: () => void;
  hasAnalysis?: boolean;
  stravaConnected?: boolean;
  stravaAthlete?: StravaAthlete | null;
  stravaConnecting?: boolean;
  onConnectStrava?: () => void;
  onDisconnectStrava?: () => void;
}

/** Glifo oficial simplificado do Strava (chevrons). */
function StravaGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}

export function Header({
  mode,
  onModeChange,
  backendOnline,
  onReset,
  hasAnalysis,
  stravaConnected,
  stravaAthlete,
  stravaConnecting,
  onConnectStrava,
  onDisconnectStrava,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/90 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-6">
            <button 
              onClick={onReset}
              className={cn("flex items-center gap-3 text-left transition-opacity", onReset && "hover:opacity-80 cursor-pointer")}
              disabled={!onReset}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/10 ring-1 ring-rose-500/30">
                <Activity className="h-5 w-5 text-rose-500" />
              </div>
              <div>
                <h1 className="text-base font-bold tracking-tight text-foreground">
                  PulseTriage
                </h1>
                <p className="text-xs text-muted-foreground">
                  Telemetria Esportiva & IA
                </p>
              </div>
            </button>
            
            {hasAnalysis && onReset && (
              <Button variant="ghost" size="sm" onClick={onReset} className="hidden sm:flex text-zinc-400 hover:text-zinc-100 h-8 gap-2 border border-zinc-800 bg-zinc-900/50">
                <ArrowLeft className="h-3.5 w-3.5" />
                Nova Análise
              </Button>
            )}
          </div>

          {/* Centro — seleção de modo */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted p-1">
            <Button
              size="sm"
              variant={mode === "demo" ? "default" : "ghost"}
              className="h-7 px-3 text-xs"
              onClick={() => onModeChange("demo")}
            >
              Modo Demo
            </Button>
            <Button
              size="sm"
              variant={mode === "strava" ? "default" : "ghost"}
              className="h-7 px-3 text-xs gap-1.5"
              onClick={() => onModeChange("strava")}
            >
              <StravaGlyph className={cn("h-3 w-3", mode === "strava" ? "" : "text-[#FC4C02]")} />
              Strava
            </Button>
          </div>

          {/* Direita — conexão Strava + status do backend */}
          <div className="flex items-center gap-2">
            {stravaConnected ? (
              <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 py-1 pl-1 pr-1.5">
                {stravaAthlete?.profile && stravaAthlete.profile.startsWith("http") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={stravaAthlete.profile} alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FC4C02]/15">
                    <StravaGlyph className="h-3 w-3 text-[#FC4C02]" />
                  </span>
                )}
                <span className="hidden md:inline text-xs font-medium text-zinc-300 max-w-[120px] truncate">
                  {stravaAthlete?.firstname ?? "Strava"}
                </span>
                <button
                  onClick={onDisconnectStrava}
                  className="rounded-full p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                  title="Desconectar Strava"
                  aria-label="Desconectar Strava"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={onConnectStrava}
                disabled={!backendOnline || stravaConnecting}
                className="h-8 gap-1.5 rounded-full bg-[#FC4C02] px-3.5 text-xs font-semibold text-white hover:bg-[#e04402]"
              >
                {stravaConnecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <StravaGlyph className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">Conectar Strava</span>
              </Button>
            )}

            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                backendOnline
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-400"
                  : "border-red-400/30 bg-red-400/10 text-red-400"
              )}
            >
              {backendOnline ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                  <Wifi className="h-3 w-3" />
                  <span className="hidden lg:inline">Backend Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" />
                  <span className="hidden lg:inline">Backend Offline</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
