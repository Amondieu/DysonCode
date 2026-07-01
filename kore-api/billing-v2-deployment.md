# KORE Billing v2 — Deployment Guide

## Step 1: Ship v2 Credit Weights (zero infra)

Replace `SERVICE_COSTS` in [`middleware/credits.py`](middleware/credits.py) and `SERVICE_COSTS` in [`middleware/billing.py`](middleware/billing.py) with the new v2 weights from [`billing_v2.py`](billing_v2.py):

| Service     | v1 (cr) | v2 (cr) | Rationale |
|-------------|---------|---------|-----------|
| `route`       | 4       | **2**   | Deterministic, no LLM; undercuts market by 41% |
| `sandbox_exec`| 20      | **10**  | Biggest adoption unlock |
| `score`       | 40      | **20**  | Local inference; halves barrier |
| `verify`      | 72      | **36**  | Unique ΦΩΡΓΕ organ; 2× proxy = fair premium |
| `embed`       | 2       | **1**   | BGE-M3 self-hosted = $0 cost |
| `memory_write`| 3       | **2**   | Undercut openapi.com ingest by 33% |
| `guard`       | 4       | **3**   | 25% below RAG+classify proxy |
| `diff`        | 5       | **4**   | 41% below 2× RAG proxy |
| `split`       | 10      | **8**   | 43% below RAG+answer proxy |
| `provenance_certify`| 15 | **12**  | Compliance premium; 20% below proxy |

**No DB migration needed.** Only a code deploy.

## Step 2: Create Stripe Subscription Products

```bash
# Preview
python create_stripe_products_v2.py --dry-run

# Test environment
STRIPE_SECRET_KEY=sk_test_... python create_stripe_products_v2.py --env test

# Live environment
STRIPE_SECRET_KEY=sk_live_... python create_stripe_products_v2.py --env live
```

This creates 3 products:
- **KORE Dev** (€9/mo, 1,200 credits)
- **KORE Pro** (€35/mo, 6,000 credits)
- **KORE Memory Bundle** (€9/mo, 1,200 memory-scoped credits)

Output: `stripe_price_ids_v2_live.json`

## Step 3: Load Price IDs

Add to Infisical / Railway env:

```
STRIPE_PRICE_DEV=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_MEMORY_BUNDLE=price_...
STRIPE_WEBHOOK_SECRET_V2=whsec_...
```

## Step 4: Register Webhook Endpoint

In Stripe Dashboard → Developers → Webhooks → Add endpoint:

- **URL**: `https://kore-api.up.railway.app/webhooks/stripe/v2`
- **Events**: `customer.subscription.*`, `invoice.payment_*`, `checkout.session.completed`
- **Secret**: `STRIPE_WEBHOOK_SECRET_V2`

## Step 5: Implement WalletStore

Implement the `WalletStore` protocol from [`webhook_router_v2.py`](webhook_router_v2.py) against your DB:

- **Redis** (fastest): pool balances with TTL for monthly expiry
- **Postgres** (durable): `subscription_pools` table with tenant_id + tier + credits

Wire into app startup:

```python
from webhook_router_v2 import configure_store, InMemoryWalletStore

store = InMemoryWalletStore()  # Replace with Redis/DB implementation
configure_store(store)
app.include_router(webhook_router, prefix="/webhooks/stripe/v2")
```

## Resolution Order (v2)

For each API call:

1. **Subscription pool** → deduct from monthly pool (scope-locked for memory_bundle)
2. **Prepaid balance** → deduct from credit pack balance
3. **PAYG overage** → bill at €0.001/credit via Stripe Meter
