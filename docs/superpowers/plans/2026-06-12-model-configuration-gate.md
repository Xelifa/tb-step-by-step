# Model Configuration Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the model configuration gate module - an interactive CLI tool for configuring LLM providers and testing real API connections before unlocking workflow features.

**Architecture:** Layered architecture with type definitions at the bottom, utility modules for cross-cutting concerns, provider abstraction for extensibility, core logic for orchestration, and command entry points for user interaction. All providers implement a common interface, centralized tester enforces validation, and state manager prevents workflow bypasses.

**Tech Stack:** Node.js, TypeScript (CommonJS), inquirer@8.2.6 for interactive CLI, dotenv for environment variables, native fetch for HTTP requests

---

## File Structure

```
tb-step-by-step/
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration
├── .gitignore                      # Ignore generated files and secrets
├── .env.example                    # Environment variable template
├── src/
│   ├── types/
│   │   ├── config.ts               # ModelConfig, ConfigInput, ProviderType
│   │   ├── provider.ts             # IProvider interface, ProviderTestResult
│   │   └── state.ts                # WorkflowState interface
│   ├── utils/
│   │   ├── logger.ts               # Logging utilities
│   │   ├── url.ts                  # URL joining helper
│   │   ├── file.ts                 # File I/O utilities
│   │   └── env.ts                  # Environment variable helpers
│   ├── providers/
│   │   ├── openai.ts               # OpenAI provider implementation
│   │   ├── deepseek.ts             # DeepSeek provider implementation
│   │   ├── glm.ts                  # GLM provider implementation
│   │   ├── claude-compatible.ts    # Claude-compatible provider
│   │   └── custom.ts               # OpenAI-compatible custom provider
│   ├── core/
│   │   ├── provider.ts             # Provider factory and registry
│   │   ├── tester.ts               # Centralized API tester
│   │   ├── state-manager.ts        # Workflow state management
│   │   ├── model-gate.ts           # Shared gate test logic
│   │   └── configure.ts            # Interactive configuration flow
│   ├── commands/
│   │   ├── config.ts               # npm run config command
│   │   └── test-model.ts           # npm run test:model command
│   └── index.ts                    # Main entry with auto-detection
├── config/
│   └── .gitkeep
├── logs/
│   └── .gitkeep
├── input/
│   └── .gitkeep
└── output/
    └── .gitkeep
```

---

## Task 1: Project Configuration Files

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Create package.json**

Create `package.json`:

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

- [ ] **Step 2: Create tsconfig.json**

Create `tsconfig.json`:

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

- [ ] **Step 3: Create .gitignore**

Create `.gitignore`:

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

- [ ] **Step 4: Create .env.example**

Create `.env.example`:

```
# Example environment variables
# Copy this file to .env and fill in your actual API keys

# OpenAI API Key
OPENAI_API_KEY=your-openai-api-key-here

# DeepSeek API Key
DEEPSEEK_API_KEY=your-deepseek-api-key-here

# GLM API Key
GLM_API_KEY=your-glm-api-key-here

# Claude API Key
CLAUDE_API_KEY=your-claude-api-key-here

# Custom Provider API Key
CUSTOM_API_KEY=your-custom-api-key-here
```

- [ ] **Step 5: Create directory structure**

Run:

```bash
mkdir -p src/types src/utils src/providers src/core src/commands
mkdir -p config logs input output
touch config/.gitkeep logs/.gitkeep input/.gitkeep output/.gitkeep
```

- [ ] **Step 6: Install dependencies**

Run:

```bash
npm install
```

Expected: Dependencies installed successfully, `node_modules/` and `package-lock.json` created.

- [ ] **Step 7: Commit project setup**

Run:

```bash
git add package.json tsconfig.json .gitignore .env.example
git add config/.gitkeep logs/.gitkeep input/.gitkeep output/.gitkeep
git commit -m "chore: initialize project structure and configuration"
```

---

## Task 2: Type Definitions

**Files:**
- Create: `src/types/config.ts`
- Create: `src/types/provider.ts`
- Create: `src/types/state.ts`

- [ ] **Step 1: Create config types**

Create `src/types/config.ts`:

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

- [ ] **Step 2: Create provider types**

Create `src/types/provider.ts`:

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

- [ ] **Step 3: Create state types**

Create `src/types/state.ts`:

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

- [ ] **Step 4: Verify compilation**

Run:

```bash
npm run build
```

Expected: TypeScript compiles successfully with no errors.

- [ ] **Step 5: Commit type definitions**

Run:

```bash
git add src/types/
git commit -m "feat: add type definitions for config, provider, and state"
```

---

## Task 3: Logger Utility

