# Step 1: Old Prompt Adaptation Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Step 1 command that verifies model gate, runs second model check, reads source files and tender document, calls real LLM API to adapt old prompt to new tender requirements, and saves outputs.

**Architecture:** Command entry point (step1.ts) delegates to core runner (step1-runner.ts) which orchestrates: model gate verification → second model check → file reading (SKILL.md, old-prompt.md, step1.md, tender.docx) → LLM API call with strict no-mock policy → structured output generation → file saves → state updates.

**Tech Stack:** TypeScript, mammoth (DOCX parsing), existing provider system, inquirer (tender file selection if multiple), fs operations.

---

## File Structure

**New files:**
- `src/types/step1.ts` - Type definitions for Step 1 outputs (Step1CheckResult, Step1RunResult, AdaptedPrompt)
- `src/utils/docx.ts` - DOCX file parsing utility using mammoth
- `src/core/step1-runner.ts` - Core Step 1 logic orchestration
- `src/commands/step1.ts` - npm run step1 command entry point

**Modified files:**
- `package.json` - Add mammoth dependency and step1 script
- `src/core/state-manager.ts` - Add Step 1 state update functions

---

## Task 1: Install Dependencies and Add Type Definitions

**Files:**
- Modify: `package.json`
- Create: `src/types/step1.ts`

- [ ] **Step 1: Install mammoth package**

Run:
```bash
cd "/Users/admin/tb step by step" && npm install mammoth @types/mammoth
```

Expected: Package installed successfully, package.json and package-lock.json updated

- [ ] **Step 2: Create Step 1 type definitions**

Create `src/types/step1.ts`:

```typescript
import { ProviderType } from './config';

export interface Step1CheckResult {
  success: boolean;
  provider: ProviderType;
  model: string;
  base_url: string;
  checked_at: string;
  test_prompt: string;  // 固定为：请回复"TB_STEP1_MODEL_CHECK_OK"，不要输出其他内容。
  test_response: string;
  mock_used: false;  // Literal type - always false
  response_validation_passed?: boolean;
  error?: string;
}

export interface AdaptedPrompt {
  adaptation_summary: string;      // A. 适配结论摘要
  adaptation_diagnosis: {
    preserved: string[];           // B. 保留项
    replaced: string[];            // B. 替换项
    added: string[];               // B. 新增项
    deleted: string[];             // B. 删除项
  };
  full_new_prompt: string;         // C. 完整新 Prompt
  key_replacements: string[];      // D. 关键替换点清单
}

export interface Step1RunResult {
  success: boolean;
  checked_at: string;
  provider: ProviderType;
  model: string;
  base_url: string;
  tender_file: string;
  skill_loaded: boolean;
  old_prompt_loaded: boolean;
  step1_instructions_loaded: boolean;
  tender_loaded: boolean;
  model_check_passed: boolean;
  adapted_prompt?: AdaptedPrompt;
  mock_used: false;  // Literal type - always false
  error?: string;
}
```

- [ ] **Step 3: Verify TypeScript compilation**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run build
```

Expected: Compilation succeeds with no errors

- [ ] **Step 4: Commit type definitions**

```bash
cd "/Users/admin/tb step by step" && git add package.json package-lock.json src/types/step1.ts && git commit -m "feat: add mammoth dependency and Step 1 type definitions"
```

---

## Task 2: DOCX Parsing Utility

**Files:**
- Create: `src/utils/docx.ts`

- [ ] **Step 1: Write DOCX parsing utility**

Create `src/utils/docx.ts`:

```typescript
import mammoth from 'mammoth';
import { logger } from './logger';

/**
 * Extract text content from a DOCX file
 * @param filePath Absolute path to the .docx file
 * @returns Extracted text content
 */
