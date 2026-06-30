"""
KORE API — FastAPI application, Railway entrypoint.

Deploy:
    railway login && railway up

Routes:
    POST /v1/compliance/verify  → answer verification
    POST /v1/compress           → context compression
    POST /v1/route              → 11-provider token routing
    POST /v1/memory/write|recall → cross-agent memory
    POST /v1/normalize           → prompt normalizer
    POST /v1/guard               → hallucination firewall
    POST /v1/score               → quality scorer
    POST /v1/split               → task decomposer
    POST /v1/diff                → semantic diff
    POST /v1/embed               → embedding cache
    POST /v1/sandbox/exec        → agent sandbox
    POST /v1/provenance/certify  → claim provenance
    POST /a2a/tasks/send         → A2A protocol
    POST /mcp/call               → MCP protocol
    GET  /v1/services            → service catalog
    GET  /v1/audit/trail|verify  → audit log
    GET  /health                 → liveness (no LLM calls)
"""

import os, sys, logging
from pathlib import Path

_kore_root = str(Path(__file__).parent)
if _kore_root not in sys.path:
    sys.path.insert(0, _kore_root)

from fastapi import FastAPI, Request, Header
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    HAS_SLOWAPI = True
except ImportError:
    HAS_SLOWAPI = False

from routes.verify import router as verify_router
from routes.compress import router as compress_router
from routes.route_endpoint import router as route_router
from routes.memory import router as memory_router
from routes.normalize import router as normalize_router
from routes.guard import router as guard_router
from routes.provenance import router as provenance_router
from routes.score import router as score_router
from routes.split import router as split_router
from routes.diff import router as diff_router
from routes.embed import router as embed_router
from routes.sandbox import router as sandbox_router
from routes.services import router as services_router
from routes.root import router as root_router
from routes.trust_card import router as trust_router
from routes.pricing import router as pricing_router
from routes.a2a import router as a2a_router
from routes.mcp import router as mcp_router
from routes.wellknown import router as wk_router
from routes.register import router as register_router
from routes.leaderboard import router as leaderboard_router
from middleware.audit import router as audit_router, AuditMiddleware
from middleware.quotas import QuotaMiddleware
from middleware.security import SecurityMiddleware

log = logging.getLogger("kore-api")
logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")

# ── FastAPI App ─────────────────────────────────────────────────────────
app = FastAPI(title="KORE Universal Agent Services", version="1.0.0")

# ── Rate Limiting (optional — pip install slowapi) ────────────────────
if HAS_SLOWAPI:
    limiter = Limiter(key_func=get_remote_address, default_limits=["300/minute"])
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
else:
    limiter = None