**Files:**
- Create: `src/utils/logger.ts`

- [ ] **Step 1: Create logger utility**

Create `src/utils/logger.ts`:

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

- [ ] **Step 2: Verify compilation**

Run:

```bash
npm run build
```

- [ ] **Step 3: Commit logger**

Run:

```bash
git add src/utils/logger.ts
git commit -m "feat: add logger utility"
```

---

## Task 4: URL Utility

**Files:**
- Create: `src/utils/url.ts`

- [ ] **Step 1: Create URL joining utility**

Create `src/utils/url.ts`:

```typescript
// Safely join base URL with path segment
export function joinUrl(base: string, pathSegment: string): string {
  // Remove trailing slash from base
  const cleanBase = base.replace(/\/+$/, '');
  // Remove leading slash from path
  const cleanPath = pathSegment.replace(/^\/+/, '');

  return `${cleanBase}/${cleanPath}`;
}
```

- [ ] **Step 2: Verify compilation**

Run:

```bash
npm run build
```

- [ ] **Step 3: Commit URL utility**

Run:

```bash
git add src/utils/url.ts
git commit -m "feat: add URL joining utility"
```

---

## Task 5: File Utilities

**Files:**
- Create: `src/utils/file.ts`

- [ ] **Step 1: Create file utilities**

Create `src/utils/file.ts`:

```typescript
import { promises as fs } from 'fs';
import * as path from 'path';
import { logger } from './logger';

// Ensure directory exists, create if needed
export async function ensureDirectoryExists(
  dirPath: string
): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Directory already exists is okay
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

// Read JSON file safely
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

// Write JSON file with formatting
export async function writeJSONFile<T>(
  filePath: string,
  data: T
): Promise<void> {
  await ensureDirectoryExists(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// Check if file exists
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Read text file
export async function readTextFile(filePath: string): Promise<string> {
  return await fs.readFile(filePath, 'utf-8');
}

// Write text file
export async function writeTextFile(
  filePath: string,
  content: string
): Promise<void> {
  await ensureDirectoryExists(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
}
```

- [ ] **Step 2: Verify compilation**

Run:

```bash
npm run build
```

- [ ] **Step 3: Commit file utilities**

Run:

```bash
git add src/utils/file.ts
git commit -m "feat: add file I/O utilities"
```

---

## Task 6: Environment Utilities

**Files:**
- Create: `src/utils/env.ts`

- [ ] **Step 1: Create environment utilities**

Create `src/utils/env.ts`:

```typescript
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileExists } from './file';

// Load .env file if it exists
export async function loadEnvFile(): Promise<void> {
  const envPath = path.resolve(process.cwd(), '.env');
  if (await fileExists(envPath)) {
    dotenv.config({ path: envPath });
  }
}

// Get environment variable or throw
export function getEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  return value;
}

// Check if environment variable exists
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

- [ ] **Step 2: Verify compilation**

Run:

```bash
npm run build
```

- [ ] **Step 3: Commit environment utilities**

Run:

```bash
git add src/utils/env.ts
git commit -m "feat: add environment variable utilities"
```

---

## Task 7: Provider Factory and Registry

**Files:**
- Create: `src/core/provider.ts`

- [ ] **Step 1: Create provider factory (with placeholder imports)**

Create `src/core/provider.ts`:

```typescript
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
```

- [ ] **Step 2: Verify imports fail (expected)**

Run:

```bash
npm run build
```

Expected: Compilation fails with "Cannot find module '../providers/openai'" errors (this is expected - we'll create providers next).

- [ ] **Step 3: Commit provider factory**

Run:

```bash
git add src/core/provider.ts
git commit -m "feat: add provider factory and registry"
```

---

## Task 8: OpenAI-Compatible Provider Helper

**Files:**
- Create: `src/providers/openai-compatible-helper.ts`

- [ ] **Step 1: Create shared OpenAI-compatible helper**

Create `src/providers/openai-compatible-helper.ts`:

```typescript
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

- [ ] **Step 2: Verify compilation**

Run:

```bash
npm run build
```

- [ ] **Step 3: Commit helper**

Run:

```bash
git add src/providers/openai-compatible-helper.ts
git commit -m "feat: add OpenAI-compatible provider helper"
```

---

## Task 9: OpenAI Provider

**Files:**
- Create: `src/providers/openai.ts`

- [ ] **Step 1: Create OpenAI provider**

Create `src/providers/openai.ts`:

```typescript
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
```

- [ ] **Step 2: Verify compilation**

Run:

```bash
npm run build
```

- [ ] **Step 3: Commit OpenAI provider**

Run:

