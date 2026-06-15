import inquirer from 'inquirer';
import { logger } from '../utils/logger';
import { readJSONFile, readTextFile, writeJSONFile, writeTextFile } from '../utils/file';
import { loadEnvFile, getEnvVar } from '../utils/env';
import { sanitizeSectionContent } from './section-sanitizer';
import { ModelConfig, ProviderType } from '../types/config';
import { Outline, OutlineSection } from '../types/step2';
import { getProvider } from './provider';
import { isModelGatePassed } from './state-manager';
import { Step2SectionRunResult, SectionGenerationPrompt } from '../types/step2-section';
import fs from 'fs';
import path from 'path';

/**
 * Verify Step 2 outline has been confirmed
 */
async function verifyStep2OutlineConfirmed(): Promise<void> {
  logger.section('Verifying Step 2 Outline Confirmation');

  const state = await readJSONFile<{
    step2_confirmed: boolean;
    outline_confirmed: boolean;
  }>('logs/workflow-state.json');

  if (!state || !state.step2_confirmed || !state.outline_confirmed) {
    throw new Error('Step 2 outline has not been confirmed. Please run: npm run step2:confirm');
  }

  // Verify logs/step2-confirm-run.json exists and has confirmed: true
  const confirmLog = await readJSONFile<{ confirmed: boolean }>('logs/step2-confirm-run.json');
  if (!confirmLog || !confirmLog.confirmed) {
    throw new Error('logs/step2-confirm-run.json not found or not confirmed. Please run: npm run step2:confirm');
  }

  logger.success('Step 2 outline confirmation verified ✓');
}

/**
 * Read all required source files for section generation
 */
async function readSectionGenerationInputFiles(): Promise<{
  newPrompt: string;
  outline: Outline;
  outlineRunLog: { success: boolean };
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

  // Read outline.md
  const outlineMarkdown = await readTextFile('output/outline.md');
  if (!outlineMarkdown) throw new Error('output/outline.md not found');
  logger.success('Loaded output/outline.md');

  // Read logs/step2-outline-run.json for structured outline
  const outlineRunLog = await readJSONFile<{ success: boolean; outline: Outline }>('logs/step2-outline-run.json');
  if (!outlineRunLog || !outlineRunLog.success) {
    throw new Error('logs/step2-outline-run.json not found or unsuccessful');
  }
  if (!outlineRunLog.outline) {
    throw new Error('logs/step2-outline-run.json missing outline structure');
  }
  logger.success('Loaded logs/step2-outline-run.json');

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
  const { extractDocxText } = await import('../utils/docx');
  const tenderContent = await extractDocxText(tenderPath);
  logger.success(`Loaded tender file: ${tenderFile}`);

  return {
    newPrompt,
    outline: outlineRunLog.outline,
    outlineRunLog: { success: outlineRunLog.success },
    step2Instructions,
    step3Instructions,
    tenderContent,
    tenderFileName: tenderFile
  };
}

/**
 * Get completed sections from workflow state
 */
async function getCompletedSections(): Promise<string[]> {
  const state = await readJSONFile<{ completed_sections: string[] }>('logs/workflow-state.json');
  return state?.completed_sections || [];
}

/**
 * Display interactive section selection
 */
async function selectSectionToWrite(outline: Outline): Promise<OutlineSection> {
  logger.section('Select Section to Write');

  const completedFilenames = await getCompletedSections();

  // Filter out already completed sections
  const availableSections = outline.sections.filter(section => {
    const filename = section.output_filename;
    return !completedFilenames.includes(filename);
  });

  if (availableSections.length === 0) {
    throw new Error('All sections have been completed. No sections available to write.');
  }

  // Create display choices
  const choices = availableSections.map(section => {
    const indent = '  '.repeat(section.level - 1);
    const prefix = section.needs_research ? '🔍 ' : '';
    return {
      name: `${indent}${prefix}${section.title}`,
      value: section
    };
  });

  const { selectedSection } = await inquirer.prompt<{ selectedSection: OutlineSection }>([{
    type: 'list',
    name: 'selectedSection',
    message: 'Select a section to write:',
    choices: choices
  }]);

  logger.success(`Selected: ${selectedSection.title}`);
  return selectedSection;
}

/**
 * Check if section file exists and handle duplicate protection
 */
async function checkDuplicateFile(outputFilename: string): Promise<boolean> {
  const outputPath = path.join('output/sections', outputFilename);

  if (!fs.existsSync(outputPath)) {
    return false; // No duplicate, safe to proceed
  }

  logger.warn(`File already exists: ${outputPath}`);

  const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([{
    type: 'confirm',
    name: 'overwrite',
    message: 'This section file already exists. Overwrite it?',
    default: false
  }]);

  return !overwrite; // Return true if should skip (user chose No)
}

