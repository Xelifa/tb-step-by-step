import { ProviderType } from '../types/config';
import { IProvider } from '../types/provider';
import { OpenAIProvider } from '../providers/openai';
import { DeepSeekProvider } from '../providers/deepseek';
import { GLMProvider } from '../providers/glm';
import { ClaudeCompatibleProvider } from '../providers/claude-compatible';
import { CustomProvider } from '../providers/custom';

// Provider registry - maps provider types to implementations
const PROVIDER_REGISTRY: Record<ProviderType, IProvider> = {
  'openai': new OpenAIProvider(),
  'deepseek': new DeepSeekProvider(),
  'glm': new GLMProvider(),
  'claude-compatible': new ClaudeCompatibleProvider(),
  'custom': new CustomProvider()
};

// Get provider by type - throws error for invalid types
export function getProvider(type: ProviderType): IProvider {
  const provider = PROVIDER_REGISTRY[type];
  if (!provider) {
    throw new Error(`Invalid provider type: ${type}. No mock providers allowed.`);
  }
  return provider;
}

// Get all supported provider types for user selection
export function getSupportedProviders(): ProviderType[] {
  return Object.keys(PROVIDER_REGISTRY) as ProviderType[];
}

// Validate provider exists (TypeScript enforces this, but runtime check too)
export function isValidProvider(type: string): type is ProviderType {
  return type in PROVIDER_REGISTRY;
}