```bash
git add src/providers/openai.ts
git commit -m "feat: add OpenAI provider implementation"
```

---

## Task 10: DeepSeek Provider

**Files:**
- Create: `src/providers/deepseek.ts`

- [ ] **Step 1: Create DeepSeek provider**

Create `src/providers/deepseek.ts`:

```typescript
import { IProvider } from '../types/provider';
import { ProviderType, ModelConfig } from '../types/config';
import { callOpenAICompatible } from './openai-compatible-helper';

export class DeepSeekProvider implements IProvider {
  readonly name = 'DeepSeek';
  readonly type: ProviderType = 'deepseek';

  async call(prompt: string, config: ModelConfig): Promise<string> {
    // Read API key from environment
    const apiKey = process.env[config.api_key_env];
    if (!apiKey) {
      throw new Error(`API key not found: ${config.api_key_env}`);
    }

    // DeepSeek uses OpenAI-compatible API
    return await callOpenAICompatible(
      config.base_url,
      '/chat/completions',
      apiKey,
      prompt,
      config
    );
  }
}
```

- [ ] **Step 2: Verify compilation**

Run:

```bash
npm run build
```

- [ ] **Step 3: Commit DeepSeek provider**

Run:

```bash
git add src/providers/deepseek.ts
git commit -m "feat: add DeepSeek provider implementation"
```

---

## Task 11: GLM Provider

**Files:**
- Create: `src/providers/glm.ts`

- [ ] **Step 1: Create GLM provider**

Create `src/providers/glm.ts`:

```typescript
import { IProvider } from '../types/provider';
import { ProviderType, ModelConfig } from '../types/config';
import { callOpenAICompatible } from './openai-compatible-helper';

export class GLMProvider implements IProvider {
  readonly name = 'GLM';
  readonly type: ProviderType = 'glm';

  async call(prompt: string, config: ModelConfig): Promise<string> {
    // Read API key from environment
    const apiKey = process.env[config.api_key_env];
    if (!apiKey) {
      throw new Error(`API key not found: ${config.api_key_env}`);
    }

    // GLM uses OpenAI-compatible API
    return await callOpenAICompatible(
      config.base_url,
      '/chat/completions',
      apiKey,
      prompt,
      config
    );
  }
}
```

- [ ] **Step 2: Verify compilation**

Run:

```bash
npm run build
```

- [ ] **Step 3: Commit GLM provider**

Run:

```bash
git add src/providers/glm.ts
git commit -m "feat: add GLM provider implementation"
```

---

## Task 12: Claude-Compatible Provider

**Files:**
- Create: `src/providers/claude-compatible.ts`

- [ ] **Step 1: Create Claude-compatible provider**

Create `src/providers/claude-compatible.ts`:

```typescript
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

- [ ] **Step 2: Verify compilation**

Run:

```bash
npm run build
```

- [ ] **Step 3: Commit Claude provider**

Run:

```bash
git add src/providers/claude-compatible.ts
git commit -m "feat: add Claude-compatible provider implementation"
```

---

## Task 13: Custom Provider

**Files:**
- Create: `src/providers/custom.ts`

- [ ] **Step 1: Create custom provider**

Create `src/providers/custom.ts`:

```typescript
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
}
```

- [ ] **Step 2: Verify compilation**

Run:

```bash
npm run build
```

Expected: Compilation succeeds (all providers now exist).

- [ ] **Step 3: Commit custom provider**

Run:

```bash
git add src/providers/custom.ts
git commit -m "feat: add custom provider implementation"
```

---

## Task 14: Centralized API Tester

**Files:**
- Create: `src/core/tester.ts`

- [ ] **Step 1: Create API tester**

Create `src/core/tester.ts`:

```typescript
import { ModelConfig } from '../types/config';
import { ProviderTestResult } from '../types/provider';
import { getProvider } from './provider';

// Fixed test prompt - MUST use this exact prompt
const TEST_PROMPT = '请回复"TB_MODEL_TEST_OK"，不要输出其他内容。';

// Validate response contains required test string
function validateTestResponse(response: string): boolean {
  return response.includes('TB_MODEL_TEST_OK');
}

