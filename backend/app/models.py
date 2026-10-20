"""
PulseTriage — Modelos Pydantic v2 de domínio (Fase 1 + Fase 2).
"""
from __future__ import annotations

from enum import Enum
from typing import Optional, Literal
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------


class TelemetryPoint(BaseModel):
    """Um ponto de telemetria num instante de tempo."""

    time_s: int = Field(..., description="Tempo desde o início da atividade, em segundos.")
    heartrate_bpm: Optional[int] = Field(None, ge=30, le=250, description="Frequência cardíaca (bpm) — opcional.")
    velocity_ms: float = Field(..., ge=0.0, description="Velocidade em metros por segundo.")
    altitude_m: float = Field(..., description="Altitude em metros acima do nível do mar.")
    cadence_rpm: Optional[int] = Field(None, ge=0, description="Cadência (rpm, padrão Strava) — opcional.")
    watts: Optional[int] = Field(None, ge=0, description="Potência instantânea (W) — opcional.")


# ---------------------------------------------------------------------------
# Sleep / Readiness Context
# ---------------------------------------------------------------------------


class SleepContext(BaseModel):
    """Contexto de sono e prontidão fisiológica do atleta."""

    recorded_at: str = Field(..., description="Timestamp ISO-8601 do registro.")
    source: str = Field(..., description="Fonte dos dados (ex: wearable_mock, strava_user).")

    total_sleep_hours: float = Field(..., ge=0.0, le=24.0, description="Total de horas dormidas.")
    # Fases do sono só existem quando há wearable; no check-in manual (Strava) ficam ausentes.
    deep_sleep_hours: Optional[float] = Field(None, ge=0.0, le=12.0, description="Horas em sono profundo.")
    rem_sleep_hours: Optional[float] = Field(None, ge=0.0, le=12.0, description="Horas em sono REM.")
    light_sleep_hours: Optional[float] = Field(None, ge=0.0, le=12.0, description="Horas em sono leve.")
    sleep_efficiency_percent: Optional[float] = Field(None, ge=0.0, le=100.0, description="Eficiência do sono (%).")

    resting_heart_rate_bpm: Optional[int] = Field(None, ge=20, le=120, description="FC em repouso (bpm).")
    hrv_rmssd_ms: Optional[float] = Field(None, ge=0.0, description="HRV RMSSD em ms (variabilidade cardíaca).")
    body_temperature_delta_celsius: Optional[float] = Field(
        None, description="Desvio de temperatura corporal vs. linha base (°C)."
    )

    subjective_quality_1_to_5: Optional[int] = Field(
        None, ge=1, le=5, description="Qualidade subjetiva do sono (1=péssima, 5=ótima)."
    )
    subjective_fatigue_1_to_5: Optional[int] = Field(
        None, ge=1, le=5, description="Fadiga percebida ao acordar (1=descansado, 5=exausto)."
    )
    notes: Optional[str] = Field(None, description="Notas livres sobre o sono.")


# ---------------------------------------------------------------------------
# Activity Meta
# ---------------------------------------------------------------------------


class ActivityMeta(BaseModel):
    """Metadados gerais da atividade esportiva."""

    id: str
    name: str
    type: str
    sport_type: str
    start_date: str
    elapsed_time_seconds: int
    distance_meters: float
    average_heartrate: Optional[float] = None
    max_heartrate: Optional[int] = None
    average_speed: float
    total_elevation_gain: float
    athlete_name: str
    athlete_age: int
    athlete_max_hr_estimated: int
    has_heartrate: bool = True


# ---------------------------------------------------------------------------
# Demo Response (Fase 1)
# ---------------------------------------------------------------------------


class DemoActivityResponse(BaseModel):
    """Resposta completa da rota GET /api/v1/demo."""

    activity_meta: ActivityMeta
    sleep_context: SleepContext
    telemetry: list[TelemetryPoint]


# ---------------------------------------------------------------------------
# Triage — Filtro Determinístico (Fase 2)
# ---------------------------------------------------------------------------


class IncidentType(str, Enum):
    """Categoria de incidente identificado pelo filtro determinístico."""
    SENSOR_NOISE = "sensor_noise"
    ANAEROBIC_SPIKE = "anaerobic_spike"
    CARDIAC_DRIFT = "cardiac_drift"
    SUSTAINED_TACHYCARDIA = "sustained_tachycardia"


