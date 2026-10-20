# ⚡ PulseTriage

> **Plataforma Web de Telemetria Esportiva & Análise Fisiológica com Inteligência Artificial.**  
> Ingestão de dados brutos do Strava, triagem determinística de carga interna e diagnósticos gerados com o Google Gemini.

[![Live Demo](https://img.shields.io/badge/Demo-Acessar%20PulseTriage-FF5722?style=for-the-badge&logo=vercel&logoColor=white)](https://ai-data-triage-agent.vercel.app/)
[![Next.js](https://img.shields.io/badge/Next.js-16+-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-2.5--Flash-4285F4?style=flat-square&logo=google)](https://ai.google.dev/)
[![Strava API](https://img.shields.io/badge/Strava-API%20v3-FC4C02?style=flat-square&logo=strava&logoColor=white)](https://developers.strava.com/)

---

## 🚀 Experimente Online (Sem Instalação)

A aplicação está publicada e funcional em produção na Vercel:

👉 **[https://ai-data-triage-agent.vercel.app](https://ai-data-triage-agent.vercel.app)**

*Conecte sua conta do Strava para carregar suas atividades reais instantaneamente ou utilize os dados demonstrativos.*

---

## 🎯 Sobre o Projeto

O **PulseTriage** preenche a lacuna entre a telemetria esportiva bruta (frequência cardíaca segundo a segundo, pace, cadência, elevação) e a tomada de decisão do atleta. 

Em vez de exibir apenas gráficos estáticos, a plataforma cruza marcadores fisiológicos determinísticos com a capacidade analítica de modelos de linguagem (Google Gemini) para responder às perguntas centrais de qualquer planejamento: **"Qual foi a carga real dessa sessão?"**, **"Houve desacoplamento cardíaco?"** e **"O treino gerou adaptação positiva ou estresse excessivo?"**.

---

## ✨ Principais Funcionalidades

* **Integração OAuth 2.0 com Strava:** Autenticação dinâmica e ingestão de atividades recentes e fluxos de telemetria brutos (*streams* de tempo, FC, velocidade e altitude).
* **Diagnóstico Fisiológico com IA:**
  * **Com Frequência Cardíaca:** Cálculo de Fator de Eficiência (EF), desacoplamento aeróbio (drift), zonas de intensidade e impacto no sistema cardiovascular.
  * **Modo Cinemático (Sem Sensor Cardíaco):** Detecção automática de treinos sem monitor cardíaco, avaliando split de ritmo, regularidade de cadência e custo mecânico do desnível (+D).
* **Contexto de Recuperação e Sono (Opcional):** Integração orgânica de percepção subjetiva de esforço, horas de sono e fadiga basal no laudo da IA.
* **Comparador Head-to-Head (H2H):**
  * Duelo lado a lado entre treinos de mesma modalidade.
  * Cálculo determinístico de deltas ($\Delta\text{EF}\%$, $\Delta\text{Pace}\%$, $\Delta\text{FC}$).
  * Sparklines sobrepostas para comparação visual da sustentação de esforço ao longo da sessão.
* **Persistência Híbrida & Cache Eficiente:**
  * Camada de banco de dados SQLite assíncrono para respostas em milissegundos sem repetição de requisições externas.
  * Armazenamento resiliente em `localStorage` para navegação instantânea no dispositivo do atleta.
* **Card de Compartilhamento em Alta Resolução (PNG):**
  * Exportação de cartões gráficos com layout *Dark Minimalist* em proporções 4:5 (Stories/Feed) e 1:1 (Quadrado).
  * Grid adaptativo inteligente: destaca Pace/Distância em corridas e Séries/Densidade em treinos de força.
  * Botões de download em alta nitidez (`pixelRatio: 3`) e cópia direta para a área de transferência.

---

## 🛠️ Arquitetura & Tecnologias

A aplicação utiliza arquitetura unificada e 100% *serverless* hospedada na Vercel:

* **Frontend:** [Next.js](https://nextjs.org/) (App Router), [React](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/), [Lucide Icons](https://lucide.dev/), [html-to-image](https://github.com/bubkoo/html-to-image).
* **Backend:** [FastAPI](https://fastapi.tiangolo.com/), [Pydantic v2](https://docs.pydantic.dev/), [SQLAlchemy](https://www.sqlalchemy.org/) + [aiosqlite](https://github.com/omnilib/aiosqlite).
* **Inteligência Artificial:** [Google Gemini API](https://ai.google.dev/) com modelagem de prompts clínicos e validação estruturada.
* **Infraestrutura:** Unificação via `vercel.json` e ponte ASGI (`api/index.py`) para execução de rotas FastAPI sob o runtime Serverless Python.