/**
 * Build prompt for section generation
 */
function buildSectionPrompt(section: OutlineSection, inputs: {
  newPrompt: string;
  tenderContent: string;
  step2Instructions: string;
  step3Instructions: string;
}): string {
  const researchPlaceholder = section.needs_research
    ? '\n\n注意：此章节大纲标记为需要联网检索。请在文中需要补充最新政策、案例或官方表述处插入：\n[需补充联网检索：相关最新政策、案例或官方表述]'
    : '';

  return `你是一个专业的招投标文件撰写专家。

请根据以下材料撰写指定章节的完整正文。

【章节信息】
章节标题：${section.title}
章节层级：${section.level}
写作目的：${section.writing_purpose}
关键内容点：${section.key_points.join('、')}
源依据：${section.source_basis}

【适配后的新 Prompt】
${inputs.newPrompt}

【招标文件内容】
${inputs.tenderContent}

【Step 2 分段撰写规则】
${inputs.step2Instructions}

【Step 3 执行模式规则】
${inputs.step3Instructions}

【写作要求】
1. 严格遵循 new-prompt.md 的指导，充分展开每个关键内容点
2. 忠实于招标文件内容，不得编造
3. 遇信息缺失时使用 \`[需补充：XXX]\` 占位
4. 采用正式招投标文件写作风格，语言专业、表达准确
5. 本章节必须是完整的多段落正文，至少3-6个实质性段落
6. 每个段落应有明确的主题句和充分展开的论述
7. 内容要有深度和细节，不能只是简单概括或罗列要点
8. 段落之间要有清晰的逻辑衔接，形成完整的论述体系${researchPlaceholder}

请输出完整的章节正文内容（不要包含章节标题，直接开始正文）：`;
}

/**
 * Call LLM API to generate section content
 * STRICT NO-MOCK POLICY: This must call real API
 */
async function callLLMForSection(
  config: ModelConfig,
  section: OutlineSection,
  inputs: {
    newPrompt: string;
    tenderContent: string;
    step2Instructions: string;
    step3Instructions: string;
  }
): Promise<string> {
  logger.section('Generating Section Content');

  const apiKey = getEnvVar(config.api_key_env);
  if (!apiKey) {
    throw new Error(`API key not found: ${config.api_key_env}`);
  }

  const provider = getProvider(config.provider);
  const prompt = buildSectionPrompt(section, inputs);

  logger.info(`Calling ${config.provider} API with model ${config.model}...`);
  logger.info(`Section: ${section.title}`);
  logger.info(`Max tokens: ${config.max_tokens}`);

  // Call provider - this is the ONLY place API is called, no fallbacks
  const response = await provider.callAPI(
    config.base_url,
    apiKey,
    config.model,
    prompt,
    config
  );

  logger.success('Section generation completed');
  return response;
}

/**
 * Ensure output/sections directory exists
 */
function ensureSectionsDirectory(): void {
  const sectionsDir = 'output/sections';
  if (!fs.existsSync(sectionsDir)) {
    fs.mkdirSync(sectionsDir, { recursive: true });
    logger.info('Created output/sections directory');
  }
}

/**
 * Main Step 2 section runner
 */