# CORS — restricted in production
cors_origins = os.environ.get("CORS_ORIGINS", "*")
if cors_origins == "*":
    app.add_middleware(CORSMiddleware, allow_origins=["*"],
        allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type", "x-api-key"])
else:
    app.add_middleware(CORSMiddleware,
        allow_origins=cors_origins.split(","),
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type", "x-api-key"])

# ── Register Routes ────────────────────────────────────────────────────
app.include_router(verify_router)
app.include_router(compress_router)
app.include_router(route_router)
app.include_router(memory_router)
app.include_router(normalize_router)
app.include_router(guard_router)
app.include_router(provenance_router)
app.include_router(score_router)
app.include_router(split_router)
app.include_router(diff_router)
app.include_router(embed_router)
app.include_router(sandbox_router)
app.include_router(services_router)
app.include_router(root_router)
app.include_router(trust_router)
app.include_router(pricing_router)
app.include_router(a2a_router)
app.include_router(mcp_router)
app.include_router(wk_router)
app.include_router(audit_router)
app.include_router(register_router)
app.include_router(leaderboard_router)

# ΩAudit middleware
app.add_middleware(AuditMiddleware)
app.add_middleware(QuotaMiddleware)
app.add_middleware(SecurityMiddleware)


# ── Health ──────────────────────────────────────────────────────────────
# CRITICAL: No LLM calls in /health. Railway restarts if this takes >10s.
@app.get("/health")
async def health(request: Request = None):
    return {"status": "ok", "service": "kore-universal-services"}


# ── Stripe Webhook + Credit Top-Up ─────────────────────────────────────
# NOTE: STRIPE_SECRET_KEY is sk_live_... — LIVE MODE
#       STRIPE_WEBHOOK_SECRET is whsec_... — already in Infisical
_STRIPE_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
if _STRIPE_KEY:
    import stripe as _stripe
    _stripe.api_key = _STRIPE_KEY

    @app.post("/webhook/stripe")
    async def stripe_webhook(request: Request):
        from middleware.credits import add_credits, PACKS
        raw = await request.body()
        sig = request.headers.get("stripe-signature", "")
        secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
        try:
            event = _stripe.Webhook.construct_event(raw, sig, secret)
        except Exception:
            from fastapi.responses import JSONResponse
            return JSONResponse({"error": "invalid signature"}, status_code=400)

        if event["type"] == "checkout.session.completed":
            session = event["data"]["object"]
            meta = session.get("metadata", {})
            cid = meta.get("customer_id", "unknown")
            pack = meta.get("pack", "starter")
            credits = PACKS.get(pack, {}).get("credits", 1000)
            add_credits(cid, credits, source=f"purchase:{pack}")
            logger.info(f"Webhook: {credits} credits for {cid} ({pack})")

        return {"status": "ok"}

    # ── Stripe Test ────────────────────────────────────────────────────
    @app.get("/stripe-test")
    async def stripe_test():
        try:
            account = _stripe.Account.retrieve()
            mode = "LIVE" if "live" in _STRIPE_KEY else "TEST"
            return {"status": "connected", "account_id": account.id, "country": account.country, "mode": mode}
        except Exception as e:
            return {"status": "error", "detail": str(e)}

    @app.get("/test-checkout")
    async def test_checkout():
        try:
            session = _stripe.checkout.Session.create(
                mode="payment",
                automatic_tax={"enabled": True},
                line_items=[{"price_data": {"currency": "eur", "unit_amount": 900,
                              "product_data": {"name": "Starter Pack"}}, "quantity": 1}],
                metadata={"customer_id": "test", "pack": "starter", "credits": "1000"},
                success_url="https://kore-api.up.railway.app/success",
                cancel_url="https://kore-api.up.railway.app/cancel",
            )
            return {"checkout_url": session.url}
        except Exception as e:
            return {"status": "error", "detail": str(e)}

    @app.get("/buy/{pack}")
    async def buy_pack(pack: str, x_api_key: str = Header(None)):
        from middleware.credits import PACKS, get_credits
        if pack not in PACKS or pack == "free":
            return {"error": "invalid pack"}
        p = PACKS[pack]

        # Look up customer_id from api key (via register.py in-memory registry)
        customer_id = "anonymous"
        if x_api_key:
            try:
                from routes.register import _agents
                if x_api_key in _agents:
                    customer_id = _agents[x_api_key]["customer_id"]
            except Exception:
                pass

        try:
            session = _stripe.checkout.Session.create(
                mode="payment",
                automatic_tax={"enabled": True},
                line_items=[{"price_data": {"currency": "eur", "unit_amount": p["price"],
                              "product_data": {"name": f"{pack.title()} Pack"}}, "quantity": 1}],
                metadata={"pack": pack, "credits": str(p["credits"]), "customer_id": customer_id},
                success_url="https://triumphant-enthusiasm-production-625b.up.railway.app/success",
                cancel_url="https://triumphant-enthusiasm-production-625b.up.railway.app/pricing",
            )
            return {"checkout_url": session.url, "customer_id": customer_id, "pack": pack}
        except Exception as e:
            return {"status": "error", "detail": str(e)}

    # ── Success / Cancel Pages ───────────────────────────────────────────
    @app.get("/success")
    async def purchase_success():
        return HTMLResponse("""
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><title>Purchase Successful</title>
        <style>body{font-family:sans-serif;max-width:600px;margin:50px auto;
        padding:20px;background:#f5f5f5;text-align:center}
        .card{background:white;padding:30px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.1)}
        h1{color:#2d5236} .btn{display:inline-block;padding:12px 24px;
        background:#4a7c59;color:white;text-decoration:none;border-radius:6px;margin-top:20px}
        </style></head><body>
        <div class="card">
        <h1>✅ Purchase Successful</h1>
        <p>Your credits have been added to your account.</p>
        <p>Use your API key to call any of the 13 KORE services.</p>
        <a class="btn" href="/v1/services">View Services</a>
        </div></body></html>
        """)

    @app.get("/cancel")
    async def purchase_cancel():
        return HTMLResponse("""
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><title>Purchase Cancelled</title>
        <style>body{font-family:sans-serif;max-width:600px;margin:50px auto;
        padding:20px;background:#f5f5f5;text-align:center}
        .card{background:white;padding:30px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.1)}
        h1{color:#b03762} .btn{display:inline-block;padding:12px 24px;
        background:#4169e1;color:white;text-decoration:none;border-radius:6px;margin-top:20px}
        </style></head><body>
        <div class="card">
        <h1>Purchase Cancelled</h1>
        <p>No charges were made. You can try again anytime.</p>
        <a class="btn" href="/pricing">View Pricing</a>
        </div></body></html>
        """)

    # ── Balance Check ────────────────────────────────────────────────────
    @app.get("/v1/balance")
    async def check_balance(x_api_key: str = Header(None)):
        from middleware.credits import get_credits
        customer_id = "anonymous"
        if x_api_key:
            try:
                from routes.register import _agents
                if x_api_key in _agents:
                    customer_id = _agents[x_api_key]["customer_id"]
            except Exception:
                pass
        balance = get_credits(customer_id)
        return {"customer_id": customer_id, "credits": balance, "currency": "EUR", "credit_value_eur": 0.001}
