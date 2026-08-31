# Competitive Analysis & SWOT — Draft 2 (verified)

**Our system:** SmartLorry / SidAI (AI Fleet Emissions & Congestion Platform)
**Competitor:** **EcoTrace Logistics** by Wan Hakim Hakimi (TAR UMT university project)
Source verified from GitHub: `github.com/Dandidit/route-optimization-app` (branch `master`).

> This draft is based on the competitor's actual README and source code (notably
> `src/utils/routeOptimizer.js`), not guesswork. Key finding: their "AI optimization"
> is presentational, not a real solver — see Section 3.

---

## 1. Who they are

EcoTrace Logistics is a **direct, near-identical-concept competitor**:
- Same domain: **carbon-neutral fleet management in the Klang Valley, Malaysia**.
- Same headline: **AI-powered route optimization + CO2 reduction**.
- Same nature: a **university project** (TAR UMT, "Carbon-Neutral Supply Chain Systems").
- Frontend-only: **React 18 + Vite + React-Leaflet + Recharts**, deployed on Vercel.
  All data is mock (`src/data/dummyData.js`); there is **no backend, no ML, no cloud infra**.

They are competing for the same story you are. The differences are in depth and substance.

---

## 1a. Their presentation vs. their code (the decisive gap)

Their slide deck (Group 9, "Solution Approach" + "System Architecture") claims a **far more
ambitious system than their repo actually contains**. This is the single most important
finding for positioning.

**What the slides claim:**
- *Solution approach — 3 pillars:*
  1. **Fuel Consumption Optimization (ML):** regression ML route optimisation per segment
     (terrain/speed/vehicle type), **3D bin-packing** load optimisation, **clustering +
     assignment** package assignment.
  2. **Anomaly Detection (AI/ML):** route-deviation checks, **multi-sensor time-series
     anomaly detection**, **deep-learning** tampering/falsification detection trained on physics.
  3. **Cybersecurity Framework:** device-to-cloud **mutual authentication** (anti-spoofing),
     **cryptographically signed** carbon data / **immutable audit trail**, least-privilege access.
- *Production architecture:* full AWS IoT stack — driver phones + sensors → **IoT Greengrass**
  (edge) → **IoT Core** → **IoT Rules Engine** → 3 Lambdas (Route Optimizer, Carbon Estimator,
  Anomaly Detection) → DynamoDB + S3 + **Glue + Athena + OpenSearch + Timestream + QuickSight**,
  with **Cognito**, CloudWatch, SNS, IAM.

**What the code actually contains (verified from GitHub):**
- A **frontend-only React SPA** with mock data (`src/data/dummyData.js`).
- **None** of the AWS backend exists: no Lambda, no IoT Core/Greengrass, no DynamoDB, no
  Cognito, no Glue/Athena/OpenSearch/Timestream/QuickSight.
- The "route optimizer" is the **hardcoded-percentage** function (`// In a real
  implementation, this would use advanced algorithms`).
- **3D bin packing, clustering assignment, deep-learning tampering detection, cryptographic
  signing — not present anywhere in the code.** They are slideware.

**The inversion:** They have a **better-looking deck**; you have a **better-working system**.
Their architecture diagram is a wish-list. Yours is one `sam deploy` from being live with
real trained models behind it.

| | EcoTrace (Group 9) | SmartLorry (you) |
|---|---|---|
| Architecture slide | Very ambitious full AWS IoT stack | Serverless stack (real) |
| Actually built | Frontend mock, hardcoded "AI" | Real trained ML + working Python backend |
| ML models | Claimed, not present | Present (R2 0.99 / 0.92), inspectable |
| Cloud deployed | Not deployed (static SPA) | Real AWS, SAM-ready to deploy |

---

## 2. Feature comparison (verified)

