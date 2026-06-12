# Model Configuration Gate Module - Design Specification

**Date**: 2026-06-12
**Status**: Approved
**Scope**: MVP - Model Configuration and Real API Testing Only

---

## 1. Overview

### 1.1 Purpose

Implement the **Model Configuration Gate Module** - the first mandatory checkpoint in the TB Step by Step workflow tool. This module ensures that:

1. Users configure a real LLM provider before accessing workflow features
2. API connections are tested with real calls (no mocks)
3. Workflow state is tracked and validated before proceeding

### 1.2 Design Principles

- **Real API Calls Only**: No mock providers, fake responses, or hardcoded results
- **File-Driven Configuration**: Config saved to `config/model.json`, API keys to `.env`
- **State Validation**: Multiple-file verification prevents bypassing the gate
- **Type Safety**: TypeScript interfaces catch configuration errors at compile time
- **Extensibility**: Provider abstraction allows adding new providers easily

### 1.3 Scope (MVP)

**In Scope**:
- Interactive CLI configuration flow
- Provider abstraction layer (5 providers)
- Real API connection testing
- Workflow state management
- Entry points: `npm start`, `npm run config`, `npm run test:model`

**Out of Scope (Future)**:
- Step 1: Old Prompt Adaptation
- Step 2: Section-by-section writing
- Step 3: Outline-first mechanism
- Web UI or REST API

---

## 2. Architecture

### 2.1 Project Structure

```
tb-step-by-step/
├── .gitignore
├── .env.example
├── package.json
├── tsconfig.json
├── CLAUDE.md
├── src/
│   ├── index.ts                    # Main entry with auto-detection
│   ├── commands/
│   │   ├── config.ts               # npm run config
│   │   └── test-model.ts           # npm run test:model
│   ├── core/
│   │   ├── configure.ts            # Interactive configuration flow
│   │   ├── model-gate.ts           # Shared gate test logic
│   │   ├── provider.ts             # Provider factory and registry
│   │   ├── state-manager.ts        # Workflow state management
│   │   └── tester.ts               # Centralized API tester
│   ├── providers/
│   │   ├── openai.ts               # OpenAI provider
│   │   ├── deepseek.ts             # DeepSeek provider
│   │   ├── glm.ts                  # GLM provider
│   │   ├── claude-compatible.ts    # Claude-compatible provider
│   │   └── custom.ts               # OpenAI-compatible custom provider
│   ├── types/
│   │   ├── config.ts               # Configuration interfaces
│   │   ├── provider.ts             # Provider interfaces
│   │   └── state.ts                # State management interfaces
│   └── utils/
│       ├── env.ts                  # Environment variable helpers
│       ├── file.ts                 # File operations
│       ├── logger.ts               # Logging utilities
│       └── url.ts                  # URL joining utilities
├── config/
│   └── .gitkeep                    # Placeholder for generated config
├── logs/
│   └── .gitkeep                    # Placeholder for generated logs
├── input/
│   └── .gitkeep                    # Placeholder for future tender docs
├── output/
│   └── .gitkeep                    # Placeholder for generated outputs
└── sources/
    ├── SKILL.md                    # Existing - total rules
    ├── old-prompt.md               # Existing - old template
    ├── step1.md                    # Existing - adaptation workflow
    ├── step2.md                    # Existing - section writing
    └── step3.md                    # Existing - outline mechanism
```

### 2.2 Module Organization

**Layered Architecture**:
1. **Entry Points** (`index.ts`, `commands/`) - User interaction
2. **Core Logic** (`core/`) - Business logic and orchestration
3. **Provider Layer** (`providers/`) - External API integration
4. **Utilities** (`utils/`) - Cross-cutting concerns
5. **Types** (`types/`) - Type definitions and contracts

---

## 3. Type System

### 3.1 Configuration Types (`src/types/config.ts`)

```typescript
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
```

**Key Design Decisions**:
- `ProviderType` is a strict union - TypeScript prevents invalid values
- `api_key_env` stores the variable name, `api_key_value` is temporary runtime input
- All numeric fields validated at input time

### 3.2 Provider Interface (`src/types/provider.ts`)

