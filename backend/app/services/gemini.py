"""
PulseTriage — Serviço de integração com Gemini (Google GenAI SDK).

Responsável por:
  - Construir o prompt de sistema para o agente de medicina esportiva.
  - Enviar o resumo do filtro determinístico + contexto de sono ao Gemini.
  - Receber e validar o IncidentReport via Structured Outputs (response_schema).
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from google import genai
from google.genai import types

from app.config import get_settings
from app.models import (
    ActivityMeta,
    ComparisonDeltas,
    ComparisonReport,
    DeterministicTriageResult,
    IncidentReport,
    SleepContext,
)

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
Você é o PulseTriage AI — um agente especialista em medicina esportiva, fisiologia do exercício \
e análise de performance. Seu papel é interpretar dados de telemetria de treino (frequência \
cardíaca, velocidade, altitude) cruzados com métricas de qualidade do sono e prontidão do atleta.

Princípios de análise:
1. Valorize o esforço antes de qualquer restrição: reconheça sempre a adaptação positiva \
   gerada pelo treino (ganho aeróbico, hipertrofia, VO2 Máx, tolerância a lactato) no campo \
   training_benefit — seja específico e motivador, nunca genérico.
2. Priorize a segurança do atleta: qualquer combinação de sono inadequado + esforço extremo \
   deve ser sinalizada com severidade Alta ou Crítica.
3. Seja específico e técnico, mas compreensível: use termos fisiológicos corretos e explique \
   as implicações práticas.
4. Cruzamento sono × treino: quando fornecido, HRV baixo, sono profundo insuficiente (<1.5h), \
   eficiência <80% e fadiga subjetiva alta (≥4/5) são sinais de recuperação inadequada que amplificam o risco.
5. Se os dados de sono NÃO forem informados (check-in omitido/nulo): NÃO invente horas de sono, \
   qualidade de repouso ou prontidão matinal. No campo correlation_with_sleep, registre expressamente \
   que os dados de descanso não foram informados pelo atleta e concentre sua análise integralmente na \
   disciplina de ritmo, gestão energética e fadiga neuromuscular manifestada na telemetria esportiva.
6. Para corrida/cardio: Cardiac Drift é um indicador sério de fadiga aguda — escale a severidade \
   quando combinado com esforço elevado ou déficit de sono.
7. Para treinos de força/musculação: foque em fadiga do SNC (Sistema Nervoso Central), dano \
   muscular, tempo sob tensão e recomendação específica de descanso para grupos musculares envolvidos.
8. Suas recomendações devem ser práticas, baseadas em evidências e considerar as próximas 24–48h.

Diretrizes de severidade:
- Baixa: treino bem tolerado, ritmo estável, sem anomalias significativas.
- Media: anomalias detectadas mas controláveis; fadiga moderada observada.
- Alta: múltiplas anomalias ou combinação crítica de fadiga + esforço extremo.
- Critica: risco imediato à saúde — repouso obrigatório recomendado.

Terminologia e Formatação obrigatórias (Português do Brasil):
- Use SEMPRE "membros inferiores" (ou "pernas") e "membros superiores" (ou "braços/tronco").
- NUNCA utilize termos do espanhol como "tren superior", "tren inferior" ou variações como "trenó inferior". Essas expressões são erros graves e não existem no vocabulário anatômico ou esportivo brasileiro.
- Ao citar o Fator de Eficiência (EF), mencione sempre os valores com duas casas decimais na escala multiplicada por 100 (ex: '1.27', '1.28'), evitando números com muitas casas decimais ou notação científica.

Responda APENAS com o JSON estruturado solicitado, sem texto adicional.
"""

