import { logger } from '../utils/logger';
import { readJSONFile, readTextFile, writeJSONFile, writeTextFile } from '../utils/file';
import { loadEnvFile, getEnvVar } from '../utils/env';
import { extractDocxText } from '../utils/docx';
import { ModelConfig, ProviderType } from '../types/config';
import { getProvider } from './provider';
import { isModelGatePassed, markStep2OutlineGenerated } from './state-manager';
import { Step2OutlineRunResult, Outline } from '../types/step2';
import fs from 'fs';
import path from 'path';

/**
 * Verify Step 1 has completed successfully
 */
async function verifyStep1Completed(): Promise<void> {
  logger.section('Verifying Step 1 Completion');

  const state = await readJSONFile<{
    new_prompt_generated: boolean;
  }>('logs/workflow-state.json');

  if (!state || !state.new_prompt_generated) {
    throw new Error('Step 1 has not completed. Please run: npm run step1');
  }

  // Verify output/new-prompt.md exists
  const newPrompt = await readTextFile('output/new-prompt.md');
  if (!newPrompt) {
    throw new Error('output/new-prompt.md not found. Please run: npm run step1');
  }

  logger.success('Step 1 completion verified ✓');
}

/**
 * Read all required source files for Step 2 outline generation
 */
async function readStep2OutlineInputFiles(): Promise<{
  newPrompt: string;
  step2Instructions: string;
  step3Instructions: string;
  tenderContent: string;
  tenderFileName: string;
}> {
  logger.section('Reading Source Files');

  // Read new-prompt.md
  const newPrompt = await readTextFile('output/new-prompt.md');
  if (!newPrompt) throw new Error('output/new-prompt.md not found');
  logger.success('Loaded output/new-prompt.md');

  // Read step2.md
  const step2Instructions = await readTextFile('sources/step2.md');
  if (!step2Instructions) throw new Error('sources/step2.md not found');
  logger.success('Loaded sources/step2.md');

  // Read step3.md
  const step3Instructions = await readTextFile('sources/step3.md');
  if (!step3Instructions) throw new Error('sources/step3.md not found');
  logger.success('Loaded sources/step3.md');

  // Find tender file
  const inputDir = 'input';
  if (!fs.existsSync(inputDir)) {
    throw new Error('input/ directory does not exist');
  }

  const files = fs.readdirSync(inputDir)
    .filter(f => f.endsWith('.docx') && f !== '.gitkeep');

  if (files.length === 0) {
    throw new Error('No .docx tender file found in input/ directory');
  }

  const tenderFile = files[0];
  if (files.length > 1) {
    logger.warn(`Multiple .docx files found in input/. Using: ${tenderFile}`);
  }

  const tenderPath = path.join(inputDir, tenderFile);
  const tenderContent = await extractDocxText(tenderPath);
  logger.success(`Loaded tender file: ${tenderFile}`);

  return {
    newPrompt,
    step2Instructions,
    step3Instructions,
    tenderContent,
    tenderFileName: tenderFile
  };
}

/**
 * Call LLM API to generate structured outline
 * STRICT NO-MOCK POLICY: This must call real API
 * NO FALLBACK OUTLINE - if parsing fails, throw error
 */
async function callLLMForOutline(
  config: ModelConfig,
  inputs: {
    newPrompt: string;
    step2Instructions: string;
    step3Instructions: string;
    tenderContent: string;
  }
): Promise<Outline> {
  logger.section('Calling LLM for Outline Generation');

  const apiKey = getEnvVar(config.api_key_env);
  if (!apiKey) {
    throw new Error(`API key not found: ${config.api_key_env}`);
  }

  const provider = getProvider(config.provider);

  // Build prompt for outline generation
  const outlinePrompt = `你是一个专业的招投标文件大纲制定专家。

以下是输入材料：

【适配后的新 Prompt】
${inputs.newPrompt}

【新招标文件内容】
${inputs.tenderContent}

【Step 2 分段撰写规则】
${inputs.step2Instructions}

【Step 3 执行模式规则】
${inputs.step3Instructions}

请基于以上材料，生成完整的投标文件大纲。

输出要求：
1. 总标题
2. 三级目录结构（一级/二级/三级标题）
3. 每个章节需包含：
   - 写作目的
   - 关键内容点（数组）
   - 源依据（来自招标文件的哪个部分）
   - 是否需要联网/政策检索（布尔值）
   - 建议输出文件名

必须覆盖以下 8 个模块：
- 项目背景
- 工作目标
- 工作内容
- 工作方法
- 项目成果
- 项目重点、难点分析
- 项目重点、难点的应对措施
- 相关的合理化建议

输出格式为结构化 JSON，包含：
- document_title: 总标题
- sections: 章节数组，每项包含 level, title, writing_purpose, key_points[], source_basis, needs_research, output_filename
- modules: 8 个模块的章节标题分组

注意：
- 大纲必须符合三级目录要求
- 严格对照招标文件和 new-prompt.md
- 工作内容必须针对工作目标
- 工作方法必须针对工作内容
- 重点/难点与应对措施数量必须一一对应`;

  logger.info(`Calling ${config.provider} API with model ${config.model}...`);

  // Call provider - this is the ONLY place API is called, no fallbacks
  const response = await provider.callAPI(
    config.base_url,
    apiKey,
    config.model,
    outlinePrompt,
    config
  );

  logger.success('LLM API call completed');

  // Parse JSON from response
  // Try to extract JSON from markdown code blocks if present
  let jsonStr = response;
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  try {
    const outline: Outline = JSON.parse(jsonStr);

    // Validate structure
    if (!outline.document_title || !outline.sections || !outline.modules) {
      throw new Error('Invalid outline structure: missing required fields');
    }

    // Validate sections have required fields
    for (const section of outline.sections) {
      if (typeof section.level !== 'number' || !section.title) {
        throw new Error('Invalid section structure: missing level or title');
      }
    }

    return outline;
  } catch (parseError) {
    // CRITICAL: NO FALLBACK OUTLINE
    // Save raw response for diagnostics
    await writeTextFile('logs/step2-outline-raw-response.txt', response);

    const errorMsg = `Failed to parse outline JSON from LLM response. Raw response saved to logs/step2-outline-raw-response.txt. Parse error: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`;

    throw new Error(errorMsg);
  }
}

