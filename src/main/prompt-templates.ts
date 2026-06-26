// src/main/prompt-templates.ts
// P2.5 — Mode-aware prompt templates for structural output differentiation

export type Mode = 'fast' | 'balanced' | 'deep' | 'audit' | 'inventor' | 'stealth';

const TEMPLATES: Record<Mode, (message: string) => string> = {
  fast: (msg) =>
    `Answer directly and concisely (≤50 words). No reasoning shown.\n\n${msg}`,

  balanced: (msg) =>
    `${msg}`,

  deep: (msg) =>
    `Think step by step. State the core tension first, then reason through it.\n\n${msg}`,

  audit: (msg) =>
    `Complete every section of the audit schema. Be exhaustive and structured.\n\nAUDIT REQUEST: ${msg}`,

  inventor: (msg) =>
    `Generate 3 invention candidates. Each must: (1) name the tension it resolves, ` +
    `(2) describe the invention, (3) name the new problem class it opens.\n\nINVENTION REQUEST: ${msg}`,

  stealth: (msg) =>
    `${msg}`,
};

export function applyModeTemplate(message: string, mode: Mode): string {
  const template = TEMPLATES[mode] ?? TEMPLATES.balanced;
  return template(message);
}

export const MODE_MAX_TOKENS: Record<Mode, number> = {
  fast: 256,
  balanced: 1024,
  deep: 4096,
  audit: 8192,
  inventor: 2048,
  stealth: 1024,
};

export const MODE_SYSTEM_SUFFIX: Record<Mode, string> = {
  fast: 'You MUST stay within 50 words. Return only the answer.',
  balanced: 'You MUST stay within 200 words. Show key steps only.',
  deep: 'You MUST stay within 800 words. Show full reasoning chain.',
  audit: 'Complete every section. No length limit. Be exhaustive.',
  inventor: 'You MUST stay within 500 words per candidate.',
  stealth: 'You MUST stay within 200 words. No external references.',
};
