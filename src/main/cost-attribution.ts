// src/main/cost-attribution.ts
// P3.7 — Turn-level cost attribution layer scoring

export interface LayerAttribution {
  layerName: string;
  tokensSent: number;
  referencedInOutput: number;
  utilityScore: number; // 0-1
}

/**
 * Score how much of each context layer was actually referenced in the response.
 * Uses keyword overlap as a proxy for "attention."
 */
export function attributeLayerCosts(
  layers: Record<string, string>,
  response: string
): LayerAttribution[] {
  const responseWords = new Set(
    response.toLowerCase().split(/\W+/).filter(w => w.length > 4)
  );

  return Object.entries(layers).map(([name, content]) => {
    const contentWords = content.toLowerCase().split(/\W+/).filter(w => w.length > 4);
    const tokensSent = Math.ceil(content.length / 4);
    const referenced = contentWords.filter(w => responseWords.has(w)).length;
    const utilityScore = contentWords.length > 0
      ? Math.min(referenced / contentWords.length, 1)
      : 0;

    return { layerName: name, tokensSent, referencedInOutput: referenced, utilityScore };
  });
}

/**
 * After N turns, find the consistently low-utility layer and surface a suggestion.
 */
export function getSuggestion(history: LayerAttribution[][]): string | null {
  if (history.length < 5) return null;

  const allLayers = [...new Set(history.flatMap(h => h.map(l => l.layerName)))];
  for (const layer of allLayers) {
    const scores = history
      .map(h => h.find(l => l.layerName === layer)?.utilityScore ?? 0);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (avg < 0.08 && layer !== 'system_core') {
      return `Layer "${layer}" has ${Math.round(avg * 100)}% utility over last ${history.length} turns. Consider switching to a leaner mode.`;
    }
  }
  return null;
}