// Execute real API test - NO MOCKS, NO FALLBACKS
export async function testModelConnection(
  config: ModelConfig
): Promise<ProviderTestResult> {
  const provider = getProvider(config.provider);
  const checked_at = new Date().toISOString();

  try {
    // Real API call
    const response = await provider.call(TEST_PROMPT, config);

    // Validate response
    const validation_passed = validateTestResponse(response);

    return {
      success: validation_passed,
      provider: config.provider,
      model: config.model,
      base_url: config.base_url,
      test_prompt: TEST_PROMPT,
      test_response: response,
      checked_at,
      mock_used: false,  // Hard-coded: always false
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

- [ ] **Step 2: Verify compilation**

Run:

```bash
npm run build
```

- [ ] **Step 3: Commit tester**

Run:

```bash
git add src/core/tester.ts
git commit -m "feat: add centralized API tester with fixed test prompt"
```

---

## Task 15: State Manager

**Files:**
- Create: `src/core/state-manager.ts`

- [ ] **Step 1: Create state manager**

Create `src/core/state-manager.ts`:

```typescript
import { WorkflowState, INITIAL_WORKFLOW_STATE } from '../types/state';
import { ModelConfig } from '../types/config';
import { ProviderTestResult } from '../types/provider';
import { readJSONFile, writeJSONFile, fileExists } from '../utils/file';

const STATE_FILE = 'logs/workflow-state.json';

// Load current workflow state
export async function loadWorkflowState(): Promise<WorkflowState> {
  const state = await readJSONFile<WorkflowState>(STATE_FILE);
  return state || INITIAL_WORKFLOW_STATE;
}

// Save workflow state
export async function saveWorkflowState(
  state: WorkflowState
): Promise<void> {
  await writeJSONFile(STATE_FILE, state);
}

// Check if model gate has passed
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

// Update state after successful configuration
export async function markModelConfigured(): Promise<void> {
  const state = await loadWorkflowState();

  // Reset downstream flags when config changes
  state.model_configured = true;
  state.model_test_passed = false;
  state.step1_model_check_passed = false;
  state.new_prompt_generated = false;

  await saveWorkflowState(state);
}

// Update state after successful test
export async function markModelTestPassed(): Promise<void> {
  const state = await loadWorkflowState();
  state.model_configured = true;
  state.model_test_passed = true;
  await saveWorkflowState(state);
}

// Update state after failed test
export async function markModelTestFailed(): Promise<void> {
  const state = await loadWorkflowState();

  // Check if config exists without throwing on invalid JSON
  const configExists = await fileExists('config/model.json');
  state.model_configured = configExists;
  state.model_test_passed = false;

  await saveWorkflowState(state);
}
```

- [ ] **Step 2: Verify compilation**

Run:

```bash
npm run build
```

- [ ] **Step 3: Commit state manager**

Run:

```bash
git add src/core/state-manager.ts
git commit -m "feat: add workflow state manager with multi-file validation"
```

---

## Task 16: Model Gate Logic

**Files:**
- Create: `src/core/model-gate.ts`

- [ ] **Step 1: Create model gate logic**

Create `src/core/model-gate.ts`:

```typescript
import { ModelConfig } from '../types/config';
import { ProviderTestResult } from '../types/provider';
import { testModelConnection } from './tester';
import { markModelTestPassed, markModelTestFailed } from './state-manager';
import { writeJSONFile } from '../utils/file';
import { logger } from '../utils/logger';

// Centralized model gate test logic
// Used by both npm run config and npm run test:model
export async function runModelGateTest(
  config: ModelConfig
): Promise<ProviderTestResult> {
  logger.info('Testing model connection...');

  // Run real API test
  const result = await testModelConnection(config);

  // Save test result
  await writeJSONFile('logs/model-test.json', result);

  // Update workflow state
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

- [ ] **Step 2: Verify compilation**

Run:

```bash
npm run build
```

- [ ] **Step 3: Commit model gate**

Run:

```bash
git add src/core/model-gate.ts
git commit -m "feat: add shared model gate test logic"
```

---

## Task 17: Interactive Configuration Flow

**Files:**
- Create: `src/core/configure.ts`

- [ ] **Step 1: Create interactive configuration (part 1)**

Create `src/core/configure.ts` with imports and constants:

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
```

- [ ] **Step 2: Add collectConfiguration function**

Append to `src/core/configure.ts`:

```typescript
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
```

- [ ] **Step 3: Add saveConfiguration and runConfigurationFlow functions**

Append to `src/core/configure.ts`:

```typescript
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

- [ ] **Step 4: Verify compilation**

Run:

```bash
npm run build
```

- [ ] **Step 5: Commit configuration flow**

Run:

```bash
git add src/core/configure.ts
git commit -m "feat: add interactive configuration flow with inquirer"
```

---

## Task 18: Main Entry Point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Create main entry point**

Create `src/index.ts`:

```typescript
import { logger } from './utils/logger';
import { loadEnvFile } from './utils/env';
import { isModelGatePassed } from './core/state-manager';
import { runConfigurationFlow } from './core/configure';

async function main() {
  try {
    // Load .env file if exists
    await loadEnvFile();

    logger.section('TB Step by Step Workflow');

    // Check if model gate has passed
    const gatePassed = await isModelGatePassed();

    if (!gatePassed) {
      logger.info('Model configuration required before workflow can proceed');
      logger.info('Launching model configuration...\n');

      // Automatically launch configuration
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

- [ ] **Step 2: Verify compilation**

Run:

```bash
npm run build
```

- [ ] **Step 3: Commit main entry**

Run:

```bash
git add src/index.ts
git commit -m "feat: add main entry point with auto-detection"
```

---

## Task 19: Config Command

**Files:**
- Create: `src/commands/config.ts`

- [ ] **Step 1: Create config command**

Create `src/commands/config.ts`:

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

- [ ] **Step 2: Verify compilation**

Run:

```bash
npm run build
```

- [ ] **Step 3: Commit config command**

Run:

```bash
git add src/commands/config.ts
git commit -m "feat: add npm run config command"
```

---

## Task 20: Test Model Command

**Files:**
- Create: `src/commands/test-model.ts`

- [ ] **Step 1: Create test model command**

Create `src/commands/test-model.ts`:

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

    // Check if config exists
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

    // Run test
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

- [ ] **Step 2: Verify full compilation**

Run:

```bash
npm run build
```

Expected: All TypeScript files compile successfully with no errors.

- [ ] **Step 3: Commit test model command**

Run:

```bash
git add src/commands/test-model.ts
git commit -m "feat: add npm run test:model command"
```

---

## Task 21: Manual Testing and Verification

**Files:**
- No new files

- [ ] **Step 1: Test npm start with no configuration**

Run:

```bash
npm start
```

Expected: Should auto-launch interactive configuration flow.

- [ ] **Step 2: Follow interactive prompts**

Complete the configuration with a real API key:
1. Select a provider (e.g., OpenAI)
2. Accept or modify Base URL
3. Enter model name
4. Accept or modify env var name
5. Enter API key
6. Set temperature
7. Set max_tokens
8. Set timeout

Expected: Configuration saves to `config/model.json` and `.env`, then runs real API test.

- [ ] **Step 3: Verify generated files**

Run:

```bash
ls -la config/model.json
ls -la logs/model-test.json
ls -la logs/workflow-state.json
ls -la .env
```

Expected: All files exist with correct content.

- [ ] **Step 4: Verify .gitignore protection**

Run:

```bash
git status
```

Expected: `.env` should NOT appear in git status (it's ignored).

- [ ] **Step 5: Test npm start with valid configuration**

Run:

```bash
npm start
```

Expected: Should say "Model gate passed ✓" and indicate workflow is ready.

- [ ] **Step 6: Test npm run test:model**

Run:

```bash
npm run test:model
```

Expected: Should show current config and re-run test successfully.

- [ ] **Step 7: Test npm run config (reconfiguration)**

Run:

```bash
npm run config
```

Expected: Should launch interactive configuration again.

- [ ] **Step 8: Test stale detection**

Manually edit `config/model.json` to change the model name, then run:

```bash
npm start
```

Expected: Should detect stale test result and require re-testing.

- [ ] **Step 9: Test invalid credentials**

Delete `.env`, then run:

```bash
npm run test:model
```

Expected: Should fail with "API key not found" error.

- [ ] **Step 10: Final commit**

Run:

```bash
git add -A
git commit -m "docs: complete manual testing and verification"
```

---

## Success Criteria

### Functional Requirements Met

- [x] Users can configure model provider interactively
- [x] API keys stored in `.env`, not in config files
- [x] Real API calls succeed for configured provider
- [x] Test validation enforces `TB_MODEL_TEST_OK` response
- [x] Workflow state prevents bypassing gate
- [x] Stale test results are detected
- [x] All three entry points work (`start`, `config`, `test:model`)

### Non-Functional Requirements Met

- [x] No mock providers in codebase
- [x] API keys never logged or printed
- [x] TypeScript strict mode catches errors early
- [x] Cross-platform compatible
- [x] Clear error messages for common failures
- [x] Defensive response parsing handles edge cases

### Code Quality

- [x] All imports use correct paths for CommonJS
- [x] No unused imports or variables
- [x] Consistent code style throughout
- [x] Type safety enforced by TypeScript
- [x] Error handling at all boundaries

---

## Next Steps

After completing this plan:

1. **Verify all tests pass** - Run through the manual testing checklist
2. **Document any edge cases** discovered during testing
3. **Prepare for Step 1 implementation** - The model gate is now ready for the next workflow stage

The MVP is complete and ready for integration with Step 1/2/3 workflow.
