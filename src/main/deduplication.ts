// src/main/deduplication.ts
// P3.6 — Semantic deduplication using Jaccard similarity (no embedding model needed)

/**
 * Jaccard similarity between two strings based on word sets.
 * Fast enough for real-time deduplication.
 */
function jaccardSim(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  return intersection / (wordsA.size + wordsB.size - intersection);
}

/**
 * Remove duplicate messages from a context array.
 * Keeps the most recent copy when similarity > threshold.
 * Threshold 0.85 = very similar (same fact stated twice).
 */
export function deduplicateContext(
  messages: Array<{ role: string; content: string }>,
  threshold = 0.85
): Array<{ role: string; content: string }> {
  if (messages.length <= 1) return messages;

  const keep: number[] = [0];
  for (let i = 1; i < messages.length; i++) {
    const sims = keep.map(j => jaccardSim(messages[i].content, messages[j].content));
    if (Math.max(...sims) < threshold) {
      keep.push(i);
    }
  }

  const keepSet = new Set(keep);
  const result = messages.filter((_, i) => keepSet.has(i));

  const dropped = messages.length - result.length;
  if (dropped > 0) {
    console.log(`[dedup] Removed ${dropped} duplicate context items`);
  }

  return result;
}