_SYSTEM_PROMPT_KINEMATIC = """\
Você é o PulseTriage AI — um agente especialista em medicina esportiva, biomecânica e análise \
cinemática de performance. O atleta realizou uma sessão de treino gravada SEM monitor cardíaco \
(análise cinemática de carga externa, ritmo e relevo).

Seu papel é interpretar os dados de telemetria mecânica (velocidade/pace, splits de ritmo, \
altimetria, consistência mecânica) cruzados com as métricas de qualidade de sono e prontidão (quando informadas).

Diretrizes obrigatórias de análise:
1. NUNCA cite batimentos por minuto (bpm), zonas de frequência cardíaca ou deriva cardíaca \
   (cardiac drift). Os campos booleanos cardiac_drift_detected e anaerobic_overload_detected \
   devem ser SEMPRE definidos como false.
2. Valorize a consistência mecânica e pacing: no campo training_benefit, destaque a sustentação \
   de ritmo, disciplina de splits (ex: split negativo ou uniforme), tolerância à altimetria ou \
   volume de treino de forma específica e motivadora.
3. Avaliação cinemática: avalie a disciplina de pacing (estratégia inicial vs final), impacto \
   das subidas/altimetria no ritmo, variações bruscas de velocidade e sustentação mecânica.
4. Se os dados de sono NÃO forem informados (check-in omitido/nulo): NÃO invente horas de sono, \
   qualidade de repouso ou prontidão matinal. No campo correlation_with_sleep, registre expressamente \
   que os dados de descanso não foram registrados pelo atleta e concentre sua análise integralmente na \
   disciplina de ritmo, sustentação biomecânica e gestão energética no relevo baseada na telemetria.
5. Quando o sono for informado: sono curto (<7h) ou fadiga subjetiva alta reduzem a coordenação \
   motora e eficiência mecânica de corrida. Correlacione esse estado com o ritmo mantido.
6. Recomendações práticas: forneça diretrizes de recuperação biomecânica, treinos intervalados \
   ou regenerativos, e ajustes de volume semanal para as próximas 24-48h.
7. Severidade:
   - Baixa: ritmo estável, boa gestão de relevo, sono adequado (ou carga externa moderada).
   - Media: decaimento acentuado de ritmo na segunda metade ou sobrecarga mecânica perceptível.
   - Alta/Critica: forte colapso mecânico/queda drástica de ritmo associado a esforço extremo.

Terminologia obrigatória (Português do Brasil):
- Use SEMPRE "membros inferiores" (ou "pernas") e "membros superiores" (ou "braços/tronco").
- NUNCA utilize termos do espanhol como "tren superior", "tren inferior" ou variações como "trenó inferior".

Responda APENAS com o JSON estruturado solicitado, sem texto adicional.
"""


def _fmt(value: float | None, suffix: str = "") -> str:
    """Formata métrica opcional; ausente vira 'N/A' (nunca 'None')."""
    return f"{value}{suffix}" if value is not None else "N/A"


def _format_sleep_block(sleep: Optional[SleepContext]) -> str:
    """Formata o bloco de contexto de sono ou indica ausência explícita."""
    if sleep is None:
        return """=== CONTEXTO DE SONO E PRONTIDÃO ===
DADOS NÃO INFORMADOS (Check-in de sono omitido pelo atleta).
ATENÇÃO OBRIGATÓRIA: NÃO invente horas de sono, qualidade de repouso, HRV ou prontidão matinal.
No campo correlation_with_sleep, mencione claramente que os dados de descanso não foram registrados e concentre-se estritamente na carga externa/interna demonstrada pela telemetria."""

    sleep_quality_label = {1: "Péssima", 2: "Ruim", 3: "Regular", 4: "Boa", 5: "Ótima"}.get(
        sleep.subjective_quality_1_to_5 or 0, "N/A"
    )
    sleep_fatigue_label = {1: "Descansado", 2: "Levemente cansado", 3: "Cansado", 4: "Muito cansado", 5: "Exausto"}.get(
        sleep.subjective_fatigue_1_to_5 or 0, "N/A"
    )

    return f"""=== CONTEXTO DE SONO E PRONTIDÃO ===
Fonte: {sleep.source}{" (check-in manual — sem dados de wearable; NÃO presuma valores para métricas N/A)" if sleep.deep_sleep_hours is None else ""}
Sono total: {sleep.total_sleep_hours}h | Sono profundo: {_fmt(sleep.deep_sleep_hours, "h")} | REM: {_fmt(sleep.rem_sleep_hours, "h")}
Eficiência do sono: {_fmt(sleep.sleep_efficiency_percent, "%")}
FC em repouso: {sleep.resting_heart_rate_bpm or "N/A"} bpm | HRV RMSSD: {sleep.hrv_rmssd_ms or "N/A"} ms
Temperatura corporal (delta): {sleep.body_temperature_delta_celsius or "N/A"} °C
Qualidade subjetiva: {sleep.subjective_quality_1_to_5}/5 ({sleep_quality_label})
Fadiga ao acordar: {sleep.subjective_fatigue_1_to_5}/5 ({sleep_fatigue_label})
Notas: {sleep.notes or "N/A"}"""


