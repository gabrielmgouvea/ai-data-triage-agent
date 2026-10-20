/**
 * PulseTriage — Tipos TypeScript espelhando os schemas Pydantic do backend.
 */

// ── Telemetria ──────────────────────────────────────────────────────────────

export interface TelemetryPoint {
  time_s: number;
  heartrate_bpm?: number | null;
  velocity_ms: number;
  altitude_m: number;
  cadence_rpm?: number | null;
  watts?: number | null;
}

// ── Sleep Context ────────────────────────────────────────────────────────────

export interface SleepContext {
  recorded_at: string;
  source: string;
  total_sleep_hours: number;
  // Fases do sono: só presentes com wearable (ausentes no check-in manual do Strava)
  deep_sleep_hours?: number | null;
  rem_sleep_hours?: number | null;
  light_sleep_hours?: number | null;
  sleep_efficiency_percent?: number | null;
  resting_heart_rate_bpm?: number;
  hrv_rmssd_ms?: number;
  body_temperature_delta_celsius?: number;
  subjective_quality_1_to_5?: number;
  subjective_fatigue_1_to_5?: number;
  notes?: string;
}

// ── Activity Meta ────────────────────────────────────────────────────────────

export interface ActivityMeta {
  id: string;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  elapsed_time_seconds: number;
  distance_meters: number;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  has_heartrate?: boolean;
  average_speed: number;
  total_elevation_gain: number;
  athlete_name: string;
  athlete_age: number;
  athlete_max_hr_estimated: number;
}

// ── Demo Response ────────────────────────────────────────────────────────────

export interface DemoActivityResponse {
  activity_meta: ActivityMeta;
  sleep_context: SleepContext;
  telemetry: TelemetryPoint[];
}

// ── Triage ───────────────────────────────────────────────────────────────────

export type IncidentType =
  | "sensor_noise"
  | "anaerobic_spike"
  | "cardiac_drift"
  | "sustained_tachycardia";

export interface TriageIncident {
  incident_type: IncidentType;
  time_start_s: number;
  time_end_s: number;
  description: string;
  peak_heartrate_bpm?: number;
  delta_heartrate_bpm?: number;
  avg_velocity_ms?: number;
}

export interface KinematicMetrics {
  average_pace_min_km: string;
  split_first_half_avg_speed_kmh: number;
  split_second_half_avg_speed_kmh: number;
  split_pace_delta_percent: number;
  split_classification: "split_negativo" | "split_uniforme" | "decaimento_ritmo";
  elevation_gain_meters: number;
  uphill_avg_pace_min_km?: string | null;
  flat_avg_pace_min_km?: string | null;
  grade_pace_impact_percent?: number | null;
}

export interface DeterministicTriageResult {
  total_points_analyzed: number;
  noise_points_removed: number;
  incidents: TriageIncident[];
  has_heartrate?: boolean;
  cardiac_drift_detected: boolean;
  drift_delta_bpm?: number;
  max_valid_heartrate_bpm?: number | null;
  avg_valid_heartrate_bpm?: number | null;
  time_in_anaerobic_zone_seconds: number;
  activity_type_detected: "run" | "weight_training";
  strength_sets_detected?: number | null;
  strength_avg_rest_seconds?: number | null;
  kinematics?: KinematicMetrics | null;
}

// ── AI Report ────────────────────────────────────────────────────────────────

export type Severity = "Baixa" | "Media" | "Alta" | "Critica";

export interface IncidentReport {
  severity: Severity;
  physiological_summary: string;
  cardiac_drift_detected: boolean;
  anaerobic_overload_detected: boolean;
  correlation_with_sleep: string;
  fatigue_risk_score: number;
  recovery_recommendation: string;
  next_training_guidance: string;
  training_benefit: string;
}

// ── Analyze ──────────────────────────────────────────────────────────────────

export type ActivityTypeHint = "run" | "weight_training" | "auto";

