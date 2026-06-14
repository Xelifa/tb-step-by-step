import { logger } from '../utils/logger';
import { readJSONFile, readTextFile, writeJSONFile, writeTextFile } from '../utils/file';
import { loadEnvFile, getEnvVar } from '../utils/env';
import { ModelConfig } from '../types/config';
import { Outline, OutlineSection } from '../types/step2';
import { getProvider } from './provider';
import { isModelGatePassed, markSectionStarted, markSectionCompleted } from './state-manager';
import { Step2SectionRunResult } from '../types/step2-section';
import fs from 'fs';
import path from 'path';

/**
 * Get available sections (not yet completed)
 */
export async function getAvailableSections(): Promise<OutlineSection[]> {
  // Read outline
  const outlineRunLog = await readJSONFile<{ success: boolean; outline: Outline }>('logs/step2-outline-run.json');
  if (!outlineRunLog || !outlineRunLog.success || !outlineRunLog.outline) {
    throw new Error('Outline not found. Please generate outline first.');
  }

  // Read completed sections
  const state = await readJSONFile<{ completed_sections: string[] }>('logs/workflow-state.json');
  const completedFilenames = state?.completed_sections || [];

  // Filter available
  const available = outlineRunLog.outline.sections.filter(section => {
    return !completedFilenames.includes(section.output_filename);
  });

  return available;
}

/**
 * Generate a specific section by filename
 */
export async function generateSectionByFilename(sectionFilename: string): Promise<Step2SectionRunResult> {
  let selectedSection: OutlineSection | null = null;

  try {
    // Load environment
    await loadEnvFile();

    // Verify model gate
    logger.section('Verifying Model Gate');
    const gatePassed = await isModelGatePassed();
    if (!gatePassed) {
      throw new Error('Model gate has not passed. Please run: npm run config');
    }
    logger.success('Model gate verified ✓');

    // Verify Step 1
    logger.section('Verifying Step 1');
    const step1State = await readJSONFile<{ new_prompt_generated: boolean }>('logs/workflow-state.json');
    if (!step1State || !step1State.new_prompt_generated) {
      throw new Error('Step 1 not completed. Please run: npm run step1');
    }
    const newPrompt = await readTextFile('output/new-prompt.md');
    if (!newPrompt) {
      throw new Error('output/new-prompt.md not found');
    }
    logger.success('Step 1 verified ✓');

    // Verify outline confirmed
    logger.section('Verifying Outline Confirmation');
    const state = await readJSONFile<{ step2_confirmed: boolean; outline_confirmed: boolean }>('logs/workflow-state.json');
    if (!state || !state.step2_confirmed || !state.outline_confirmed) {
      throw new Error('Outline not confirmed. Please run: npm run step2:confirm');
    }
    const confirmLog = await readJSONFile<{ confirmed: boolean }>('logs/step2-confirm-run.json');
    if (!confirmLog || !confirmLog.confirmed) {
      throw new Error('logs/step2-confirm-run.json not found or not confirmed');
    }
    logger.success('Outline confirmation verified ✓');

    // Load model config
    const config = await readJSONFile<ModelConfig>('config/model.json');
    if (!config) {
      throw new Error('Model configuration not found. Please run: npm run config');
    }

    // Read outline
    const outlineRunLog = await readJSONFile<{ success: boolean; outline: Outline }>('logs/step2-outline-run.json');
    if (!outlineRunLog || !outlineRunLog.success || !outlineRunLog.outline) {
      throw new Error('Outline not found');
    }

    // Find section by filename
    const found = outlineRunLog.outline.sections.find(s => s.output_filename === sectionFilename);
    if (!found) {
      throw new Error(`Section not found: ${sectionFilename}`);
    }
    selectedSection = found;

    // Read instructions
    const step2Instructions = await readTextFile('sources/step2.md');
    if (!step2Instructions) throw new Error('sources/step2.md not found');

    const step3Instructions = await readTextFile('sources/step3.md');
    if (!step3Instructions) throw new Error('sources/step3.md not found');

    // Read tender
    const inputDir = 'input';
    if (!fs.existsSync(inputDir)) {
      throw new Error('input/ directory does not exist');
    }

    const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.docx') && f !== '.gitkeep');
    if (files.length === 0) {
      throw new Error('No .docx tender file found in input/');
    }

    const tenderFile = files[0];
    const tenderPath = path.join(inputDir, tenderFile);
    const { extractDocxText } = await import('../utils/docx');
    const tenderContent = await extractDocxText(tenderPath);
    logger.success(`Loaded tender: ${tenderFile}`);

    // Check if already completed
    const workflowState = await readJSONFile<{ completed_sections: string[] }>('logs/workflow-state.json');
    if (workflowState?.completed_sections?.includes(sectionFilename)) {
      logger.warn(`Section already completed: ${sectionFilename}`);
      // Still allow overwrite in web UI
    }

    // Mark section started
    await markSectionStarted(selectedSection.title);

    // Build prompt
    const researchPlaceholder = selectedSection.needs_research
      ? '\n\n注意：此章节大纲标记为需要联网检索。请在文中需要补充最新政策、案例或官方表述处插入：\n[需补充联网检索：相关最新政策、案例或官方表述]'
      : '';

    const prompt = `你是一个专业的招投标文件撰写专家。

请根据以下材料撰写指定章节的完整正文。

【章节信息】
章节标题：${selectedSection.title}
章节层级：${selectedSection.level}
写作目的：${selectedSection.writing_purpose}
关键内容点：${selectedSection.key_points.join('、')}
源依据：${selectedSection.source_basis}

【适配后的新 Prompt】
${newPrompt}

【招标文件内容】
${tenderContent}

【Step 2 分段撰写规则】
${step2Instructions}

【Step 3 执行模式规则】
${step3Instructions}

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

    // Call LLM
    logger.section('Generating Section Content');
    const apiKey = getEnvVar(config.api_key_env);
    if (!apiKey) {
      throw new Error(`API key not found: ${config.api_key_env}`);
    }

    const provider = getProvider(config.provider);
    logger.info(`Calling ${config.provider} API with model ${config.model}...`);
    logger.info(`Section: ${selectedSection.title}`);
    logger.info(`Max tokens: ${config.max_tokens}`);

    const sectionContent = await provider.callAPI(
      config.base_url,
      apiKey,
      config.model,
      prompt,
      config
    );

    logger.success('Section generation completed');

    // Save section file
    logger.section('Saving Section File');
    const sectionsDir = 'output/sections';
    if (!fs.existsSync(sectionsDir)) {
      fs.mkdirSync(sectionsDir, { recursive: true });
    }

    const outputPath = path.join(sectionsDir, sectionFilename);
    await writeTextFile(outputPath, sectionContent);
    logger.success(`Saved ${outputPath}`);

    // Mark section completed
    await markSectionCompleted(sectionFilename);

    // Create result
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

    return result;

  } catch (error) {
    logger.error('Section generation failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');

    // Reset current_section on failure
    if (selectedSection) {
      const state = await readJSONFile<{ current_section: string }>('logs/workflow-state.json');
      if (state) {
        state.current_section = "";
        await writeJSONFile('logs/workflow-state.json', state);
      }
    }

    const config = await readJSONFile<ModelConfig>('config/model.json');

    const result: Step2SectionRunResult = {
      success: false,
      checked_at: new Date().toISOString(),
      provider: config?.provider || 'openai',
      model: config?.model || '',
      base_url: config?.base_url || '',
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
