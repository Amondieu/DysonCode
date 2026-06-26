# Dyson Frame Modulator

Interactive chat UI component: toggleable cognitive Frame modulators beneath the chat input.
Each Frame transforms text via LLM call through your liteLLM endpoint.

---

## Files

| File | Purpose |
|------|---------|
| `dyson-frame-modulator.html` | Standalone demo — open in browser, no build step |
| `DysonFrameModulator.jsx`    | React component (drop into any React chat UI) |
| `DysonFrameModulator.css`    | Component styles |

---

## Quick Start (Standalone Demo)

1. Open `dyson-frame-modulator.html` in any browser
2. Enter your LiteLLM base URL and API key in the bottom bar
3. Select `gpt-4.5-preview` (or your Abacus model name)
4. Toggle Frame symbols, type a message, click **Fuse ⚡**
5. Edit the transformed text, press Enter to send

---

## React Integration

```jsx
import DysonFrameModulator from './DysonFrameModulator';
import './DysonFrameModulator.css';

function ChatInterface() {
  const [input, setInput] = useState('');

  const handleSend = (text) => {
    // your existing send logic
    sendMessage(text);
    setInput('');
  };

  return (
    <div className="chat-layout">
      <ChatHistory />
      <DysonFrameModulator
        value={input}
        onChange={setInput}
        onSend={handleSend}
        apiConfig={{
          baseUrl: 'https://your-litellm.example.com/v1',
          apiKey: process.env.LITELLM_API_KEY,
          model: 'gpt-4.5-preview',
        }}
      />
    </div>
  );
}
```

---

## The Five Frames

| Symbol | Frame  | ID        | Cognitive Operation              | LLM Temperature |
|--------|--------|-----------|----------------------------------|-----------------|
| Σ      | ΣΚΟΠ   | sigma     | Field Collapse — constraint injection | 0.4         |
| Ω      | IDEVA  | ideva     | Compression — max signal density      | 0.4         |
| Φ      | ΦΩΡGΕ  | phworge   | Invention — expand category, seed contradictions | 0.9 |
| ∞      | ΩMEGA  | omega     | Cross-Domain Bridge — find isomorphisms | 0.4        |
| ◉      | Dyson  | dyson     | Harvest Geometry — capture before building | 0.4    |

---

## Fusion Frames (multi-select)

When exactly two Frames are active and a predefined fusion exists, a named Fusion Frame activates:

| Combination      | Fusion Name          | Emergent Effect |
|-----------------|----------------------|-----------------|
| ΣΚΟΠ + IDEVA    | COMPRESSION COLLAPSE | Max constraint at min tokens |
| ΣΚΟΠ + ΦΩΡGΕ   | INVENTION GATE       | Collapse then explode invention space |
| ΦΩΡGΕ + ΩMEGA  | CROSS-DOMAIN INVENTION | Abstract pattern → novel invention |
| ΣΚΟΠ + Dyson   | HARVEST GATE         | Constraint + audit existing capacity |
| IDEVA + Dyson  | DENSE HARVEST        | Harvest existing, expressed densely |

For any other multi-Frame combination, a generic fusion prompt is constructed automatically.

---

## Adding Custom Frames

```js
// In DysonFrameModulator.jsx, add to the FRAMES array:
{
  id: 'myframe',
  name: 'MYFRAME',
  symbol: '⬡',
  color: '#ff6b6b',
  glowColor: 'rgba(255,107,107,0.28)',
  description: 'Short description for tooltip',
  systemPrompt: `You are applying the MYFRAME transformation.
Transform the following text by:
1. ...
Output only the transformed text. No explanation.`,
}
```

---

## LiteLLM / Abacus Configuration

The Fuse button calls:

```
POST {baseUrl}/chat/completions
Authorization: Bearer {apiKey}
{
  "model": "gpt-4.5-preview",
  "messages": [
    { "role": "system", "content": "<frame system prompt>" },
    { "role": "user",   "content": "<your input text>" }
  ],
  "max_tokens": 1024,
  "temperature": 0.4
}
```

This is OpenAI-compatible and works with any LiteLLM proxy endpoint.
For Abacus AI, set the base URL to your Abacus LiteLLM endpoint and use the model name `gpt-4.5-preview` or whatever model alias your workspace uses.

---

## Keyboard Navigation

- **Tab** — move between Frame buttons
- **Space / Enter** on a Frame button — toggle it
- **Enter** in textarea — send message (Shift+Enter for newline)
- All interactive elements have `aria-pressed`, `aria-label`, and `:focus-visible` rings
