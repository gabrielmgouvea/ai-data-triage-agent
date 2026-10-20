import httpx, json, sys
sys.stdout.reconfigure(encoding='utf-8')

print("Chamando POST /api/v1/analyze/demo ...")
resp = httpx.post("http://localhost:8000/api/v1/analyze/demo", timeout=90.0)
print(f"Status: {resp.status_code}")

if resp.status_code == 200:
    data = resp.json()
    triage = data["triage"]
    report = data["report"]
    incidents = triage["incidents"]

    print()
    print("=== TRIAGEM DETERMINISTICA ===")
    print(f"  Incidentes        : {len(incidents)}")
    print(f"  Cardiac Drift     : {triage['cardiac_drift_detected']}")
    print(f"  Delta drift (bpm) : {triage['drift_delta_bpm']}")
    print(f"  Tempo anaerobico  : {triage['time_in_anaerobic_zone_seconds']}s")
    print(f"  FC media valida   : {triage['avg_valid_heartrate_bpm']} bpm")
    print(f"  Ruidos removidos  : {triage['noise_points_removed']}")
    for inc in incidents:
        print(f"  > [{inc['incident_type']}] {inc['time_start_s']}s-{inc['time_end_s']}s")

    print()
    print("=== RELATORIO GEMINI (IncidentReport) ===")
    print(f"  Severidade        : {report['severity']}")
    print(f"  Drift confirmado  : {report['cardiac_drift_detected']}")
    print(f"  Sobrecarga anaer. : {report['anaerobic_overload_detected']}")
    print(f"  Score de fadiga   : {report['fatigue_risk_score']}/100")
    print()
    print("--- Resumo Fisiologico ---")
    print(report["physiological_summary"])
    print()
    print("--- Correlacao Sono x Treino ---")
    print(report["correlation_with_sleep"])
    print()
    print("--- Recomendacao de Recuperacao ---")
    print(report["recovery_recommendation"])
    print()
    print("--- Proximo Treino ---")
    print(report["next_training_guidance"])
else:
    print("ERRO:", resp.text[:2000])