class TriageIncident(BaseModel):
    """Registro de uma anomalia detectada pelo filtro determinístico."""

    incident_type: IncidentType = Field(..., description="Tipo de incidente detectado.")
    time_start_s: int = Field(..., description="Início do incidente (segundos).")
    time_end_s: int = Field(..., description="Fim do incidente (segundos).")
    description: str = Field(..., description="Descrição técnica do incidente.")
    peak_heartrate_bpm: Optional[int] = Field(None, description="FC máxima observada no período.")
    delta_heartrate_bpm: Optional[int] = Field(None, description="Variação de FC no período (bpm).")
    avg_velocity_ms: Optional[float] = Field(None, description="Velocidade média no período (m/s).")


class KinematicMetrics(BaseModel):
    """Métricas cinemáticas e de carga externa calculadas determinísticamente."""

    average_pace_min_km: str = Field(..., description="Pace médio formatado (ex: '5:24 /km').")
    split_first_half_avg_speed_kmh: float = Field(..., description="Velocidade média na 1ª metade (km/h).")
    split_second_half_avg_speed_kmh: float = Field(..., description="Velocidade média na 2ª metade (km/h).")
    split_pace_delta_percent: float = Field(..., description="Variação percentual de velocidade/ritmo entre as metades.")
    split_classification: Literal["split_negativo", "split_uniforme", "decaimento_ritmo"] = Field(
        ..., description="Classificação do split: split_negativo, split_uniforme ou decaimento_ritmo."
    )
    elevation_gain_meters: float = Field(..., description="Desnível acumulado (+D em metros).")
    uphill_avg_pace_min_km: Optional[str] = Field(None, description="Ritmo médio em subidas.")
    flat_avg_pace_min_km: Optional[str] = Field(None, description="Ritmo médio no plano.")
    grade_pace_impact_percent: Optional[float] = Field(None, description="Variação percentual de ritmo subida vs plano.")


class DeterministicTriageResult(BaseModel):
    """Saída completa do filtro determinístico antes da análise Gemini."""

    total_points_analyzed: int
    noise_points_removed: int
    incidents: list[TriageIncident]
    has_heartrate: bool = True
    cardiac_drift_detected: bool = Field(
        False, description="True se houver desacoplamento FC-velocidade progressivo."
    )
    drift_delta_bpm: Optional[float] = Field(
        None, description="Variação de FC (bpm) durante janela de drift com velocidade estável."
    )
    max_valid_heartrate_bpm: Optional[int] = None
    avg_valid_heartrate_bpm: Optional[float] = None
    time_in_anaerobic_zone_seconds: int = Field(
        0, description="Tempo total estimado em zona anaeróbica (>85% FCmax)."
    )
    
    # Novos campos para musculação
    activity_type_detected: Literal["run", "weight_training"] = "run"
    strength_sets_detected: Optional[int] = None
    strength_avg_rest_seconds: Optional[int] = None

    # Métricas cinemáticas
    kinematics: Optional[KinematicMetrics] = None


# ---------------------------------------------------------------------------
# AI Report — Structured Output Gemini (Fase 2)
# ---------------------------------------------------------------------------


class Severity(str, Enum):
    """Nível de severidade do diagnóstico fisiológico."""
    BAIXA = "Baixa"
    MEDIA = "Media"
    ALTA = "Alta"
    CRITICA = "Critica"