| Capability | EcoTrace Logistics | SmartLorry / SidAI |
|---|---|---|
| **Route optimization** | ✅ UI + before/after view — but **fake** (hardcoded % improvements, see §3) | ⚠️ No route solver yet (forecasts congestion, scores emissions) |
| **Emissions model** | Fuel-liters × fixed emission factor (diesel 2.68, etc.) — **static coefficients** | ✅ Trained ML model, R2≈0.99, physics-grounded U-curve (idle→cruise), ~8.6x CO2 swing |
| **Congestion forecasting** | ❌ None | ✅ Trained ML model, R2≈0.92, per road segment |
| **Interactive map** | ✅ Leaflet, live-ish markers (simulated every 5s) | ✅ Live map |
| **Driver behavior monitoring** | ✅ Safety scores, anomaly types (speeding, hard braking, fatigue, idling) — **rule-based on mock data** | ⚠️ Eco-scores present; less driver-safety framing |
| **Analytics / charts** | ✅ Recharts (emissions trend, efficiency, fuel mix) | ✅ Forecast charts, KPIs, rankings |
| **Explainable AI** | ❌ None | ✅ Feature-importance panel |
| **What-if policy simulator** | ❌ None | ✅ Freight-lane / off-peak / EV switch simulation |
| **Multi-stop / VRP** | ❌ Claims nearest-neighbor but **not implemented** (see §3) | ❌ Not yet |
| **Real backend** | ❌ Frontend-only, mock data | ✅ Python API (Lambda), real request handling |
| **Cloud architecture** | ❌ Static SPA on Vercel | ✅ AWS serverless (API GW + Lambda + DynamoDB + S3/CloudFront), free-tier |
| **Security/compliance claims** | ✅ Lists GDPR/PDPA/ISO 27001/SOC 2 (**claims, not implemented**) | ⚠️ Not claimed (more honest, but less polished-sounding) |
| **UI polish / breadth** | ✅ 5 clean pages, strong visual design, driver profiles | ✅ Multiple pages; comparable |

---

## 3. The critical finding: their "AI" is not real

From their own `routeOptimizer.js`:

- The optimizer contains the comment *"In a real implementation, this would use advanced
  algorithms. For now, we'll simulate optimization with improved metrics."*
- "Optimized" results are a **hardcoded base distance (160.8 km) multiplied by fixed
  percentage improvements** per priority mode (e.g. carbon = 15% distance, 20% fuel).
  The savings are predetermined constants, not computed from the actual waypoints.
- The README advertises a "nearest neighbor algorithm," but the shipped `optimizeRoute()`
  **does not order or route the destinations at all** — it ignores their geometry.
- Emissions = liters × a **fixed** emission factor. No speed/congestion/idle modelling.
- "Driver behavior AI" and "anomaly detection" run on **mock data** with **static
  thresholds** — pattern/ML framing is marketing, not code.
