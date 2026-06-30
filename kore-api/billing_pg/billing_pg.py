# billing_pg.py — Full billing system with Postgres
# Drop-in replacement for billing.py (in-memory version)

import os, secrets, hashlib
from datetime import datetime, timezone
from typing import Optional
from fastapi import FastAPI, Request, Header, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
import stripe

from database import Agent, Subscription, UsageLog, CreditTransaction, get_db, init_db

stripe.api_key = os.environ["STRIPE_SECRET_KEY"]

SERVICE_CREDITS = {
    "compress":       3,
    "route":          5,
    "verify":        72,
    "score":         40,
    "evidence":    1000,
    "evolution":    300,
    "strategy_lab": 180,
    "trust_card":     0,
}

PACK_CREDITS = {
    "starter":     1_000,
    "builder":     5_000,
    "scale":      20_000,
    "enterprise": 100_000,
}

STRIPE_PRICES = {
    "starter":       os.environ.get("STRIPE_PRICE_STARTER",  "price_starter"),
    "builder":       os.environ.get("STRIPE_PRICE_BUILDER",  "price_builder"),
    "scale":         os.environ.get("STRIPE_PRICE_SCALE",    "price_scale"),
    "enterprise":    os.environ.get("STRIPE_PRICE_ENTERPRISE","price_enterprise"),
    "drift_starter": os.environ.get("STRIPE_PRICE_DRIFT_S",  "price_drift_s"),
    "drift_growth":  os.environ.get("STRIPE_PRICE_DRIFT_G",  "price_drift_g"),
    "drift_biz":     os.environ.get("STRIPE_PRICE_DRIFT_B",  "price_drift_b"),
    "session_mem":   os.environ.get("STRIPE_PRICE_SESSION",  "price_session"),
    "dataset_exp":   os.environ.get("STRIPE_PRICE_DATASET",  "price_dataset"),
    "retrain":       os.environ.get("STRIPE_PRICE_RETRAIN",  "price_retrain"),
}

BASE_URL = os.environ.get("BASE_URL", "https://yourapp.railway.app")

app = FastAPI(title="KORE API", version="1.0.0")

@app.on_event("startup")
async def startup():
    await init_db()

# ─── AUTH ──────────────────────────────────────────────────────────────────────

async def auth(
    authorization: str = Header(None),
    x_api_key: str = Header(None),
    db: AsyncSession = Depends(get_db)
) -> Agent:
    # Accept both x-api-key (Smithery) and Authorization: Bearer
    token = None
    if x_api_key:
        token = x_api_key
    elif authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "").strip()
    if not token:
        raise HTTPException(401, "Missing API key. Send x-api-key header or Authorization: Bearer <key>")
    result = await db.execute(select(Agent).where(Agent.api_key == token, Agent.is_active == True))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(401, "Invalid API key")
    return agent

# ─── CREDIT DEDUCTION ──────────────────────────────────────────────────────────

async def deduct(agent: Agent, service: str, db: AsyncSession, count: int = 1) -> dict:
    cost = SERVICE_CREDITS.get(service, 0) * count
    if cost == 0:
        return {"cost": 0, "remaining": agent.credits}
    if agent.credits < cost:
        raise HTTPException(
            402,
            f"Insufficient credits. Need {cost}, have {agent.credits}. "
            f"Top up at POST /v1/billing/topup"
        )
    agent.credits -= cost
    await db.execute(
        update(Agent).where(Agent.agent_id == agent.agent_id)
        .values(credits=agent.credits)
    )
    db.add(UsageLog(
        agent_id=agent.agent_id,
        service=service,
        credits_used=cost,
        credits_after=agent.credits,
    ))
    await db.commit()
    return {"cost": cost, "remaining": agent.credits}

# ─── BILLING DEPENDENCIES ──────────────────────────────────────────────────────

def require_credits(service: str, count: int = 1):
    async def _dep(agent: Agent = Depends(auth), db: AsyncSession = Depends(get_db)):
        billing = await deduct(agent, service, db, count)
        return {"agent": agent, "billing": billing, "db": db}
    return _dep