class IncidentReport(BaseModel):
    """
    Relatório estruturado gerado pelo agente de IA (Gemini).
    Schema usado como Structured Output — todos os campos são obrigatórios.
    """

    severity: Severity = Field(
        ..., description="Severidade geral do esforço: Baixa, Media, Alta ou Critica."
    )
    physiological_summary: str = Field(
        ...,
        description=(
            "Resumo técnico do estado fisiológico do atleta durante o treino, "
            "integrando dados de FC, velocidade e altitude."
        ),
    )
    cardiac_drift_detected: bool = Field(
        ..., description="True se desacoplamento cardíaco progressivo foi confirmado."
    )
    anaerobic_overload_detected: bool = Field(
        ..., description="True se o tempo em zona anaeróbica indica sobrecarga."
    )
    correlation_with_sleep: str = Field(
        ...,
        description=(
            "Análise clínica direta cruzando as horas dormidas, qualidade do repouso e "
            "percepção de cansaço informadas com a telemetria do treino (FC, sustentação de "
            "ritmo ou volume na musculação), avaliando se o rendimento bate com a prontidão relatada. "
            "Proibido incluir avisos sobre falta de dispositivos vestíveis ou sensores biométricos."
        ),
    )
    fatigue_risk_score: int = Field(
        ..., ge=0, le=100,
        description="Score de 0 a 100 indicando risco de fadiga acumulada. ≥70 = alto risco.",
    )
    recovery_recommendation: str = Field(
        ...,
        description=(
            "Recomendações práticas de recuperação para as próximas 24–48h, "
            "baseadas na carga do treino e no contexto de sono."
        ),
    )
    next_training_guidance: str = Field(
        ...,
        description="Orientação sobre intensidade e tipo do próximo treino recomendado.",
    )
    training_benefit: str = Field(
        ...,
        description=(
            "Insight conciso sobre a adaptação fisiológica positiva gerada pela sessão. "
            "Para corrida: ganho aeróbico, VO2 Máx, limiar de lactato. "
            "Para musculação: recrutamento motor, estímulo hipertrófico, densidade óssea. "
            "Seja específico e motivador. Máximo 2 frases."
        ),
    )


# ---------------------------------------------------------------------------
# Analyze — Request / Response (Fase 2)
# ---------------------------------------------------------------------------


class AnalyzeRequest(BaseModel):
    """Payload da rota POST /api/v1/analyze."""

    activity_meta: ActivityMeta
    sleep_context: Optional[SleepContext] = None
    telemetry: list[TelemetryPoint] = Field(..., min_length=10)
    activity_type: Literal["run", "weight_training", "auto"] = "auto"
    force_refresh: bool = Field(False, description="Se True, ignora o cache local e refaz o diagnóstico com IA.")


class AnalyzeResponse(BaseModel):
    """Resposta completa da rota POST /api/v1/analyze."""

    triage: DeterministicTriageResult
    report: IncidentReport
    from_cache: bool = Field(False, description="Indica se o diagnóstico veio do banco local SQLite.")
    cached_at: Optional[str] = Field(None, description="Data/hora ISO em que o diagnóstico foi salvo no cache.")


# ---------------------------------------------------------------------------
# Strava — OAuth 2.0 & Ingestão (Fase 5)
# ---------------------------------------------------------------------------


class StravaAuthUrlResponse(BaseModel):
    """URL de autorização + state anti-CSRF (validado pelo frontend no callback)."""

    url: str
    state: str


class StravaTokenExchangeRequest(BaseModel):
    code: str = Field(..., min_length=1, description="Código de autorização recebido no callback.")


class StravaRefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1)


class StravaAthlete(BaseModel):
    id: int
    firstname: Optional[str] = None
    lastname: Optional[str] = None
    profile: Optional[str] = Field(None, description="URL do avatar.")
    city: Optional[str] = None


class StravaTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_at: int = Field(..., description="Epoch (s) de expiração do access_token.")
    athlete: Optional[StravaAthlete] = None


class StravaActivitySummary(BaseModel):
    """Item da lista de treinos recentes (seletor de atividades)."""

    id: int
    name: str
    sport_type: str
    type: str
    start_date_local: str
    distance: float = Field(0.0, description="Distância em metros.")
    moving_time: int = Field(0, description="Tempo em movimento (s).")
    has_heartrate: bool = False
    average_heartrate: Optional[float] = None
    max_heartrate: Optional[float] = None


class StravaActivityResponse(BaseModel):
    """Atividade real do Strava normalizada para a estrutura interna do PulseTriage."""

    activity_meta: ActivityMeta
    telemetry: list[TelemetryPoint]
    suggested_activity_type: Literal["run", "weight_training", "auto"]
    available_streams: list[str]
    dropped_points: int = Field(0, description="Pontos descartados (FC ausente/inválida).")
    downsampled: bool = False
    has_heartrate: bool = True
    from_cache: bool = False


