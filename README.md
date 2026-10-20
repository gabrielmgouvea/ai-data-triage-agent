# PulseTriage

> Plataforma Web de Telemetria Esportiva & Análise de Prontidão com IA

## Estrutura do Monorepo

```
pulsetriage/
├── backend/          # FastAPI + Python
│   ├── app/
│   │   ├── main.py        # Aplicação FastAPI
│   │   ├── config.py      # Configurações (Pydantic Settings)
│   │   ├── models.py      # Modelos de domínio (Pydantic v2)
│   │   └── routers/
│   │       └── demo.py    # GET /api/v1/demo
│   ├── mock_activity.json # Dados de treino + sono mockados
│   ├── requirements.txt
│   ├── run.py             # Entrada Uvicorn
│   └── .env.example
└── frontend/         # Next.js 14+ (Fase 3)
```

## Backend — Setup Rápido

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux/Mac
pip install -r requirements.txt
cp .env.example .env            # Edite com suas chaves
python run.py
```

API disponível em: http://localhost:8000
- Documentação interativa: http://localhost:8000/docs
- Demo endpoint: http://localhost:8000/api/v1/demo
- Health check: http://localhost:8000/health

## Frontend — Setup Rápido (Fase 3)

```bash
cd frontend
npm install
npm run dev
```

Frontend disponível em: http://localhost:3000

## Fases de Desenvolvimento

| Fase | Status | Descrição |
|------|--------|-----------|
| 1 | ✅ Concluída | Fundação Backend & Mock Estruturado |
| 2 | ✅ Concluída | Motor de Triagem Determinístico & Gemini |
| 3 | ✅ Concluída | Fundação Frontend & Boilerplate |
| 4 | ⏳ Pendente | Dashboard, Gráficos Recharts e Check-in |
| 5 | ⏳ Pendente | Integração Strava OAuth |
| 6 | ⏳ Pendente | Polimento e Deploy |
