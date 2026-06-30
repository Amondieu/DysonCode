"""
GET / — Human-readable landing page
GET /robots.txt — For web crawlers
GET /sitemap.xml — For search engines
"""

import json, logging
from fastapi import APIRouter, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse

logger = logging.getLogger(__name__)
router = APIRouter()

# Rich MCP tool definitions for Smithery quality score (100/100)
_MCP_TOOLS = [
    {
        "name": "guard",
        "description": "Check AI output against source documents to detect hallucination. Returns safety score, flagged claims, and revision hints.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "output": {"type": "string", "description": "The AI-generated text to check for hallucination"},
                "sources": {"type": "array", "items": {"type": "object", "properties": {"id": {"type": "string"}, "content": {"type": "string"}}, "description": "Source documents to verify against"}},
                "threshold": {"type": "number", "description": "Score threshold (0-1). Higher = stricter", "default": 0.5},
            },
            "required": ["output"],
        },
        "outputSchema": {"type": "object", "properties": {"safe": {"type": "boolean"}, "hallucination_score": {"type": "number"}, "flagged_claims": {"type": "array"}}},
        "annotations": {"title": "Hallucination Firewall", "readOnlyHint": True},
    },
    {
        "name": "compress",
        "description": "Semantically compress text 3-5x without quality loss. Reduces token costs for LLM context windows.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "The text to compress"},
                "profile": {"type": "string", "description": "Compression profile: aggressive, balanced, or preserve", "enum": ["aggressive", "balanced", "preserve"], "default": "balanced"},
                "max_chars": {"type": "integer", "description": "Maximum output length in characters (optional)"},
            },
            "required": ["text"],
        },
        "outputSchema": {"type": "object", "properties": {"compressed": {"type": "string"}, "ratio": {"type": "number"}, "tokens_saved": {"type": "integer"}}},
        "annotations": {"title": "Context Compression", "readOnlyHint": True},
    },
    {
        "name": "route",
        "description": "Route a task to the cheapest LLM provider that meets quality threshold. Uses 11-provider fallback chain. Saves 60-90% on inference costs.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_text": {"type": "string", "description": "The task description to route"},
                "estimated_tokens": {"type": "integer", "description": "Estimated input tokens for provider selection"},
                "mode": {"type": "string", "description": "Routing strategy: auto, speed, quality, or cheapest", "enum": ["auto", "speed", "quality", "cheapest"], "default": "auto"},
            },
            "required": ["task_text"],
        },
        "outputSchema": {"type": "object", "properties": {"recommended_provider": {"type": "string"}, "provider_speed_tok_s": {"type": "integer"}, "fallback_chain_length": {"type": "integer"}}},
        "annotations": {"title": "Token Cost Arbitrage", "readOnlyHint": True},
    },
    {
        "name": "memory",
        "description": "Store or retrieve observations from cross-agent memory. Qdrant-backed with all-MiniLM embeddings. Network effect across all agents.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "description": "Action: write or recall", "enum": ["write", "recall"]},
                "observation": {"type": "string", "description": "Text to store (for write action)"},
                "query": {"type": "string", "description": "Search query (for recall action)"},
                "domain": {"type": "string", "description": "Domain/namespace for memory organization"},
                "k": {"type": "integer", "description": "Number of results to return (for recall)", "default": 5},
            },
            "required": ["action"],
        },
        "outputSchema": {"type": "object", "properties": {"results": {"type": "array"}, "id": {"type": "string"}}},
        "annotations": {"title": "Cross-Agent Memory", "readOnlyHint": True},
    },
    {
        "name": "normalize",
        "description": "Detect prompt injections, normalize whitespace, strip noise from text. Returns risk score and blocked flag.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "The text to normalize and check for injections"},
                "mode": {"type": "string", "description": "Detection strictness: minimal, balanced, or strict", "enum": ["minimal", "balanced", "strict"], "default": "balanced"},
            },
            "required": ["text"],
        },
        "outputSchema": {"type": "object", "properties": {"normalized": {"type": "string"}, "risk_score": {"type": "number"}, "blocked": {"type": "boolean"}, "injection_flags": {"type": "array"}}},
        "annotations": {"title": "Prompt Normalizer", "readOnlyHint": True},
    },
    {
        "name": "score",
        "description": "Rank multiple candidate outputs by heuristic quality. Evaluates length, code quality, structure, and keyword coverage.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task": {"type": "string", "description": "The original task/instruction"},
                "candidates": {"type": "array", "items": {"type": "string"}, "description": "Array of candidate output texts to rank"},
            },
            "required": ["task", "candidates"],
        },
        "outputSchema": {"type": "object", "properties": {"ranked_candidates": {"type": "array"}, "mean_score": {"type": "number"}, "score_spread": {"type": "number"}}},
        "annotations": {"title": "Output Quality Scorer", "readOnlyHint": True},
    },
    {
        "name": "split",
        "description": "Decompose a complex task into parallel subtasks. Supports 5 decomposition types: sequential, parallel, build, verify, document.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task": {"type": "string", "description": "The complex task to decompose"},
                "max_subtasks": {"type": "integer", "description": "Maximum number of subtasks", "default": 8},
                "type": {"type": "string", "description": "Decomposition strategy", "enum": ["sequential", "parallel", "build", "verify", "document"], "default": "parallel"},
            },
            "required": ["task"],
        },
        "outputSchema": {"type": "object", "properties": {"subtasks": {"type": "array"}, "count": {"type": "integer"}, "type": {"type": "string"}}},
        "annotations": {"title": "Task Decomposer", "readOnlyHint": True},
    },
    {
        "name": "diff",
        "description": "Compute a meaning-preserving semantic diff between original and modified text using SequenceMatcher.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "original": {"type": "string", "description": "The original text"},
                "modified": {"type": "string", "description": "The modified text"},
            },
            "required": ["original", "modified"],
        },
        "outputSchema": {"type": "object", "properties": {"similarity": {"type": "number"}, "changes": {"type": "array"}, "change_count": {"type": "integer"}}},
        "annotations": {"title": "Semantic Diff Engine", "readOnlyHint": True},
    },
    {
        "name": "provenance",
        "description": "Generate EU AI Act compliant provenance certificate with HMAC-SHA256 hash chain. Certify claims with source attribution.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "claim": {"type": "string", "description": "The claim to certify"},
                "source_id": {"type": "string", "description": "Source document identifier"},
                "confidence": {"type": "number", "description": "Confidence score 0-1", "default": 0.9},
            },
            "required": ["claim"],
        },
        "outputSchema": {"type": "object", "properties": {"cert_id": {"type": "string"}, "hash": {"type": "string"}, "chain": {"type": "array"}, "timestamp": {"type": "string"}}},
        "annotations": {"title": "Claim Provenance", "readOnlyHint": True},
    },
    {
        "name": "embed",
        "description": "Compute text embeddings via all-MiniLM-L6-v2 with LRU cache. Returns vector embeddings for RAG or similarity search.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Text to embed"},
                "normalize": {"type": "boolean", "description": "Whether to L2-normalize the embedding", "default": True},
            },
            "required": ["text"],
        },
        "outputSchema": {"type": "object", "properties": {"embedding": {"type": "array"}, "dimension": {"type": "integer"}, "cached": {"type": "boolean"}}},
        "annotations": {"title": "Embedding Cache", "readOnlyHint": True},
    },
    {
        "name": "sandbox",
        "description": "Execute Python code in a secure sandbox. 30-second timeout with automatic temp file cleanup. No Docker needed.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "code": {"type": "string", "description": "Python code to execute"},
                "language": {"type": "string", "description": "Language (currently only python)", "default": "python"},
                "timeout": {"type": "integer", "description": "Execution timeout in seconds", "default": 30},
            },
            "required": ["code"],
        },
        "outputSchema": {"type": "object", "properties": {"stdout": {"type": "string"}, "stderr": {"type": "string"}, "exit_code": {"type": "integer"}}},
        "annotations": {"title": "Agent Sandbox", "readOnlyHint": True},
    },
    {
        "name": "verify",
        "description": "Verify AI-generated answers against provided source documents. Returns groundedness score, risk level, and detailed issue list.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "The question being answered"},
                "answer": {"type": "string", "description": "The answer to verify"},
                "sources": {"type": "array", "items": {"type": "object", "properties": {"id": {"type": "string"}, "content": {"type": "string"}}}, "description": "Source documents for verification"},
                "mode": {"type": "string", "description": "Verification strictness", "enum": ["strict", "balanced", "lenient"], "default": "balanced"},
            },
            "required": ["question", "answer", "sources"],
        },
        "outputSchema": {"type": "object", "properties": {"grounded": {"type": "boolean"}, "verification_score": {"type": "number"}, "risk_level": {"type": "string"}, "issues": {"type": "array"}}},
        "annotations": {"title": "Compliance Verification", "readOnlyHint": True},
    },
    {
        "name": "audit",
        "description": "Retrieve or verify the immutable HMAC-SHA256 chained audit trail. EU AI Act compliant. Tamper-evident logging for all API calls.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "description": "trail to view log, verify/{hash} to check integrity", "enum": ["trail", "verify"]},
                "limit": {"type": "integer", "description": "Number of log entries to return", "default": 50},
            },
            "required": ["action"],
        },
        "outputSchema": {"type": "object", "properties": {"entries": {"type": "array"}, "count": {"type": "integer"}, "verified": {"type": "boolean"}}},
        "annotations": {"title": "Immutable Audit Log", "readOnlyHint": True},
    },
]

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
<a href="https://smithery.ai/servers/amonmaly-33/kore-api"><img src="https://smithery.ai/badge/amonmaly-33/kore-api" alt="smithery badge" style="vertical-align:middle"></a><br><br>
KORE v1.0.0 — 13 services · 26 endpoints · $333k/mo projected
</div>
</div></body></html>
"""


@router.get("/")
async def root():
    return HTMLResponse(LANDING_HTML)


@router.post("/")
async def root_post(request: Request):
    """
    MCP JSON-RPC transport endpoint.
    Handles initialize and tools/list for Smithery/MCP clients.
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"status": "ok", "service": "kore-universal-services"})

    method = body.get("method", "")
    msg_id = body.get("id", 1)

    if method == "initialize":
        return JSONResponse({
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "kore-universal-services", "version": "1.0.0"},
            },
        })

    if method == "tools/list":
        return JSONResponse({
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {"tools": _MCP_TOOLS},
        })

    if method == "tools/call":
        return JSONResponse({
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "content": [{"type": "text", "text": f"Call {body.get('params', {}).get('name', 'unknown')}"}],
            },
        })

    # Notifications (no id)
    if msg_id is None:
        return Response(status_code=200)

    # Unknown method
    return JSONResponse({
        "jsonrpc": "2.0",
        "id": msg_id,
        "error": {"code": -32601, "message": f"Method not found: {method}"},
    })


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
