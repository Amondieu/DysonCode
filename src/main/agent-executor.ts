export interface AgentExecuteArgs {
  sessionId: string;
  nodeId: string;
  prompt: string;
  model?: string;
  context?: string;
}

export interface AgentExecuteResult {
  content: string;
  tokensUsed: number;
}

interface AgentEndpoint {
  url: string;
  apiKey: string;
  model?: string;
  label: string;
}

function normalizeUrl(url: string) {
  return url.replace(/\/$/, '');
}

function defaultApiKeyForUrl(url: string) {
  return url.includes(':4000') ? 'grey-os-local' : 'sk-local';
}

function parseAgentContent(payload: {
  choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  usage?: { total_tokens?: number };
}) {
  const rawContent = payload.choices?.[0]?.message?.content;
  const content = Array.isArray(rawContent)
    ? rawContent.map((part) => part.text || '').join('')
    : typeof rawContent === 'string'
      ? rawContent
      : '';

  return {
    content,
    tokensUsed: payload.usage?.total_tokens ?? content.length,
  };
}

async function checkEndpoint(endpoint: AgentEndpoint): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${endpoint.url}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${endpoint.apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok || response.status === 401; // 401 = reachable but needs auth
  } catch {
    return false;
  }
}

function buildStatusReport(endpoints: AgentEndpoint[], results: boolean[]): string {
  const lines = endpoints.map((ep, i) => {
    const status = results[i] ? 'reachable' : 'unreachable';
    return `  ${ep.label}: ${ep.url} → ${status}`;
  });
  return `No LLM backend available. Checked:\n${lines.join('\n')}`;
}

export async function executeAgent(args: AgentExecuteArgs): Promise<AgentExecuteResult> {
  const routingMode = (args.model?.startsWith('local:') ? 'local'
    : args.model?.startsWith('cloud:') ? 'cloud'
    : process.env.KORE_ROUTING_MODE) || 'hybrid';

  const effectiveModel = args.model?.replace(/^(local|cloud):/, '') || undefined;

  const localUrl = normalizeUrl(process.env.KORE_LOCAL_URL || 'http://127.0.0.1:8080/v1');
  const localApiKey = process.env.KORE_LOCAL_API_KEY || 'sk-local';
  const localModel = process.env.KORE_LOCAL_MODEL || 'coder';

  const litellmUrl = normalizeUrl(process.env.LITELLM_BASE_URL || process.env.OPENAI_BASE_URL || 'http://127.0.0.1:4000/v1');
  const litellmApiKey = process.env.LITELLM_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENAI_TOKEN || defaultApiKeyForUrl(litellmUrl);
  const litellmModel = effectiveModel || process.env.KORE_AGENT_MODEL || 'flash-k2';

  const fallbackUrl = normalizeUrl(process.env.KORE_AGENT_FALLBACK_URL || 'http://127.0.0.1:8080/v1');
  const fallbackModel = process.env.KORE_AGENT_FALLBACK_MODEL || 'SET-A';
  const fallbackApiKey = process.env.KORE_AGENT_FALLBACK_API_KEY || defaultApiKeyForUrl(fallbackUrl);

  // Direct cloud fallback — DeepSeek API (bypasses local proxy)
  const cloudDirectKey = process.env.KORE_CLOUD_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  const cloudDirectUrl = process.env.KORE_CLOUD_API_URL || 'https://api.deepseek.com/v1';
  const cloudDirectModel = process.env.KORE_CLOUD_API_MODEL || 'deepseek-chat';

  let endpoints: AgentEndpoint[];

  if (routingMode === 'local') {
    endpoints = [
      { url: localUrl, apiKey: localApiKey, model: effectiveModel || localModel, label: 'Local (llama-swap)' },
    ];
    if (cloudDirectKey) {
      endpoints.push({ url: cloudDirectUrl, apiKey: cloudDirectKey, model: cloudDirectModel, label: 'Cloud (DeepSeek API)' });
    }
  } else if (routingMode === 'cloud') {
    endpoints = [
      { url: litellmUrl, apiKey: litellmApiKey, model: litellmModel, label: 'Cloud (litellm proxy)' },
    ];
    if (fallbackUrl !== litellmUrl) {
      endpoints.push({ url: fallbackUrl, apiKey: fallbackApiKey, model: fallbackModel, label: 'Fallback (local)' });
    }
    if (cloudDirectKey) {
      endpoints.push({ url: cloudDirectUrl, apiKey: cloudDirectKey, model: cloudDirectModel, label: 'Cloud (DeepSeek API)' });
    }
  } else {
    // hybrid
    endpoints = [
      { url: litellmUrl, apiKey: litellmApiKey, model: litellmModel, label: 'Cloud (litellm proxy)' },
    ];
    if (fallbackUrl !== litellmUrl) {
      endpoints.push({ url: fallbackUrl, apiKey: fallbackApiKey, model: fallbackModel, label: 'Fallback (local)' });
    }
    if (cloudDirectKey) {
      endpoints.push({ url: cloudDirectUrl, apiKey: cloudDirectKey, model: cloudDirectModel, label: 'Cloud (DeepSeek API)' });
    }
  }

  // Pre-flight: check which endpoints are reachable
  const reachable = await Promise.all(endpoints.map((ep) => checkEndpoint(ep)));
  const anyReachable = reachable.some(Boolean);

  if (!anyReachable) {
    throw new Error(buildStatusReport(endpoints, reachable));
  }

  const systemMessage = args.context?.trim()
    ? `Use the provided repo/graph context while answering.\n\n${args.context.trim()}`
    : 'Answer directly and concisely.';

  let lastError: Error | null = null;

  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    if (!reachable[i]) {
      console.warn(`[agent-executor] ${endpoint.label}: ${endpoint.url} skipped (unreachable)`);
      continue;
    }

    try {
      const response = await fetch(`${endpoint.url}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${endpoint.apiKey}`,
        },
        body: JSON.stringify({
          model: endpoint.model || litellmModel,
          temperature: 0.2,
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: args.prompt },
          ],
        }),
      });

      if (response.ok) {
        const parsed = parseAgentContent(await response.json() as {
          choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
          usage?: { total_tokens?: number };
        });

        if (!parsed.content.trim()) {
          throw new Error(`${endpoint.label} returned no content`);
        }

        return parsed;
      }

      const errorBody = await response.text();
      if (response.status === 400 || response.status === 401) {
        throw new Error(`${endpoint.label} auth/config error ${response.status}: ${errorBody}`);
      }

      lastError = new Error(`${endpoint.label} error ${response.status}: ${errorBody}`);
    } catch (error) {
      if (error instanceof Error && /auth\/config error/.test(error.message)) {
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(String(error));
      if (i < endpoints.length - 1) {
        console.warn(`[agent-executor] ${endpoint.label} failed, trying next: ${lastError.message}`);
        continue;
      }
    }
  }

  throw lastError ?? new Error('All LLM endpoints failed');
}
