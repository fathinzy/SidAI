# SmartLorry — Judge & Customer Pitch

**MAIC Nexus Challenge · T6: AI for ESG & SDG · SDG 13 (Climate Action)**

## The problem (30 seconds)

Heavy goods vehicles are a major, growing source of road-transport CO2 in Malaysia.
The worst emissions happen when lorries **idle in congestion** — burning fuel and
emitting CO, CO2, NOx and methane while moving zero cargo. Fleet operators have no
real-time view of the *climate cost* of their routing decisions.

## The solution

SmartLorry turns fleet operations into measurable climate action:

1. **Predicts emissions** (CO, CO2, NOx, CH4) per trip with a machine-learning model
   (R2 ≈ 0.99), so every route has a carbon price tag.
2. **Forecasts congestion** per road segment (R2 ≈ 0.92) and re-routes lorries away
   from idle-heavy jams *before* they happen.
3. **Automates incident response** — high-severity events trigger reroute + operator
   alerts, reducing human-in-the-loop.
4. **Quantifies impact** — a live "CO2 avoided" counter (currently ~190 tonnes / ~34%
   in the demo dataset, ≈ 9,000 trees/year) that judges and customers can trust.
5. **Advises planners** — congestion hotspot ranking, road-network recommendations, and
   a **what-if policy simulator** for freight lanes, off-peak windows, and EV switches.

## Why the numbers are credible

The emission model is grounded in real road-transport physics: emissions per km follow
a U-shaped curve against speed — worst at crawl/idle, best near a ~65 km/h cruise. In our
Malaysian dataset, CO2 per km rises **~8.6x** from free-flow to heavy congestion. That is
the entire thesis of the product, and it is measurable.

## Differentiators (why this wins / sells)

- **Explainable AI panel** — shows *why* the model predicts what it does (feature
  importances). Buyers trust what they can inspect.
- **CO2-avoided as a first-class metric** — most fleet tools optimise cost or time;
  SmartLorry makes climate impact the headline, matching the ESG/SDG brief exactly.
- **Runs on AWS Free Tier** — serverless, scales to zero, near-zero cost to operate a
  pilot. Low barrier for a city or SME fleet to adopt.
- **Policy simulator** — sells to *both* fleet operators and government/city planners.

## Architecture (one line)

React dashboard on S3+CloudFront → API Gateway → Lambda (Python, ML inference) →
DynamoDB. Serverless, Malaysian freight domain, deployable in one `sam deploy`.

## Roadmap (what "develop and sell" looks like next)

- Ingest real telematics (GPS + OBD-II) via AWS IoT Core.
- Multi-tenant SaaS with per-fleet dashboards and billing.
- Carbon-credit reporting export (align with voluntary carbon markets).
- Mobile driver app with live eco-score coaching.