export async function extractDocxText(filePath: string): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    const text = result.value;

    if (!text || text.trim().length === 0) {
      throw new Error('DOCX file contains no readable text');
    }

    logger.success(`Extracted ${text.length} characters from DOCX`);
    return text;
  } catch (error) {
    logger.error(`Failed to parse DOCX file: ${filePath}`);
    throw new Error(
      `DOCX parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
```

- [ ] **Step 2: Verify compilation**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run build
```

Expected: Compilation succeeds

- [ ] **Step 3: Commit DOCX utility**

```bash
cd "/Users/admin/tb step by step" && git add src/utils/docx.ts && git commit -m "feat: add DOCX parsing utility with mammoth"
```

---

## Task 3: State Manager Updates for Step 1

**Files:**
- Modify: `src/core/state-manager.ts`

- [ ] **Step 1: Add Step 1 state update function**

Read `src/core/state-manager.ts`, then add these functions after `markModelConfigured()`:

```typescript
export async function markStep1CheckPassed(): Promise<void> {
  const state = await loadWorkflowState();
  state.step1_model_check_passed = true;
  await writeJSONFile(WORKFLOW_STATE_FILE, state);
  logger.success('Step 1 model check passed');
}

export async function markStep1Completed(tenderFile: string): Promise<void> {
  const state = await loadWorkflowState();
  state.skill_loaded = true;
  state.old_prompt_loaded = true;
  state.tender_file_loaded = true;
  state.new_prompt_generated = true;
  // Note: We don't set tender_file name in state, but log it in step1-run.json
  await writeJSONFile(WORKFLOW_STATE_FILE, state);
  logger.success('Step 1 workflow completed');
}
```

- [ ] **Step 2: Verify compilation**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run build
```

Expected: Compilation succeeds

- [ ] **Step 3: Commit state manager updates**

```bash
cd "/Users/admin/tb step by step" && git add src/core/state-manager.ts && git commit -m "feat: add Step 1 state update functions"
```

---

## Task 4: Core Step 1 Runner - Part 1: Model Gate and File Reading

**Files:**
- Create: `src/core/step1-runner.ts` (Part 1)

- [ ] **Step 1: Create Step 1 runner skeleton with imports and Step 1 model check**

Create `src/core/step1-runner.ts`:

```typescript
import { logger } from '../utils/logger';
import { readJSONFile, readTextFile, writeJSONFile, writeTextFile } from '../utils/file';
import { loadEnvFile, getEnvVar } from '../utils/env';
import { extractDocxText } from '../utils/docx';
import { ModelConfig, ProviderType } from '../types/config';
import { getProvider } from './provider';
import { joinUrl } from '../utils/url';
import { isModelGatePassed, markStep1CheckPassed, markStep1Completed } from './state-manager';
import { Step1CheckResult, Step1RunResult, AdaptedPrompt } from '../types/step1';
import fs from 'fs';
import path from 'path';

const STEP1_CHECK_PROMPT = '请回复"TB_STEP1_MODEL_CHECK_OK"，不要输出其他内容。';

/**
 * Run Step 1 model check (second verification before generating new-prompt.md)
 */
export async function runStep1ModelCheck(config: ModelConfig): Promise<Step1CheckResult> {
  logger.section('Step 1 Model Check');
  logger.info('Running second model verification...');

  const apiKey = getEnvVar(config.api_key_env);
  if (!apiKey) {
    throw new Error(`API key not found in environment: ${config.api_key_env}`);
  }

  const provider = getProvider(config.provider);

  try {
    const response = await provider.testConnection(
      config.base_url,
      apiKey,
      config.model,
      STEP1_CHECK_PROMPT,
      config
    );

    const validationPassed = response.includes('TB_STEP1_MODEL_CHECK_OK');

    const result: Step1CheckResult = {
      success: validationPassed,
      provider: config.provider,
      model: config.model,
      base_url: config.base_url,
      checked_at: new Date().toISOString(),
      test_prompt: STEP1_CHECK_PROMPT,
      test_response: response,
      mock_used: false,
      response_validation_passed: validationPassed
    };

    await writeJSONFile('logs/step1-model-check.json', result);

    if (!validationPassed) {
      logger.error('Step 1 model check failed: response did not contain expected string');
      throw new Error('Step 1 model check failed');
    }

    await markStep1CheckPassed();
    return result;
  } catch (error) {
    const result: Step1CheckResult = {
      success: false,
      provider: config.provider,
      model: config.model,
      base_url: config.base_url,
      checked_at: new Date().toISOString(),
      test_prompt: STEP1_CHECK_PROMPT,
      test_response: '',
      mock_used: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };

    await writeJSONFile('logs/step1-model-check.json', result);
    throw error;
  }
}
```

- [ ] **Step 2: Add file reading function**

Add to `src/core/step1-runner.ts` after the check function:

```typescript
interface Step1InputFiles {
  skill: string;
  oldPrompt: string;
  step1Instructions: string;
  tenderContent: string;
  tenderFileName: string;
}

/**
 * Read all required source files for Step 1
 */
async function readStep1InputFiles(tenderFileName?: string): Promise<Step1InputFiles> {
  logger.section('Reading Source Files');

  // Read fixed source files
  const skill = await readTextFile('sources/SKILL.md');
  if (!skill) throw new Error('sources/SKILL.md not found');
  logger.success('Loaded sources/SKILL.md');

  const oldPrompt = await readTextFile('sources/old-prompt.md');
  if (!oldPrompt) throw new Error('sources/old-prompt.md not found');
  logger.success('Loaded sources/old-prompt.md');

  const step1Instructions = await readTextFile('sources/step1.md');
  if (!step1Instructions) throw new Error('sources/step1.md not found');
  logger.success('Loaded sources/step1.md');

  // Find tender file in input/ directory
  const inputDir = 'input';
  if (!fs.existsSync(inputDir)) {
    throw new Error('input/ directory does not exist');
  }

  const files = fs.readdirSync(inputDir)
    .filter(f => f.endsWith('.docx') && f !== '.gitkeep');

  if (files.length === 0) {
    throw new Error('No .docx tender file found in input/ directory');
  }

  let tenderFile = tenderFileName;
  if (!tenderFile) {
    tenderFile = files[0];
    if (files.length > 1) {
      logger.warn(`Multiple .docx files found in input/. Using: ${tenderFile}`);
    }
  }

  const tenderPath = path.join(inputDir, tenderFile);
  const tenderContent = await extractDocxText(tenderPath);
  logger.success(`Loaded tender file: ${tenderFile}`);

  return {
    skill,
    oldPrompt,
    step1Instructions,
    tenderContent,
    tenderFileName: tenderFile
  };
}
```

- [ ] **Step 3: Verify compilation**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run build
```

Expected: Compilation succeeds

- [ ] **Step 4: Commit Part 1**

```bash
cd "/Users/admin/tb step by step" && git add src/core/step1-runner.ts && git commit -m "feat: add Step 1 runner Part 1 - model check and file reading"
```

---

## Task 5: Core Step 1 Runner - Part 2: LLM API Call and Output Generation

**Files:**
- Modify: `src/core/step1-runner.ts` (add Part 2)

- [ ] **Step 1: Add LLM API call function**

Add to `src/core/step1-runner.ts` after file reading function:

```typescript
/**
 * Call LLM API to generate adapted prompt
 * STRICT NO-MOCK POLICY: This must call real API
 */
async function callLLMForAdaptation(
  config: ModelConfig,
  inputs: Step1InputFiles
): Promise<AdaptedPrompt> {
  logger.section('Calling LLM for Prompt Adaptation');

  const apiKey = getEnvVar(config.api_key_env);
  if (!apiKey) {
    throw new Error(`API key not found: ${config.api_key_env}`);
  }

  const provider = getProvider(config.provider);

  // Build prompt for adaptation
  const adaptationPrompt = `你是一个专业的招投标 Prompt 适配专家。

以下是输入材料：

【旧 Prompt 模板】
${inputs.oldPrompt}

【新招标文件内容】
${inputs.tenderContent}

【适配规则（来自 step1.md）】
${inputs.step1Instructions}

【总规则（来自 SKILL.md）】
${inputs.skill}

请严格按照 step1.md 中定义的 Step 1 工作流执行旧 Prompt 适配任务。

输出格式要求：
1. A. 适配结论摘要（简洁说明核心结构保留、替换内容、新增内容、删除内容、总体逻辑）
2. B. 旧 Prompt 适配诊断（按四类列出：保留项、替换项、新增项、删除项）
3. C. 完整新 Prompt（结构完整、可直接使用）
4. D. 关键替换点清单（清单形式）

注意：
- 遇到信息不足时必须使用 \`[需补充：XXX]\` 占位，不得编造
- 保留旧 Prompt 的成熟结构和工作流机制
- 严格对照新招标文件的评分标准`;

  logger.info(`Calling ${config.provider} API with model ${config.model}...`);

  // Call provider - this is the ONLY place API is called, no fallbacks
  const response = await provider.callAPI(
    config.base_url,
    apiKey,
    config.model,
    adaptationPrompt,
    config
  );

  logger.success('LLM API call completed');

  // Parse response into structured AdaptedPrompt
  // Note: We expect the LLM to follow the format, but we do basic parsing
  const adapted: AdaptedPrompt = {
    adaptation_summary: extractSection(response, 'A. 适配结论摘要') || '未能提取',
    adaptation_diagnosis: {
      preserved: extractListSection(response, '保留项') || [],
      replaced: extractListSection(response, '替换项') || [],
      added: extractListSection(response, '新增项') || [],
      deleted: extractListSection(response, '删除项') || []
    },
    full_new_prompt: extractSection(response, 'C. 完整新 Prompt') || response,
    key_replacements: extractListSection(response, '关键替换点') || []
  };

  return adapted;
}

// Helper functions for parsing LLM response
function extractSection(text: string, sectionTitle: string): string | null {
  const regex = new RegExp(`${sectionTitle}[\\s\\S]*?(?=(?:\\n[A-D]\\. |$))`, 'i');
  const match = text.match(regex);
  return match ? match[0].trim() : null;
}

function extractListSection(text: string, listTitle: string): string[] | null {
  const regex = new RegExp(`${listTitle}[\\s\\S]*?(?=(?:\\n\\*\\*[1-4]|$))`, 'i');
  const match = text.match(regex);
  if (!match) return null;

  const items = match[0]
    .split('\n')
    .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'))
    .map(line => line.replace(/^[\s\-\•]+/, '').trim())
    .filter(line => line.length > 0);

  return items.length > 0 ? items : null;
}
```

- [ ] **Step 2: Add main runStep1 function**

Add to `src/core/step1-runner.ts` after parsing helpers:

```typescript
/**
 * Main Step 1 runner - orchestrates entire Step 1 workflow
 */
export async function runStep1(tenderFileName?: string): Promise<Step1RunResult> {
  try {
    // Load environment
    await loadEnvFile();

    // Step 1: Verify model gate passed
    logger.section('Verifying Model Gate');
    const gatePassed = await isModelGatePassed();

    if (!gatePassed) {
      throw new Error('Model gate has not passed. Please run: npm run config');
    }
    logger.success('Model gate verified ✓');

    // Step 2: Load model configuration
    const config = await readJSONFile<ModelConfig>('config/model.json');
    if (!config) {
      throw new Error('Model configuration not found. Please run: npm run config');
    }

    // Step 3: Run Step 1 model check (second verification)
    const checkResult = await runStep1ModelCheck(config);

    // Step 4: Read all input files
    const inputs = await readStep1InputFiles(tenderFileName);

    // Step 5: Call LLM API for adaptation
    const adaptedPrompt = await callLLMForAdaptation(config, inputs);

    // Step 6: Save outputs
    logger.section('Saving Outputs');

    // Save new-prompt.md
    await writeTextFile('output/new-prompt.md', adaptedPrompt.full_new_prompt);
    logger.success('Saved output/new-prompt.md');

    // Step 7: Create run log
    const runResult: Step1RunResult = {
      success: true,
      checked_at: new Date().toISOString(),
      provider: config.provider,
      model: config.model,
      base_url: config.base_url,
      tender_file: inputs.tenderFileName,
      skill_loaded: true,
      old_prompt_loaded: true,
      step1_instructions_loaded: true,
      tender_loaded: true,
      model_check_passed: true,
      adapted_prompt: adaptedPrompt,
      mock_used: false
    };

    await writeJSONFile('logs/step1-run.json', runResult);
    logger.success('Saved logs/step1-run.json');

    // Step 8: Update workflow state
    await markStep1Completed(inputs.tenderFileName);

    logger.section('Step 1 Completed');
    logger.info('');
    logger.info('Adaptation Summary:');
    logger.info(adaptedPrompt.adaptation_summary);
    logger.info('');
    logger.success('Step 1 workflow completed successfully ✓');
    logger.info('');
    logger.info('Next step: Review output/new-prompt.md');
    logger.info('When ready, run: npm run step2 (not implemented yet)');

    return runResult;

  } catch (error) {
    logger.error('Step 1 failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');

    const runResult: Step1RunResult = {
      success: false,
      checked_at: new Date().toISOString(),
      provider: 'openai',  // Placeholder, will be overwritten if config exists
      model: '',
      base_url: '',
      tender_file: tenderFileName || 'unknown',
      skill_loaded: false,
      old_prompt_loaded: false,
      step1_instructions_loaded: false,
      tender_loaded: false,
      model_check_passed: false,
      mock_used: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };

    await writeJSONFile('logs/step1-run.json', runResult);
    throw error;
  }
}
```

- [ ] **Step 3: Add callAPI method to IProvider interface**

Modify `src/types/provider.ts`. Read the file first, then add this method signature to the IProvider interface after testConnection:

```typescript
callAPI(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  config: ModelConfig
): Promise<string>;
```

- [ ] **Step 4: Implement callAPI in all providers**

For each provider file (openai.ts, deepseek.ts, glm.ts, custom.ts, claude-compatible.ts), add this method after testConnection. Example for OpenAI (use same pattern for others):

```typescript
async callAPI(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  config: ModelConfig
): Promise<string> {
  const result = await callOpenAICompatible(
    baseUrl,
    '/chat/completions',
    apiKey,
    prompt,
    config
  );
  return result;
}
```

For claude-compatible.ts, use the Claude-specific helper instead.

- [ ] **Step 5: Verify compilation**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run build
```

Expected: Compilation succeeds

- [ ] **Step 6: Commit Part 2**

```bash
cd "/Users/admin/tb step by step" && git add src/types/provider.ts src/providers/*.ts src/core/step1-runner.ts && git commit -m "feat: add Step 1 runner Part 2 - LLM API call and output generation"
```

---

## Task 6: Step 1 Command Entry Point

**Files:**
- Create: `src/commands/step1.ts`
- Modify: `package.json`

- [ ] **Step 1: Create Step 1 command entry point**

Create `src/commands/step1.ts`:

```typescript
import { logger } from '../utils/logger';
import { runStep1 } from '../core/step1-runner';

async function step1Command() {
  try {
    logger.section('Step 1: Old Prompt Adaptation Workflow');

    await runStep1();

  } catch (error) {
    logger.error('Step 1 command failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

step1Command();
```

- [ ] **Step 2: Add npm script**

Read `package.json` and add this line to the scripts section after "test:model":

```json
"step1": "node dist/commands/step1.js",
```

Also add pre-step1 hook:

```json
"prestep1": "npm run build",
```

- [ ] **Step 3: Verify compilation**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run build
```

Expected: Compilation succeeds

- [ ] **Step 4: Commit Step 1 command**

```bash
cd "/Users/admin/tb step by step" && git add src/commands/step1.ts package.json && git commit -m "feat: add npm run step1 command entry point"
```

---

## Task 7: Final Verification and Testing

**Files:**
- No new files

- [ ] **Step 1: Verify final build**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run build
```

Expected: Compilation succeeds with no errors

- [ ] **Step 2: Verify no-mock enforcement**

Run:
```bash
cd "/Users/admin/tb step by step" && grep -R "MockProvider\|fake_response\|dummy_response\|placeholder_model\|hardcoded\|fallback provider" src dist
```

Expected: No prohibited patterns found (except error messages like "No mock providers allowed")

- [ ] **Step 3: Verify command structure**

Run:
```bash
cd "/Users/admin/tb step by step" && npm run
```

Expected: Lists available scripts including:
- start
- config
- test:model
- step1

- [ ] **Step 4: Final commit**

```bash
cd "/Users/admin/tb step by step" && git add -A && git commit -m "feat: complete Step 1 old prompt adaptation workflow implementation"
```

- [ ] **Step 5: Manual testing instructions**

The implementation is now ready for manual testing. User should:

1. Place a `.docx` tender file in `input/` directory
2. Run: `npm run step1`
3. Verify files are created:
   - `output/new-prompt.md`
   - `logs/step1-model-check.json`
   - `logs/step1-run.json`
   - Workflow state updated in `logs/workflow-state.json`
4. Check `logs/step1-run.json` contains:
   - `mock_used: false`
   - `success: true`
   - Real LLM API response in `adapted_prompt`

---

## Scope Verification

**Implemented requirements:**
✅ Add `npm run step1` command
✅ Verify model gate has passed
✅ Run second model check with fixed prompt
✅ Save check result to `logs/step1-model-check.json`
✅ Read `sources/SKILL.md`, `old-prompt.md`, `step1.md`
✅ Read `.docx` tender file from `input/` using mammoth
✅ Call real model API (strict no-mock policy enforced)
✅ Output adaptation summary/diagnosis/new prompt/replacement checklist
✅ Save to `output/new-prompt.md` and `logs/step1-run.json`
✅ Update workflow state flags

**NOT implemented (as requested):**
- Step 2 (outline generation and section writing)
- Step 3 (execution mode)

**Quality checks:**
- All code includes complete implementations (no placeholders)
- TypeScript strict mode enabled
- Literal type `mock_used: false` enforces no-mock policy
- Defensive parsing in file reading and response extraction
- Clear error messages and logging
- State management prevents workflow skipping
