// Supported model providers
export type ProviderType =
  | 'openai'
  | 'deepseek'
  | 'glm'
  | 'claude-compatible'
  | 'custom';

// Model configuration stored in config/model.json
export interface ModelConfig {
  provider: ProviderType;
  base_url: string;
  api_key_env: string;  // Environment variable name, NOT the key itself
  model: string;
  temperature: number;
  max_tokens: number;
  timeout_seconds: number;
  stream: boolean;
}

// User input during interactive configuration
export interface ConfigInput {
  provider: ProviderType;
  base_url: string;
  api_key_env: string;
  api_key_value: string;  // Temporary, will be saved to .env
  model: string;
  temperature: number;
  max_tokens: number;
  timeout_seconds: number;
  stream: boolean;
}