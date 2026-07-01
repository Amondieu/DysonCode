#!/usr/bin/env python3
"""
create_stripe_products_v2.py
============================
Creates 3 new Stripe Products + Prices for KORE billing v2.

Run once in each environment:
    STRIPE_SECRET_KEY=sk_test_... python create_stripe_products_v2.py --env test
    STRIPE_SECRET_KEY=sk_live_... python create_stripe_products_v2.py --env live

Outputs a JSON file: stripe_price_ids_v2_{env}.json
Load that file in your app config / environment to wire up the subscription
checkout flows and webhook handlers.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

try:
    import stripe
except ImportError:
    sys.exit("Install stripe-python first:  pip install stripe>=8")

# ── Product definitions ───────────────────────────────────────────────────────

PRODUCTS = [
    {
        "key": "dev",
        "name": "KORE Dev",
        "description": (
            "1,200 credits/month for individual developers and indie agent builders. "
            "Includes all KORE endpoints. Overage billed at €0.001/credit."
        ),
        "unit_amount": 900,     # EUR cents (€9.00)
        "currency": "eur",
        "interval": "month",
        "metadata": {
            "credits_per_period": "1200",
            "overage_eur_per_credit": "0.001",
            "endpoint_scope": "unrestricted",
            "tier": "dev",
        },
    },
    {
        "key": "pro",
        "name": "KORE Pro",
        "description": (
            "6,000 credits/month for production agent stacks and multi-agent swarms. "
            "Includes all KORE endpoints. Overage billed at €0.001/credit."
        ),
        "unit_amount": 3500,    # EUR cents (€35.00)
        "currency": "eur",
        "interval": "month",
        "metadata": {
            "credits_per_period": "6000",
            "overage_eur_per_credit": "0.001",
            "endpoint_scope": "unrestricted",
            "tier": "pro",
        },
    },
    {
        "key": "memory_bundle",
        "name": "KORE Memory Bundle",
        "description": (
            "1,200 memory-scoped credits/month. "
            "Credits apply to memory_recall and memory_write endpoints only. "
            "Ideal for Memanto-style long-term memory integrations."
        ),
        "unit_amount": 900,     # EUR cents (€9.00)
        "currency": "eur",
        "interval": "month",
        "metadata": {
            "credits_per_period": "1200",
            "overage_eur_per_credit": "0.001",
            "endpoint_scope": "memory_recall,memory_write",
            "tier": "memory_bundle",
        },
    },
]

# ── Stripe helper ─────────────────────────────────────────────────────────────


def create_product_and_price(spec: dict, dry_run: bool = False) -> dict:
    """Create a Stripe Product + recurring Price. Returns {product_id, price_id}."""
    if dry_run:
        return {
            "key": spec["key"],
            "product_id": f"prod_DRY_{spec['key'].upper()}",
            "price_id":   f"price_DRY_{spec['key'].upper()}",
            "name":       spec["name"],
            "amount_eur": spec["unit_amount"] / 100,
        }

    product = stripe.Product.create(
        name=spec["name"],
        description=spec["description"],
        metadata=spec["metadata"],
    )

    price = stripe.Price.create(
        product=product.id,
        unit_amount=spec["unit_amount"],
        currency=spec["currency"],
        recurring={"interval": spec["interval"]},
        metadata=spec["metadata"],
    )

    return {
        "key":        spec["key"],
        "product_id": product.id,
        "price_id":   price.id,
        "name":       spec["name"],
        "amount_eur": spec["unit_amount"] / 100,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Create KORE v2 Stripe products")
    parser.add_argument("--env",     choices=["test", "live"], default="test")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would be created without calling Stripe")
    args = parser.parse_args()

    stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
    if not stripe.api_key and not args.dry_run:
        sys.exit(
            "Set STRIPE_SECRET_KEY in your environment.\n"
            "  export STRIPE_SECRET_KEY=sk_test_...\n"
            "Or run with --dry-run to preview."
        )

    if not args.dry_run:
        key_prefix = stripe.api_key[:7]
        expected = "sk_test" if args.env == "test" else "sk_live"
        if not stripe.api_key.startswith(expected):
            sys.exit(
                f"Key prefix {key_prefix!r} does not match --env {args.env!r}. "
                "Aborting to prevent live/test mismatch."
            )

    results = {}
    for spec in PRODUCTS:
        result = create_product_and_price(spec, dry_run=args.dry_run)
        results[result["key"]] = result
        status = "DRY RUN" if args.dry_run else "CREATED"
        print(f"[{status}] {result['name']}")
        print(f"         product_id : {result['product_id']}")
        print(f"         price_id   : {result['price_id']}")
        print(f"         amount     : €{result['amount_eur']:.2f}/month")
        print()

    out_path = Path(f"stripe_price_ids_v2_{args.env}.json")
    out_path.write_text(json.dumps(results, indent=2))
    print(f"Price IDs saved → {out_path}")
    print()
    print("Next step: load stripe_price_ids_v2.json in your app config, then")
    print("run webhook_router_v2.py to handle subscription lifecycle events.")


if __name__ == "__main__":
    main()