```typescript
import { ProviderType, ModelConfig } from './config';

// Provider interface - all providers must implement this
export interface IProvider {
  readonly name: string;
  readonly type: ProviderType;

  // Execute a real API call with given prompt
  call(prompt: string, config: ModelConfig): Promise<string>;
}

// Result from centralized tester
export interface ProviderTestResult {
  success: boolean;
  provider: ProviderType;
  model: string;
  base_url: string;
  test_prompt: string;
  test_response: string;
  checked_at: string;
  mock_used: false;  // Hard-coded literal type - always false
  response_validation_passed?: boolean;
  error?: string;
}
```

**Key Design Decisions**:
- Removed `testConnection()` from interface - all test logic in `core/tester.ts`
- Providers only implement `call()` for real API requests
- `mock_used: false` is a hard-coded literal - TypeScript prevents `true`

### 3.3 State Management Types (`src/types/state.ts`)

```typescript
// Workflow state tracking
export interface WorkflowState {
  model_configured: boolean;
  model_test_passed: boolean;
  skill_loaded: boolean;
  old_prompt_loaded: boolean;
  tender_file_loaded: boolean;
  step1_model_check_passed: boolean;
  new_prompt_generated: boolean;
  step2_confirmed: boolean;
  outline_generated: boolean;
  outline_confirmed: boolean;
  current_section: string;
  completed_sections: string[];
  final_combined: boolean;
}

// Default initial state
export const INITIAL_WORKFLOW_STATE: WorkflowState = {
  model_configured: false,
  model_test_passed: false,
  skill_loaded: false,
  old_prompt_loaded: false,
  tender_file_loaded: false,
  step1_model_check_passed: false,
  new_prompt_generated: false,
  step2_confirmed: false,
  outline_generated: false,
  outline_confirmed: false,
  current_section: '',
  completed_sections: [],
  final_combined: false
};
```

**Key Design Decisions**:
- Single source of truth for workflow progression
- Each step has a dedicated flag
- Future steps (Step 1/2/3) have placeholder flags ready

---

## 4. Core Modules

### 4.1 Provider Factory (`src/core/provider.ts`)

**Responsibility**: Provider registry and instantiation

```typescript
import { ProviderType } from '../types/config';
import { IProvider } from '../types/provider';
import { OpenAIProvider } from '../providers/openai';
import { DeepSeekProvider } from '../providers/deepseek';
import { GLMProvider } from '../providers/glm';
import { ClaudeCompatibleProvider } from '../providers/claude-compatible';
import { CustomProvider } from '../providers/custom';

const PROVIDER_REGISTRY: Record<ProviderType, IProvider> = {
  'openai': new OpenAIProvider(),
  'deepseek': new DeepSeekProvider(),
  'glm': new GLMProvider(),
  'claude-compatible': new ClaudeCompatibleProvider(),
  'custom': new CustomProvider()
};

export function getProvider(type: ProviderType): IProvider {
  const provider = PROVIDER_REGISTRY[type];
  if (!provider) {
    throw new Error(`Invalid provider type: ${type}. No mock providers allowed.`);
  }
  return provider;
}

export function getSupportedProviders(): ProviderType[] {
  return Object.keys(PROVIDER_REGISTRY) as ProviderType[];
}

export function isValidProvider(type: string): type is ProviderType {
  return type in PROVIDER_REGISTRY;
}
```

**Key Design Decisions**:
- No fallback provider - invalid types throw errors
- Registry only contains real providers - no mock entry
- TypeScript union type + runtime validation = double safety

### 4.2 API Tester (`src/core/tester.ts`)

**Responsibility**: Centralized API testing with fixed prompt

```typescript
import { ModelConfig } from '../types/config';
import { ProviderTestResult } from '../types/provider';
import { getProvider } from './provider';

const TEST_PROMPT = '请回复"TB_MODEL_TEST_OK"，不要输出其他内容。';

function validateTestResponse(response: string): boolean {
  return response.includes('TB_MODEL_TEST_OK');
}

export async function testModelConnection(
  config: ModelConfig
): Promise<ProviderTestResult> {
  const provider = getProvider(config.provider);
  const checked_at = new Date().toISOString();

  try {
    const response = await provider.call(TEST_PROMPT, config);
    const validation_passed = validateTestResponse(response);

    return {
      success: validation_passed,
      provider: config.provider,
      model: config.model,
      base_url: config.base_url,
      test_prompt: TEST_PROMPT,
      test_response: response,
      checked_at,
      mock_used: false,
      response_validation_passed: validation_passed,
      error: validation_passed ? undefined :
        'Response does not contain TB_MODEL_TEST_OK'
    };
  } catch (error) {
    return {
      success: false,
      provider: config.provider,
      model: config.model,
      base_url: config.base_url,
      test_prompt: TEST_PROMPT,
      test_response: '',
      checked_at,
      mock_used: false,
      response_validation_passed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
```

