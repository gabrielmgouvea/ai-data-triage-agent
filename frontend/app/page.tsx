"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Play,
  RefreshCw,
  AlertCircle,
  ActivitySquare,
  BedDouble,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Sparkles,
  Info,
  Moon,
} from "lucide-react";
import { Header } from "@/components/Header";
import { SleepCheckinCard } from "@/components/SleepCheckinCard";
import { DiagnosticReportCard } from "@/components/DiagnosticReportCard";
import { TelemetryChart } from "@/components/TelemetryChart";
import { ChartSkeleton, DiagnosticSkeleton, HeroSkeleton } from "@/components/LoadingSkeletons";
import { ActivityPickerModal } from "@/components/ActivityPickerModal";
import { ComparisonView } from "@/components/ComparisonView";
import { ShareableCardModal } from "@/components/ShareableCardModal";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  analyzeActivity,
  analyzeDemoActivity,
  checkBackendHealth,
  compareStravaActivities,
  fetchDemoActivity,
  fetchStravaActivityStreams,
  getStravaAuthUrl,
} from "@/lib/api";
import {
  getLocalComparison,
  getLocalDiagnostic,
  saveLocalComparison,
  saveLocalDiagnostic,
} from "@/lib/localCache";
import {
  clearStravaSession,
  getValidAccessToken,
  loadStravaSession,
  saveOAuthState,
} from "@/lib/strava";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  AnalysisStatus,
  AppMode,
  CompareResponse,
  DemoActivityResponse,
  LoadedActivity,
  SleepCheckin,
  SleepContext,
  StravaActivityResponse,
  StravaActivitySummary,
  StravaSession,
} from "@/lib/types";
import { cn, formatDuration, msToPace } from "@/lib/utils";

const AGE_KEY = "pulsetriage.athlete_age";

const DEFAULT_SLEEP: SleepCheckin = {
  total_sleep_hours: 7,
  subjective_quality_1_to_5: 3,
  subjective_fatigue_1_to_5: 2,
  notes: "",
};

function StatusMessage({ status }: { status: AnalysisStatus }) {
  const messages: Record<AnalysisStatus, { text: string; sub: string }> = {
    idle: { text: "", sub: "" },
    loading_data: {
      text: "Sincronizando...",
      sub: "Obtendo série temporal",
    },
    analyzing: {
      text: "Processando IA...",
      sub: "Avaliando biomecânica e esforço",
    },
    done: { text: "", sub: "" },
    error: { text: "", sub: "" },
  };

  const msg = messages[status];
  if (!msg.text) return null;

  return (
    <div className="flex items-center justify-center gap-3 py-12">
      <RefreshCw className="h-6 w-6 animate-spin text-zinc-500" />
      <div>
        <p className="text-sm font-medium text-zinc-200">{msg.text}</p>
        <p className="text-xs text-zinc-500">{msg.sub}</p>
      </div>
    </div>
  );
}

