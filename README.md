# SmartLorry — AI Fleet Emissions & Congestion Platform (Malaysia)

> **MAIC Nexus Challenge — T6: AI for ESG & SDG**
> **Focus: SDG 13 — Climate Action**

SmartLorry is a professional, AI-powered platform for smart lorry (heavy goods vehicle)
fleet operations in Malaysia. It predicts tailpipe emissions (CO, CO2, NOx, Methane),
forecasts road congestion so lorries avoid emission-heavy idling, automates incident
response, and quantifies the CO2 saved — turning fleet operations into measurable
climate action.

Built on **AWS Free Tier** serverless infrastructure, it doubles as a cloud portfolio piece.

---

## Why this matters for SDG 13

Heavy goods vehicles are a major source of road transport emissions. Idling in congestion
is one of the worst offenders: an idling diesel lorry burns fuel and emits CO2, NOx and
particulates while moving zero cargo. SmartLorry attacks this directly:

- **Predict** emissions per trip so operators see the climate cost of every route.
- **Forecast** congestion and re-route lorries away from idle-heavy jams.
- **Quantify** the CO2 avoided (a hard number judges and customers can trust).
- **Advise** planners with hotspot analysis and "what-if" policy simulation.

---

## Architecture (high level)

```
                    +-------------------+
   React Dashboard  |  S3 + CloudFront  |   (static hosting, free tier)
   (Vite)  ───────► |                   |
                    +-------------------+
                             │ HTTPS
                             ▼
                    +-------------------+
                    |  API Gateway      |   HTTP API (1M calls/mo free)
                    |  (HTTP API)       |
                    +-------------------+
                             │
                             ▼
                    +-------------------+
                    |  AWS Lambda       |   Python 3.12, ML inference in-process
                    |  (Python)         |   (1M requests/mo always free)
                    +-------------------+
                             │
                             ▼
                    +-------------------+
                    |  DynamoDB         |   Telemetry + results (25GB free)
                    +-------------------+
```

Region: **ap-southeast-2 (Sydney)** — the account's assigned region. The *domain* is
Malaysia (simulated Malaysian roads, lorries, cities); the *infrastructure* runs in Sydney.

## Repo structure

```
smartlorry/
├── data-simulator/   Malaysian lorry telemetry + emissions generator (Python)
├── ml/               Model training (emissions + congestion), exports for Lambda
├── backend/          Lambda handlers + API logic (Python)
├── frontend/         React + Vite dashboard
├── infra/            AWS SAM template (serverless, free-tier)
└── docs/             Deployment guide + cost guardrails
```

## Quick start (local)

```bash
# 1. Generate simulated Malaysian fleet data
cd data-simulator
pip install -r requirements.txt
python generate.py

# 2. Train models
cd ../ml
pip install -r requirements.txt
python train_emissions.py
python train_congestion.py

# 3. Run backend locally
cd ../backend
pip install -r requirements.txt
python local_server.py

# 4. Run dashboard
cd ../frontend
npm install
npm run dev
```

See `docs/DEPLOYMENT.md` for AWS deployment and cost safety.

## Cost safety

Account is on the **PAID plan with $0 credits**, so everything is sized for the
AWS Free Tier. See `docs/DEPLOYMENT.md` for guardrails before you deploy.
