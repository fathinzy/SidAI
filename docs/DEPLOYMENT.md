# SmartLorry — Deployment Guide & Cost Safety

This guide deploys SmartLorry to AWS on the **Free Tier**. Read the
[Cost safety](#cost-safety--free-tier-guardrails) section first — your account is on
the **paid plan with $0 promotional credits**, so anything beyond Free Tier limits
bills to your card.

- **Region:** everything deploys to `ap-southeast-2` (Sydney) — your project's
  assigned region. The application *domain* is Malaysia (simulated), the
  *infrastructure* runs in Sydney. This is expected and fine.
- **Architecture:** S3 + CloudFront (dashboard) → API Gateway HTTP API → Lambda → DynamoDB.

---

## Prerequisites

| Tool | Check | Install |
|------|-------|---------|
| AWS CLI v2 | `aws --version` | Already installed (2.36) |
| SAM CLI | `sam --version` | https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html |
| Python 3.12+ | `python --version` | Installed (3.14) |
| Node.js 18+ | `node --version` | Installed (24) |
| AWS credentials | `aws sts get-caller-identity --profile fath-awsproject` | via `aws login` / AWS Settings |

> **Why SAM CLI?** It packages the Lambda + API Gateway + DynamoDB + S3 + CloudFront
> from `infra/template.yaml` in one command. It is the only missing prerequisite on
> this machine.

---

## Step 1 — Generate data and train models (local)

```powershell
# from smartlorry/
python data-simulator/generate.py --lorries 40 --days 30 --seed 42
python ml/train_emissions.py
python ml/train_congestion.py
```

This produces the simulated Malaysian fleet data and the trained models.

## Step 2 — Stage runtime assets into the Lambda package

```powershell
python infra/stage_assets.py
```

Copies the data CSVs into `backend/data/` and model metrics into `backend/models/`
so the Lambda zip is self-contained.

> **Free-tier note:** the default Lambda build has an **empty `requirements.txt`**, so
> it ships only Python stdlib + the built-in physics emissions model. This keeps the
> package tiny and avoids the scikit-learn size/cold-start cost. Prediction accuracy is
> preserved because the physics model is the same one that generated the training data.
> To ship the trained scikit-learn model instead, see [ML model in Lambda](#optional--full-ml-model-in-lambda-container-image).

## Step 3 — Build and deploy the backend

```powershell
# from smartlorry/infra/
sam build
sam deploy --guided        # first time only; accept region ap-southeast-2
# subsequent deploys: sam deploy
```

At the end, SAM prints **Outputs**. Copy the `ApiUrl` — you need it for the frontend.

```
Key                 Value
ApiUrl              https://abc123.execute-api.ap-southeast-2.amazonaws.com
DashboardUrl        https://dxxxx.cloudfront.net
SiteBucketName      smartlorry-site-053650398614
```

## Step 4 — Build the frontend against the live API

```powershell
# from smartlorry/frontend/
# Windows note: the tsc/vite .bin shims can be missing; call them via node directly.
$env:VITE_API_BASE = "https://abc123.execute-api.ap-southeast-2.amazonaws.com"
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
```

## Step 5 — Upload the dashboard and go live

```powershell
# from smartlorry/frontend/  (use the SiteBucketName + Distribution id from outputs)
aws s3 sync dist/ s3://smartlorry-site-053650398614 --delete --profile fath-awsproject --region ap-southeast-2

# Invalidate the CloudFront cache so the new build is served immediately
aws cloudfront create-invalidation --distribution-id <DIST_ID> --paths "/*" --profile fath-awsproject
```

Open the `DashboardUrl`. Done.

---

## Cost safety & Free Tier guardrails

Your account is **paid plan, $0 credits**. Stay inside these limits and the whole
stack costs ~$0/month for a demo. Numbers are the AWS Free Tier at time of writing;
confirm current limits in the AWS console.

| Service | Free Tier (per month) | This app's demo usage | Risk |
|---------|----------------------|-----------------------|------|
| Lambda | 1M requests + 400k GB-s (always free) | Dozens–hundreds of calls | None |
| API Gateway HTTP API | 1M calls (first 12 months) | Same as Lambda | None |
| DynamoDB | 25 GB + 25 RCU/WCU (always free) | A few MB | None |
| S3 | 5 GB + 20k GET (first 12 months) | ~1 MB dashboard | None |
| CloudFront | 1 TB out + 10M requests (always free) | Demo traffic | None |

**Guardrails to set (do this before/after deploying):**

1. **Set a spend limit** in AWS Settings → Billing. Only a project owner can do this.
   It pauses the project if exceeded — your hard stop against surprise bills.
2. **Create a Budgets alert** (AWS Billing console) at e.g. USD $1 to get an email if
   anything starts costing money.
3. **Avoid the container-image Lambda** unless you need the ML model in production —
   ECR storage and larger images can nudge you past free limits.
4. **Do not add:** SageMaker endpoints, NAT Gateways, always-on EC2/RDS, or provisioned
   DynamoDB — these bill hourly regardless of traffic and are the usual "why is my bill
   not zero" culprits.

**If something suddenly returns Access Denied** on operations that worked before, your
spend limit may have paused the project — check AWS Settings → Billing.

---

## Tear down (stop all costs)

```powershell
# empty the bucket first (CloudFormation won't delete a non-empty bucket)
aws s3 rm s3://smartlorry-site-053650398614 --recursive --profile fath-awsproject --region ap-southeast-2

# from smartlorry/infra/
sam delete --stack-name smartlorry --region ap-southeast-2
```

This removes the Lambda, API, DynamoDB table, S3 bucket, and CloudFront distribution.
Keep the stack if you want it live in your portfolio — at demo traffic it stays within
Free Tier.

---

## Optional — Full ML model in Lambda (container image)

The default zip deploy uses the physics fallback. To run the trained scikit-learn
model in Lambda instead:

1. Add a `backend/Dockerfile` based on `public.ecr.aws/lambda/python:3.12`.
2. Install `backend/requirements-full.txt` and copy `ml/models/*.joblib` into the image.
3. Change `ApiFunction` in `infra/template.yaml` to `PackageType: Image`.
4. `sam build` + `sam deploy` will push to ECR and wire it up.

Watch ECR storage against the Free Tier (500 MB for 12 months) if you go this route.