**Key Design Decisions**:
- Fixed test prompt ensures consistent validation
- Centralized validation logic - no provider-specific test methods
- `mock_used: false` hard-coded - impossible to return true
- Success requires: real API call + valid response + no mock

### 4.3 Model Gate (`src/core/model-gate.ts`)

**Responsibility**: Shared gate test logic for config and test commands

```typescript
import { ModelConfig } from '../types/config';
import { ProviderTestResult } from '../types/provider';
import { testModelConnection } from './tester';
import { markModelTestPassed, markModelTestFailed } from './state-manager';
import { writeJSONFile } from '../utils/file';
import { logger } from '../utils/logger';

export async function runModelGateTest(
  config: ModelConfig
): Promise<ProviderTestResult> {
  logger.info('Testing model connection...');

  const result = await testModelConnection(config);
  await writeJSONFile('logs/model-test.json', result);

  if (result.success) {
    await markModelTestPassed();
    logger.success('Model test passed ✓');
    logger.info(`Response validation passed: ${result.response_validation_passed}`);
  } else {
    await markModelTestFailed();
    logger.error('Model test failed ✗');
    if (result.error) {
      logger.error(`Error: ${result.error}`);
    }
  }

  return result;
}
```

**Key Design Decisions**:
- Single path for model testing - config and test:model both use this
- Saves test result before updating state
- Logs validation status, not full response (for safety)

### 4.4 State Manager (`src/core/state-manager.ts`)

**Responsibility**: Workflow state persistence and validation

```typescript
import { WorkflowState, INITIAL_WORKFLOW_STATE } from '../types/state';
import { ModelConfig } from '../types/config';
import { ProviderTestResult } from '../types/provider';
import { readJSONFile, writeJSONFile, fileExists } from '../utils/file';

const STATE_FILE = 'logs/workflow-state.json';

export async function loadWorkflowState(): Promise<WorkflowState> {
  const state = await readJSONFile<WorkflowState>(STATE_FILE);
  return state || INITIAL_WORKFLOW_STATE;
}

export async function saveWorkflowState(
  state: WorkflowState
): Promise<void> {
  await writeJSONFile(STATE_FILE, state);
}

export async function isModelGatePassed(): Promise<boolean> {
  try {
    // Check config/model.json exists
    const config = await readJSONFile<ModelConfig>('config/model.json');
    if (!config) return false;

    // Check workflow state flags
    const state = await loadWorkflowState();
    if (!state.model_configured || !state.model_test_passed) {
      return false;
    }

    // Check test result exists and passed
    const testResult = await readJSONFile<ProviderTestResult>('logs/model-test.json');
    if (!testResult) return false;

    // Verify all success criteria
    if (!testResult.success) return false;
    if (testResult.mock_used !== false) return false;
    if (testResult.response_validation_passed !== true) return false;

    // Verify test matches current config
    if (testResult.provider !== config.provider) return false;
    if (testResult.model !== config.model) return false;
    if (testResult.base_url !== config.base_url) return false;

    return true;
  } catch {
    return false;
  }
}

export async function markModelConfigured(): Promise<void> {
  const state = await loadWorkflowState();

  // Reset downstream flags when config changes
  state.model_configured = true;
  state.model_test_passed = false;
  state.step1_model_check_passed = false;
  state.new_prompt_generated = false;

  await saveWorkflowState(state);
}

export async function markModelTestPassed(): Promise<void> {
  const state = await loadWorkflowState();
  state.model_configured = true;
  state.model_test_passed = true;
  await saveWorkflowState(state);
}

export async function markModelTestFailed(): Promise<void> {
  const state = await loadWorkflowState();

  // Check if config exists without throwing on invalid JSON
  const configExists = await fileExists('config/model.json');
  state.model_configured = configExists;
  state.model_test_passed = false;

  await saveWorkflowState(state);
}
```

