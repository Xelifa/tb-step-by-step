import { IProvider } from '../types/provider';
import { ProviderType, ModelConfig } from '../types/config';
import { callOpenAICompatible } from './openai-compatible-helper';

export class OpenAIProvider implements IProvider {
  readonly name = 'OpenAI';
  readonly type: ProviderType = 'openai';

  async call(prompt: string, config: ModelConfig): Promise<string> {
    // Read API key from environment
    const apiKey = process.env[config.api_key_env];
    if (!apiKey) {
      throw new Error(`API key not found: ${config.api_key_env}`);
    }

    // Use shared OpenAI-compatible helper
    return await callOpenAICompatible(
      config.base_url,
      '/chat/completions',
      apiKey,
      prompt,
      config
    );
  }
}
