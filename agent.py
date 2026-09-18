import json
import os
from pydantic import BaseModel, Field
from google import genai

# 1. Formato estrito que a IA deve devolver
class IncidentReport(BaseModel):
    severity: str = Field(description="Baixa, Media ou Critica")
    root_cause_hypothesis: str = Field(description="Hipotese da causa raiz da anomalia")
    recommended_action: str = Field(description="Acao operacional imediata recomendada")

# 2. Dados brutos simulando registros com picos anormais
raw_telemetry = [
    {"timestamp": "2026-09-17T10:00:00", "metric": "heart_rate", "value": 72, "unit": "bpm"},
    {"timestamp": "2026-09-17T10:01:00", "metric": "heart_rate", "value": 75, "unit": "bpm"},
    {"timestamp": "2026-09-17T10:02:00", "metric": "heart_rate", "value": 178, "unit": "bpm"},  # EXEMPLO DE ANOMALIA
    {"timestamp": "2026-09-17T10:03:00", "metric": "heart_rate", "value": 80, "unit": "bpm"},
]

def filter_anomalies(data: list) -> list:
    """Filtra leituras fora do intervalo operacional normal(repouso) (45 a 140 bpm)"""
    return [d for d in data if d["value"] > 140 or d["value"] < 45]

def analyze_with_llm(anomalies: list) -> IncidentReport:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("Chave GEMINI_API_KEY nao encontrada nas variaveis de ambiente.")

    client = genai.Client(api_key=api_key)
    
    prompt = f"""
    Voce e um agente de triagem automatizada de dados de saude e operacoes.
    Analise os seguintes registros anomalos detectados no fluxo:
    {json.dumps(anomalies)}
    
    Classifique a severidade, a hipotese da causa e a acao operacional imediata recomendada.
    """
    
    response = client.models.generate_content(
        model='gemini-3.6-flash',
        contents=prompt,
        config={
            'response_mime_type': 'application/json',
            'response_schema': IncidentReport,
        },
    )
    return IncidentReport.model_validate_json(response.text)

if __name__ == "__main__":
    print("1. Ingerindo fluxo de dados...")
    flagged = filter_anomalies(raw_telemetry)
    print(f"2. Registros anomalos encontrados: {len(flagged)}")
    
    if flagged:
        print("3. Acionando agente de IA para triagem estruturada...")
        try:
            report = analyze_with_llm(flagged)
            print("\n=== RELATORIO GERADO PELO AGENTE ===")
            print(report.model_dump_json(indent=2))
        except ValueError as e:
            print(f"\nAviso: {e}")
            print("Para rodar a chamada real a IA, defina sua chave GEMINI_API_KEY no terminal.")