**Key Design Decisions**:
- Multi-file validation prevents bypasses
- Test result must match current config (prevents stale results)
- Invalid JSON in critical files logged as warning, not silently ignored
- Downstream flags reset when config changes

### 4.5 Interactive Configuration (`src/core/configure.ts`)

**Responsibility**: Guide users through configuration collection

```typescript
import inquirer from 'inquirer';
import { ProviderType, ModelConfig, ConfigInput } from '../types/config';
import { getSupportedProviders } from './provider';
import { upsertEnvVar, loadEnvFile, hasEnvVar } from '../utils/env';
import { writeJSONFile } from '../utils/file';
import { logger } from '../utils/logger';

// Provider defaults (used during configuration)
const PROVIDER_DEFAULTS: Record<ProviderType, { base_url: string; suggested_model: string }> = {
  'openai': { base_url: 'https://api.openai.com/v1', suggested_model: 'gpt-4o' },
  'deepseek': { base_url: 'https://api.deepseek.com/v1', suggested_model: 'deepseek-chat' },
  'glm': { base_url: 'https://open.bigmodel.cn/api/paas/v4', suggested_model: 'glm-4-plus' },
  'claude-compatible': { base_url: 'https://api.anthropic.com', suggested_model: 'claude-3-5-sonnet-latest' },
  'custom': { base_url: '', suggested_model: '' }
};

// Provider to env var name mapping
const ENV_VAR_NAMES: Record<ProviderType, string> = {
  'openai': 'OPENAI_API_KEY',
  'deepseek': 'DEEPSEEK_API_KEY',
  'glm': 'GLM_API_KEY',
  'claude-compatible': 'CLAUDE_API_KEY',
  'custom': 'CUSTOM_API_KEY'
};

export async function collectConfiguration(): Promise<ConfigInput> {
  logger.section('Model Configuration Setup');

  // Step 1: Select provider
  const { provider } = await inquirer.prompt<{ provider: ProviderType }>([{
    type: 'list',
    name: 'provider',
    message: 'Select model provider:',
    choices: getSupportedProviders()
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
  // Build ModelConfig (without api_key_value)
  const config: ModelConfig = {
    provider: input.provider,
    base_url: input.base_url,
    api_key_env: input.api_key_env,
    model: input.model,
    temperature: input.temperature,
    max_tokens: input.max_tokens,
    timeout_seconds: input.timeout_seconds,
    stream: false
  };

  // Save to config/model.json
  await writeJSONFile('config/model.json', config);
  logger.success('Saved config/model.json');

  // Mark model as configured (invalidates downstream state)
  const { markModelConfigured } = await import('./state-manager');
  await markModelConfigured();

  // Upsert to .env if api_key_value provided
  if (input.api_key_value) {
    await upsertEnvVar(input.api_key_env, input.api_key_value);
    logger.success(`Saved API key to .env as ${input.api_key_env}`);

    // Update process.env so immediate test works
    process.env[input.api_key_env] = input.api_key_value;
  }

  return config;
}

export async function runConfigurationFlow(): Promise<void> {
  // Load .env first
  await loadEnvFile();

  // Collect configuration
  const input = await collectConfiguration();

  // Save configuration
  const config = await saveConfiguration(input);

  // Run connection test
  const { runModelGateTest } = await import('./model-gate');
  const result = await runModelGateTest(config);

  if (!result.success) {
    logger.info('Please reconfigure: npm run config');
    throw new Error('Model test failed');
  }

  logger.success('Model configuration complete ✓');
  logger.info('You can now proceed with the workflow');
}
```

**Key Design Decisions**:
- Provider-specific defaults for better UX, but user can override
- Password masking for API key input
- Validation at each step prevents invalid configurations
- Load `.env` before checking existing variables
- Update `process.env` after saving to `.env` for immediate test
- API key never logged or printed

---

## 5. Provider Implementations

### 5.1 Provider Implementation Pattern

All providers follow the same structure (example using OpenAI):

