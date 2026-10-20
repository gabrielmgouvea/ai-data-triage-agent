"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Bike,
  Check,
  CheckCircle2,
  ChevronRight,
  Dumbbell,
  Footprints,
  GitCompareArrows,
  HeartPulse,
  Loader2,
  Mountain,
  PersonStanding,
  RefreshCw,
  Search,
  Waves,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, fetchStravaActivities } from "@/lib/api";
import { getValidAccessToken } from "@/lib/strava";
import type { StravaActivitySummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const PER_PAGE = 15;

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// ── Formatação ───────────────────────────────────────────────────────────────

/**
 * "Hoje às 18:30" · "Ontem às 07:15" · "12 de Outubro · 06:40".
 * O Strava envia `start_date_local` com sufixo "Z", mas o valor já é o horário
 * local do atleta — por isso é lido como data "ingênua", sem conversão de fuso.
 */
export function formatActivityDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d, hh, mm] = m;
  const date = new Date(+y, +mo - 1, +d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - date.getTime()) / 86_400_000);
  const time = `${hh}:${mm}`;

  if (diffDays === 0) return `Hoje às ${time}`;
  if (diffDays === 1) return `Ontem às ${time}`;
  const year = +y !== now.getFullYear() ? ` de ${y}` : "";
  return `${+d} de ${MONTHS[+mo - 1]}${year} · ${time}`;
}

function formatMovingTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const min = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${min.toString().padStart(2, "0")}min`;
  return `${min}min`;
}

function formatKm(meters: number): string {
  return `${(meters / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
}

type CategoryFilter = "all" | "Corrida" | "Musculação" | "Caminhada" | "Ciclismo";

const CATEGORY_TABS: Array<{ id: CategoryFilter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "Corrida", label: "Corrida" },
  { id: "Musculação", label: "Musculação" },
  { id: "Caminhada", label: "Caminhada" },
  { id: "Ciclismo", label: "Ciclismo" },
];

function sportVisual(sportType: string): { icon: LucideIcon; label: string; tint: string } {
  const st = sportType.toLowerCase();
  if (st.includes("run")) return { icon: Footprints, label: "Corrida", tint: "text-emerald-400 bg-emerald-500/10" };
  if (["weighttraining", "crossfit", "workout", "hiit"].includes(st))
    return { icon: Dumbbell, label: "Musculação", tint: "text-indigo-400 bg-indigo-500/10" };
  if (st.includes("ride") || st.includes("bike") || st.includes("cycling"))
    return { icon: Bike, label: "Ciclismo", tint: "text-sky-400 bg-sky-500/10" };
  if (st === "walk" || st.includes("walk"))
    return { icon: PersonStanding, label: "Caminhada", tint: "text-teal-400 bg-teal-500/10" };
  if (st === "hike") return { icon: Mountain, label: "Trilha", tint: "text-lime-400 bg-lime-500/10" };
  if (st.includes("swim")) return { icon: Waves, label: "Natação", tint: "text-cyan-400 bg-cyan-500/10" };
  return { icon: Activity, label: sportType, tint: "text-zinc-300 bg-zinc-800" };
}

// ── Componentes ──────────────────────────────────────────────────────────────

function ActivityRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-800/60 p-3">
      <Skeleton className="h-10 w-10 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
        <div className="flex gap-3 pt-0.5">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
  );
}

