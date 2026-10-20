import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder do Hero (título + metadados) enquanto a atividade carrega. */
export function HeroSkeleton() {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-zinc-800/80 mb-8">
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-72 md:h-12 md:w-[28rem]" />
        <div className="flex flex-wrap gap-6 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-2.5 w-14" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="h-[136px] w-[200px] rounded-3xl" />
    </div>
  );
}

/** Placeholder do grid de diagnóstico da IA (Gemini processando). */
export function DiagnosticSkeleton() {
  const block = (wide = false, key?: number) => (
    <div
      key={key}
      className={`rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-6 space-y-4 ${wide ? "md:col-span-2" : ""}`}
    >
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-7 rounded-md" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-4/5" />
      </div>
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-28 rounded-full" />
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-busy="true" aria-label="Gerando diagnóstico">
      {block(false, 1)}
      {block(false, 2)}
      {block(true, 3)}
      {block(true, 4)}
    </div>
  );
}

/** Placeholder dos gráficos de telemetria. */
export function ChartSkeleton() {
  return (
    <div className="space-y-6">
      {[280, 180, 180].map((h, i) => (
        <div key={i} className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-md" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="w-full rounded-xl" style={{ height: h }} />
        </div>
      ))}
    </div>
  );
}