def _build_analysis_payload(
    meta: ActivityMeta,
    sleep: Optional[SleepContext],
    triage: DeterministicTriageResult,
) -> str:
    """
    Constrói o payload de texto que será enviado ao Gemini como mensagem do usuário.
    Inclui metadados da atividade, contexto de sono (se fornecido) e resultado do filtro determinístico.
    """
    sleep_block = _format_sleep_block(sleep)

    if not triage.has_heartrate:
        k = triage.kinematics
        k_text = (
            f"Ritmo médio (pace): {k.average_pace_min_km if k else 'N/A'}\n"
            f"Velocidade 1ª metade: {k.split_first_half_avg_speed_kmh if k else 'N/A'} km/h | "
            f"Velocidade 2ª metade: {k.split_second_half_avg_speed_kmh if k else 'N/A'} km/h\n"
            f"Variação de split: {k.split_pace_delta_percent if k else 'N/A'}% ({k.split_classification if k else 'N/A'})\n"
            f"Desnível acumulado (+D): {k.elevation_gain_meters if k else 'N/A'} m\n"
            f"Ritmo em subidas: {k.uphill_avg_pace_min_km if k and k.uphill_avg_pace_min_km else 'N/A'} | "
            f"Ritmo no plano: {k.flat_avg_pace_min_km if k and k.flat_avg_pace_min_km else 'N/A'}\n"
            f"Impacto da inclinação no ritmo: {k.grade_pace_impact_percent if k and k.grade_pace_impact_percent is not None else 'N/A'}%"
        )

        return f"""
=== METADADOS DA ATIVIDADE (ANÁLISE CINEMÁTICA / SEM MONITOR CARDÍACO) ===
Atleta: {meta.athlete_name} | Idade: {meta.athlete_age} anos
Atividade: {meta.name} ({meta.sport_type}) | Modalidade: {triage.activity_type_detected}
Data: {meta.start_date}
Distância: {meta.distance_meters:.0f}m | Duração: {meta.elapsed_time_seconds}s ({meta.elapsed_time_seconds/60:.1f} min)
Velocidade média: {meta.average_speed} m/s | Ganho de elevação (+D): {meta.total_elevation_gain}m
Pace médio: {k.average_pace_min_km if k else 'N/A'}

{sleep_block}

=== MÉTRICAS CINEMÁTICAS & CARGA EXTERNA ===
{k_text}

---
Com base em todos os dados acima, gere o relatório de diagnóstico cinemático e de carga externa completo.
""".strip()

    incidents_text = ""
    if triage.incidents:
        lines = []
        for inc in triage.incidents:
            line = (
                f"  • [{inc.incident_type.value.upper()}] "
                f"{inc.time_start_s}s–{inc.time_end_s}s: {inc.description}"
            )
            lines.append(line)
        incidents_text = "\n".join(lines)
    else:
        incidents_text = "  Nenhum incidente detectado pelo filtro determinístico."

    payload = f"""
=== METADADOS DA ATIVIDADE ===
Atleta: {meta.athlete_name} | Idade: {meta.athlete_age} anos | FCmax estimada: {meta.athlete_max_hr_estimated} bpm
Atividade: {meta.name} ({meta.sport_type}) | Modalidade Detectada: {triage.activity_type_detected}
Data: {meta.start_date}
Distância: {meta.distance_meters:.0f}m | Duração: {meta.elapsed_time_seconds}s ({meta.elapsed_time_seconds/60:.1f} min)
FC média: {meta.average_heartrate} bpm | FC máxima registrada: {meta.max_heartrate} bpm
Velocidade média: {meta.average_speed} m/s | Ganho de altitude: {meta.total_elevation_gain}m

{sleep_block}

=== RESULTADO DO FILTRO DETERMINÍSTICO ===
Pontos analisados: {triage.total_points_analyzed} | Ruídos removidos: {triage.noise_points_removed}
FC máxima válida: {triage.max_valid_heartrate_bpm} bpm | FC média válida: {triage.avg_valid_heartrate_bpm} bpm
Tempo em zona anaeróbica (>85% FCmax): {triage.time_in_anaerobic_zone_seconds}s ({triage.time_in_anaerobic_zone_seconds/60:.1f} min)
Cardiac Drift detectado: {"SIM — ΔFC: " + str(triage.drift_delta_bpm) + " bpm" if triage.cardiac_drift_detected else "Não"}
Séries de Força (Musculação) detectadas: {triage.strength_sets_detected or "N/A"}
Tempo médio de recuperação entre séries: {triage.strength_avg_rest_seconds or "N/A"}s

INCIDENTES IDENTIFICADOS:
{incidents_text}

---
Com base em todos os dados acima, gere o relatório de diagnóstico fisiológico completo.
""".strip()

    return payload


