# ZooCode Instructions — jcode Chat Interface Upgrade
# Dyson Sphere Project · 2026-06-25
# Target file: the chat interface of the jcode TUI/web implementation

---

## OBJECTIVE

Upgrade the existing jcode chat interface to:
1. Show user messages visibly in the conversation history
2. Stream assistant responses token-by-token in real time
3. Display tool call / work steps with color-coded success/failure indicators
4. Add a hover-triggered copy-to-clipboard button on assistant messages
5. (Bonus) Add additional UX improvements listed at the end

---

## FEATURE 1 — USER MESSAGES IN CHAT HISTORY

### What to change
The chat history must render the user's message immediately when the user submits it,
before any API call begins.

### Implementation pattern (frontend JS)

```javascript
function appendUserMessage(text) {
  const msg = document.createElement('div');
  msg.className = 'message message--user';
  msg.innerHTML = `
    <div class="message__avatar">You</div>
    <div class="message__body">${escapeHtml(text)}</div>
  `;
  chatContainer.appendChild(msg);
  scrollToBottom();
}

// Call this BEFORE starting the API request:
submitButton.addEventListener('click', () => {
  const text = inputField.value.trim();
  if (!text) return;
  appendUserMessage(text);
  inputField.value = '';
  startAssistantStream(text);   // existing or new streaming function
});
```

### CSS

```css
.message--user {
  display: flex;
  flex-direction: row-reverse;
  gap: var(--space-2);
  align-items: flex-start;
  padding: var(--space-3) var(--space-4);
}
.message--user .message__body {
  background: var(--color-primary-highlight);
  color: var(--color-text);
  border-radius: var(--radius-lg) var(--radius-sm) var(--radius-lg) var(--radius-lg);
  padding: var(--space-3) var(--space-4);
  max-width: 70%;
  font-size: var(--text-sm);
  white-space: pre-wrap;
  word-break: break-word;
}
.message--user .message__avatar {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  padding-top: var(--space-1);
  white-space: nowrap;
}
```

---

## FEATURE 2 — REAL-TIME TOKEN STREAMING

### Backend requirement
The API endpoint must use Server-Sent Events (SSE) or chunked transfer encoding.
If you are calling OpenAI / Anthropic / Ollama, pass `stream: true`.

### If using SSE (recommended for Python/FastAPI backend)

**Python (FastAPI) backend:**
```python
from fastapi.responses import StreamingResponse
import json

@app.post("/api/chat")
async def chat_stream(request: ChatRequest):
    async def generate():
        async for chunk in llm_client.stream(request.messages):
            token = chunk.choices[0].delta.content or ""
            yield f"data: {json.dumps({'token': token})}\n\n"
        yield "data: [DONE]\n\n"
    return StreamingResponse(generate(), media_type="text/event-stream")
```

**If using Ollama locally:**
```python
import ollama

@app.post("/api/chat")
async def chat_stream(request: ChatRequest):
    async def generate():
        stream = ollama.chat(
            model=request.model,
            messages=request.messages,
            stream=True
        )
        for chunk in stream:
            token = chunk['message']['content']
            yield f"data: {json.dumps({'token': token})}\n\n"
        yield "data: [DONE]\n\n"
    return StreamingResponse(generate(), media_type="text/event-stream")
```

### Frontend streaming consumer

```javascript
function startAssistantStream(userText) {
  // 1. Create the assistant message bubble immediately (empty)
  const bubble = appendAssistantBubble();

  // 2. Open SSE connection
  const eventSource = new EventSource('/api/chat?' + new URLSearchParams({
    message: userText
  }));

  // Alternatively, for POST with fetch + ReadableStream:
  streamWithFetch('/api/chat', { message: userText }, bubble);
}

// POST-based streaming (works better for auth headers):
async function streamWithFetch(url, payload, bubble) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') { finalizeAssistantBubble(bubble); return; }
      try {
        const { token } = JSON.parse(data);
        appendToken(bubble, token);
      } catch {}
    }
  }
}

function appendAssistantBubble() {
  const wrapper = document.createElement('div');
  wrapper.className = 'message message--assistant';
  wrapper.innerHTML = `
    <div class="message__avatar">Ω</div>
    <div class="message__body" data-streaming="true"></div>
    <button class="copy-btn" title="Copy to clipboard" aria-label="Copy message">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
    </button>
  `;
  chatContainer.appendChild(wrapper);
  scrollToBottom();
  return wrapper;
}

function appendToken(bubble, token) {
  const body = bubble.querySelector('.message__body');
  body.textContent += token;  // use textContent for plain text
  // If markdown rendering: buffer full response, then render at [DONE]
  scrollToBottom();
}

function finalizeAssistantBubble(bubble) {
  const body = bubble.querySelector('.message__body');
  body.removeAttribute('data-streaming');
  // Optionally render markdown here:
  // body.innerHTML = marked.parse(body.textContent);
  setupCopyButton(bubble);
}
```

