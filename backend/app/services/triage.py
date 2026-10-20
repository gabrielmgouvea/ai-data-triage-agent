"""
PulseTriage — Filtro Determinístico de Triagem Fisiológica.

Processa a série temporal de telemetria ANTES de enviar ao Gemini.
Detecta:
  1. Ruído de sensor (saltos abruptos de FC impossíveis fisiologicamente)
  2. Picos em zona anaeróbica sustentada (>85% FCmax por janela contínua)
  3. Desacoplamento cardíaco / Cardiac Drift (FC sobe enquanto velocidade estável/cai)
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from typing import Optional

from app.models import (
    ActivityMeta,
    ComparisonDeltas,
    DeterministicTriageResult,
    IncidentType,
    KinematicMetrics,
    TelemetryPoint,
    TriageIncident,
)

# ── Parâmetros do filtro (ajustáveis) ────────────────────────────────────────

# Salto máximo de FC aceitável entre pontos consecutivos (bpm/s normalizado)
_MAX_HR_DELTA_PER_SECOND: float = 4.0          # fisiologicamente ~3-4 bpm/s máximo

# FC mínima e máxima absolutas para não ser considerado ruído de sensor
_ABS_HR_MIN: int = 40
_ABS_HR_MAX: int = 220

# Limiar anaeróbico como fração da FCmax estimada
_ANAEROBIC_THRESHOLD_FRACTION: float = 0.85

# Duração mínima para um pico ser registrado como incidente anaeróbico (segundos)
_MIN_ANAEROBIC_DURATION_S: int = 30

# Janela para análise de Cardiac Drift (em segundos) — analisa segunda metade do treino
_DRIFT_WINDOW_FRACTION: float = 0.35           # 35% final da atividade

# Desvio mínimo de velocidade para considerar "estável" no drift (m/s)
_DRIFT_VELOCITY_STABILITY_THRESHOLD: float = 0.4

# Elevação mínima de FC para confirmar drift (bpm)
_DRIFT_HR_ELEVATION_THRESHOLD: float = 6.0


@dataclass
class _AnalysisState:
    """Estado interno durante a passagem pelo filtro."""
    clean_points: list[TelemetryPoint] = field(default_factory=list)
    incidents: list[TriageIncident] = field(default_factory=list)
    noise_count: int = 0


def _format_pace(speed_ms: float) -> str:
    """Converte velocidade em m/s para ritmo formatado (min:ss /km)."""
    if speed_ms <= 0.2:
        return "--:-- /km"
    pace_s_km = 1000.0 / speed_ms
    mins = int(pace_s_km // 60)
    secs = int(pace_s_km % 60)
    return f"{mins}:{secs:02d} /km"


def _calculate_kinematics(points: list[TelemetryPoint]) -> Optional[KinematicMetrics]:
    """Calcula métricas cinemáticas determinísticas de pacing, splits e altimetria."""
    if not points:
        return None

    # Pontos em movimento (> 0.5 m/s) para ritmo e splits
    moving = [p for p in points if p.velocity_ms > 0.5]
    eval_points = moving if len(moving) >= 10 else points

    if not eval_points:
        return None

    overall_vel = statistics.mean(p.velocity_ms for p in eval_points)
    avg_pace_str = _format_pace(overall_vel)

    # Análise de Splits (1ª metade vs 2ª metade)
    half_idx = max(len(eval_points) // 2, 1)
    first_half = eval_points[:half_idx]
    second_half = eval_points[half_idx:]

    v1 = statistics.mean(p.velocity_ms for p in first_half) if first_half else overall_vel
    v2 = statistics.mean(p.velocity_ms for p in second_half) if second_half else overall_vel

    v1_kmh = round(v1 * 3.6, 2)
    v2_kmh = round(v2 * 3.6, 2)

    delta_pct = round(((v2 - v1) / v1 * 100), 2) if v1 > 0 else 0.0

    if delta_pct > 2.0:
        split_class = "split_negativo"
    elif delta_pct < -2.0:
        split_class = "decaimento_ritmo"
    else:
        split_class = "split_uniforme"

    # Desnível acumulado (+D) e variação em subida vs plano
    elev_gain = 0.0
    uphill_vels: list[float] = []
    flat_vels: list[float] = []

    for i in range(1, len(points)):
        p_prev = points[i - 1]
        p_curr = points[i]

        if p_curr.altitude_m is not None and p_prev.altitude_m is not None:
            d_alt = p_curr.altitude_m - p_prev.altitude_m
            if d_alt > 0:
                elev_gain += d_alt

            dt = max(p_curr.time_s - p_prev.time_s, 1)
            dist = p_curr.velocity_ms * dt
            if dist > 5.0 and p_curr.velocity_ms > 0.5:
                grade = (d_alt / dist) * 100.0
                if grade >= 2.5:
                    uphill_vels.append(p_curr.velocity_ms)
                elif abs(grade) <= 1.5:
                    flat_vels.append(p_curr.velocity_ms)

    uphill_pace = _format_pace(statistics.mean(uphill_vels)) if len(uphill_vels) >= 3 else None
    flat_pace = _format_pace(statistics.mean(flat_vels)) if len(flat_vels) >= 3 else None

    grade_impact: Optional[float] = None
    if uphill_vels and flat_vels and len(uphill_vels) >= 3 and len(flat_vels) >= 3:
        avg_uphill_v = statistics.mean(uphill_vels)
        avg_flat_v = statistics.mean(flat_vels)
        if avg_flat_v > 0:
            grade_impact = round(((avg_flat_v - avg_uphill_v) / avg_flat_v) * 100, 1)

    return KinematicMetrics(
        average_pace_min_km=avg_pace_str,
        split_first_half_avg_speed_kmh=v1_kmh,
        split_second_half_avg_speed_kmh=v2_kmh,
        split_pace_delta_percent=delta_pct,
        split_classification=split_class,
        elevation_gain_meters=round(elev_gain, 1),
        uphill_avg_pace_min_km=uphill_pace,
        flat_avg_pace_min_km=flat_pace,
        grade_pace_impact_percent=grade_impact,
    )


def run_deterministic_triage(
    telemetry: list[TelemetryPoint],
    max_hr_estimated: int = 190,
    activity_type: str = "auto",
) -> DeterministicTriageResult:
    """
    Executa o pipeline de triagem determinística sobre a telemetria bruta.

    Args:
        telemetry: Lista ordenada de TelemetryPoint.
        max_hr_estimated: FCmax estimada do atleta (usada para calcular zonas).
        activity_type: 'run', 'weight_training' ou 'auto'

    Returns:
        DeterministicTriageResult com incidentes, flags e métricas resumidas.
    """
    if not telemetry:
        raise ValueError("Telemetria vazia — não é possível executar a triagem.")

    has_hr = any(p.heartrate_bpm is not None and p.heartrate_bpm > 0 for p in telemetry)

    # ── Modo sem monitor cardíaco (Análise Cinemática & Pacing) ────────────────
    if not has_hr:
        kinematics = _calculate_kinematics(telemetry)
        avg_vel = statistics.mean(p.velocity_ms for p in telemetry)
        detected_type = "run"
        if activity_type == "weight_training" or (activity_type == "auto" and avg_vel < 0.2):
            detected_type = "weight_training"

        return DeterministicTriageResult(
            total_points_analyzed=len(telemetry),
            noise_points_removed=0,
            incidents=[],
            has_heartrate=False,
            cardiac_drift_detected=False,
            drift_delta_bpm=None,
            max_valid_heartrate_bpm=None,
            avg_valid_heartrate_bpm=None,
            time_in_anaerobic_zone_seconds=0,
            activity_type_detected=detected_type,
            strength_sets_detected=None,
            strength_avg_rest_seconds=None,
            kinematics=kinematics,
        )

    # ── Modo com monitor cardíaco ─────────────────────────────────────────────
    state = _AnalysisState()

    # Passo 1: Limpeza de ruído de sensor
    _filter_sensor_noise(telemetry, state)

    clean = state.clean_points
    if len(clean) < 5:
        raise ValueError("Pontos válidos insuficientes após filtragem de ruído.")

    # Passo 2: Detecção de picos anaeróbicos sustentados
    anaerobic_threshold_bpm = int(max_hr_estimated * _ANAEROBIC_THRESHOLD_FRACTION)
    time_in_anaerobic = _detect_anaerobic_spikes(clean, anaerobic_threshold_bpm, state)

    # Métricas agregadas iniciais
    valid_hrs = [p.heartrate_bpm for p in clean if p.heartrate_bpm is not None]
    avg_hr = round(statistics.mean(valid_hrs), 1) if valid_hrs else None
    max_hr = max(valid_hrs) if valid_hrs else None
    avg_velocity_overall = statistics.mean(p.velocity_ms for p in clean)

    # Auto-detecção de modalidade
    detected_type = activity_type
    if detected_type == "auto":
        hr_std = statistics.stdev(valid_hrs) if len(valid_hrs) > 1 else 0
        if avg_velocity_overall < 0.5 and hr_std > 10:
            detected_type = "weight_training"
        else:
            detected_type = "run"

    # Passo 3: Métricas Específicas
    drift_detected = False
    drift_delta = None
    strength_sets = None
    strength_avg_rest = None

    if detected_type == "weight_training":
        sets_count = 0
        rests = []
        in_set = False
        last_set_end = None
        set_threshold = max(110, (avg_hr or 120) * 1.1)

        for p in clean:
            if p.heartrate_bpm is not None and p.heartrate_bpm >= set_threshold:
                if not in_set:
                    in_set = True
                    sets_count += 1
                    if last_set_end is not None:
                        rest_time = p.time_s - last_set_end
                        if rest_time > 15:
                            rests.append(rest_time)
            else:
                if in_set:
                    in_set = False
                    last_set_end = p.time_s

        strength_sets = sets_count
        if rests:
            strength_avg_rest = int(statistics.mean(rests))
    else:
        drift_detected, drift_delta = _detect_cardiac_drift(clean, state)

    kinematics = _calculate_kinematics(clean)

    return DeterministicTriageResult(
        total_points_analyzed=len(telemetry),
        noise_points_removed=state.noise_count,
        incidents=state.incidents,
        has_heartrate=True,
        cardiac_drift_detected=drift_detected,
        drift_delta_bpm=round(drift_delta, 1) if drift_delta is not None else None,
        max_valid_heartrate_bpm=max_hr,
        avg_valid_heartrate_bpm=avg_hr,
        time_in_anaerobic_zone_seconds=time_in_anaerobic,
        activity_type_detected=detected_type,
        strength_sets_detected=strength_sets,
        strength_avg_rest_seconds=strength_avg_rest,
        kinematics=kinematics,
    )


# ── Funções auxiliares ────────────────────────────────────────────────────────


def _filter_sensor_noise(
    telemetry: list[TelemetryPoint],
    state: _AnalysisState,
) -> None:
    """
    Remove leituras espúrias de sensor baseando-se em:
    - FC fora dos limites absolutos fisiológicos
    - Salto brusco de FC incompatível com a fisiologia cardíaca humana
    """
    prev: Optional[TelemetryPoint] = None
    noise_intervals: list[tuple[int, int]] = []   # (time_start, time_end)

    for point in telemetry:
        is_noise = False

        # Limites absolutos ou ausência de leitura
        if point.heartrate_bpm is None or not (_ABS_HR_MIN <= point.heartrate_bpm <= _ABS_HR_MAX):
            is_noise = True

        # Salto abrupto vs. ponto anterior
        if prev is not None and not is_noise:
            if prev.heartrate_bpm is not None and point.heartrate_bpm is not None:
                dt = max(point.time_s - prev.time_s, 1)           # evitar divisão por zero
                delta_per_s = abs(point.heartrate_bpm - prev.heartrate_bpm) / dt
                if delta_per_s > _MAX_HR_DELTA_PER_SECOND:
                    is_noise = True

        if is_noise:
            state.noise_count += 1
            noise_intervals.append((point.time_s, point.time_s))
        else:
            state.clean_points.append(point)
            prev = point

    # Consolidar intervalos de ruído em incidentes
    if noise_intervals:
        merged = _merge_intervals(noise_intervals)
        for start, end in merged:
            state.incidents.append(
                TriageIncident(
                    incident_type=IncidentType.SENSOR_NOISE,
                    time_start_s=start,
                    time_end_s=end,
                    description=(
                        f"Leitura espúria de FC detectada entre {start}s e {end}s. "
                        "Salto ou valor fora dos limites fisiológicos — provável "
                        "falha de contato do sensor óptico ou pico de artefato."
                    ),
                )
            )


def _detect_anaerobic_spikes(
    clean: list[TelemetryPoint],
    anaerobic_threshold_bpm: int,
    state: _AnalysisState,
) -> int:
    """
    Identifica janelas contínuas de FC acima do limiar anaeróbico.
    Registra incidentes apenas para janelas ≥ _MIN_ANAEROBIC_DURATION_S.
    Retorna o tempo total (segundos) em zona anaeróbica.
    """
    total_anaerobic_s = 0
    in_spike = False
    spike_start: Optional[TelemetryPoint] = None
    spike_points: list[TelemetryPoint] = []

    def _flush_spike(end_point: TelemetryPoint) -> None:
        nonlocal in_spike, spike_start, spike_points
        if spike_start is None or not spike_points:
            return
        duration = end_point.time_s - spike_start.time_s
        avg_vel = round(statistics.mean(p.velocity_ms for p in spike_points), 2)
        peak_hr = max(p.heartrate_bpm for p in spike_points if p.heartrate_bpm is not None)

        if duration >= _MIN_ANAEROBIC_DURATION_S:
            incident_type = (
                IncidentType.SUSTAINED_TACHYCARDIA
                if peak_hr >= int(anaerobic_threshold_bpm * 1.05)
                else IncidentType.ANAEROBIC_SPIKE
            )
            state.incidents.append(
                TriageIncident(
                    incident_type=incident_type,
                    time_start_s=spike_start.time_s,
                    time_end_s=end_point.time_s,
                    description=(
                        f"FC sustentada acima do limiar anaeróbico ({anaerobic_threshold_bpm} bpm) "
                        f"por {duration}s. Pico: {peak_hr} bpm. "
                        f"Velocidade média no período: {avg_vel} m/s."
                    ),
                    peak_heartrate_bpm=peak_hr,
                    delta_heartrate_bpm=peak_hr - anaerobic_threshold_bpm,
                    avg_velocity_ms=avg_vel,
                )
            )
        in_spike = False
        spike_start = None
        spike_points = []

    for i, point in enumerate(clean):
        above_threshold = point.heartrate_bpm is not None and point.heartrate_bpm >= anaerobic_threshold_bpm

        if above_threshold:
            if not in_spike:
                in_spike = True
                spike_start = point
                spike_points = [point]
            else:
                spike_points.append(point)

            # Acumula tempo (intervalo até próximo ponto ou 10s como default)
            if i + 1 < len(clean):
                total_anaerobic_s += clean[i + 1].time_s - point.time_s
            else:
                total_anaerobic_s += 10
        else:
            if in_spike:
                _flush_spike(point)

    # Fechar spike aberto no final
    if in_spike and spike_points:
        _flush_spike(spike_points[-1])

    return total_anaerobic_s


def _detect_cardiac_drift(
    clean: list[TelemetryPoint],
    state: _AnalysisState,
) -> tuple[bool, Optional[float]]:
    """
    Detecta Cardiac Drift: FC cresce progressivamente enquanto
    a velocidade permanece estável ou em declínio — sinal de fadiga
    cardiovascular e possível desidratação/sobrecarga.

    Analisa a fração final (_DRIFT_WINDOW_FRACTION) da atividade,
    excluindo o warm-up e o cool-down final (velocidade próxima de zero).
    """
    # Filtrar pontos com velocidade acima de 1 m/s e FC válida (excluir paradas/cooldown)
    moving = [p for p in clean if p.velocity_ms > 1.0 and p.heartrate_bpm is not None]
    if len(moving) < 10:
        return False, None

    # Considerar apenas a janela central-final
    window_size = max(int(len(moving) * _DRIFT_WINDOW_FRACTION), 6)
    mid_start = len(moving) // 2
    window = moving[mid_start: mid_start + window_size]

    if len(window) < 6:
        return False, None

    # Dividir janela em duas metades e comparar médias
    half = len(window) // 2
    first_half = window[:half]
    second_half = window[half:]

    avg_hr_first = statistics.mean(p.heartrate_bpm for p in first_half)
    avg_hr_second = statistics.mean(p.heartrate_bpm for p in second_half)

    avg_vel_first = statistics.mean(p.velocity_ms for p in first_half)
    avg_vel_second = statistics.mean(p.velocity_ms for p in second_half)

    hr_delta = avg_hr_second - avg_hr_first
    vel_delta = avg_vel_second - avg_vel_first

    # Drift confirmado: FC subiu e velocidade ficou estável ou caiu
    velocity_stable_or_falling = vel_delta <= _DRIFT_VELOCITY_STABILITY_THRESHOLD
    hr_elevated = hr_delta >= _DRIFT_HR_ELEVATION_THRESHOLD

    if velocity_stable_or_falling and hr_elevated:
        state.incidents.append(
            TriageIncident(
                incident_type=IncidentType.CARDIAC_DRIFT,
                time_start_s=first_half[0].time_s,
                time_end_s=second_half[-1].time_s,
                description=(
                    f"Cardiac Drift detectado: FC subiu +{hr_delta:.1f} bpm "
                    f"enquanto velocidade variou {vel_delta:+.2f} m/s no mesmo período. "
                    "Indica fadiga cardiovascular progressiva — possível desidratação "
                    "ou depleção de glicogênio."
                ),
                delta_heartrate_bpm=int(hr_delta),
                avg_velocity_ms=round(avg_vel_second, 2),
            )
        )
        return True, hr_delta

    return False, None


def _merge_intervals(intervals: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Consolida intervalos sobrepostos ou adjacentes."""
    if not intervals:
        return []
    sorted_ivs = sorted(intervals)
    merged = [sorted_ivs[0]]
    for start, end in sorted_ivs[1:]:
        if start <= merged[-1][1] + 5:          # margem de 5s
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def _calc_hr_decoupling(points: list[TelemetryPoint]) -> Optional[float]:
    """
    Calcula o descolamento cardíaco (bpm) entre a 1ª e a 2ª metade dos pontos válidos.
    Retorna avg_hr_2nd_half - avg_hr_1st_half.
    """
    valid = [p for p in points if p.heartrate_bpm is not None and _ABS_HR_MIN <= p.heartrate_bpm <= _ABS_HR_MAX]
    if len(valid) < 6:
        return None
    half = len(valid) // 2
    first_h = valid[:half]
    second_h = valid[half:]
    if not first_h or not second_h:
        return None
    hr1 = statistics.mean(p.heartrate_bpm for p in first_h if p.heartrate_bpm is not None)
    hr2 = statistics.mean(p.heartrate_bpm for p in second_h if p.heartrate_bpm is not None)
    return round(hr2 - hr1, 1)


