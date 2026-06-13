import inquirer from 'inquirer';
import { ProviderType, ModelConfig, ConfigInput } from '../types/config';
import { loadEnvFile, hasEnvVar } from '../utils/env';
import { logger } from '../utils/logger';
import {
  ENV_VAR_NAMES,
  getModelProviderDefaults,
  getModelProviderOptions,
  saveAndTestModelConfiguration,
  persistModelConfiguration
} from './model-config-service';

const PROVIDER_DEFAULTS = getModelProviderDefaults();
const PROVIDER_OPTIONS = getModelProviderOptions();

export async function collectConfiguration(): Promise<ConfigInput> {
  logger.section('Model Configuration Setup');

  // Step 1: Select provider
  const { provider } = await inquirer.prompt<{ provider: ProviderType }>([{
    type: 'list',
    name: 'provider',
    message: 'Select model provider:',
    choices: PROVIDER_OPTIONS
  }]);

  // Step 2: Enter Base URL
  const { base_url } = await inquirer.prompt<{ base_url: string }>([{
    type: 'input',
    name: 'base_url',
    message: 'Enter Base URL:',
    default: PROVIDER_DEFAULTS[provider].base_url,
    validate: (input) => {
      try {
        new URL(input);
        return true;
      } catch {
        return 'Please enter a valid URL';
      }
    }
  }]);

  // Step 3: Enter model name
  const { model } = await inquirer.prompt<{ model: string }>([{
    type: 'input',
    name: 'model',
    message: 'Enter model name:',
    default: PROVIDER_DEFAULTS[provider].suggested_model,
    validate: (input) => input.trim().length > 0 || 'Model name is required'
  }]);

  // Step 4: API Key environment variable
  const { api_key_env } = await inquirer.prompt<{ api_key_env: string }>([{
    type: 'input',
    name: 'api_key_env',
    message: 'Enter API key environment variable name:',
    default: ENV_VAR_NAMES[provider],
    validate: (input) => {
      const valid = /^[A-Za-z_][A-Za-z0-9_]*$/.test(input);
      return valid || 'Invalid environment variable name';
    }
  }]);

  // Step 5: Check if env var exists, or ask for key value
  let api_key_value = '';
  if (hasEnvVar(api_key_env)) {
    logger.info(`Environment variable ${api_key_env} already exists`);
    const { use_existing } = await inquirer.prompt<{ use_existing: boolean }>([{
      type: 'confirm',
      name: 'use_existing',
      message: `Use existing ${api_key_env}?`,
      default: true
    }]);

    if (!use_existing) {
      const { new_key } = await inquirer.prompt<{ new_key: string }>([{
        type: 'password',
        name: 'new_key',
        message: `Enter new API key for ${api_key_env}:`,
        mask: '*',
        validate: (input) => {
          if (!input || input.trim().length === 0) {
            return 'API key cannot be empty';
          }
          if (input.includes('\n') || input.includes('\r')) {
            return 'API key cannot contain newline characters';
          }
          return true;
        }
      }]);
      api_key_value = new_key.trim();
    }
  } else {
    const { key_value } = await inquirer.prompt<{ key_value: string }>([{
      type: 'password',
      name: 'key_value',
      message: `Enter API key value:`,
      mask: '*',
      validate: (input) => {
        if (!input || input.trim().length === 0) {
          return 'API key cannot be empty';
        }
        if (input.includes('\n') || input.includes('\r')) {
          return 'API key cannot contain newline characters';
        }
        return true;
      }
    }]);
    api_key_value = key_value.trim();
  }

  // Step 6: Temperature
  const { temperature } = await inquirer.prompt<{ temperature: number }>([{
    type: 'number',
    name: 'temperature',
    message: 'Enter temperature (0.0-2.0):',
    default: 0.2,
    validate: (input) => {
      if (isNaN(input)) return 'Please enter a valid number';
      if (input < 0 || input > 2) return 'Temperature must be between 0 and 2';
      return true;
    }
  }]);

  // Step 7: Max tokens
  const { max_tokens } = await inquirer.prompt<{ max_tokens: number }>([{
    type: 'number',
    name: 'max_tokens',
    message: 'Enter max_tokens:',
    default: 6000,
    validate: (input) => {
      if (isNaN(input)) return 'Please enter a valid number';
      if (input <= 0 || !Number.isInteger(input)) return 'max_tokens must be a positive integer';
      return true;
    }
  }]);

  // Step 8: Timeout
  const { timeout_seconds } = await inquirer.prompt<{ timeout_seconds: number }>([{
    type: 'number',
    name: 'timeout_seconds',
    message: 'Enter timeout in seconds:',
    default: 120,
    validate: (input) => {
      if (isNaN(input)) return 'Please enter a valid number';
      if (input <= 0 || !Number.isInteger(input)) return 'Timeout must be a positive integer';
      return true;
    }
  }]);

  return {
    provider,
    base_url,
    api_key_env,
    api_key_value,
    model,
    temperature,
    max_tokens,
    timeout_seconds,
    stream: false
  };
}

export async function saveConfiguration(
  input: ConfigInput
): Promise<ModelConfig> {
  return await persistModelConfiguration(input);
}

export async function runConfigurationFlow(): Promise<void> {
  // Load .env first
  await loadEnvFile();

  // Collect configuration
  const input = await collectConfiguration();

  // Save configuration
  const result = await saveAndTestModelConfiguration(input);

  if (!result.success) {
    logger.info('Please reconfigure: npm run config');
    throw new Error('Model test failed');
  }

  logger.success('Saved config/model.json');
  logger.success(`Saved API key to .env as ${result.api_key_env}`);
  logger.success('Model configuration complete ✓');
  logger.info('You can now proceed with the workflow');
}