/**
 * Format outline structure as markdown
 */
function formatOutlineAsMarkdown(outline: Outline): string {
  let markdown = `# ${outline.document_title}\n\n`;

  for (const section of outline.sections) {
    const indent = '  '.repeat(section.level - 1);
    const prefix = section.level === 1 ? '#' : section.level === 2 ? '##' : '###';
    markdown += `${prefix} ${section.title}\n\n`;
    markdown += `${indent}**写作目的:** ${section.writing_purpose}\n\n`;
    markdown += `${indent}**关键内容点:**\n`;
    for (const point of section.key_points) {
      markdown += `${indent}- ${point}\n`;
    }
    markdown += `\n${indent}**源依据:** ${section.source_basis}\n\n`;
    markdown += `${indent}**需要联网检索:** ${section.needs_research ? '是' : '否'}\n\n`;
    markdown += `${indent}**建议输出文件:** \`${section.output_filename}\`\n\n`;
    markdown += `${indent}---\n\n`;
  }

  markdown += `## 模块覆盖情况\n\n`;
  markdown += `- **项目背景:** ${outline.modules.background.join(', ') || '无'}\n`;
  markdown += `- **工作目标:** ${outline.modules.objectives.join(', ') || '无'}\n`;
  markdown += `- **工作内容:** ${outline.modules.content.join(', ') || '无'}\n`;
  markdown += `- **工作方法:** ${outline.modules.methods.join(', ') || '无'}\n`;
  markdown += `- **项目成果:** ${outline.modules.results.join(', ') || '无'}\n`;
  markdown += `- **项目重点、难点分析:** ${outline.modules.challenges.join(', ') || '无'}\n`;
  markdown += `- **项目重点、难点应对措施:** ${outline.modules.solutions.join(', ') || '无'}\n`;
  markdown += `- **相关的合理化建议:** ${outline.modules.suggestions.join(', ') || '无'}\n`;

  return markdown;
}

/**
 * Main Step 2 outline runner - orchestrates entire outline generation workflow
 */
export async function runStep2Outline(): Promise<Step2OutlineRunResult> {
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

    // Step 2: Verify Step 1 completed
    await verifyStep1Completed();

    // Step 3: Load model configuration
    const config = await readJSONFile<ModelConfig>('config/model.json');
    if (!config) {
      throw new Error('Model configuration not found. Please run: npm run config');
    }

    // Step 4: Read all input files
    const inputs = await readStep2OutlineInputFiles();

    // Step 5: Call LLM API for outline generation
    const outline = await callLLMForOutline(config, inputs);

    // Step 6: Save outputs
    logger.section('Saving Outputs');

    // Format outline as markdown
    const outlineMarkdown = formatOutlineAsMarkdown(outline);
    await writeTextFile('output/outline.md', outlineMarkdown);
    logger.success('Saved output/outline.md');

    // Step 7: Create run log
    const runResult: Step2OutlineRunResult = {
      success: true,
      checked_at: new Date().toISOString(),
      provider: config.provider,
      model: config.model,
      base_url: config.base_url,
      tender_file: inputs.tenderFileName,
      new_prompt_loaded: true,
      step2_instructions_loaded: true,
      step3_instructions_loaded: true,
      tender_loaded: true,
      outline_generated: true,
      outline: outline,
      mock_used: false
    };

    await writeJSONFile('logs/step2-outline-run.json', runResult);
    logger.success('Saved logs/step2-outline-run.json');

    // Step 8: Update workflow state
    await markStep2OutlineGenerated();

    logger.section('Step 2 Outline Generation Completed');
    logger.info('');
    logger.success('Outline generated successfully ✓');
    logger.info('');
    logger.info('Document Structure:');
    logger.info(`  Title: ${outline.document_title}`);
    logger.info(`  Total Sections: ${outline.sections.length}`);
    logger.info(`  Modules Covered: ${Object.keys(outline.modules).length}`);
    logger.info('');
    logger.info('Next steps:');
    logger.info('  1. Review output/outline.md');
    logger.info('  2. Step 2 section writing: NOT implemented yet');
    logger.info('  3. Outline confirmation command: NOT implemented yet');

    return runResult;

  } catch (error) {
    logger.error('Step 2 outline generation failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');

    const runResult: Step2OutlineRunResult = {
      success: false,
      checked_at: new Date().toISOString(),
      provider: 'openai',
      model: '',
      base_url: '',
      tender_file: '',
      new_prompt_loaded: false,
      step2_instructions_loaded: false,
      step3_instructions_loaded: false,
      tender_loaded: false,
      outline_generated: false,
      mock_used: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };

    await writeJSONFile('logs/step2-outline-run.json', runResult);
    throw error;
  }
}