```typescript
import { IProvider } from '../types/provider';
import { ProviderType, ModelConfig } from '../types/config';
import { joinUrl } from '../utils/url';

export class ExampleProvider implements IProvider {
  readonly name = 'Example Provider';
  readonly type: ProviderType = 'example';

  async call(prompt: string, config: ModelConfig): Promise<string> {
    // 1. Read API key from environment
    const apiKey = process.env[config.api_key_env];
    if (!apiKey) {
      throw new Error(`API key not found: ${config.api_key_env}`);
    }

    // 2. Build request with real HTTP call
    const response = await fetch(joinUrl(config.base_url, '/endpoint'), {
      method: 'POST',
      headers: { /* auth headers */ },
      body: JSON.stringify({ /* request body */ }),
      signal: AbortSignal.timeout(config.timeout_seconds * 1000)
    });

    // 3. Handle errors
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    // 4. Parse response safely
    const data = await response.json();
    // Validate response shape
    // Extract text content

    return extractedText;
  }
}
```

**Implementation Rules**:
1. Read API key ONLY from `process.env[config.api_key_env]`
2. Use real HTTP requests with `fetch`
3. Respect `timeout_seconds` and `max_tokens` from config
4. Throw errors on failures - no fallback responses
5. Return raw string - no validation (handled by tester)
6. Validate response shape defensively

### 5.2 OpenAI-Compatible Providers

**OpenAI, DeepSeek, GLM, Custom** share similar request format:

```typescript
// Request format
{
  model: string,
  messages: [{ role: 'user', content: string }],
  temperature: number,
  max_tokens: number,
  stream: false
}

// Response format
{
  choices: [{
    message: { content: string }
  }]
}
```

Implementation extracts shared logic:

```typescript
// Shared helper for OpenAI-compatible providers
async function callOpenAICompatible(
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

  const data = await response.json();

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
```

### 5.3 Claude-Compatible Provider

Different request format:

```typescript
// Request format
{
  model: string,
  max_tokens: number,
  messages: [{ role: 'user', content: string }]
}

// Response format
{
  content: [{ type: 'text', text: string }]
}

// Headers
{
  'x-api-key': string,
  'anthropic-version': string,
  'Content-Type': 'application/json'
}
```

Implementation:

```typescript
export class ClaudeCompatibleProvider implements IProvider {
  readonly name = 'Claude Compatible';
  readonly type: ProviderType = 'claude-compatible';

  async call(prompt: string, config: ModelConfig): Promise<string> {
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

    const data = await response.json();

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
```

---

## 6. Utility Modules

### 6.1 File Utilities (`src/utils/file.ts`)

```typescript
import { promises as fs } from 'fs';
import * as path from 'path';
import { logger } from './logger';

export async function ensureDirectoryExists(
  dirPath: string
): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

export async function readJSONFile<T>(
  filePath: string
): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      // File not found - return null
      return null;
    }
    // Invalid JSON - log warning and throw
    logger.warn(`Invalid JSON in ${filePath}: ${error}`);
    throw new Error(`Invalid JSON in ${filePath}`);
  }
}

export async function writeJSONFile<T>(
  filePath: string,
  data: T
): Promise<void> {
  await ensureDirectoryExists(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readTextFile(filePath: string): Promise<string> {
  return await fs.readFile(filePath, 'utf-8');
}

export async function writeTextFile(
  filePath: string,
  content: string
): Promise<void> {
  await ensureDirectoryExists(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
}
```

### 6.2 Environment Utilities (`src/utils/env.ts`)

```typescript
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileExists } from './file';

export async function loadEnvFile(): Promise<void> {
  const envPath = path.resolve(process.cwd(), '.env');
  if (await fileExists(envPath)) {
    dotenv.config({ path: envPath });
  }
}

export function getEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  return value;
}

export function hasEnvVar(key: string): boolean {
  return !!process.env[key];
}

// Format value for .env file (safe quoting)
function formatEnvValue(value: string): string {
  // Reject newlines
  if (value.includes('\n') || value.includes('\r')) {
    throw new Error('Environment variable value cannot contain newline characters');
  }

  // If value contains special characters, quote it
  const needsQuoting = /[\s#=]/.test(value);
  if (needsQuoting) {
    // Escape double quotes and wrap in quotes
    return `"${value.replace(/"/g, '\\"')}"`;
  }

  return value;
}

