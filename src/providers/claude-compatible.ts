import { IProvider } from '../types/provider';
import { ProviderType, ModelConfig } from '../types/config';
import { joinUrl } from '../utils/url';

export class ClaudeCompatibleProvider implements IProvider {
  readonly name = 'Claude Compatible';
  readonly type: ProviderType = 'claude-compatible';

  async call(prompt: string, config: ModelConfig): Promise<string> {
    // Read API key from environment
    const apiKey = process.env[config.api_key_env];
    if (!apiKey) {
      throw new Error(`API key not found: ${config.api_key_env}`);
    }

    const url = joinUrl(config.base_url, '/v1/messages');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.max_tokens,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: AbortSignal.timeout(config.timeout_seconds * 1000)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error ${response.status}: ${error}`);
    }

    const data = await response.json() as any;

    // Defensive parsing
    if (!data.content || !Array.isArray(data.content)) {
      throw new Error('Invalid Claude response: missing content array');
    }

    const textBlock = data.content.find((block: any) => block.type === 'text');
    if (!textBlock || typeof textBlock.text !== 'string') {
      throw new Error('Invalid Claude response: no text block found');
    }

    return textBlock.text;
  }
}
