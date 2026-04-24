// app/api/chat/route.js
// Server-side Haiku chat endpoint for the Ask Christy panel
// Keeps ANTHROPIC_API_KEY off the browser — never exposed to the client

import { CHRISTY_SYSTEM_PROMPT, HAIKU_MODEL } from '../../../lib/governance.js';
import { GOVERNANCE_ERRORS } from '../../../lib/governance.js';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const { messages, metricsContext, flagsContext } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }

    const systemPrompt = `${CHRISTY_SYSTEM_PROMPT}

You are also available to answer care manager questions about today's data.
Be concise, clinical, and actionable.
Today's metrics: ${JSON.stringify(metricsContext ?? {})}.
Top flagged patients today: ${JSON.stringify(flagsContext ?? [])}.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 512,
        system: systemPrompt,
        messages
      })
    });

    if (!response.ok) {
      throw new Error(`${GOVERNANCE_ERRORS.HAIKU_PARSE_FAIL}: ${response.status}`);
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text ?? 'Unable to process. Please try again.';

    return Response.json({ reply });

  } catch (err) {
    console.error('[Christy Chat]', err.message);
    return Response.json({ error: 'Chat unavailable. Please try again.' }, { status: 500 });
  }
}