export async function runStep2Section(): Promise<Step2SectionRunResult> {
  let selectedSection: OutlineSection | null = null;

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
    logger.section('Verifying Step 1 Completion');
    const step1State = await readJSONFile<{ new_prompt_generated: boolean }>('logs/workflow-state.json');
    if (!step1State || !step1State.new_prompt_generated) {
      throw new Error('Step 1 has not completed. Please run: npm run step1');
    }

    const newPrompt = await readTextFile('output/new-prompt.md');
    if (!newPrompt) {
      throw new Error('output/new-prompt.md not found. Please run: npm run step1');
    }
    logger.success('Step 1 completion verified ✓');

    // Step 3: Verify Step 2 outline generated
    logger.section('Verifying Step 2 Outline Generation');
    const step2State = await readJSONFile<{ outline_generated: boolean }>('logs/workflow-state.json');
    if (!step2State || !step2State.outline_generated) {
      throw new Error('Step 2 outline has not been generated. Please run: npm run step2:outline');
    }

    const outlineFile = await readTextFile('output/outline.md');
    if (!outlineFile) {
      throw new Error('output/outline.md not found. Please run: npm run step2:outline');
    }

    const outlineRunLog = await readJSONFile<{ success: boolean }>('logs/step2-outline-run.json');
    if (!outlineRunLog || !outlineRunLog.success) {
      throw new Error('logs/step2-outline-run.json not found or unsuccessful. Please run: npm run step2:outline');
    }
    logger.success('Step 2 outline generation verified ✓');

    // Step 4: Verify Step 2 outline confirmed
    await verifyStep2OutlineConfirmed();

    // Step 5: Load model configuration
    const config = await readJSONFile<ModelConfig>('config/model.json');
    if (!config) {
      throw new Error('Model configuration not found. Please run: npm run config');
    }

    // Step 6: Read all input files
    const inputs = await readSectionGenerationInputFiles();

    // Step 7: Select section to write
    selectedSection = await selectSectionToWrite(inputs.outline);

    // Step 8: Check for duplicate file
    const shouldSkip = await checkDuplicateFile(selectedSection.output_filename);

    if (shouldSkip) {
      logger.info('');
      logger.info('Section file not overwritten. Exiting without changes.');

      const result: Step2SectionRunResult = {
        success: true,
        checked_at: new Date().toISOString(),
        provider: config.provider,
        model: config.model,
        base_url: config.base_url,
        selected_section: {
          title: selectedSection.title,
          level: selectedSection.level,
          output_filename: selectedSection.output_filename
        },
        output_file: `output/sections/${selectedSection.output_filename}`,
        overwritten: false,
        mock_used: false
      };

      await writeJSONFile('logs/step2-section-run.json', result);
      return result;
    }

    // Step 9: Mark section as started
    const { markSectionStarted } = await import('./state-manager');
    await markSectionStarted(selectedSection.title);

    // Step 10: Generate section content
    const sectionContent = await callLLMForSection(config, selectedSection, {
      newPrompt: inputs.newPrompt,
      tenderContent: inputs.tenderContent,
      step2Instructions: inputs.step2Instructions,
      step3Instructions: inputs.step3Instructions
    });

    // Step 11: Save section file
    logger.section('Saving Section File');
    ensureSectionsDirectory();

    const outputPath = path.join('output/sections', selectedSection.output_filename);
    const cleaned = sanitizeSectionContent(sectionContent);
    await writeTextFile(outputPath, cleaned);
    logger.success(`Saved ${outputPath}`);

    // Step 12: Mark section as completed
    const { markSectionCompleted } = await import('./state-manager');
    await markSectionCompleted(selectedSection.output_filename);

    // Step 13: Create run log
    const result: Step2SectionRunResult = {
      success: true,
      checked_at: new Date().toISOString(),
      provider: config.provider,
      model: config.model,
      base_url: config.base_url,
      selected_section: {
        title: selectedSection.title,
        level: selectedSection.level,
        output_filename: selectedSection.output_filename
      },
      output_file: outputPath,
      overwritten: true,
      mock_used: false
    };

    await writeJSONFile('logs/step2-section-run.json', result);
    logger.success('Saved logs/step2-section-run.json');

    logger.section('Section Writing Completed');
    logger.info('');
    logger.success(`Section "${selectedSection.title}" generated successfully ✓`);
    logger.info('');
    logger.info('Output file:');
    logger.info(`  ${outputPath}`);
    logger.info('');
    logger.info('Workflow state updated:');
    logger.info('  • current_section: ""');
    logger.info(`  • completed_sections: +${selectedSection.output_filename}`);
    logger.info('');
    logger.info('Next steps:');
    logger.info('  • Review the generated section file');
    logger.info('  • Run: npm run step2:section (to write another section)');
    logger.info('  • Final combination: NOT implemented yet');

    return result;

  } catch (error) {
    logger.error('Step 2 section generation failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');

    // Reset current_section on failure
    if (selectedSection) {
      const state = await readJSONFile<{ current_section: string }>('logs/workflow-state.json');
      if (state) {
        state.current_section = "";
        await writeJSONFile('logs/workflow-state.json', state);
      }
    }

    const result: Step2SectionRunResult = {
      success: false,
      checked_at: new Date().toISOString(),
      provider: 'openai',
      model: '',
      base_url: '',
      selected_section: selectedSection ? {
        title: selectedSection.title,
        level: selectedSection.level,
        output_filename: selectedSection.output_filename
      } : { title: '', level: 0, output_filename: '' },
      output_file: '',
      overwritten: false,
      mock_used: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };

    await writeJSONFile('logs/step2-section-run.json', result);
    throw error;
  }
}