# ---------------------------------------------------------------------------
# Comparador de Treinos (Head-to-Head: Treino A vs. Treino B)
# ---------------------------------------------------------------------------


class CompareRequest(BaseModel):
    """Payload de entrada para POST /api/strava/compare."""

    activity_id_a: int | str = Field(..., description="ID do Treino A (referência / mais antigo).")
    activity_id_b: int | str = Field(..., description="ID do Treino B (recente / mais novo).")
    athlete_age: int = Field(30, ge=10, le=100, description="Idade do atleta para ajuste de zonas.")
    force_refresh: bool = Field(False, description="Se True, ignora o cache local e refaz o comparativo com IA.")


class ComparisonDeltas(BaseModel):
    """Métricas determinísticas comparativas (Deltas: Treino B vs. Treino A)."""

    speed_kmh_a: float
    speed_kmh_b: float
    delta_speed_kmh: float
    delta_speed_percent: float
    pace_a: str
    pace_b: str
    delta_pace_seconds_per_km: Optional[float] = None
    ef_a: Optional[float] = Field(None, description="Fator de Eficiência A padronizado: round((Velocidade m/s / FC Média bpm) * 100, 2).")
    ef_b: Optional[float] = Field(None, description="Fator de Eficiência B padronizado: round((Velocidade m/s / FC Média bpm) * 100, 2).")
    delta_ef_percent: Optional[float] = Field(None, description="Variação percentual do Fator de Eficiência (%).")
    avg_hr_a: Optional[float] = None
    avg_hr_b: Optional[float] = None
    delta_avg_hr_bpm: Optional[float] = None
    decoupling_a_bpm: Optional[float] = Field(None, description="Descolamento cardíaco 1ª vs 2ª metade no Treino A (bpm).")
    decoupling_b_bpm: Optional[float] = Field(None, description="Descolamento cardíaco 1ª vs 2ª metade no Treino B (bpm).")
    delta_decoupling_bpm: Optional[float] = Field(None, description="Diferença de deriva cardíaca (B - A em bpm).")
    split_delta_pct_a: float
    split_delta_pct_b: float
    split_class_a: str
    split_class_b: str
    elevation_gain_a: float
    elevation_gain_b: float
    delta_elevation_gain: float
    distance_km_a: float
    distance_km_b: float
    delta_distance_km: float
    both_have_hr: bool = True
    same_sport_type: bool = True


class ComparisonReport(BaseModel):
    """Parecer comparativo estruturado gerado pelo Gemini (Structured Output)."""

    headline_badge: str = Field(
        ...,
        description="Rótulo conciso do veredito (ex: 'Evolução Aeróbica Confirmada', 'Pacing Mais Eficiente', 'Maior Exigência Altimétrica').",
    )
    evolution_score: int = Field(
        ...,
        ge=-100,
        le=100,
        description="Score de -100 a +100 indicando direção e magnitude da evolução (+ = evolução positiva).",
    )
    adaptation_verdict: str = Field(
        ...,
        description="Veredito da Adaptação: avalia se os ganhos foram fisiológicos/condicionamento crônico, melhor gestão de ritmo ou diferença de terreno.",
    )
    pacing_and_energy_analysis: str = Field(
        ...,
        description="Eficiência de Pacing e Distribuição de Energia: compara a estratégia de ritmo (1ª vs 2ª metade) e resposta ao relevo.",
    )
    cardiovascular_or_mechanical_efficiency: str = Field(
        ...,
        description="Avaliação do Fator de Eficiência (EF) e deriva cardíaca (se ambos tiverem FC) ou sustentação mecânica e consistência cinemática.",
    )
    next_block_guidance: str = Field(
        ...,
        description="Diretriz prática e objetiva para os próximos blocos de treino com base na evolução observada.",
    )


class CompareResponse(BaseModel):
    """Resposta completa do comparador Head-to-Head."""

    activity_a: StravaActivityResponse
    activity_b: StravaActivityResponse
    triage_a: DeterministicTriageResult
    triage_b: DeterministicTriageResult
    deltas: ComparisonDeltas
    report: ComparisonReport
    from_cache: bool = Field(False, description="Indica se o comparativo veio do banco local SQLite.")
    cached_at: Optional[str] = Field(None, description="Data/hora ISO em que o comparativo foi salvo no cache.")