def require_subscription(feature: str):
    async def _dep(agent: Agent = Depends(auth), db: AsyncSession = Depends(get_db)):
        has_sub = any(s.feature == feature and s.active for s in agent.subscriptions)
        if not has_sub:
            raise HTTPException(
                403,
                f"Requires active {feature} subscription. "
                f"Subscribe at POST /v1/billing/subscribe"
            )
        return agent
    return _dep

# ─── ENDPOINTS ─────────────────────────────────────────────────────────────────

@app.post("/v1/register")
async def register(body: dict, db: AsyncSession = Depends(get_db)):
    agent_id = body.get("agent_id") or "agent_" + secrets.token_hex(6)
    api_key  = "kore_" + secrets.token_urlsafe(32)
    agent = Agent(
        agent_id=agent_id,
        api_key=api_key,
        email=body.get("email", ""),
        credits=100,
        tier="free",
    )
    db.add(agent)
    await db.commit()
    return {
        "api_key":  api_key,
        "agent_id": agent_id,
        "credits":  100,
        "message":  "100 free credits. Use: Authorization: Bearer <api_key>"
    }

@app.get("/v1/credits")
async def credits_status(agent: Agent = Depends(auth)):
    return {
        "agent_id":      agent.agent_id,
        "credits":       agent.credits,
        "tier":          agent.tier,
        "subscriptions": [s.feature for s in agent.subscriptions if s.active],
    }

@app.post("/v1/billing/topup")
async def topup(body: dict, agent: Agent = Depends(auth)):
    pack = body.get("pack", "starter")
    if pack not in PACK_CREDITS:
        raise HTTPException(400, f"Choose: {list(PACK_CREDITS.keys())}")
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{"price": STRIPE_PRICES[pack], "quantity": 1}],
        metadata={"agent_id": agent.agent_id, "credits": str(PACK_CREDITS[pack]), "pack": pack, "type": "topup"},
        automatic_tax={"enabled": True},
        customer_update={"address": "auto"},
        success_url=BASE_URL + "/billing/success?session_id={CHECKOUT_SESSION_ID}",
        cancel_url=BASE_URL + "/billing/cancel",
    )
    return {"checkout_url": session.url, "credits": PACK_CREDITS[pack], "pack": pack}

@app.post("/v1/billing/subscribe")
async def subscribe_plan(body: dict, agent: Agent = Depends(auth)):
    plan = body.get("plan")
    if plan not in STRIPE_PRICES:
        raise HTTPException(400, f"Unknown plan: {plan}")
    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": STRIPE_PRICES[plan], "quantity": 1}],
        metadata={"agent_id": agent.agent_id, "plan": plan, "type": "subscription"},
        automatic_tax={"enabled": True},
        customer_update={"address": "auto"},
        success_url=BASE_URL + "/billing/success",
        cancel_url=BASE_URL + "/billing/cancel",
    )
    return {"checkout_url": session.url, "plan": plan}

@app.post("/webhook")
async def stripe_webhook(request: Request, stripe_signature: str = Header(None), db: AsyncSession = Depends(get_db)):
    raw_body = await request.body()
    try:
        event = stripe.Webhook.construct_event(raw_body, stripe_signature, os.environ["STRIPE_WEBHOOK_SECRET"])
    except Exception as e:
        raise HTTPException(400, str(e))

    if event["type"] == "checkout.session.completed":
        sess = event["data"]["object"]
        meta = sess.get("metadata", {})
        agent_id = meta.get("agent_id")
        tx_type  = meta.get("type")

        result = await db.execute(select(Agent).where(Agent.agent_id == agent_id))
        agent  = result.scalar_one_or_none()
        if not agent:
            return {"status": "agent_not_found"}

        if tx_type == "topup":
            credits = int(meta.get("credits", 0))
            agent.credits += credits
            agent.tier = meta.get("pack", agent.tier)
            db.add(CreditTransaction(
                agent_id=agent_id,
                stripe_session=sess["id"],
                credits_added=credits,
                pack=meta.get("pack", ""),
                amount_eur=sess.get("amount_total", 0),
                processed=True,
            ))
            await db.commit()

        elif tx_type == "subscription":
            plan = meta.get("plan", "")
            feature_map = {
                "drift_starter": "drift",   "drift_growth": "drift",
                "drift_biz": "drift",       "session_mem": "session_memory",
                "dataset_exp": "dataset_export",
            }
            feature = feature_map.get(plan)
            if feature:
                db.add(Subscription(
                    agent_id=agent_id, feature=feature,
                    stripe_sub_id=sess.get("subscription", ""),
                    plan=plan, active=True
                ))
                await db.commit()

    elif event["type"] == "customer.subscription.deleted":
        sub_id = event["data"]["object"]["id"]
        await db.execute(
            update(Subscription).where(Subscription.stripe_sub_id == sub_id)
            .values(active=False)
        )
        await db.commit()

    return {"status": "ok"}