function HeroSection({
  demo,
  result,
}: {
  demo: LoadedActivity;
  result?: AnalyzeResponse | null;
}) {
  const meta = demo.activity_meta;
  const score = result?.report.fatigue_risk_score;
  const hasHR =
    meta.has_heartrate ??
    (result?.triage.has_heartrate ?? (meta.average_heartrate != null && meta.average_heartrate > 0));

  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-zinc-800/80 mb-8">
      <div>
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <p className="text-sm font-semibold tracking-widest uppercase text-zinc-500 flex items-center gap-2">
            <ActivitySquare className="h-4 w-4" />
            {meta.sport_type}
          </p>
          {!hasHR && (
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-xs font-semibold text-sky-400 cursor-help"
              title="Análise focada em distribuição de ritmo, sustentação mecânica e altimetria."
            >
              <span>Análise Cinemática & Pacing</span>
              <Info className="h-3.5 w-3.5 text-sky-400/80" />
            </div>
          )}
        </div>
        <h2 className="text-3xl md:text-5xl font-bold text-zinc-100 tracking-tight">
          {meta.name}
        </h2>
        
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-6">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Distância</span>
            <span className="text-lg font-medium text-zinc-200">{(meta.distance_meters / 1000).toFixed(2)} <span className="text-sm text-zinc-500">km</span></span>
          </div>
          <div className="w-px h-8 bg-zinc-800/80 hidden sm:block" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Duração</span>
            <span className="text-lg font-medium text-zinc-200">{formatDuration(meta.elapsed_time_seconds)}</span>
          </div>
          <div className="w-px h-8 bg-zinc-800/80 hidden sm:block" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Pace Médio</span>
            <span className="text-lg font-medium text-zinc-200">
              {result?.triage.kinematics?.average_pace_min_km ?? msToPace(meta.average_speed)}
            </span>
          </div>
          <div className="w-px h-8 bg-zinc-800/80 hidden sm:block" />
          <div className="flex flex-col">
            {hasHR ? (
              <>
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">FC Média</span>
                <span className="text-lg font-medium text-zinc-200">
                  {meta.average_heartrate ?? "--"} <span className="text-sm text-zinc-500">bpm</span>
                </span>
              </>
            ) : (
              <>
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">+D Ganho de Elevação</span>
                <span className="text-lg font-medium text-zinc-200">
                  {result?.triage.kinematics?.elevation_gain_meters ?? meta.total_elevation_gain ?? 0}{" "}
                  <span className="text-sm text-zinc-500">m</span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {score !== undefined && (
        <div className="flex flex-col items-start md:items-end bg-zinc-900/50 p-6 rounded-3xl border border-zinc-800/80 min-w-[200px]">
          <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-2">
            Fadiga Biomecânica
          </span>
          <div className="flex items-baseline gap-1">
            <span
              className={cn(
                "text-6xl font-bold tracking-tighter",
                score >= 70 ? "text-rose-500" : score >= 45 ? "text-amber-500" : "text-emerald-500"
              )}
            >
              {score}
            </span>
            <span className="text-zinc-600 font-medium text-xl">/100</span>
          </div>
          <div className="w-full h-1.5 bg-zinc-800 rounded-full mt-4 overflow-hidden">
            <div 
              className={cn(
                "h-full rounded-full transition-all duration-1000",
                score >= 70 ? "bg-rose-500" : score >= 45 ? "bg-amber-500" : "bg-emerald-500"
              )}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const [mode, setMode] = useState<AppMode>("demo");
  const [backendOnline, setBackendOnline] = useState(true);
  const [sleepData, setSleepData] = useState<SleepCheckin | null>(null);
  const [demoSleepMode, setDemoSleepMode] = useState<"mock" | "custom" | "none">("mock");
  const [demoType, setDemoType] = useState<"run" | "strength">("run");
  const [demoData, setDemoData] = useState<DemoActivityResponse | null>(null);

  // Strava state
  const [stravaSession, setStravaSession] = useState<StravaSession | null>(null);
  const [stravaConnecting, setStravaConnecting] = useState(false);
  const [stravaActivity, setStravaActivity] = useState<StravaActivityResponse | null>(null);
  const [loadingStravaActivity, setLoadingStravaActivity] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [athleteAge, setAthleteAge] = useState<number>(30);

  // Analysis state
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [compareResult, setCompareResult] = useState<CompareResponse | null>(null);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCheckin, setShowCheckin] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // Health check on mount (compatível com localhost:8000 e Vercel Serverless /health)
  useEffect(() => {
    checkBackendHealth().then(setBackendOnline);
  }, []);

  // Load Strava session & age from localStorage + handle ?strava=connected query param
  useEffect(() => {
    setStravaSession(loadStravaSession());

    if (typeof window !== "undefined") {
      const savedAge = window.localStorage.getItem(AGE_KEY);
      if (savedAge) {
        const parsed = parseInt(savedAge, 10);
        if (!isNaN(parsed) && parsed >= 10 && parsed <= 100) {
          setAthleteAge(parsed);
        }
      }

      const params = new URLSearchParams(window.location.search);
      if (params.get("strava") === "connected") {
        setMode("strava");
        setStravaSession(loadStravaSession());
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    }
  }, []);

  // Fetch demo data when in demo mode
  useEffect(() => {
    if (mode === "demo") {
      fetchDemoActivity(demoType)
        .then(setDemoData)
        .catch(() => {});
    }
  }, [mode, demoType]);

  // Handle Strava connect
  const handleConnectStrava = async () => {
    try {
      setStravaConnecting(true);
      setError(null);
      const { url, state } = await getStravaAuthUrl();
      saveOAuthState(state);
      window.location.href = url;
    } catch (err) {
      setStravaConnecting(false);
      setError(err instanceof Error ? err.message : "Erro ao iniciar conexão com Strava.");
    }
  };

  // Handle Strava disconnect
  const handleDisconnectStrava = () => {
    clearStravaSession();
    setStravaSession(null);
    setStravaActivity(null);
    setResult(null);
    setStatus("idle");
  };

  const handleStravaAuthExpired = useCallback(() => {
    clearStravaSession();
    setStravaSession(null);
    setStravaActivity(null);
    setError("Sessão do Strava expirada ou revogada — conecte novamente.");
  }, []);

  // Load the activity chosen in the picker modal
  const handleSelectStravaActivity = async (summary: StravaActivitySummary) => {
    setPickerOpen(false);
    setError(null);
    setResult(null);
    setCompareResult(null);
    setStatus("idle");
    setLoadingStravaActivity(true);

    try {
      const token = await getValidAccessToken();
      const activity = await fetchStravaActivityStreams(token, summary.id, athleteAge);
      setStravaActivity(activity);

      // Se já houver diagnóstico salvo no localStorage para este treino, carrega imediatamente
      const localCached = getLocalDiagnostic(summary.id);
      if (localCached) {
        setResult(localCached);
        setStatus("done");
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleStravaAuthExpired();
        return;
      }
      setError(err instanceof Error ? err.message : "Falha ao carregar a atividade do Strava.");
    } finally {
      setLoadingStravaActivity(false);
    }
  };

  // Compare two Strava activities Head-to-Head
  const runCompareByIds = async (
    idA: number,
    idB: number,
    forceRefresh: boolean = false
  ) => {
    setPickerOpen(false);
    setError(null);
    setResult(null);
    setCompareResult(null);

    if (!forceRefresh) {
      const localComp = getLocalComparison(idA, idB);
      if (localComp) {
        setCompareResult(localComp);
        setStatus("done");
        return;
      }
    }

    setComparing(true);
    setStatus("analyzing");

    try {
      const token = await getValidAccessToken();
      const comp = await compareStravaActivities(
        token,
        idA,
        idB,
        athleteAge,
        forceRefresh
      );
      saveLocalComparison(idA, idB, comp);
      setCompareResult(comp);
      setStatus("done");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleStravaAuthExpired();
        setStatus("idle");
        return;
      }
      setError(
        err instanceof Error ? err.message : "Falha ao comparar os treinos selecionados."
      );
      setStatus("error");
    } finally {
      setComparing(false);
    }
  };

  const handleCompareStravaActivities = async (
    actA: StravaActivitySummary,
    actB: StravaActivitySummary
  ) => {
    await runCompareByIds(actA.id, actB.id, false);
  };

  // Update athlete age
  const handleAgeChange = (newAge: number) => {
    const clamped = Math.min(100, Math.max(10, newAge));
    setAthleteAge(clamped);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AGE_KEY, clamped.toString());
    }
  };

  // Analyze activity (Demo or Strava)
  const handleAnalyze = useCallback(
    async (forceRefresh: boolean = false) => {
      setError(null);
      setResult(null);

      try {
        if (mode === "demo") {
          const demoCacheKey = `demo_${demoType}_${demoSleepMode}`;
          if (!forceRefresh && demoSleepMode !== "custom") {
            const localDemo = getLocalDiagnostic(demoCacheKey);
            if (localDemo) {
              setResult(localDemo);
              setStatus("done");
              return;
            }
          }

          setStatus("loading_data");
          await new Promise((r) => setTimeout(r, 200));
          setStatus("analyzing");

          const omitSleep = demoSleepMode === "none";
          const override = demoSleepMode === "custom" ? sleepData : undefined;
          const res = await analyzeDemoActivity(
            override,
            demoType,
            omitSleep,
            forceRefresh
          );
          if (demoSleepMode !== "custom") {
            saveLocalDiagnostic(demoCacheKey, res);
          }
          if (demoData?.activity_meta?.id) {
            saveLocalDiagnostic(demoData.activity_meta.id, res);
          }
          setResult(res);
        } else {
          if (!stravaActivity) {
            throw new Error("Nenhuma atividade do Strava carregada para análise.");
          }

          const actId = stravaActivity.activity_meta.id;
          if (!forceRefresh && !sleepData) {
            const localCached = getLocalDiagnostic(actId);
            if (localCached) {
              setResult(localCached);
              setStatus("done");
              return;
            }
          }

          setStatus("loading_data");
          await new Promise((r) => setTimeout(r, 200));
          setStatus("analyzing");

          const nowIso = new Date().toISOString();
          const sleepContext: SleepContext | null = sleepData
            ? {
                recorded_at: nowIso,
                source: "strava_user",
                total_sleep_hours: sleepData.total_sleep_hours,
                subjective_quality_1_to_5: sleepData.subjective_quality_1_to_5,
                subjective_fatigue_1_to_5: sleepData.subjective_fatigue_1_to_5,
                notes: sleepData.notes || undefined,
              }
            : null;

          const payload: AnalyzeRequest = {
            activity_meta: stravaActivity.activity_meta,
            sleep_context: sleepContext,
            telemetry: stravaActivity.telemetry,
            activity_type: stravaActivity.suggested_activity_type,
            force_refresh: forceRefresh,
          };

          const res = await analyzeActivity(payload);
          saveLocalDiagnostic(actId, res);
          setResult(res);
        }
        setStatus("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro desconhecido durante análise");
        setStatus("error");
      }
    },
    [mode, demoType, demoSleepMode, demoData, sleepData, stravaActivity]
  );

  const handleReset = () => {
    setResult(null);
    setCompareResult(null);
    setStatus("idle");
    setError(null);
  };

  const isLoading = status === "loading_data" || status === "analyzing";

  // Unified active activity
  const activeActivity: LoadedActivity | null =
    mode === "demo"
      ? demoData
      : stravaActivity
      ? {
          activity_meta: stravaActivity.activity_meta,
          telemetry: stravaActivity.telemetry,
          sleep_context: sleepData
            ? {
                recorded_at: new Date().toISOString(),
                source: "strava_user",
                total_sleep_hours: sleepData.total_sleep_hours,
                subjective_quality_1_to_5: sleepData.subjective_quality_1_to_5,
                subjective_fatigue_1_to_5: sleepData.subjective_fatigue_1_to_5,
                notes: sleepData.notes,
              }
            : null,
        }
      : null;

  const thresholdBpm = activeActivity
    ? Math.round(activeActivity.activity_meta.athlete_max_hr_estimated * 0.85)
    : 160;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-rose-500/30 selection:text-rose-200">
      <Header
        mode={mode}
        onModeChange={(m) => {
          setMode(m);
          setResult(null);
          setCompareResult(null);
          setError(null);
          setStatus("idle");
        }}
        backendOnline={backendOnline}
        onReset={handleReset}
        hasAnalysis={!!result || !!compareResult}
        stravaConnected={!!stravaSession}
        stravaAthlete={stravaSession?.athlete}
        stravaConnecting={stravaConnecting}
        onConnectStrava={handleConnectStrava}
        onDisconnectStrava={handleDisconnectStrava}
      />

      <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
        {/* Comparador Evolutivo Head-to-Head */}
        {compareResult && !comparing && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <ComparisonView
              data={compareResult}
              onBack={() => {
                setCompareResult(null);
                setStatus("idle");
              }}
              onOpenPicker={() => setPickerOpen(true)}
              onRefreshCompare={() =>
                runCompareByIds(
                  Number(compareResult.activity_a.activity_meta.id),
                  Number(compareResult.activity_b.activity_meta.id),
                  true
                )
              }
              onShareCompare={() => setShareOpen(true)}
            />
          </div>
        )}

        {/* Loading Skeleton when fetching Strava activity or comparing */}
        {(loadingStravaActivity || comparing) && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <HeroSkeleton />
            <ChartSkeleton />
            {comparing && <DiagnosticSkeleton />}
          </div>
        )}

        {/* Hero Section if activity is loaded and not currently fetching or in compare view */}
        {!loadingStravaActivity && !comparing && !compareResult && activeActivity && (
          <HeroSection demo={activeActivity} result={result} />
        )}

        {/* Main interactive area when idle and not analyzed yet */}
        {!result && !compareResult && status === "idle" && !loadingStravaActivity && !comparing && (
          <div className="max-w-xl mx-auto space-y-6 mt-8">
            {/* Modo Demo: seletor de modalidade */}
            {mode === "demo" && (
              <div className="flex bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-1 w-full max-w-sm mx-auto">
                <button
                  onClick={() => setDemoType("run")}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-all ${
                    demoType === "run"
                      ? "bg-zinc-800 text-zinc-100 shadow-md"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Corrida (Ibirapuera)
                </button>
                <button
                  onClick={() => setDemoType("strength")}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-all ${
                    demoType === "strength"
                      ? "bg-zinc-800 text-zinc-100 shadow-md"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Mock Força (Musculação)
                </button>
              </div>
            )}

            {/* Modo Strava: se não estiver conectado, exibe CTA de conexão */}
            {mode === "strava" && !stravaSession && (
              <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-8 text-center space-y-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FC4C02]/10 ring-1 ring-[#FC4C02]/30">
                  <ActivitySquare className="h-7 w-7 text-[#FC4C02]" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-zinc-100">
                    Conectar com o Strava
                  </h3>
                  <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                    Sincronize seus treinos reais segundo a segundo e analise sua frequência cardíaca,
                    cadência, velocidade e desacoplamento fisiológico com a inteligência do PulseTriage.
                  </p>
                </div>
                <Button
                  onClick={handleConnectStrava}
                  disabled={!backendOnline || stravaConnecting}
                  className="rounded-xl bg-[#FC4C02] hover:bg-[#e04402] text-white font-medium px-6 h-11"
                >
                  {stravaConnecting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Autorizar com Strava
                </Button>
              </div>
            )}

            {/* Modo Strava conectado: controles de atleta e botão Puxar Último Treino */}
            {mode === "strava" && stravaSession && (
              <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800/60">
                  <div className="flex items-center gap-3">
                    {stravaSession.athlete?.profile ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={stravaSession.athlete.profile}
                        alt=""
                        className="h-10 w-10 rounded-full border border-zinc-700 object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-[#FC4C02]/20 flex items-center justify-center text-[#FC4C02] font-bold">
                        {stravaSession.athlete?.firstname?.[0] ?? "S"}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-zinc-200">
                        {stravaSession.athlete?.firstname} {stravaSession.athlete?.lastname}
                      </p>
                      <p className="text-xs text-emerald-400 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Conta Strava vinculada
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs text-zinc-400 whitespace-nowrap">
                      Sua idade:
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={100}
                      value={athleteAge}
                      onChange={(e) => handleAgeChange(parseInt(e.target.value, 10) || 30)}
                      className="w-16 rounded-lg border border-zinc-700 bg-zinc-800/80 px-2 py-1 text-center text-xs text-zinc-200 font-medium focus:border-indigo-500 focus:outline-none"
                      title="Idade usada para calibrar a FC máxima (220 - idade)"
                    />
                    <span className="text-[10px] text-zinc-500">anos</span>
                  </div>
                </div>

                <Button
                  onClick={() => setPickerOpen(true)}
                  disabled={loadingStravaActivity || !backendOnline}
                  className="w-full h-12 rounded-xl bg-[#FC4C02] hover:bg-[#e04402] text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#FC4C02]/10 transition-all hover:scale-[0.99]"
                >
                  {loadingStravaActivity ? (
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  ) : (
                    <ActivitySquare className="h-4 w-4 text-white" />
                  )}
                  Selecionar Treino do Strava
                </Button>

                {stravaActivity && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-zinc-400">
                    <span className="text-zinc-500">
                      Streams: {stravaActivity.available_streams.join(", ")}
                    </span>
                    <span className="text-emerald-400/90 font-mono text-[11px]">
                      {stravaActivity.telemetry.length} pontos carregados
                      {stravaActivity.downsampled && " (reamostrado)"}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Card de Contexto de Sono (100% opcional tanto no Demo quanto no Strava) */}
            {(mode === "demo" || (mode === "strava" && stravaActivity)) && (
              <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl overflow-hidden">
                <button
                  onClick={() => setShowCheckin(!showCheckin)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-800/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                      <BedDouble className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-zinc-200 text-sm">
                        {mode === "strava"
                          ? "Check-in de Sono & Prontidão"
                          : "Contexto de Sono (Opcional)"}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {mode === "strava"
                          ? "100% opcional — cruze a telemetria com seu descanso ou gere sem sono"
                          : "Cruze a biomecânica com sua recuperação ou avalie carga pura"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {mode === "strava" ? (
                      sleepData ? (
                        <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                          {sleepData.total_sleep_hours}h informadas
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase font-bold text-zinc-500 bg-zinc-800/60 px-2.5 py-0.5 rounded-full border border-zinc-700/50">
                          Não informado (opcional)
                        </span>
                      )
                    ) : (
                      demoSleepMode === "none" ? (
                        <span className="text-[10px] uppercase font-bold text-sky-400 bg-sky-500/10 px-2.5 py-0.5 rounded-full border border-sky-500/20">
                          Telemetria Pura
                        </span>
                      ) : demoSleepMode === "custom" && sleepData ? (
                        <span className="text-[10px] uppercase font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20">
                          {sleepData.total_sleep_hours}h manual
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                          Wearable Simulado
                        </span>
                      )
                    )}
                    {showCheckin ? (
                      <ChevronUp className="h-5 w-5 text-zinc-500" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-zinc-500" />
                    )}
                  </div>
                </button>

                {showCheckin && (
                  <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/20">
                    {mode === "demo" ? (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-zinc-800/60 text-xs">
                          <span className="text-zinc-400 font-medium mr-1">Contexto de sono:</span>
                          <button
                            type="button"
                            onClick={() => setDemoSleepMode("mock")}
                            className={cn(
                              "px-2.5 py-1 rounded-lg border text-xs transition-colors",
                              demoSleepMode === "mock"
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-semibold"
                                : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:text-zinc-200"
                            )}
                          >
                            Simulado (Wearable)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDemoSleepMode("custom");
                              if (!sleepData) setSleepData(DEFAULT_SLEEP);
                            }}
                            className={cn(
                              "px-2.5 py-1 rounded-lg border text-xs transition-colors",
                              demoSleepMode === "custom"
                                ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-300 font-semibold"
                                : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:text-zinc-200"
                            )}
                          >
                            Check-in Manual
                          </button>
                          <button
                            type="button"
                            onClick={() => setDemoSleepMode("none")}
                            className={cn(
                              "px-2.5 py-1 rounded-lg border text-xs transition-colors",
                              demoSleepMode === "none"
                                ? "border-sky-500/40 bg-sky-500/10 text-sky-400 font-semibold"
                                : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:text-zinc-200"
                            )}
                          >
                            Não Registrar (Telemetria Pura)
                          </button>
                        </div>

                        {demoSleepMode === "mock" && (
                          <p className="text-xs text-zinc-400">
                            Usando métricas fisiológicas completas do mock (HRV, sono profundo, eficiência de repouso).
                          </p>
                        )}

                        {demoSleepMode === "none" && (
                          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-xs text-sky-300/90 leading-relaxed">
                            O diagnóstico será focado integralmente na telemetria, biomecânica e consistência de ritmo, sem assumir valores fictícios de sono.
                          </div>
                        )}

                        {demoSleepMode === "custom" && sleepData && (
                          <div className="space-y-3">
                            <SleepCheckinCard
                              value={sleepData}
                              onChange={setSleepData}
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      // Modo Strava
                      <div className="space-y-4">
                        {sleepData ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
                              <span className="text-xs text-zinc-400 font-medium">
                                Preencha seu descanso da noite anterior:
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setSleepData(null)}
                                className="text-xs text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 h-7 px-2.5"
                              >
                                Ignorar / Deixar em branco
                              </Button>
                            </div>
                            <SleepCheckinCard
                              value={sleepData}
                              onChange={setSleepData}
                            />
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40">
                            <div>
                              <p className="text-sm font-medium text-zinc-200">
                                Nenhum dado de sono registrado
                              </p>
                              <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                                Você pode gerar o diagnóstico imediatamente. O sistema avaliará a atividade estritamente pela telemetria esportiva.
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setSleepData(DEFAULT_SLEEP)}
                              className="rounded-xl border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 hover:text-indigo-200 shrink-0"
                            >
                              <Moon className="h-3.5 w-3.5 mr-1.5" />
                              Registrar Sono
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Botão de Disparo da Análise com IA */}
            {(mode === "demo" || (mode === "strava" && stravaActivity)) && (
              <Button
                className="w-full h-14 rounded-2xl bg-zinc-100 text-zinc-950 hover:bg-zinc-300 hover:scale-[0.99] transition-all font-semibold text-base shadow-lg"
                onClick={() => handleAnalyze(false)}
                disabled={isLoading || !backendOnline}
              >
                <Play className="h-5 w-5 mr-2" />
                {activeActivity?.activity_meta.has_heartrate ?? true
                  ? "Gerar Diagnóstico Fisiológico"
                  : "Gerar Diagnóstico Cinemático"}
              </Button>
            )}

            {!backendOnline && (
              <p className="text-center text-xs text-rose-500">
                Backend offline — inicie o servidor FastAPI na porta 8000
              </p>
            )}
          </div>
        )}

        <StatusMessage status={status} />

        {/* Skeleton while AI is analyzing */}
        {status === "analyzing" && !comparing && (
          <div className="space-y-6 mt-8">
            <DiagnosticSkeleton />
          </div>
        )}

        {/* Error notification */}
        {status === "error" && error && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 max-w-xl mx-auto my-6">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
            <div>
              <p className="text-sm font-medium text-rose-500">Erro na análise</p>
              <p className="mt-1 text-xs text-rose-400/80">{error}</p>
            </div>
          </div>
        )}

        {/* Results presentation */}
        {result && !compareResult && activeActivity && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000 ease-out mt-6">
            <DiagnosticReportCard
              result={result}
              sleepContext={
                mode === "demo"
                  ? demoSleepMode === "none"
                    ? null
                    : demoSleepMode === "custom" && sleepData
                    ? {
                        recorded_at: new Date().toISOString(),
                        source: "strava_user",
                        total_sleep_hours: sleepData.total_sleep_hours,
                        subjective_quality_1_to_5: sleepData.subjective_quality_1_to_5,
                        subjective_fatigue_1_to_5: sleepData.subjective_fatigue_1_to_5,
                        notes: sleepData.notes,
                      }
                    : activeActivity.sleep_context
                  : sleepData
                  ? {
                      recorded_at: new Date().toISOString(),
                      source: "strava_user",
                      total_sleep_hours: sleepData.total_sleep_hours,
                      subjective_quality_1_to_5: sleepData.subjective_quality_1_to_5,
                      subjective_fatigue_1_to_5: sleepData.subjective_fatigue_1_to_5,
                      notes: sleepData.notes,
                    }
                  : null
              }
              durationSeconds={activeActivity.activity_meta.elapsed_time_seconds}
              onRefreshAnalysis={() => handleAnalyze(true)}
              onShareCard={() => setShareOpen(true)}
            />

            <TelemetryChart
              data={activeActivity.telemetry}
              incidents={result.triage.incidents}
              anaerobicThreshold={thresholdBpm}
              hasHeartrate={result.triage.has_heartrate}
            />

            <div className="flex justify-center pt-8 pb-12">
              <Button
                variant="outline"
                className="rounded-full px-8 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                onClick={handleReset}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Nova Análise
              </Button>
            </div>
          </div>
        )}
      </main>

      {mode === "strava" && stravaSession && (
        <ActivityPickerModal
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onSelect={handleSelectStravaActivity}
          onCompare={handleCompareStravaActivities}
          currentActivityId={stravaActivity ? Number(stravaActivity.activity_meta.id) : null}
          onAuthExpired={handleStravaAuthExpired}
        />
      )}

      <ShareableCardModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        mode={compareResult ? "comparison" : "single"}
        activity={activeActivity}
        result={result}
        comparison={compareResult}
      />
    </div>
  );
}
