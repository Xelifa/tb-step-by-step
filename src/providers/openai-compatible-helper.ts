import { ModelConfig } from '../types/config';
import { joinUrl } from '../utils/url';

// Shared helper for OpenAI-compatible providers
export async function callOpenAICompatible(
  baseUrl: string,
  endpoint: string,
  apiKey: string,
  prompt: string,
  config: ModelConfig
): Promise<string> {
  const url = joinUrl(baseUrl, endpoint);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      stream: false
    }),
    signal: AbortSignal.timeout(config.timeout_seconds * 1000)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error ${response.status}: ${error}`);
  }

  const data = await response.json() as any;

  // Defensive parsing
  if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
    throw new Error('Invalid response: missing choices array');
  }

  const choice = data.choices[0];
  if (!choice.message || typeof choice.message.content !== 'string') {
    throw new Error('Invalid response: missing message content');
  }

  return choice.message.content;
}
