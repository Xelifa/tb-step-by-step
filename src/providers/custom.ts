import { IProvider } from '../types/provider';
import { ProviderType, ModelConfig } from '../types/config';
import { callOpenAICompatible } from './openai-compatible-helper';

export class CustomProvider implements IProvider {
  readonly name = 'Custom';
  readonly type: ProviderType = 'custom';

  async call(prompt: string, config: ModelConfig): Promise<string> {
    // Read API key from environment
    const apiKey = process.env[config.api_key_env];
    if (!apiKey) {
      throw new Error(`API key not found: ${config.api_key_env}`);
    }

    // Assume OpenAI-compatible API for custom providers
    return await callOpenAICompatible(
      config.base_url,
      '/chat/completions',
      apiKey,
      prompt,
      config
    );
  }

  async callAPI(
    baseUrl: string,
    apiKey: string,
    model: string,
    prompt: string,
    config: ModelConfig
  ): Promise<string> {
    return await callOpenAICompatible(baseUrl, '/chat/completions', apiKey, prompt, config);
  }
}