function ActivityRow({
  activity,
  isCurrent,
  checkedOrder,
  disabledCheck,
  onToggleCheck,
  onQuickOpen,
}: {
  activity: StravaActivitySummary;
  isCurrent: boolean;
  checkedOrder: number | null; // 1 ou 2 se selecionado
  disabledCheck: boolean;
  onToggleCheck: () => void;
  onQuickOpen: () => void;
}) {
  const { icon: Icon, label, tint } = sportVisual(activity.sport_type);
  const isChecked = checkedOrder !== null;

  return (
    <div
      onClick={() => {
        if (!disabledCheck || isChecked) onToggleCheck();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!disabledCheck || isChecked) onToggleCheck();
        }
      }}
      className={cn(
        "group flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200",
        isChecked
          ? "border-[#FC4C02]/70 bg-[#FC4C02]/10 shadow-sm shadow-[#FC4C02]/10"
          : isCurrent
          ? "border-zinc-700 bg-zinc-800/50"
          : disabledCheck
          ? "cursor-not-allowed border-zinc-800/40 bg-zinc-900/20 opacity-50"
          : "border-zinc-800/60 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-800/60"
      )}
    >
      {/* Checkbox de seleção (máx. 2) */}
      <div
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold transition-colors",
          isChecked
            ? "border-[#FC4C02] bg-[#FC4C02] text-white"
            : "border-zinc-700 bg-zinc-900/80 text-transparent group-hover:border-zinc-500"
        )}
        title={isChecked ? `Selecionado (${checkedOrder}º)` : "Selecionar para abrir ou comparar"}
      >
        {isChecked ? checkedOrder : <Check className="h-3.5 w-3.5" />}
      </div>

      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tint)} title={label}>
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-zinc-100">{activity.name}</p>
          {isCurrent && (
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
              Atual
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-zinc-500">{formatActivityDate(activity.start_date_local)}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-zinc-400">
          <span className="text-zinc-300">{label}</span>
          {activity.distance > 0 && <span>{formatKm(activity.distance)}</span>}
          <span>{formatMovingTime(activity.moving_time)}</span>
          {activity.average_heartrate != null && (
            <span className="text-rose-400/90">{Math.round(activity.average_heartrate)} bpm méd.</span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {activity.has_heartrate ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
            <HeartPulse className="h-3 w-3" /> Com FC
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-400">
            <Footprints className="h-3 w-3" /> Cinemática
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onQuickOpen();
          }}
          title="Abrir este treino individualmente"
          className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

interface ActivityPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (activity: StravaActivitySummary) => void;
  onCompare?: (activityA: StravaActivitySummary, activityB: StravaActivitySummary) => void;
  currentActivityId?: number | null;
  /** Chamado quando o Strava rejeita o token (sessão expirada/revogada). */
  onAuthExpired?: () => void;
}

export function ActivityPickerModal({
  open,
  onOpenChange,
  onSelect,
  onCompare,
  currentActivityId,
  onAuthExpired,
}: ActivityPickerModalProps) {
  const [activities, setActivities] = useState<StravaActivitySummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Callbacks em ref: mantém `loadPage` estável mesmo que o pai passe funções inline.
  const onAuthExpiredRef = useRef(onAuthExpired);
  const onOpenChangeRef = useRef(onOpenChange);
  onAuthExpiredRef.current = onAuthExpired;
  onOpenChangeRef.current = onOpenChange;

  const loadPage = useCallback(async (target: number) => {
    setLoading(true);
    setError(null);
    try {
      const token = await getValidAccessToken();
      const batch = await fetchStravaActivities(token, target, PER_PAGE);
      setActivities((prev) => (target === 1 ? batch : [...prev, ...batch]));
      setPage(target);
      setHasMore(batch.length === PER_PAGE);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthExpiredRef.current?.();
        onOpenChangeRef.current(false);
        return;
      }
      setError(err instanceof Error ? err.message : "Falha ao carregar treinos do Strava.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Recarrega a lista sempre que o modal abre (pega treinos recém-sincronizados).
  useEffect(() => {
    if (open) {
      setActivities([]);
      setSelectedIds([]);
      setActiveCategory("all");
      setSearchQuery("");
      loadPage(1);
    }
  }, [open, loadPage]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 2) {
        return prev;
      }
      return [...prev, id];
    });
  };

  // Contagem por categoria entre as atividades carregadas
  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryFilter, number> = {
      all: activities.length,
      Corrida: 0,
      Musculação: 0,
      Caminhada: 0,
      Ciclismo: 0,
    };
    for (const act of activities) {
      const cat = sportVisual(act.sport_type).label;
      if (cat === "Corrida" || cat === "Musculação" || cat === "Caminhada" || cat === "Ciclismo") {
        counts[cat] += 1;
      }
    }
    return counts;
  }, [activities]);

  // Lista filtrada instantaneamente por categoria + busca textual
  const filteredActivities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activities.filter((act) => {
      const cat = sportVisual(act.sport_type).label;
      const matchesCategory = activeCategory === "all" || cat === activeCategory;
      const matchesSearch = !q || act.name.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [activities, activeCategory, searchQuery]);

  const selectedActivities = selectedIds
    .map((id) => activities.find((a) => a.id === id))
    .filter((a): a is StravaActivitySummary => Boolean(a));

  const sameSport =
    selectedActivities.length === 2
      ? sportVisual(selectedActivities[0].sport_type).label ===
        sportVisual(selectedActivities[1].sport_type).label
      : true;

  const bothHaveHr =
    selectedActivities.length === 2
      ? selectedActivities[0].has_heartrate && selectedActivities[1].has_heartrate
      : true;

  const mixedHr =
    selectedActivities.length === 2 &&
    selectedActivities[0].has_heartrate !== selectedActivities[1].has_heartrate;

  const initialLoading = loading && activities.length === 0;
  const withHr = activities.filter((a) => a.has_heartrate).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden">
        <DialogHeader className="border-b border-zinc-800/80 px-5 pb-3.5 pt-5">
          <div className="flex items-center justify-between pr-6">
            <DialogTitle>Selecionar ou Comparar Treinos</DialogTitle>
            {selectedActivities.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FC4C02]/40 bg-[#FC4C02]/15 px-2.5 py-0.5 text-xs font-semibold text-[#FC4C02]">
                {selectedActivities.length === 1
                  ? "1 selecionado"
                  : "2 selecionados (Máx)"}
              </span>
            )}
          </div>
          <DialogDescription>
            {initialLoading
              ? "Buscando suas atividades recentes…"
              : activities.length > 0
              ? `Marque 1 treino para análise individual ou 2 treinos para comparação Head-to-Head (${withHr} com FC)`
              : "Escolha qual atividade carregar na dashboard"}
          </DialogDescription>

          {/* 1. Filtros por Categoria (Tabs) + 2. Campo de Busca Textual */}
          {!initialLoading && activities.length > 0 && (
            <div className="mt-3 space-y-2.5 pt-1">
              {/* Abas de Categoria */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {CATEGORY_TABS.map((tab) => {
                  const count = categoryCounts[tab.id];
                  const isActive = activeCategory === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveCategory(tab.id)}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all",
                        isActive
                          ? "border-[#FC4C02]/60 bg-[#FC4C02]/15 text-[#FC4C02] shadow-sm"
                          : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                      )}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.2 text-[10px] font-semibold",
                          isActive
                            ? "bg-[#FC4C02]/25 text-[#FC4C02]"
                            : "bg-zinc-800 text-zinc-500"
                        )}
                      >
                        ({count})
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Input de Busca Textual */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nome do treino..."
                  className="w-full rounded-xl border border-zinc-800/90 bg-zinc-900/70 py-1.5 pl-8 pr-8 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-700 focus:bg-zinc-900 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    title="Limpar busca"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
        </DialogHeader>

        {/* Validação visual rápida no topo quando 2 treinos estão selecionados */}
        {selectedActivities.length === 2 && (
          <div className="space-y-1.5 border-b border-zinc-800/80 bg-zinc-900/70 px-5 py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {sameSport ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  Mesma modalidade ({sportVisual(selectedActivities[0].sport_type).label})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                  Modalidades diferentes ({sportVisual(selectedActivities[0].sport_type).label} vs.{" "}
                  {sportVisual(selectedActivities[1].sport_type).label})
                </span>
              )}

              {bothHaveHr ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-300">
                  <HeartPulse className="h-3.5 w-3.5 text-emerald-400" />
                  Ambos com sensor cardíaco (EF + Deriva ativos)
                </span>
              ) : mixedHr ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-medium text-sky-300">
                  <AlertTriangle className="h-3.5 w-3.5 text-sky-400" />
                  1 com FC e 1 sem FC (foco em Pacing, Splits & Altimetria)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-medium text-sky-300">
                  <Footprints className="h-3.5 w-3.5 text-sky-400" />
                  Ambos em Modo Cinemático (Pacing & Altimetria)
                </span>
              )}
            </div>
          </div>
        )}

        <div className="max-h-[46vh] space-y-2 overflow-y-auto px-5 py-3.5">
          {initialLoading &&
            Array.from({ length: 6 }).map((_, i) => <ActivityRowSkeleton key={i} />)}

          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <div className="flex-1">
                <p className="text-xs text-rose-300">{error}</p>
                <button
                  onClick={() => loadPage(activities.length ? page + 1 : 1)}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-rose-400 hover:text-rose-300"
                >
                  <RefreshCw className="h-3 w-3" /> Tentar novamente
                </button>
              </div>
            </div>
          )}

          {!loading && !error && activities.length === 0 && (
            <p className="py-10 text-center text-sm text-zinc-500">
              Nenhuma atividade encontrada na sua conta Strava.
            </p>
          )}

          {!initialLoading && !error && activities.length > 0 && filteredActivities.length === 0 && (
            <div className="py-8 text-center space-y-2">
              <p className="text-sm text-zinc-400">
                Nenhum treino encontrado para os filtros aplicados.
              </p>
              <button
                type="button"
                onClick={() => {
                  setActiveCategory("all");
                  setSearchQuery("");
                }}
                className="text-xs font-medium text-[#FC4C02] hover:underline"
              >
                Limpar filtros
              </button>
            </div>
          )}

          {filteredActivities.map((a) => {
            const idx = selectedIds.indexOf(a.id);
            return (
              <ActivityRow
                key={a.id}
                activity={a}
                isCurrent={a.id === currentActivityId}
                checkedOrder={idx >= 0 ? idx + 1 : null}
                disabledCheck={selectedIds.length >= 2 && idx === -1}
                onToggleCheck={() => toggleSelect(a.id)}
                onQuickOpen={() => onSelect(a)}
              />
            );
          })}

          {hasMore && !initialLoading && (
            <button
              onClick={() => loadPage(page + 1)}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-800 py-2.5 text-xs font-medium text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Carregar treinos mais antigos
            </button>
          )}
        </div>

        {/* Rodapé do Modal + 3. Validação de Compatibilidade no Head-to-Head */}
        <div className="border-t border-zinc-800/80 bg-zinc-950/95 px-5 py-3.5 space-y-2.5">
          {selectedActivities.length === 2 && !sameSport && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
              <span className="shrink-0">⚠️</span>
              <span>
                Modalidades diferentes selecionadas: a comparação focará em tempo e carga interna geral, pois métricas de pace e EF exigem a mesma modalidade.
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-zinc-400">
              {selectedActivities.length === 0 && "Clique em um treino para selecionar (até 2)."}
              {selectedActivities.length === 1 && (
                <span>
                  <strong className="text-zinc-200">1 selecionado</strong> — abra agora ou marque o 2º para comparar.
                </span>
              )}
              {selectedActivities.length === 2 && (
                <span>
                  <strong className="text-zinc-200">2 treinos prontos</strong> para confronto evolutivo.
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {selectedActivities.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="rounded-lg border border-zinc-800 px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
                >
                  Limpar
                </button>
              )}

              {selectedActivities.length === 1 && (
                <button
                  type="button"
                  onClick={() => onSelect(selectedActivities[0])}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-900 transition-colors hover:bg-white"
                >
                  Abrir Treino Selecionado
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}

              {selectedActivities.length === 2 && onCompare && (
                <button
                  type="button"
                  onClick={() => {
                    onCompare(selectedActivities[0], selectedActivities[1]);
                    onOpenChange(false);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#FC4C02] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-[#FC4C02]/25 transition-all hover:bg-[#e04300]"
                >
                  <GitCompareArrows className="h-4 w-4" />
                  Comparar 2 Treinos Selecionados
                </button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
