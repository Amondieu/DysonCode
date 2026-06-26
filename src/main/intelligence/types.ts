export interface KnowledgeItem {
  id: string;
  content: string;
  hScore: number;
  source: string;
  harvestedAt: string;
}

export interface DysonIntelligence {
  knowledgeItems: KnowledgeItem[];
  summary: string;
  harvestedAt: string;
}

export function buildDysonPrimer(intel: DysonIntelligence | null): string {
  if (!intel || intel.knowledgeItems.length === 0) return '';
  const items = intel.knowledgeItems.slice(0, 5).map((ki) =>
    `### ${ki.id} (score: ${ki.hScore})\n${ki.content.slice(0, 200)}`
  ).join('\n\n');
  return `## DysonSphere Knowledge\n${items}`;
}
