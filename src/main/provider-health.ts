// src/main/provider-health.ts
// P4.8 — LiteLLM provider health check

export interface HealthResult {
  available: boolean;
  latencyMs: number;
  error?: string;
}

export async function checkLiteLLM(baseUrl = 'http://localhost:4000'): Promise<HealthResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
    return { available: res.ok, latencyMs: Date.now() - start };
  } catch (err: any) {
    return {
      available: false,
      latencyMs: Date.now() - start,
      error: err.code === 'ABORT_ERR'
        ? 'LiteLLM not responding (timeout). Run: litellm --config litellm.config.yaml'
        : `LiteLLM unreachable: ${err.message}`,
    };
  }
}

/**
 * Block any mode switch that requires a provider that is down.
 * Returns null if safe, or an error message if the switch should be blocked.
 */
export async function guardModeSwitch(
  targetMode: string,
  baseUrl = 'http://localhost:4000'
): Promise<string | null> {
  if (targetMode === 'stealth') return null;

  const health = await checkLiteLLM(baseUrl);
  if (!health.available) {
    return health.error ?? 'Provider unavailable. Cannot switch mode.';
  }
  return null;
}
