"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { exchangeStravaToken } from "@/lib/api";
import { consumeOAuthState, saveStravaSession } from "@/lib/strava";
import { Button } from "@/components/ui/button";

type Phase = "exchanging" | "success" | "error";

function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const [phase, setPhase] = useState<Phase>("exchanging");
  const [message, setMessage] = useState<string>("");
  const [athleteName, setAthleteName] = useState<string>("");
  // O `code` do Strava é de uso único: impede a 2ª execução do efeito (StrictMode).
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const fail = (msg: string) => {
      setPhase("error");
      setMessage(msg);
    };

    const oauthError = params.get("error");
    if (oauthError) {
      return fail(
        oauthError === "access_denied"
          ? "Você cancelou a autorização no Strava."
          : `O Strava retornou um erro: ${oauthError}`
      );
    }

    const code = params.get("code");
    if (!code) return fail("Código de autorização ausente na URL de retorno.");

    if (!consumeOAuthState(params.get("state"))) {
      return fail("Falha de validação de segurança (state OAuth). Inicie a conexão novamente.");
    }

    const scope = params.get("scope") ?? "";
    if (!scope.includes("activity:read")) {
      return fail("Permissão de leitura de atividades não concedida. Autorize o acesso às atividades.");
    }

    exchangeStravaToken(code)
      .then((session) => {
        saveStravaSession(session);
        setAthleteName(session.athlete?.firstname ?? "");
        setPhase("success");
        setTimeout(() => router.replace("/?strava=connected"), 900);
      })
      .catch((err) => fail(err instanceof Error ? err.message : "Erro ao trocar o token."));
  }, [params, router]);

  return (
    <div className="w-full max-w-md rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-8 text-center">
      <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-[#FC4C02]/10 ring-1 ring-[#FC4C02]/30">
        <Activity className="h-6 w-6 text-[#FC4C02]" />
      </div>

      {phase === "exchanging" && (
        <>
          <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-zinc-400" />
          <p className="text-sm font-medium text-zinc-200">Conectando ao Strava…</p>
          <p className="mt-1 text-xs text-zinc-500">Trocando o código de autorização por um token seguro</p>
        </>
      )}

      {phase === "success" && (
        <>
          <CheckCircle2 className="mx-auto mb-3 h-6 w-6 text-emerald-500" />
          <p className="text-sm font-medium text-zinc-200">
            Conectado{athleteName ? `, ${athleteName}` : ""}!
          </p>
          <p className="mt-1 text-xs text-zinc-500">Redirecionando para o painel…</p>
        </>
      )}

      {phase === "error" && (
        <>
          <AlertCircle className="mx-auto mb-3 h-6 w-6 text-rose-500" />
          <p className="text-sm font-medium text-rose-400">Não foi possível conectar</p>
          <p className="mt-2 text-xs text-zinc-400">{message}</p>
          <Button
            variant="outline"
            className="mt-6 rounded-full border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            onClick={() => router.replace("/")}
          >
            Voltar ao PulseTriage
          </Button>
        </>
      )}
    </div>
  );
}

export default function StravaCallbackPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <Suspense fallback={<Loader2 className="h-5 w-5 animate-spin text-zinc-500" />}>
        <CallbackHandler />
      </Suspense>
    </main>
  );
}