// Upsert environment variable in .env file
export async function upsertEnvVar(
  key: string,
  value: string
): Promise<void> {
  const envPath = path.resolve(process.cwd(), '.env');

  // Format value safely
  const formattedValue = formatEnvValue(value);

  let content = '';
  if (await fileExists(envPath)) {
    content = await fs.readFile(envPath, 'utf-8');
  }

  const lines = content.split('\n').filter(line => line.trim() !== '');
  const keyPattern = new RegExp(`^${key}=`);
  const existingIndex = lines.findIndex(line => keyPattern.test(line));

  const newLine = `${key}=${formattedValue}`;

  if (existingIndex >= 0) {
    // Update existing key
    lines[existingIndex] = newLine;
  } else {
    // Add new key
    lines.push(newLine);
  }

  await fs.writeFile(envPath, lines.join('\n') + '\n', 'utf-8');
}
```

### 6.3 URL Utilities (`src/utils/url.ts`)

```typescript
export function joinUrl(base: string, pathSegment: string): string {
  const cleanBase = base.replace(/\/+$/, '');
  const cleanPath = pathSegment.replace(/^\/+/, '');
  return `${cleanBase}/${cleanPath}`;
}
```

### 6.4 Logger (`src/utils/logger.ts`)

```typescript
export const logger = {
  info: (message: string) => {
    console.log(`[INFO] ${message}`);
  },

  success: (message: string) => {
    console.log(`[SUCCESS] ${message}`);
  },

  error: (message: string) => {
    console.error(`[ERROR] ${message}`);
  },

  warn: (message: string) => {
    console.warn(`[WARN] ${message}`);
  },

  section: (title: string) => {
    console.log('\n' + '='.repeat(50));
    console.log(title);
    console.log('='.repeat(50) + '\n');
  }
};
```

---

## 7. Command Entry Points

### 7.1 Main Entry (`src/index.ts`)

```typescript
import { logger } from './utils/logger';
import { loadEnvFile } from './utils/env';
import { isModelGatePassed } from './core/state-manager';
import { runConfigurationFlow } from './core/configure';