export interface AnalyzeRequest {
  activity_meta: ActivityMeta;
  sleep_context?: SleepContext | null;
  telemetry: TelemetryPoint[];
  activity_type?: ActivityTypeHint;
  force_refresh?: boolean;
}

export interface AnalyzeResponse {
  triage: DeterministicTriageResult;
  report: IncidentReport;
  from_cache?: boolean;
  from_local_storage?: boolean;
  cached_at?: string | null;
}

// ── Strava (Fase 5) ──────────────────────────────────────────────────────────

export interface StravaAthlete {
  id: number;
  firstname?: string | null;
  lastname?: string | null;
  profile?: string | null;
  city?: string | null;
}

export interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch (s)
  athlete?: StravaAthlete | null;
}

/** Sessão persistida no navegador (localStorage). */
export type StravaSession = StravaTokenResponse;

export interface StravaActivitySummary {
  id: number;
  name: string;
  sport_type: string;
  type: string;
  start_date_local: string;
  distance: number; // metros
  moving_time: number; // segundos
  has_heartrate: boolean;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
}

export interface StravaActivityResponse {
  activity_meta: ActivityMeta;
  telemetry: TelemetryPoint[];
  suggested_activity_type: ActivityTypeHint;
  available_streams: string[];
  dropped_points: number;
  downsampled: boolean;
  has_heartrate?: boolean;
  from_cache?: boolean;
}

/** Dados de atividade carregados na tela (Demo ou Strava). */
export interface LoadedActivity {
  activity_meta: ActivityMeta;
  telemetry: TelemetryPoint[];
  sleep_context?: SleepContext | null;
}

// ── Check-in de Sono (formulário frontend) ───────────────────────────────────

export interface SleepCheckin {
  total_sleep_hours: number;
  subjective_quality_1_to_5: number;
  subjective_fatigue_1_to_5: number;
  notes?: string;
}

// ── App state ────────────────────────────────────────────────────────────────

export type AppMode = "demo" | "strava";

export type AnalysisStatus = "idle" | "loading_data" | "analyzing" | "done" | "error";

// ── Comparador Head-to-Head (Treino A vs. Treino B) ──────────────────────────

export interface CompareRequest {
  activity_id_a: number | string;
  activity_id_b: number | string;
  athlete_age?: number;
  force_refresh?: boolean;
}

export interface ComparisonDeltas {
  speed_kmh_a: number;
  speed_kmh_b: number;
  delta_speed_kmh: number;
  delta_speed_percent: number;
  pace_a: string;
  pace_b: string;
  delta_pace_seconds_per_km?: number | null;
  ef_a?: number | null;
  ef_b?: number | null;
  delta_ef_percent?: number | null;
  avg_hr_a?: number | null;
  avg_hr_b?: number | null;
  delta_avg_hr_bpm?: number | null;
  decoupling_a_bpm?: number | null;
  decoupling_b_bpm?: number | null;
  delta_decoupling_bpm?: number | null;
  split_delta_pct_a: number;
  split_delta_pct_b: number;
  split_class_a: string;
  split_class_b: string;
  elevation_gain_a: number;
  elevation_gain_b: number;
  delta_elevation_gain: number;
  distance_km_a: number;
  distance_km_b: number;
  delta_distance_km: number;
  both_have_hr: boolean;
  same_sport_type: boolean;
}

export interface ComparisonReport {
  headline_badge: string;
  evolution_score: number;
  adaptation_verdict: string;
  pacing_and_energy_analysis: string;
  cardiovascular_or_mechanical_efficiency: string;
  next_block_guidance: string;
}

export interface CompareResponse {
  activity_a: StravaActivityResponse;
  activity_b: StravaActivityResponse;
  triage_a: DeterministicTriageResult;
  triage_b: DeterministicTriageResult;
  deltas: ComparisonDeltas;
  report: ComparisonReport;
  from_cache?: boolean;
  from_local_storage?: boolean;
  cached_at?: string | null;
}

