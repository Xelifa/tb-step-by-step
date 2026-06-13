import { ModelConfig, ConfigInput, ProviderType } from '../types/config';
import { getSupportedProviders, isValidProvider } from './provider';
import { hasEnvVar, loadEnvFile, upsertEnvVar } from '../utils/env';
import { writeJSONFile, readJSONFile } from '../utils/file';
import { runModelGateTest } from './model-gate';
import { ProviderTestResult } from '../types/provider';

export const PROVIDER_DEFAULTS: Record<ProviderType, { base_url: string; suggested_model: string }> = {
  'openai': { base_url: 'https://api.openai.com/v1', suggested_model: 'gpt-4o' },
  'deepseek': { base_url: 'https://api.deepseek.com', suggested_model: 'deepseek-chat' },
  'glm': { base_url: 'https://open.bigmodel.cn/api/paas/v4', suggested_model: 'glm-4-plus' },
  'claude-compatible': { base_url: 'https://api.anthropic.com', suggested_model: 'claude-3-5-sonnet-latest' },
  'custom': { base_url: '', suggested_model: '' }
};

export const ENV_VAR_NAMES: Record<ProviderType, string> = {
  'openai': 'OPENAI_API_KEY',
  'deepseek': 'DEEPSEEK_API_KEY',
  'glm': 'GLM_API_KEY',
  'claude-compatible': 'CLAUDE_API_KEY',
  'custom': 'CUSTOM_API_KEY'
};

export interface ModelConfigStatus {
  configured: boolean;
  model_test_passed: boolean;
  provider: ProviderType | null;
  base_url: string | null;
  model: string | null;
  api_key_env: string | null;
  temperature: number | null;
  max_tokens: number | null;
  timeout_seconds: number | null;
  has_api_key: boolean;
}

export interface SaveAndTestInput {
  provider: string;
  base_url: string;
  api_key_env: string;
  api_key_value?: string;
  model: string;
  temperature: number;
  max_tokens: number;
  timeout_seconds: number;
}

export interface SaveAndTestResult {
  success: boolean;
  provider: ProviderType;
  base_url: string;
  model: string;
  api_key_env: string;
  has_api_key: boolean;
  model_test_passed: boolean;
  checked_at: string;
  error?: string;
}

function validateEnvironmentVariableName(input: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(input);
}

function sanitizeErrorMessage(message: string, apiKey?: string): string {
  let sanitized = message;

  if (apiKey) {
    sanitized = sanitized.split(apiKey).join('[REDACTED]');
  }

  sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
  sanitized = sanitized.replace(/x-api-key["']?\s*[:=]\s*["']?[^"'\s,}]+/gi, 'x-api-key: [REDACTED]');
  sanitized = sanitized.replace(/Authorization["']?\s*[:=]\s*["']?[^"'\n\r]+/gi, 'Authorization: [REDACTED]');

  return sanitized;
}

function assertValidInput(input: SaveAndTestInput): asserts input is SaveAndTestInput {
  if (!isValidProvider(input.provider)) {
    throw new Error(`Unsupported provider: ${input.provider}`);
  }

  try {
    new URL(input.base_url);
  } catch {
    throw new Error('Please enter a valid Base URL');
  }

  if (!input.model.trim()) {
    throw new Error('Model is required');
  }

  if (!validateEnvironmentVariableName(input.api_key_env)) {
    throw new Error('API Key Env Var is invalid');
  }

  if (!Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2) {
    throw new Error('Temperature must be between 0 and 2');
  }

  if (!Number.isInteger(input.max_tokens) || input.max_tokens <= 0) {
    throw new Error('Max Tokens must be a positive integer');
  }

  if (!Number.isInteger(input.timeout_seconds) || input.timeout_seconds <= 0) {
    throw new Error('Timeout Seconds must be a positive integer');
  }

  if (input.api_key_value) {
    if (!input.api_key_value.trim()) {
      throw new Error('API Key Value cannot be empty');
    }
    if (input.api_key_value.includes('\n') || input.api_key_value.includes('\r')) {
      throw new Error('API Key Value cannot contain newline characters');
    }
  }
}

function buildConfig(input: SaveAndTestInput & { provider: ProviderType }): ModelConfig {
  return {
    provider: input.provider,
    base_url: input.base_url.trim(),
    api_key_env: input.api_key_env.trim(),
    model: input.model.trim(),
    temperature: input.temperature,
    max_tokens: input.max_tokens,
    timeout_seconds: input.timeout_seconds,
    stream: false
  };
}

export async function saveConfiguration(
  input: ConfigInput
): Promise<ModelConfig> {
  const config = buildConfig({
    ...input,
    provider: input.provider
  });

  await writeJSONFile('config/model.json', config);

  const { markModelConfigured } = await import('./state-manager');
  await markModelConfigured();

  if (input.api_key_value) {
    await upsertEnvVar(input.api_key_env, input.api_key_value);
    process.env[input.api_key_env] = input.api_key_value;
  }

  return config;
}

export async function persistModelConfiguration(
  rawInput: SaveAndTestInput
): Promise<ModelConfig> {
  assertValidInput(rawInput);

  const provider = rawInput.provider as ProviderType;
  const apiKeyValue = rawInput.api_key_value?.trim() ?? '';

  if (!apiKeyValue && !hasEnvVar(rawInput.api_key_env)) {
    throw new Error(`API key value is required for ${rawInput.api_key_env}`);
  }

  return await saveConfiguration({
    provider,
    base_url: rawInput.base_url,
    api_key_env: rawInput.api_key_env,
    api_key_value: apiKeyValue,
    model: rawInput.model,
    temperature: rawInput.temperature,
    max_tokens: rawInput.max_tokens,
    timeout_seconds: rawInput.timeout_seconds,
    stream: false
  });
}

export async function saveAndTestModelConfiguration(
  rawInput: SaveAndTestInput
): Promise<SaveAndTestResult> {
  await loadEnvFile();
  const config = await persistModelConfiguration(rawInput);

  const testResult = await runModelGateTest(config);
  const sanitizedResult = sanitizeTestResult(testResult, process.env[config.api_key_env]);

  return {
    success: sanitizedResult.success,
    provider: config.provider,
    base_url: config.base_url,
    model: config.model,
    api_key_env: config.api_key_env,
    has_api_key: hasEnvVar(config.api_key_env),
    model_test_passed: sanitizedResult.success,
    checked_at: sanitizedResult.checked_at,
    error: sanitizedResult.error
  };
}

export function sanitizeTestResult(
  result: ProviderTestResult,
  apiKey?: string
): ProviderTestResult {
  return {
    ...result,
    error: result.error ? sanitizeErrorMessage(result.error, apiKey) : undefined
  };
}

export async function getSanitizedModelConfigStatus(): Promise<ModelConfigStatus> {
  await loadEnvFile();

  const config = await readJSONFile<ModelConfig>('config/model.json');
  const { isModelGatePassed } = await import('./state-manager');
  const modelTestPassed = await isModelGatePassed();

  return {
    configured: !!config,
    model_test_passed: modelTestPassed,
    provider: config?.provider ?? null,
    base_url: config?.base_url ?? null,
    model: config?.model ?? null,
    api_key_env: config?.api_key_env ?? null,
    temperature: config?.temperature ?? null,
    max_tokens: config?.max_tokens ?? null,
    timeout_seconds: config?.timeout_seconds ?? null,
    has_api_key: config ? hasEnvVar(config.api_key_env) : false
  };
}

export function getModelProviderDefaults() {
  return PROVIDER_DEFAULTS;
}

export function getModelProviderOptions(): ProviderType[] {
  return getSupportedProviders();
}