---

## FEATURE 3 — TOOL CALL STEPS WITH COLOR INDICATORS

### Concept
Each tool call (GNOSIS, KRONOS, PHWORGE, IDEVA, LOGOS, HARNESS, etc.)
appears as a collapsible step row BEFORE the final assistant message, matching
the jcode TUI style.

### Step states and colors

| State         | Color token              | CSS class              | Icon |
|--------------|--------------------------|------------------------|------|
| Running       | --color-gold             | .step--running         | ⟳ (spinning) |
| Success       | --color-success          | .step--success         | ✓ |
| Failed        | --color-error            | .step--failed          | ✗ |
| Skipped       | --color-text-faint       | .step--skipped         | — |

### Backend: emit step events via SSE

```python
# Emit before a tool call:
yield f"data: {json.dumps({'type': 'step_start', 'id': 'step-1', 'label': 'GNOSIS: awareness scan'})}\n\n"

# After success:
yield f"data: {json.dumps({'type': 'step_done', 'id': 'step-1', 'status': 'success', 'detail': '0.84 awareness'})}\n\n"

# After failure:
yield f"data: {json.dumps({'type': 'step_done', 'id': 'step-1', 'status': 'failed', 'detail': 'timeout after 5s'})}\n\n"
```

### Frontend: step rendering

```javascript
const steps = {};  // id → DOM element

function handleStreamEvent(data) {
  if (data.type === 'step_start') {
    const el = createStep(data.id, data.label);
    chatContainer.insertBefore(el, currentAssistantBubble);
    steps[data.id] = el;
  }
  else if (data.type === 'step_done') {
    updateStep(data.id, data.status, data.detail);
  }
  else if (data.token) {
    appendToken(currentAssistantBubble, data.token);
  }
}

function createStep(id, label) {
  const el = document.createElement('div');
  el.className = 'step step--running';
  el.dataset.stepId = id;
  el.innerHTML = `
    <span class="step__icon">
      <svg class="spin" width="12" height="12" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.5">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
    </span>
    <span class="step__label">${escapeHtml(label)}</span>
    <span class="step__detail"></span>
    <span class="step__duration"></span>
  `;
  el._startTime = Date.now();
  return el;
}

function updateStep(id, status, detail) {
  const el = steps[id];
  if (!el) return;
  el.className = `step step--${status}`;
  const elapsed = ((Date.now() - el._startTime) / 1000).toFixed(2);
  el.querySelector('.step__icon').innerHTML = status === 'success'
    ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
    : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  el.querySelector('.step__detail').textContent = detail || '';
  el.querySelector('.step__duration').textContent = elapsed + 's';
}
```

### CSS for steps

```css
.step {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-4);
  font-size: var(--text-xs);
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  color: var(--color-text-muted);
  border-left: 2px solid transparent;
  transition: border-color 200ms ease, color 200ms ease;
}

.step--running {
  border-left-color: var(--color-gold);
  color: var(--color-gold);
}
.step--success {
  border-left-color: var(--color-success);
  color: var(--color-success);
}
.step--failed {
  border-left-color: var(--color-error);
  color: var(--color-error);
}
.step--skipped {
  border-left-color: var(--color-text-faint);
  color: var(--color-text-faint);
}

.step__icon svg { display: inline-block; vertical-align: middle; }
.step__label { flex: 1; }
.step__detail { color: var(--color-text-faint); font-size: 0.9em; }
.step__duration { margin-left: auto; color: var(--color-text-faint); }

@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
.spin { animation: spin 0.8s linear infinite; }
```

---

## FEATURE 4 — COPY TO CLIPBOARD BUTTON

### Behavior
- Button appears in the bottom-right corner of each assistant message
- Visible only on hover of the message bubble (opacity 0 → 1 on hover)
- Shows a checkmark for 1.5s after copy, then reverts

### CSS

```css
.message--assistant {
  position: relative;
}
.copy-btn {
  position: absolute;
  bottom: var(--space-2);
  right: var(--space-2);
  opacity: 0;
  transition: opacity 180ms ease;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-surface-offset);
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
}
.message--assistant:hover .copy-btn {
  opacity: 1;
}
.copy-btn:hover {
  background: var(--color-surface-dynamic);
  color: var(--color-text);
}
.copy-btn.copied {
  color: var(--color-success);
  border-color: var(--color-success-highlight);
}
/* Hide during active streaming */
[data-streaming="true"] ~ .copy-btn {
  display: none;
}
```

### JS

```javascript
function setupCopyButton(bubble) {
  const btn = bubble.querySelector('.copy-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const text = bubble.querySelector('.message__body').textContent;
    try {
      await navigator.clipboard.writeText(text);
      btn.classList.add('copied');
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Copied
      `;
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        `;
      }, 1500);
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
  });
}
```