- Compliance badges (ISO 27001, SOC 2, GDPR/PDPA) are **displayed claims** with no
  backing implementation (it's a frontend-only demo).

**Implication:** EcoTrace *looks* more feature-complete and more polished in a quick demo,
but under inspection it is a well-designed mock. SmartLorry has **less breadth but real
substance** (trained models, physics grounding, a working backend, explainability). Any
technical judge who opens the code will see this immediately.

---

## 4. SWOT — SmartLorry / SidAI (relative to EcoTrace)

### Strengths
- **Genuine ML with defensible numbers** (R2 0.99 / 0.92) vs. their hardcoded constants.
- **Physics-grounded emissions story** (U-shaped curve, 8.6x idle-vs-cruise) — a real
  thesis they cannot match with fixed emission factors.
- **Congestion forecasting** — they have none; this is your unique, on-theme capability.
- **Explainable-AI panel** and **what-if policy simulator** — genuinely differentiated.
- **Real cloud architecture** (AWS serverless) — a working backend and a portfolio story,
  vs. their frontend-only mock.
- **Honesty/credibility** — you don't claim compliance you didn't build.

### Weaknesses
- **No visible route optimizer.** Even though theirs is fake, it *demos* a route
  before/after with savings. You currently have no equivalent "give me the optimized
  route" screen — a perception gap in a 3-minute pitch.
- **Less UI breadth in one area:** their **driver-behavior page** (safety scores, anomaly
  types, training compliance) is a clean, sellable module you don't emphasize.
- **Polish/marketing.** Their README and UI are slick (badges, screenshots, design system).
  Presentation can beat substance with non-technical judges.
- **Simulated data** — same limitation both of you share; not a differentiator either way.

### Opportunities
- **Ship a *real* eco-routing engine** — even a genuine nearest-neighbor + 2-opt ordering,
  ranked by *predicted* CO2 from your model. You'd have what they only pretend to have,
  backed by real ML. This is the single highest-leverage move.
- **Add a route before/after comparison screen** — match their most demo-friendly feature,
  but with your real numbers and a "fastest vs lowest-carbon" CO2 delta.
- **Add a driver eco-score / behavior page** — close their one genuine UI advantage, tied
  to your emissions model (idle time → CO2).
- **Lead the pitch with "our AI is real, and here's the code"** — turn their weakness into
  your positioning. Show the trained model + feature importances live.
- **Compliance done right** — if you add Cognito auth + PDPA-aware data handling, you can
  claim it truthfully where they only display badges.

### Threats
- **Demo-day optics.** If judges only watch a 3-minute demo, EcoTrace's polish + fake
  before/after route can *look* more complete than your deeper system.
- **Same niche, same country, same brief** — direct overlap means you'll be compared head
  to head; you must make the "real vs mock" distinction obvious and fast.
- **They can iterate UI quickly** (frontend-only), so they may keep out-polishing on visuals.

---

## 5. Prioritized improvements to our system

**P0 — win the head-to-head, close the perception gap**
1. **Real eco-routing engine.** Order stops with nearest-neighbor + 2-opt, score each
   candidate route with your *actual* emissions + congestion models, return the lowest-CO2
   route. Directly beats their fake optimizer with real ML.
2. **Route optimization screen with before/after + "fastest vs lowest-carbon" toggle**,
   showing the CO2 delta. Matches their most demo-friendly view, with credible numbers.

**P1 — neutralize their genuine advantages**
3. **Driver eco-score / behavior page** — idle time, harsh events → CO2 impact, tied to
   your model (not static thresholds).
4. **Pitch reframing** — explicitly show "our optimization runs a real model; here are the
   feature importances and R2" to expose the substance gap.

**P2 — polish and credibility**
5. **UI/README polish pass** — screenshots, a design-system section, clear metric callouts.
6. **Truthful compliance** — Cognito auth + a short PDPA data-handling note you can actually
   stand behind.

**Good ideas worth borrowing from their *slides* (they never built these — you can):**
7. **Anomaly / tampering detection on telemetry** — even a simple physics-consistency check
   (does reported fuel/CO2 match speed+load?) flags implausible data. They pitched
   "deep-learning tampering detection"; you can ship a real, explainable version cheaply.
8. **Load / package optimisation** — a basic capacity-aware assignment (which lorry, which
   load) tied to emissions. You don't need 3D bin packing; a greedy capacity fit already
   beats a slide.
9. **Data-integrity / audit trail** — hash-and-store telemetry records in DynamoDB so carbon
   figures are verifiable. Cheap, on-brand for ESG reporting, and truthfully claimable.

---

## 6. One-line strategic takeaway

EcoTrace **presents** an ambitious IoT/ML/security platform but **ships** a polished
frontend mock. SmartLorry ships **real trained models and a working backend** with thinner
routing UX. Win by (a) adding a genuine emissions-weighted routing + before/after screen to
match their demo appeal, and (b) leading with **"our AI is real, deployed, and inspectable —
here's the code and the R2"** — the comparison they cannot survive. Their slides are the
roadmap; your repo is the product.