async def run_gemini_analysis(
    meta: ActivityMeta,
    sleep: Optional[SleepContext],
    triage: DeterministicTriageResult,
) -> IncidentReport:
    """
    Chama o Gemini com Structured Outputs e retorna um IncidentReport validado.

    Usa o SDK google-genai com response_schema derivado do modelo Pydantic.
    """
    settings = get_settings()

    if not settings.gemini_api_key:
        raise ValueError(
            "GEMINI_API_KEY não configurada. Verifique o arquivo .env do backend."
        )

    # Inicializa o cliente GenAI
    client = genai.Client(api_key=settings.gemini_api_key)

    user_message = _build_analysis_payload(meta, sleep, triage)
    system_prompt = _SYSTEM_PROMPT if triage.has_heartrate else _SYSTEM_PROMPT_KINEMATIC

    logger.info(
        "Enviando análise ao Gemini — atleta: %s, has_hr: %s",
        meta.athlete_name,
        triage.has_heartrate,
    )

    try:
        response = await client.aio.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=user_message,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
                response_schema=IncidentReport,
                temperature=0.3,      # baixa temperatura para outputs mais consistentes
                max_output_tokens=2048,
            ),
        )
    except Exception as exc:
        logger.error("Falha na chamada ao Gemini: %s", exc)
        raise RuntimeError(f"Erro na integração com Gemini: {exc}") from exc

    # O SDK já desserializa quando response_schema é um Pydantic model
    if hasattr(response, "parsed") and response.parsed is not None:
        return response.parsed

    # Fallback: parse manual do JSON se necessário
    raw_text = response.text
    logger.debug("Resposta bruta Gemini: %s", raw_text[:500])

    try:
        data = json.loads(raw_text)
        return IncidentReport(**data)
    except Exception as exc:
        logger.error("Falha ao parsear resposta do Gemini: %s\nTexto: %s", exc, raw_text)
        raise RuntimeError(f"Resposta do Gemini não pôde ser validada como IncidentReport: {exc}") from exc