---

## BONUS FEATURES (Recommended Additions)

### B1 — Typing indicator while streaming
Show a pulsing "..." before the first token arrives:
```css
.typing-indicator {
  display: flex; gap: 4px; padding: var(--space-2) var(--space-4);
}
.typing-indicator span {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--color-text-faint);
  animation: bounce 1.2s ease-in-out infinite;
}
.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40%           { transform: translateY(-6px); opacity: 1; }
}
```
Remove it as soon as the first token arrives.

### B2 — Collapsible step groups
Wrap all steps for a single assistant turn in a `<details>` element:
```html
<details class="step-group" open>
  <summary class="step-group__summary">
    <span class="step-group__count">4 steps</span>
    <span class="step-group__status step-group__status--success">✓ Done in 3.2s</span>
  </summary>
  <!-- individual .step elements here -->
</details>
```
Auto-collapse after success. Keep open on failure.

### B3 — Message timestamps
Show relative time ("just now", "2m ago") on hover of each message.
Use `Intl.RelativeTimeFormat` — no library needed.

### B4 — Keyboard shortcuts
- `Enter` → submit (existing)
- `Shift+Enter` → newline in textarea
- `Escape` → cancel active stream (call `reader.cancel()` and `controller.abort()`)
- `Cmd/Ctrl+K` → focus input from anywhere

### B5 — Token speed indicator
Show live tokens/sec during streaming in the step area:
```javascript
let tokenCount = 0;
let streamStartTime = Date.now();
// On each token:
tokenCount++;
const tps = (tokenCount / ((Date.now() - streamStartTime) / 1000)).toFixed(1);
tpsIndicator.textContent = tps + ' tok/s';
```

### B6 — Auto-scroll with override
Auto-scroll to bottom while streaming. If the user manually scrolls up during
streaming, pause auto-scroll. Resume when they scroll back to bottom:
```javascript
let userScrolled = false;
chatContainer.addEventListener('scroll', () => {
  const atBottom = chatContainer.scrollHeight - chatContainer.scrollTop
                   <= chatContainer.clientHeight + 50;
  userScrolled = !atBottom;
});
function scrollToBottom() {
  if (!userScrolled)
    chatContainer.scrollTop = chatContainer.scrollHeight;
}
```

---

## IMPLEMENTATION CHECKLIST

- [ ] Backend: `stream=True` on LLM call, SSE endpoint with `text/event-stream`
- [ ] Backend: emit `step_start` and `step_done` events for each tool/agent call
- [ ] Frontend: `appendUserMessage()` called before API request
- [ ] Frontend: `streamWithFetch()` consuming SSE, calling `appendToken()` per token
- [ ] Frontend: `createStep()` / `updateStep()` for color-coded work steps
- [ ] Frontend: copy button hidden during stream, wired after `[DONE]`
- [ ] CSS: `.step--running` gold, `.step--success` green, `.step--failed` red
- [ ] CSS: `.copy-btn` opacity-0, opacity-1 on `.message--assistant:hover`
- [ ] Bonus: typing indicator, collapsible steps, Escape to abort, token speed

---

## NOTES FOR ZooCode

- All color tokens match the Nexus/Dyson Sphere palette already in use
- The font-mono stack (`JetBrains Mono`, `Fira Code`, `monospace`) for step labels
  matches the existing TUI aesthetic
- Do NOT use localStorage — all state is in-memory
- The copy button uses `navigator.clipboard.writeText` (HTTPS only; add a
  `document.execCommand('copy')` fallback for non-HTTPS local dev)
- If the existing interface is Python-based TUI (Textual/Rich), these patterns
  map to: Rich Live() for streaming, Panel with border_style='green'/'red' for steps,
  and pyperclip for copy — see the Textual equivalent section below

---

## TEXTUAL / RICH TUI EQUIVALENT (if jcode runs in terminal, not browser)

```python
from rich.live import Live
from rich.panel import Panel
from rich.console import Console
from rich.spinner import Spinner
from rich.text import Text
import pyperclip

console = Console()

# Streaming output with Live():
with Live(console=console, refresh_per_second=20) as live:
    response_text = ""
    for token in llm_stream:
        response_text += token
        live.update(Panel(response_text, title="Ω", border_style="cyan"))

# Step indicators:
def show_step(label, status):
    color = {"running": "yellow", "success": "green", "failed": "red"}[status]
    icon  = {"running": "⟳", "success": "✓", "failed": "✗"}[status]
    text = Text(f"{icon} {label}", style=color)
    console.print(text)

# Copy to clipboard (pyperclip):
pyperclip.copy(response_text)
console.print("[dim]Copied to clipboard[/dim]")
```

---
Generated by Perplexity Dyson Sphere Space · 2026-06-25
