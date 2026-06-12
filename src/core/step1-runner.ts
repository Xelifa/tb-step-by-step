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
