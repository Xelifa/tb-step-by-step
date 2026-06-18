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
    const response = await provider.call(STEP1_CHECK_PROMPT, config);

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

// Extract the clean prompt from LLM output — only the content inside the
// ```markdown fence under "C. 完整新 Prompt". Validates no meta markers remain.
function extractCleanPrompt(raw: string): string {
  // Find the ```markdown block that follows "C. 完整新 Prompt"
  const fencedMatch = raw.match(/C\.\s*完整新\s*Prompt[^\n]*\n+```markdown\s*\n([\s\S]*?)```/i);
  let content: string;
  if (fencedMatch) {
    content = fencedMatch[1].trim();
  } else {
    // Fallback: strip everything before 【角色定义】 and after any A/B/C/D marker
    const roleStart = raw.indexOf('【角色定义】');
    if (roleStart === -1) {
      throw new Error('Could not find 【角色定义】 in LLM response. Aborting to avoid polluting new-prompt.md');
    }
    content = raw.slice(roleStart);
    // Remove anything that looks like a section header after the role block
    content = content.replace(/\n[A-D]\.\s+\S[\s\S]*$/i, '');
  }

  // Validate: fail if forbidden markers are still present
  const forbidden = [
    /^A\.\s/m, /^B\.\s/m, /^C\.\s/m, /^D\.\s/m,
    /关键替换点清单/, /适配结论摘要/, /适配完成/, /旧\s*Prompt\s*适配诊断/,
    /^[A-D]\.\s+\S/m
  ];
  for (const pattern of forbidden) {
    if (pattern.test(content)) {
      throw new Error(
        `Validation failed: forbidden marker "${pattern}" still in extracted prompt. ` +
        'LLM response format was unexpected. Please retry or report this issue.'
      );
    }
  }

  return content;
}

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

    // Save full LLM response as adaptation report
    await writeTextFile('logs/step1-adaptation-report.md', adaptedPrompt.full_new_prompt);
    logger.success('Saved logs/step1-adaptation-report.md');

    // Extract only the fenced block content from C. 完整新 Prompt
    const cleanPrompt = extractCleanPrompt(adaptedPrompt.full_new_prompt);
    await writeTextFile('output/new-prompt.md', cleanPrompt);
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