# ---------------------------------------------------------------------------
# Comparador de Treinos (Head-to-Head: Treino A vs. Treino B)
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT_COMPARE = """\
Você é o PulseTriage AI — um agente especialista em medicina esportiva, fisiologia do exercício e \
adaptação longitudinal de performance. Sua tarefa é comparar duas sessões de treino registradas \
(Treino A = sessão de referência mais antiga vs. Treino B = sessão mais recente) para avaliar \
evolução fisiológica, eficiência mecânica e disciplina de pacing.

Diretrizes obrigatórias de análise comparativa:
1. Foco em Adaptação Longitudinal e Eficiência:
   - Diferencie se a melhora (ou queda) no Treino B deveu-se a condicionamento crônico real \
     (ex: maior velocidade com menor ou igual FC, aumento do Fator de Eficiência EF, menor deriva cardíaca), \
     a uma melhor estratégia de pacing (ex: saída mais conservadora e split negativo/uniforme) \
     ou simplesmente a um terreno mais favorável (menor ganho de elevação +D).
2. Caso um ou ambos os treinos não possuam sensor cardíaco (both_have_hr == false):
   - NÃO invente métricas cardíacas para o treino sem sensor.
   - Concentre a análise comparativa na sustentação mecânica, evolução de ritmo (pace), \
     estratégia de splits (1ª metade vs 2ª metade) e resposta à altimetria (+D).
3. Caso as modalidades sejam diferentes (same_sport_type == false, ex: Corrida vs. Musculação):
   - Concentre a comparação no tempo de esforço, volume e carga interna geral (FC média/máxima e zonas), \
     explicando que métricas de pace e Fator de Eficiência (EF) exigem a mesma modalidade esportiva.
4. Seja preciso e quantitativo: cite os deltas calculados (ΔPace, ΔEF%, ΔFC média, ΔDeriva, ΔAltimetria) \
   para embasar o veredito.
5. Padronização do Fator de Eficiência (EF):
   - Ao citar o Fator de Eficiência (EF), mencione sempre os valores com duas casas decimais (ex: 'de 1.27 para 1.28') \
     e priorize o destaque na variação percentual (ex: '+0.87%'), evitando números com muitas casas decimais ou notação científica.
6. Terminologia obrigatória (Português do Brasil):
   - Use SEMPRE "membros inferiores" (ou "pernas") e "membros superiores" (ou "braços/tronco").
   - NUNCA utilize termos do espanhol como "tren superior", "tren inferior" ou "trenó inferior". Essas expressões são proibidas.

Responda APENAS com o JSON estruturado solicitado (ComparisonReport), sem texto adicional.
"""


