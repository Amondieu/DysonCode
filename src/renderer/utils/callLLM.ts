/**
 * callLLM — thin wrapper around the Electron agent executor for the jcode agent loop.
 *
 * Takes an array of messages [{role, content}], extracts system prompt from messages[0]
 * if role is 'system', and sends the user messages to the agent executor via preload bridge.
 */

type LLMMessage = { role: string; content: string };

export async function callLLM(messages: LLMMessage[]): Promise<string> {
  const dyson = (window as any).dyson;
  if (!dyson?.agent?.execute) {
    throw new Error('Preload bridge not available — window.dyson.agent.execute is missing');
  }

  // Extract system prompt from messages[0] if present
  const systemMsg = messages[0]?.role === 'system' ? messages[0].content : undefined;
  const userMessages = systemMsg ? messages.slice(1) : messages;

  // Use the LAST user message as the prompt; join prior context before it
  const lastUserMsg = [...userMessages].reverse().find(m => m.role === 'user');
  const priorMessages = userMessages.filter(m => m !== lastUserMsg);

  const priorContext = priorMessages
    .map(m => `[${m.role}]: ${typeof m.content === 'string' ? m.content.slice(0, 2000) : ''}`)
    .join('\n\n');

  const prompt = priorContext
    ? `${priorContext}\n\n---\n\n${lastUserMsg?.content || ''}`
    : lastUserMsg?.content || '';

  const result = await dyson.agent.execute({
    sessionId: 'jcode-agent',
    nodeId: 'jcode-chat',
    prompt,
    model: 'flash-k2',
    context: systemMsg,
  });

  return typeof result.content === 'string'
    ? result.content
    : String(result.content || '');
}