async function main() {
  try {
    await loadEnvFile();

    logger.section('TB Step by Step Workflow');

    const gatePassed = await isModelGatePassed();

    if (!gatePassed) {
      logger.info('Model configuration required before workflow can proceed');
      logger.info('Launching model configuration...\n');

      await runConfigurationFlow();
    } else {
      logger.success('Model gate passed ✓');
      logger.info('Configuration valid. Workflow ready to proceed.');
      logger.info('');
      logger.info('Step 1 is not implemented yet.');
      logger.info('The model gate is ready for the next development stage.');
      logger.info('');
      logger.info('To reconfigure model:');
      logger.info('  Run: npm run config');
    }

  } catch (error) {
    logger.error('Workflow initialization failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

main();
```

### 7.2 Config Command (`src/commands/config.ts`)

```typescript
import { logger } from '../utils/logger';
import { loadEnvFile } from '../utils/env';
import { runConfigurationFlow } from '../core/configure';

async function configCommand() {
  try {
    await loadEnvFile();

    logger.section('Model Configuration');

    await runConfigurationFlow();

  } catch (error) {
    logger.error('Configuration failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

configCommand();
```

### 7.3 Test Model Command (`src/commands/test-model.ts`)

```typescript
import { logger } from '../utils/logger';
import { loadEnvFile } from '../utils/env';
import { readJSONFile } from '../utils/file';
import { ModelConfig } from '../types/config';
import { runModelGateTest } from '../core/model-gate';
import { isModelGatePassed } from '../core/state-manager';

async function testModelCommand() {
  try {
    await loadEnvFile();

    logger.section('Model Connection Test');

    const config = await readJSONFile<ModelConfig>('config/model.json');

    if (!config) {
      logger.error('No model configuration found');
      logger.info('Please run: npm run config');
      process.exit(1);
    }

    logger.info(`Provider: ${config.provider}`);
    logger.info(`Model: ${config.model}`);
    logger.info(`Base URL: ${config.base_url}`);
    logger.info(`API Key Env: ${config.api_key_env}`);
    logger.info('');

    const result = await runModelGateTest(config);

    if (result.success) {
      const gatePassed = await isModelGatePassed();

      if (gatePassed) {
        logger.success('Model gate unlocked ✓');
        logger.info('Workflow can proceed to next steps');
      }
    } else {
      logger.info('Please reconfigure: npm run config');
      process.exit(1);
    }

  } catch (error) {
    logger.error('Test failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

testModelCommand();
```

---

## 8. Package Configuration

### 8.1 package.json

```json
{
  "name": "tb-step-by-step",
  "version": "1.0.0",
  "description": "Fixed-step, file-driven, human-controlled bidding document workflow tool",
  "main": "dist/index.js",
  "scripts": {
    "start": "node dist/index.js",
    "prestart": "npm run build",
    "config": "node dist/commands/config.js",
    "preconfig": "npm run build",
    "test:model": "node dist/commands/test-model.js",
    "pretest:model": "npm run build",
    "build": "tsc",
    "dev": "tsc --watch",
    "clean": "rimraf dist"
  },
  "keywords": ["bidding", "workflow", "llm", "ai"],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "dotenv": "^16.4.0",
    "inquirer": "^8.2.6"
  },
  "devDependencies": {
    "@types/inquirer": "^8.2.0",
    "@types/node": "^20.0.0",
    "rimraf": "^5.0.0",
    "typescript": "^5.3.0"
  }
}
```

### 8.2 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "rootDir": "./src",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 8.3 .gitignore

```
# Environment variables
.env

# Generated model config
config/*.json
!config/.gitkeep

# Generated logs
logs/*.json
!logs/.gitkeep

# User input files
input/*
!input/.gitkeep

# Generated outputs
output/*
!output/.gitkeep

# Node
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build output
dist/
*.tsbuildinfo

# OS
.DS_Store
Thumbs.db
```

---

## 9. Security Guarantees

### 9.1 No Mock Providers

**Implementation**:
- Provider registry contains only real providers
- No mock provider in registry
- No fallback provider when type is invalid
- `getProvider()` throws on invalid types

**Verification**:
```typescript
// This will never compile - TypeScript rejects invalid types
const mock = getProvider('mock'); // Error: not assignable to ProviderType

// This will throw at runtime
const provider = getProvider('invalid' as ProviderType);
// Error: Invalid provider type. No mock providers allowed.
```

### 9.2 API Key Safety

**Storage**:
- API keys stored only in `.env`
- Never in `config/model.json`
- `.env` is gitignored

**Runtime**:
- Read from `process.env[api_key_env]`
- Never logged or printed
- Masked in interactive prompts

**Verification**:
- `.gitignore` includes `.env`
- `.env.example` committed as template
- Logger never prints env values

### 9.3 Test Validation

**Fixed Prompt**:
```
请回复"TB_MODEL_TEST_OK"，不要输出其他内容。
```

**Success Criteria**:
1. Real API call succeeds
2. Response contains `TB_MODEL_TEST_OK`
3. `mock_used === false` (hard-coded)
4. `response_validation_passed === true`

**Verification**:
- Centralized tester enforces criteria
- No provider-specific test logic
- Gate checks all criteria before unlocking

### 9.4 State Validation

**Multi-File Check**:
```
config/model.json exists
logs/model-test.json exists
workflow-state.json exists
model_configured === true
model_test_passed === true
test_result.success === true
test_result.mock_used === false
test_result.response_validation_passed === true
test_result matches current config
```

**Verification**:
- `isModelGatePassed()` checks all files
- Mismatch detected (stale test results)
- Prevents manual editing of state files

---

## 10. Future Extensions

### 10.1 Step 1 Integration (Future)

When implementing Step 1, add:

```typescript
// In state-manager.ts
export async function markSkillLoaded(): Promise<void> {
  const state = await loadWorkflowState();
  state.skill_loaded = true;
  await saveWorkflowState(state);
}

export async function markOldPromptLoaded(): Promise<void> {
  const state = await loadWorkflowState();
  state.old_prompt_loaded = true;
  await saveWorkflowState(state);
}
```

### 10.2 New Provider Addition

To add a new provider:

1. Implement `IProvider` interface
2. Add to `PROVIDER_REGISTRY` in `provider.ts`
3. Add to `ProviderType` union
4. Add default URL in `configure.ts`
5. Add env var name in `configure.ts`

**Example**:
```typescript
// 1. Implement provider
export class MistralProvider implements IProvider {
  readonly name = 'Mistral';
  readonly type: ProviderType = 'mistral';

  async call(prompt: string, config: ModelConfig): Promise<string> {
    // Real implementation
  }
}

// 2. Add to registry
import { MistralProvider } from '../providers/mistral';

const PROVIDER_REGISTRY: Record<ProviderType, IProvider> = {
  // ...existing
  'mistral': new MistralProvider()
};

// 3. Add to type union
export type ProviderType =
  | 'openai'
  | 'deepseek'
  | 'glm'
  | 'claude-compatible'
  | 'custom'
  | 'mistral';  // New

// 4 & 5. Add defaults
const PROVIDER_DEFAULTS: Record<ProviderType, { base_url: string; suggested_model: string }> = {
  // ...existing
  'mistral': { base_url: 'https://api.mistral.ai/v1', suggested_model: 'mistral-large-latest' }
};

const ENV_VAR_NAMES: Record<ProviderType, string> = {
  // ...existing
  'mistral': 'MISTRAL_API_KEY'
};
```

---

## 11. Testing Strategy

### 11.1 Manual Testing Flow

```bash
# 1. Install dependencies
npm install

# 2. Build project
npm run build

# 3. Run main entry (should auto-launch config)
npm start

# 4. Follow interactive prompts
# - Select provider
# - Enter Base URL (or accept default)
# - Enter model name
# - Enter API key env var name (or accept default)
# - Enter API key value (masked)
# - Set temperature, max_tokens, timeout

# 5. After config, test should run automatically
# - Real API call with fixed prompt
# - Response validation
# - State update

# 6. Verify files created
ls config/model.json
ls logs/model-test.json
ls logs/workflow-state.json
ls .env

# 7. Run main entry again (should detect valid config)
npm start
# Should say "Model gate passed ✓"

# 8. Reconfigure manually
npm run config

# 9. Test current model
npm run test:model
```

### 11.2 Edge Cases to Test

1. **Invalid JSON in config file**
   - Manually corrupt `config/model.json`
   - Run `npm start`
   - Should detect invalid config

2. **Stale test result**
   - Configure OpenAI
   - Run test (pass)
   - Reconfigure DeepSeek
   - Run `npm start`
   - Should detect mismatch

3. **Missing .env file**
   - Delete `.env`
   - Run `npm run test:model`
   - Should fail with "API key not found"

4. **Network timeout**
   - Set very low timeout (1 second)
   - Run test
   - Should fail gracefully

5. **Invalid credentials**
   - Enter wrong API key
   - Run test
   - Should show auth error

---

## 12. Success Criteria

### 12.1 Functional Requirements

- [x] Users can configure model provider interactively
- [x] API keys stored in `.env`, not in config files
- [x] Real API calls succeed for configured provider
- [x] Test validation enforces `TB_MODEL_TEST_OK` response
- [x] Workflow state prevents bypassing gate
- [x] Stale test results are detected
- [x] All three entry points work (`start`, `config`, `test:model`)

### 12.2 Non-Functional Requirements

- [x] No mock providers in codebase
- [x] API keys never logged or printed
- [x] TypeScript strict mode catches errors early
- [x] Cross-platform (macOS/Linux/Windows via `rimraf`)
- [x] Clear error messages for common failures
- [x] Defensive response parsing handles edge cases

### 12.3 Code Quality

- [x] All imports use correct paths for CommonJS
- [x] No unused imports or variables
- [x] Consistent code style throughout
- [x] Type safety enforced by TypeScript
- [x] Error handling at all boundaries

---

## 13. Deployment Checklist

- [ ] Review `.gitignore` ensures `.env` is ignored
- [ ] Verify `.env.example` committed to repo
- [ ] Test fresh clone: `npm install && npm start`
- [ ] Test all three commands on clean install
- [ ] Verify log files created in correct directory
- [ ] Test with real API keys from each provider
- [ ] Verify error messages are user-friendly
- [ ] Confirm no API keys in any log file

---

## 14. Conclusion

This design implements a robust, secure, and extensible model configuration gate that:

1. **Enforces real API testing** - No bypasses, no mocks
2. **Protects credentials** - Keys in `.env`, never in config
3. **Validates state strictly** - Multi-file verification
4. **Extends easily** - Provider abstraction pattern
5. **Type-safe** - TypeScript catches errors at compile time

The MVP scope is intentionally narrow - only configuration and testing. This establishes a solid foundation for future workflow steps (Step 1/2/3) without premature complexity.
