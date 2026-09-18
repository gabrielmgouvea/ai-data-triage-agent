# AI Data Triage Agent

Pipeline em Python para ingestao de telemetria, deteccao de anomalias e triagem automatica via LLM com saida estruturada (Structured Outputs com Pydantic e Gemini).

## Objetivo
Automatizar a triagem de fluxos de dados continuos (como metricas operacionais e sinais de saude), filtrando leituras anomalas e gerando diagnosticos imediatos em formato JSON validado.

## Arquitetura
1. **Filtro Determinístico**: Identificacao de registros fora do limiar estatistico aceitavel.
2. **Triagem por IA**: Analise semantica do incidente via Gemini 2.5 Flash.
3. **Validacao com Pydantic**: Garantia de tipagem e integridade do retorno para consumo em downstream APIs.

## Como Executar

Instale as dependencias:
\`\`\`bash
pip install -r requirements.txt
\`\`\`

Defina sua chave de API e execute:
\`\`\`bash
# Linux/Mac
export GEMINI_API_KEY="sua_chave"

# Windows (PowerShell)
$env:GEMINI_API_KEY="sua_chave"

# Windows (CMD)
set GEMINI_API_KEY=sua_chave

python agent.py
\`\`\`