def compute_comparison_deltas(
    meta_a: ActivityMeta,
    triage_a: DeterministicTriageResult,
    points_a: list[TelemetryPoint],
    meta_b: ActivityMeta,
    triage_b: DeterministicTriageResult,
    points_b: list[TelemetryPoint],
) -> ComparisonDeltas:
    """
    Calcula as métricas determinísticas comparativas (Treino B recente vs. Treino A referência).
    """
    moving_a = [p for p in points_a if p.velocity_ms > 0.4] or points_a
    moving_b = [p for p in points_b if p.velocity_ms > 0.4] or points_b

    vel_ms_a = statistics.mean(p.velocity_ms for p in moving_a) if moving_a else 0.0
    vel_ms_b = statistics.mean(p.velocity_ms for p in moving_b) if moving_b else 0.0

    speed_kmh_a = round(vel_ms_a * 3.6, 2)
    speed_kmh_b = round(vel_ms_b * 3.6, 2)
    delta_speed_kmh = round(speed_kmh_b - speed_kmh_a, 2)
    delta_speed_pct = round(((speed_kmh_b - speed_kmh_a) / speed_kmh_a) * 100.0, 2) if speed_kmh_a > 0 else 0.0

    pace_a = triage_a.kinematics.average_pace_min_km if triage_a.kinematics else _format_pace(vel_ms_a)
    pace_b = triage_b.kinematics.average_pace_min_km if triage_b.kinematics else _format_pace(vel_ms_b)

    delta_pace_s: Optional[float] = None
    if vel_ms_a > 0.3 and vel_ms_b > 0.3:
        pace_s_a = 1000.0 / vel_ms_a
        pace_s_b = 1000.0 / vel_ms_b
        delta_pace_s = round(pace_s_b - pace_s_a, 1)  # Negativo = mais rápido no Treino B

    both_have_hr = bool(triage_a.has_heartrate and triage_b.has_heartrate)
    avg_hr_a = triage_a.avg_valid_heartrate_bpm
    avg_hr_b = triage_b.avg_valid_heartrate_bpm
    delta_avg_hr = (
        round(avg_hr_b - avg_hr_a, 1)
        if (avg_hr_a is not None and avg_hr_b is not None)
        else None
    )

    ef_a: Optional[float] = None
    ef_b: Optional[float] = None
    delta_ef_pct: Optional[float] = None
    if both_have_hr and avg_hr_a and avg_hr_b and avg_hr_a > 0 and avg_hr_b > 0:
        raw_ef_a = (vel_ms_a / avg_hr_a) * 100.0
        raw_ef_b = (vel_ms_b / avg_hr_b) * 100.0
        ef_a = round(raw_ef_a, 2)
        ef_b = round(raw_ef_b, 2)
        if raw_ef_a > 0:
            delta_ef_pct = round(((raw_ef_b - raw_ef_a) / raw_ef_a) * 100.0, 2)

    decoupling_a = _calc_hr_decoupling(points_a) if triage_a.has_heartrate else None
    decoupling_b = _calc_hr_decoupling(points_b) if triage_b.has_heartrate else None
    delta_decoupling = (
        round(decoupling_b - decoupling_a, 1)
        if (decoupling_a is not None and decoupling_b is not None)
        else None
    )

    split_delta_a = triage_a.kinematics.split_pace_delta_percent if triage_a.kinematics else 0.0
    split_delta_b = triage_b.kinematics.split_pace_delta_percent if triage_b.kinematics else 0.0
    split_class_a = triage_a.kinematics.split_classification if triage_a.kinematics else "split_uniforme"
    split_class_b = triage_b.kinematics.split_classification if triage_b.kinematics else "split_uniforme"

    elev_a = triage_a.kinematics.elevation_gain_meters if triage_a.kinematics else 0.0
    elev_b = triage_b.kinematics.elevation_gain_meters if triage_b.kinematics else 0.0
    delta_elev = round(elev_b - elev_a, 1)

    dist_km_a = round(meta_a.distance_meters / 1000.0, 2)
    dist_km_b = round(meta_b.distance_meters / 1000.0, 2)
    delta_dist_km = round(dist_km_b - dist_km_a, 2)

    same_sport = (meta_a.sport_type.lower() == meta_b.sport_type.lower()) or (
        triage_a.activity_type_detected == triage_b.activity_type_detected
    )

    return ComparisonDeltas(
        speed_kmh_a=speed_kmh_a,
        speed_kmh_b=speed_kmh_b,
        delta_speed_kmh=delta_speed_kmh,
        delta_speed_percent=delta_speed_pct,
        pace_a=pace_a,
        pace_b=pace_b,
        delta_pace_seconds_per_km=delta_pace_s,
        ef_a=ef_a,
        ef_b=ef_b,
        delta_ef_percent=delta_ef_pct,
        avg_hr_a=avg_hr_a,
        avg_hr_b=avg_hr_b,
        delta_avg_hr_bpm=delta_avg_hr,
        decoupling_a_bpm=decoupling_a,
        decoupling_b_bpm=decoupling_b,
        delta_decoupling_bpm=delta_decoupling,
        split_delta_pct_a=split_delta_a,
        split_delta_pct_b=split_delta_b,
        split_class_a=split_class_a,
        split_class_b=split_class_b,
        elevation_gain_a=elev_a,
        elevation_gain_b=elev_b,
        delta_elevation_gain=delta_elev,
        distance_km_a=dist_km_a,
        distance_km_b=dist_km_b,
        delta_distance_km=delta_dist_km,
        both_have_hr=both_have_hr,
        same_sport_type=same_sport,
    )