def _build_comparison_payload(
    meta_a: ActivityMeta,
    triage_a: DeterministicTriageResult,
    meta_b: ActivityMeta,
    triage_b: DeterministicTriageResult,
    deltas: ComparisonDeltas,
) -> str:
    """Constrói o payload estruturado comparando Treino A (referência) vs Treino B (recente)."""
    ef_block = (
        f"EF Treino A: {deltas.ef_a:.2f}\n"
        f"EF Treino B: {deltas.ef_b:.2f}\n"
        f"ΔEF: {deltas.delta_ef_percent:+.2f}%"
        if (deltas.ef_a is not None and deltas.ef_b is not None and deltas.delta_ef_percent is not None)
        else "Fator de Eficiência (EF): Indisponível (ao menos um treino sem sensor cardíaco)"
    )
    hr_block = (
        f"FC Média A: {deltas.avg_hr_a} bpm vs FC Média B: {deltas.avg_hr_b} bpm (ΔFC: {deltas.delta_avg_hr_bpm:+.1f} bpm)\n"
        f"Deriva Cardíaca (1ª->2ª metade) A: {_fmt(deltas.decoupling_a_bpm, ' bpm')} | "
        f"B: {_fmt(deltas.decoupling_b_bpm, ' bpm')} (ΔDeriva: {_fmt(deltas.delta_decoupling_bpm, ' bpm')})"
        if deltas.both_have_hr and deltas.delta_avg_hr_bpm is not None
        else "Comparação Cardíaca Direta: Ao menos uma sessão foi gravada em modo cinemático (sem FC)."
    )

    return f"""
=== COMPARATIVO HEAD-TO-HEAD: TREINO A (REFERÊNCIA) vs. TREINO B (RECENTE) ===

[TREINO A — REFERÊNCIA / MAIS ANTIGO]
Título: {meta_a.name} ({meta_a.sport_type}) | Data: {meta_a.start_date}
Distância: {deltas.distance_km_a} km | Duração: {meta_a.elapsed_time_seconds}s ({meta_a.elapsed_time_seconds/60:.1f} min)
Ritmo Médio (Pace): {deltas.pace_a} ({deltas.speed_kmh_a} km/h)
Ganho de Elevação (+D): {deltas.elevation_gain_a} m
Comportamento de Split (1ª vs 2ª metade): {deltas.split_delta_pct_a:+.2f}% ({deltas.split_class_a})
Possui FC: {"Sim (" + str(deltas.avg_hr_a) + " bpm méd)" if triage_a.has_heartrate else "Não (Análise Cinemática)"}

[TREINO B — RECENTE / MAIS NOVO]
Título: {meta_b.name} ({meta_b.sport_type}) | Data: {meta_b.start_date}
Distância: {deltas.distance_km_b} km | Duração: {meta_b.elapsed_time_seconds}s ({meta_b.elapsed_time_seconds/60:.1f} min)
Ritmo Médio (Pace): {deltas.pace_b} ({deltas.speed_kmh_b} km/h)
Ganho de Elevação (+D): {deltas.elevation_gain_b} m
Comportamento de Split (1ª vs 2ª metade): {deltas.split_delta_pct_b:+.2f}% ({deltas.split_class_b})
Possui FC: {"Sim (" + str(deltas.avg_hr_b) + " bpm méd)" if triage_b.has_heartrate else "Não (Análise Cinemática)"}

[DELTAS DETERMINÍSTICOS CALCULADOS (B vs. A)]
Δ Velocidade Média: {deltas.delta_speed_kmh:+.2f} km/h ({deltas.delta_speed_percent:+.2f}%)
Δ Pace: {_fmt(deltas.delta_pace_seconds_per_km, " s/km")} (valores negativos indicam ritmo mais rápido no Treino B)
Δ Distância: {deltas.delta_distance_km:+.2f} km
Δ Elevação (+D): {deltas.delta_elevation_gain:+.1f} m
{ef_block}
{hr_block}

---
Elabore o parecer evolutivo estruturado (ComparisonReport) confrontando o Treino A e o Treino B.
""".strip()


async def run_gemini_comparison(
    meta_a: ActivityMeta,
    triage_a: DeterministicTriageResult,
    meta_b: ActivityMeta,
    triage_b: DeterministicTriageResult,
    deltas: ComparisonDeltas,
) -> ComparisonReport:
    """Chama o Gemini para gerar o ComparisonReport entre Treino A e Treino B."""
    settings = get_settings()
    if not settings.gemini_api_key:
        raise ValueError("GEMINI_API_KEY não configurada.")

    client = genai.Client(api_key=settings.gemini_api_key)
    user_message = _build_comparison_payload(meta_a, triage_a, meta_b, triage_b, deltas)

    try:
        response = await client.aio.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=user_message,
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM_PROMPT_COMPARE,
                response_mime_type="application/json",
                response_schema=ComparisonReport,
                temperature=0.3,
                max_output_tokens=2048,
            ),
        )
    except Exception as exc:
        logger.error("Falha na chamada comparativa ao Gemini: %s", exc)
        raise RuntimeError(f"Erro na integração com Gemini (Comparador): {exc}") from exc

    if hasattr(response, "parsed") and response.parsed is not None:
        return response.parsed

    raw_text = response.text
    try:
        data = json.loads(raw_text)
        return ComparisonReport(**data)
    except Exception as exc:
        logger.error("Falha ao parsear ComparisonReport do Gemini: %s\nTexto: %s", exc, raw_text)
        raise RuntimeError(f"Resposta do Gemini não pôde ser validada como ComparisonReport: {exc}") from exc

