"""
GET /pricing — Public pricing tiers.
"""

from fastapi import APIRouter

router = APIRouter()

PRICING = {
    "free": {
        "price_monthly": 0,
        "calls_per_month": 10_000,
        "api_keys": 1,
        "features": ["REST API access", "Community support"],
    },
    "starter": {
        "price_monthly": 149,
        "calls_per_month": 50_000,
        "api_keys": 1,
        "features": ["All free features", "Email support", "Basic analytics"],
    },
    "growth": {
        "price_monthly": 690,
        "calls_per_month": 300_000,
        "api_keys": 3,
        "features": ["All starter features", "Priority support", "Custom webhooks", "Slack integration"],
    },
    "business": {
        "price_monthly": 1990,
        "calls_per_month": 2_000_000,
        "api_keys": 10,
        "features": ["All growth features", "Dedicated support", "SLA guarantee", "Custom models", "Dataset exports"],
    },
    "enterprise": {
        "price_monthly": "custom",
        "calls_per_month": "custom",
        "api_keys": "unlimited",
        "features": ["All business features", "On-premise deployment", "Compliance certifications", "Custom contracts"],
    },
}


@router.get("/pricing")
async def pricing():
    return {"tiers": PRICING}
