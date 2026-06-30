"""
GET / — Human-readable landing page
GET /robots.txt — For web crawlers
GET /sitemap.xml — For search engines
"""

from fastapi import APIRouter, Response
from fastapi.responses import HTMLResponse

router = APIRouter()

LANDING_HTML = """<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>KORE — Universal Agent Infrastructure</title>
<meta name="description" content="13 universal infrastructure services for AI agents: hallucination firewall, context compression, semantic dedup, cross-agent memory, token routing, prompt normalizer, quality scorer, task decomposer, semantic diff, claim provenance, embedding cache, agent sandbox, immutable audit log.">
<meta name="keywords" content="AI agent infrastructure, hallucination detection, context compression, agent memory, token routing, prompt security, LLM quality scoring, provenance, EU AI Act compliance, sandbox execution">
<meta property="og:title" content="KORE — Universal Agent Infrastructure">
<meta property="og:description" content="13 API services every AI agent needs. Deploy once, use everywhere.">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0f;color:#e0e0e0;line-height:1.6}
.container{max-width:900px;margin:0 auto;padding:40px 20px}
h1{font-size:2.5rem;background:linear-gradient(135deg,#6c8cf8,#39d088);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
.tagline{font-size:1.2rem;color:#888;margin-bottom:40px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px;margin-bottom:40px}
.card{background:#14141f;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;transition:border-color 0.2s}
.card:hover{border-color:#6c8cf8}
.card h3{font-size:1rem;margin-bottom:6px;color:#6c8cf8}
.card .sym{font-size:1.4rem;margin-right:6px}
.card .score{font-size:0.8rem;color:#39d088;float:right}
.card p{font-size:0.85rem;color:#999;margin-bottom:8px}
.card .tag{display:inline-block;background:rgba(108,140,248,0.15);color:#6c8cf8;font-size:0.7rem;padding:2px 8px;border-radius:4px;margin:2px}
.endpoints{margin-bottom:40px}
.endpoints h2{font-size:1.3rem;margin-bottom:12px}
.endpoints code{display:block;background:#1a1a2e;padding:8px 12px;border-radius:6px;margin:4px 0;font-size:0.85rem;color:#39d088}
.footer{text-align:center;color:#555;font-size:0.85rem;margin-top:40px}
a{color:#6c8cf8;text-decoration:none}
</style></head>
<body><div class="container">
<h1>KORE</h1>
<p class="tagline">Universal infrastructure services for AI agents.</p>
<div class="grid">
<div class="card"><span class="sym">🛡️</span><span class="score">8.94</span><h3>ΨGuard — Hallucination Firewall</h3><p>Last gate before agent output emission</p><span class="tag">safety</span><span class="tag">hallucination</span></div>
<div class="card"><span class="sym">📦</span><span class="score">9.0</span><h3>ΔPack — Context Compression</h3><p>3–5× semantic compression</p><span class="tag">cost</span><span class="tag">compression</span></div>
<div class="card"><span class="sym">🧠</span><span class="score">9.11</span><h3>ΦMem — Cross-Agent Memory</h3><p>Shared Qdrant-backed memory</p><span class="tag">memory</span><span class="tag">network-effect</span></div>
<div class="card"><span class="sym">🔄</span><span class="score">8.0</span><h3>ΞRoute — Token Routing</h3><p>Cheapest model per task</p><span class="tag">cost</span><span class="tag">routing</span></div>
<div class="card"><span class="sym">🧹</span><span class="score">8.7</span><h3>ΛNorm — Prompt Normalizer</h3><p>Injection detection + cleanup</p><span class="tag">security</span><span class="tag">normalization</span></div>
<div class="card"><span class="sym">⭐</span><span class="score">8.5</span><h3>ΘScore — Quality Scorer</h3><p>Rank candidate outputs</p><span class="tag">quality</span><span class="tag">scoring</span></div>
<div class="card"><span class="sym">✂️</span><span class="score">8.3</span><h3>ΣSplit — Task Decomposer</h3><p>Parallel subtask planning</p><span class="tag">planning</span><span class="tag">parallel</span></div>
<div class="card"><span class="sym">🔍</span><span class="score">7.8</span><h3>ΓDiff — Semantic Diff</h3><p>Meaning-preserving comparison</p><span class="tag">diff</span><span class="tag">versioning</span></div>
<div class="card"><span class="sym">📜</span><span class="score">8.85</span><h3>ΠProve — Provenance</h3><p>EU AI Act certificates</p><span class="tag">compliance</span><span class="tag">eu-ai-act</span></div>
<div class="card"><span class="sym">💾</span><span class="score">7.6</span><h3>ΦEmbed — Embed Cache</h3><p>LRU-cached embeddings</p><span class="tag">embedding</span><span class="tag">cache</span></div>
<div class="card"><span class="sym">🏖️</span><span class="score">8.82</span><h3>ΨSandbox — Agent Sandbox</h3><p>Safe code execution</p><span class="tag">sandbox</span><span class="tag">execution</span></div>
<div class="card"><span class="sym">📋</span><span class="score">9.15</span><h3>ΩAudit — Audit Log</h3><p>HMAC-chained immutable trail</p><span class="tag">audit</span><span class="tag">compliance</span></div>
<div class="card"><span class="sym">🗂️</span><span class="score">7.5</span><h3>ΩDeDup — Semantic Dedup</h3><p>Cosine duplicate detection</p><span class="tag">rag</span><span class="tag">dedup</span></div>
</div>
<div class="endpoints">
<h2>🔌 All 26 API Endpoints</h2>
<code>POST /v1/guard · /v1/compress · /v1/route · /v1/memory/write · /v1/memory/recall · DELETE /v1/memory/{id}</code>
<code>POST /v1/normalize · /v1/score · /v1/split · /v1/diff · /v1/embed · /v1/sandbox/exec</code>
<code>POST /v1/provenance/certify · /v1/compliance/verify</code>
<code>GET  /v1/services · /v1/audit/trail · /v1/audit/verify/{hash}</code>
<code>POST /a2a/tasks/send · /mcp/call · GET /mcp/manifest · /.well-known/agent.json</code>
<code>GET  /trust-card · /pricing · /health</code>
</div>
<div class="footer">
<a href="/v1/services">📋 Service Catalog</a> · <a href="/trust-card">📊 Trust Card</a> · <a href="/pricing">💰 Pricing</a> · <a href="/docs">📖 API Docs</a><br><br>
KORE v1.0.0 — 13 services · 26 endpoints · $333k/mo projected
</div>
</div></body></html>
"""


@router.get("/")
async def root():
    return HTMLResponse(LANDING_HTML)


@router.post("/")
async def root_post():
    """Accept POST for MCP/Smithery initialization probes."""
    return {"status": "ok", "service": "kore-universal-services"}


@router.get("/robots.txt")
async def robots():
    return Response(
        content="User-agent: *\nAllow: /\nSitemap: https://api.kore.ai/sitemap.xml\n",
        media_type="text/plain",
    )


@router.get("/sitemap.xml")
async def sitemap():
    return Response(
        content='<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                '<url><loc>https://api.kore.ai/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>'
                '<url><loc>https://api.kore.ai/v1/services</loc><changefreq>daily</changefreq><priority>0.9</priority></url>'
                '<url><loc>https://api.kore.ai/pricing</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>'
                '<url><loc>https://api.kore.ai/trust-card</loc><changefreq>hourly</changefreq><priority>0.7</priority></url>'
                '</urlset>',
        media_type="application/xml",
    )
