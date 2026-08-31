# SidAI — AI Fleet Emissions & Congestion Platform (Malaysia)

> **MAIC Nexus Challenge — T6: AI for ESG & SDG**
> **Focus: SDG 13 — Climate Action**

SidAI (project codename **SmartLorry**) is a professional, AI-powered platform for
smart lorry (heavy goods vehicle) fleet operations in Malaysia. It predicts tailpipe
emissions (CO, CO₂, NOx, methane), forecasts road congestion so lorries avoid
emission-heavy idling, recommends the greenest capable vehicle and driver for each
trip, and quantifies the CO₂ saved — turning fleet operations into measurable climate
action.

The same framework-agnostic backend runs on **Vercel** (single-deploy demo) or **AWS
Free Tier** serverless (Lambda + API Gateway), so it also doubles as a cloud portfolio
piece.

---

## Why this matters for SDG 13

Heavy goods vehicles are a major source of road transport emissions. Idling in
congestion is one of the worst offenders: an idling diesel lorry burns fuel and emits
CO₂, NOx and particulates while moving zero cargo. SidAI attacks this directly:

- **Predict** emissions per trip so operators see the climate cost of every route.
- **Forecast** congestion and steer lorries away from idle-heavy jams.
- **Recommend** the greenest capable vehicle and safest driver for each order.
- **Quantify** the CO₂ avoided (a hard number judges and customers can trust).

---

## What's in the dashboard

- **Live Tracking** — real-time animated fleet positions, congestion forecasts and
  automated incident response.
- **Emission Tracker** — CO₂ intelligence comparing AI-Optimized vs Standard routing,
  filtered by time and vehicle, with carbon-intensity benchmarking.
- **Trip / New Order** — plan a shipment and let SidAI score every capable vehicle on
  CO₂, load right-sizing and fuel type, plus suggest a driver.
- **Trip List** — all scheduled, booked and completed trips across the fleet.
- **Registry** — register vehicles and view profile history.
- **Vehicle & Driver Profiles** — specifications, compliance, maintenance and driver
  behaviour profiles.
- **Report** — exportable ESG PDF report per vehicle or whole fleet.

---

## Architecture (high level)

Two interchangeable deployment targets share one router (`router.dispatch`), so
behaviour is identical locally, on Vercel and on AWS.

**Vercel (default demo)**

```
  React Dashboard (Vite)  ──►  frontend/dist  (static, served by Vercel)
                                     │  /api/*
                                     ▼
                          api/index.py  (Python serverless function)
                                     │
                                     ▼
                          backend router + service + bundled data
```

**AWS Free Tier (portfolio option)**

```
  React Dashboard ─► S3 + CloudFront ─► API Gateway (HTTP API) ─► Lambda (Python 3.12)
```

Region for AWS: **ap-southeast-2 (Sydney)** — the account's assigned region. The
*domain* is Malaysia (simulated Malaysian roads, lorries, cities); the *infrastructure*
runs in Sydney.

## Repo structure

```
smartlorry/
├── data-simulator/   Malaysian lorry telemetry + emissions generator (Python)
├── ml/               Model training (emissions + congestion), metrics export
├── backend/          Shared router/service/features + AWS Lambda handler + local server
├── api/              Vercel Python serverless function (bundles backend + data)
├── frontend/         React + Vite dashboard
├── infra/            AWS SAM template (serverless, free-tier)
├── scripts/          Asset staging (stage_vercel.py)
└── docs/             Deployment guide, pitch, competitor analysis
```

## Quick start (local)

```bash
# 1. Generate simulated Malaysian fleet data
cd data-simulator
pip install -r requirements.txt
python generate.py

# 2. (Optional) train the ML models and export metrics
cd ../ml
pip install -r requirements.txt
python train_emissions.py
python train_congestion.py

# 3. Run the backend locally
cd ../backend
pip install -r requirements.txt
python local_server.py            # serves the API on http://localhost:8000

# 4. Run the dashboard (Vite proxies /api -> http://localhost:8000)
cd ../frontend
npm install
npm run dev
```

> The backend ships with a built-in physics emissions model, so predictions work even
> without the trained scikit-learn models. Training is optional and only needed to
> refresh the model metrics under `backend/models/`.

## Deploying

- **Vercel:** push the repo and let `vercel.json` do the rest — it builds the frontend,
  serves `frontend/dist`, and runs `api/index.py` as a Python function. Data is bundled
  under `api/_backend/` by `scripts/stage_vercel.py`.
- **AWS:** see `docs/DEPLOYMENT.md` for the SAM build/deploy steps and Free-Tier cost
  guardrails.

## Cost safety (AWS)

If you deploy to AWS, everything is sized for the **AWS Free Tier**. See
`docs/DEPLOYMENT.md` for guardrails (spend limit, budget alert) before you deploy.
