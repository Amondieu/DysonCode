import { useIpc } from './useIpc';

export interface BlueprintRound {
  round: number;
  architectDraft: string;
  reviewerCritique: string;
  reviewerScore: number;
  reviewerObjections: string[];
}

export interface BlueprintResult {
  rounds: BlueprintRound[];
  finalArtifact: string;
  converged: boolean;
  finalScore: number;
  totalRounds: number;
}

export interface BlueprintArbitrationConfig {
  sessionTextId: string;
  intent: string;
  constraints: string[];
  architectModel: string;
  reviewerModel: string;
  convergenceThreshold?: number;
  maxRounds?: number;
  repoPath?: string | null;
}

function buildArchitectPrompt(intent: string, constraints: string[]) {
  return `You are the Architect model in a Blueprint planning session.

INTENT: ${intent}

CONSTRAINTS:
${constraints.map((constraint) => `- ${constraint}`).join('\n')}

Produce a structured Blueprint artifact: a clear plan with goals, approach, risks, and first executable step. Be precise and concrete.`;
}

function buildArchitectRevisionPrompt(
  intent: string,
  constraints: string[],
  rounds: BlueprintRound[],
) {
  const lastRound = rounds.at(-1)!;
  return `You are the Architect model revising your Blueprint draft.

ORIGINAL INTENT: ${intent}

CONSTRAINTS:
${constraints.map((constraint) => `- ${constraint}`).join('\n')}

YOUR PREVIOUS DRAFT:
${lastRound.architectDraft}

REVIEWER SCORE: ${lastRound.reviewerScore}/10
REVIEWER OBJECTIONS:
${lastRound.reviewerObjections.map((objection) => `- ${objection}`).join('\n') || '- none provided'}

REVIEWER CRITIQUE:
${lastRound.reviewerCritique}

Revise the Blueprint addressing every objection. Do not just rephrase — resolve each objection structurally.`;
}

function buildReviewerPrompt(
  intent: string,
  draft: string,
  priorRounds: BlueprintRound[],
) {
  const context = priorRounds.length > 0
    ? `\nThis is revision ${priorRounds.length + 1}. Prior score: ${priorRounds.at(-1)!.reviewerScore}/10.`
    : '';

  return `You are the Reviewer model evaluating a Blueprint draft.${context}

ORIGINAL INTENT: ${intent}

ARCHITECT DRAFT:
${draft}

Respond ONLY in this exact JSON format:
{
  "score": <0-10>,
  "objections": ["<specific structural objection 1>", "..."],
  "critique": "<1-2 sentence overall critique>"
}

Score 7+ means the blueprint is sound enough to proceed.
Score below 7 means it needs revision. Be precise and harsh.`;
}

function parseReviewerResponse(raw: string): {
  score: number;
  objections: string[];
  critique: string;
} {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        score: Number(parsed.score) || 0,
        objections: Array.isArray(parsed.objections) ? parsed.objections.map(String) : [],
        critique: String(parsed.critique || ''),
      };
    }
  } catch {
    // Fall through to heuristic extraction.
  }

  const scoreMatch = raw.match(/score[:\s]+(\d+)/i);
  return {
    score: scoreMatch ? parseInt(scoreMatch[1], 10) : 5,
    objections: [],
    critique: raw.slice(0, 200),
  };
}

export function useBlueprintArbitration() {
  const ipc = useIpc();

  async function run(config: BlueprintArbitrationConfig): Promise<BlueprintResult> {
    const {
      sessionTextId,
      intent,
      constraints,
      architectModel,
      reviewerModel,
      convergenceThreshold = 7,
      maxRounds = 3,
      repoPath,
    } = config;

    const rounds: BlueprintRound[] = [];
    let converged = false;
    let currentDraft = '';

    const baseContext = [
      repoPath ? `Repository: ${repoPath}` : '',
      'Work in planning mode first, not implementation mode.',
      'Prefer the smallest reversible slices that can later be executed in FLOW.',
    ].filter(Boolean).join('\n\n');

    for (let index = 0; index < maxRounds; index += 1) {
      const architectPrompt = index === 0
        ? buildArchitectPrompt(intent, constraints)
        : buildArchitectRevisionPrompt(intent, constraints, rounds);

      const architectResult = await ipc.agent.execute({
        sessionId: sessionTextId,
        nodeId: 'blueprint-architect',
        model: architectModel,
        prompt: architectPrompt,
        context: baseContext,
      });

      const reviewerResponse = await ipc.agent.execute({
        sessionId: sessionTextId,
        nodeId: 'blueprint-reviewer',
        model: reviewerModel,
        prompt: buildReviewerPrompt(intent, architectResult.content, rounds),
        context: baseContext,
      });

      const { score, objections, critique } = parseReviewerResponse(reviewerResponse.content);
      currentDraft = architectResult.content;

      rounds.push({
        round: index + 1,
        architectDraft: architectResult.content,
        reviewerCritique: critique,
        reviewerScore: score,
        reviewerObjections: objections,
      });

      if (score >= convergenceThreshold) {
        converged = true;
        break;
      }
    }

    return {
      rounds,
      finalArtifact: currentDraft,
      converged,
      finalScore: rounds.at(-1)?.reviewerScore ?? 0,
      totalRounds: rounds.length,
    };
  }

  return { run };
}