# ─── SERVICE ENDPOINTS ─────────────────────────────────────────────────────────

@app.post("/v1/compress")
async def compress(body: dict, billing=Depends(require_credits("compress"))):
    # ← replace with kore_harness_contextdebt.py logic
    return {"compressed_text": "...", "credits_used": billing["billing"]["cost"], "credits_remaining": billing["billing"]["remaining"]}

@app.post("/v1/route")
async def route(body: dict, billing=Depends(require_credits("route"))):
    return {"recommended_tier": "flash", "credits_used": billing["billing"]["cost"], "credits_remaining": billing["billing"]["remaining"]}

@app.post("/v1/compliance-verify")
async def verify(body: dict, billing=Depends(require_credits("verify"))):
    return {"grounded": True, "verification_score": 0.91, "credits_used": billing["billing"]["cost"], "credits_remaining": billing["billing"]["remaining"]}

@app.post("/v1/score")
async def score(body: dict, billing=Depends(require_credits("score"))):
    return {"ranked_candidates": [], "credits_used": billing["billing"]["cost"], "credits_remaining": billing["billing"]["remaining"]}

@app.post("/v1/evidence")
async def evidence(body: dict, billing=Depends(require_credits("evidence"))):
    return {"evidence_id": "ev_" + secrets.token_hex(8), "credits_used": billing["billing"]["cost"], "credits_remaining": billing["billing"]["remaining"]}

@app.post("/v1/drift-check")
async def drift_check(body: dict, agent: Agent = Depends(require_subscription("drift"))):
    return {"drift_status": "ok", "agent_id": agent.agent_id}

@app.post("/v1/datasets/export")
async def dataset_export(body: dict, agent: Agent = Depends(require_subscription("dataset_export"))):
    return {"download_url": "https://...", "records": 0}

@app.post("/v1/evolution-search")
async def evolution_search(body: dict, billing=Depends(require_credits("evolution"))):
    return {"best_fitness": 0.87, "credits_used": billing["billing"]["cost"], "credits_remaining": billing["billing"]["remaining"]}

@app.post("/v1/lab/simulate")
async def strategy_lab(body: dict, billing=Depends(require_credits("strategy_lab"))):
    return {"projected_mrr": 0, "credits_used": billing["billing"]["cost"], "credits_remaining": billing["billing"]["remaining"]}

@app.get("/trust-card")
async def trust_card():
    return {
        "name": "KORE API", "auth_type": "bearer_token",
        "free_tier_credits": 100, "register": "POST /v1/register",
        "uptime_30d": 0.999, "calibration_ece": 0.04,
    }

@app.get("/v1/usage")
async def usage(agent: Agent = Depends(auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(UsageLog).where(UsageLog.agent_id == agent.agent_id)
        .order_by(UsageLog.ts.desc()).limit(50)
    )
    logs = result.scalars().all()
    return {
        "agent_id": agent.agent_id,
        "credits":  agent.credits,
        "log": [{"ts": l.ts.isoformat(), "service": l.service, "cost": l.credits_used, "remaining": l.credits_after} for l in logs]
    }

@app.get("/health")
async def health():
    return {"status": "ok", "service": "KORE API"}
