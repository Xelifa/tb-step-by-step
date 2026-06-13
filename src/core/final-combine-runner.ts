import inquirer from 'inquirer';
import { logger } from '../utils/logger';
import { readJSONFile, readTextFile, writeJSONFile, writeTextFile } from '../utils/file';
import { loadEnvFile } from '../utils/env';
import { isModelGatePassed } from './state-manager';
import { FinalCombineRunResult } from '../types/final-combine';
import { Outline } from '../types/step2';
import fs from 'fs';
import path from 'path';

/**
 * Read required files for final combination
 */
async function readCombineInputFiles(): Promise<{
  workflowState: {
    completed_sections: string[];
    current_section: string;
  };
  outline: Outline;
}> {
  // Read workflow state
  const workflowState = await readJSONFile<{
    completed_sections: string[];
    current_section: string;
  }>('logs/workflow-state.json');

  if (!workflowState) {
    throw new Error('logs/workflow-state.json not found');
  }

  // Read outline from step2-outline-run.json
  const outlineRunLog = await readJSONFile<{
    success: boolean;
    outline: Outline;
  }>('logs/step2-outline-run.json');

  if (!outlineRunLog || !outlineRunLog.success) {
    throw new Error('logs/step2-outline-run.json not found or unsuccessful');
  }

  if (!outlineRunLog.outline) {
    throw new Error('logs/step2-outline-run.json missing outline structure');
  }

  return {
    workflowState,
    outline: outlineRunLog.outline
  };
}

/**
 * Get list of generated section files
 */
function getGeneratedSectionFiles(): string[] {
  const sectionsDir = 'output/sections';

  if (!fs.existsSync(sectionsDir)) {
    return [];
  }

  const files = fs.readdirSync(sectionsDir)
    .filter(f => f.endsWith('.md') && f !== '.gitkeep');

  return files;
}

/**
 * Read section file content
 */
function readSectionFile(filename: string): string {
  const filePath = path.join('output/sections', filename);

  if (!fs.existsSync(filePath)) {
    return '';
  }

  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Check section completion status
 */
function checkSectionCompletion(
  outline: Outline,
  generatedFiles: string[]
): {
  missingSections: string[];
  missingFilenames: string[];
  allComplete: boolean;
} {
  const missingSections: string[] = [];
  const missingFilenames: string[] = [];

  for (const section of outline.sections) {
    const filename = section.output_filename;
    if (!generatedFiles.includes(filename)) {
      missingSections.push(section.title);
      missingFilenames.push(filename);
    }
  }

  return {
    missingSections,
    missingFilenames,
    allComplete: missingSections.length === 0
  };
}

/**
 * Prompt user for partial combination confirmation
 */
async function promptPartialCombine(missingSections: string[]): Promise<boolean> {
  logger.warn('');
  logger.warn('Missing sections detected:');
  for (const section of missingSections) {
    logger.warn(`  • ${section}`);
  }
  logger.warn('');

  const { proceed } = await inquirer.prompt<{ proceed: boolean }>([{
    type: 'confirm',
    name: 'proceed',
    message: 'Some sections are missing. Combine only completed sections?',
    default: false
  }]);

  return proceed;
}

/**
 * Generate table of contents from outline
 */
function generateTableOfContents(outline: Outline): string {
  let toc = '## 目录\n\n';

  for (const section of outline.sections) {
    const indent = '  '.repeat(section.level - 1);
    const prefix = section.level === 1 ? '- ' : '  - ';
    toc += `${indent}${prefix}${section.title}\n`;
  }

  return toc;
}

/**
 * Combine sections into final document
 */
function combineSections(
  outline: Outline,
  generatedFiles: string[],
  partial: boolean
): string {
  let content = '';

  for (const section of outline.sections) {
    const filename = section.output_filename;
    const hasFile = generatedFiles.includes(filename);

    if (hasFile) {
      // Read and append section content
      const sectionContent = readSectionFile(filename);
      content += sectionContent + '\n\n';
    } else if (partial) {
      // Add placeholder for missing section
      content += `## ${section.title}\n\n`;
      content += `[未生成：该章节尚未通过 npm run step2:section 生成]\n\n`;
    }
  }

  return content;
}

/**
 * Generate final combined document
 */
function generateFinalDocument(
  outline: Outline,
  generatedFiles: string[],
  combinedCount: number,
  totalCount: number,
  partial: boolean
): string {
  const timestamp = new Date().toISOString();

  let document = '';

  // Document title
  document += `# ${outline.document_title}\n\n`;

  // Generation metadata
  document += `**生成时间:** ${timestamp}\n\n`;
  document += `**组合状态:** ${partial ? '部分组合' : '完整组合'} (${combinedCount}/${totalCount} 章节)\n\n`;

  // Table of contents
  document += generateTableOfContents(outline) + '\n\n';

  // Divider
  document += '---\n\n';

  // Combined sections
  document += combineSections(outline, generatedFiles, partial);

  return document;
}

/**
 * Main final combine runner
 */
export async function runFinalCombine(): Promise<FinalCombineRunResult> {
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
    logger.success('Step 1 completion verified ✓');

    // Step 3: Verify Step 2 outline generated
    logger.section('Verifying Step 2 Outline Generation');
    const step2State = await readJSONFile<{ outline_generated: boolean }>('logs/workflow-state.json');
    if (!step2State || !step2State.outline_generated) {
      throw new Error('Step 2 outline has not been generated. Please run: npm run step2:outline');
    }
    logger.success('Step 2 outline generation verified ✓');

    // Step 4: Verify Step 2 outline confirmed
    logger.section('Verifying Step 2 Outline Confirmation');
    const confirmState = await readJSONFile<{ outline_confirmed: boolean }>('logs/workflow-state.json');
    if (!confirmState || !confirmState.outline_confirmed) {
      throw new Error('Step 2 outline has not been confirmed. Please run: npm run step2:confirm');
    }
    logger.success('Step 2 outline confirmation verified ✓');

    // Step 5: Read input files
    logger.section('Reading Input Files');
    const { workflowState, outline } = await readCombineInputFiles();
    logger.success('Input files loaded ✓');

    // Step 6: Get generated section files
    logger.section('Checking Generated Sections');
    const generatedFiles = getGeneratedSectionFiles();
    logger.info(`Found ${generatedFiles.length} generated section files`);

    // Step 7: Check section completion
    const { missingSections, missingFilenames, allComplete } = checkSectionCompletion(outline, generatedFiles);

    const totalSections = outline.sections.length;
    const combinedCount = totalSections - missingSections.length;
    const missingCount = missingSections.length;

    let partial = false;

    // Step 8: Handle missing sections
    if (!allComplete) {
      const proceed = await promptPartialCombine(missingSections);

      if (!proceed) {
        // User chose not to continue
        logger.info('');
        logger.info('Final combination cancelled.');
        logger.info('Please generate missing sections first: npm run step2:section');

        const result: FinalCombineRunResult = {
          success: true,
          checked_at: new Date().toISOString(),
          total_sections: totalSections,
          combined_count: 0,
          missing_count: missingCount,
          missing_sections: missingSections,
          partial: false,
          output_file: '',
          mock_used: false
        };

        await writeJSONFile('logs/final-combine-run.json', result);
        logger.success('Saved logs/final-combine-run.json');

        return result;
      }

      partial = true;
    }

    // Step 9: Generate final document
    logger.section('Generating Final Document');
    const finalDocument = generateFinalDocument(outline, generatedFiles, combinedCount, totalSections, partial);

    // Step 10: Save final document
    await writeTextFile('output/final-combined.md', finalDocument);
    logger.success('Saved output/final-combined.md');

    // Step 11: Create run log
    const result: FinalCombineRunResult = {
      success: true,
      checked_at: new Date().toISOString(),
      total_sections: totalSections,
      combined_count: combinedCount,
      missing_count: missingCount,
      missing_sections: missingSections,
      partial,
      output_file: 'output/final-combined.md',
      mock_used: false
    };

    await writeJSONFile('logs/final-combine-run.json', result);
    logger.success('Saved logs/final-combine-run.json');

    // Step 12: Update workflow state
    const { markFinalCombined } = await import('./state-manager');
    await markFinalCombined();

    logger.section('Final Combination Completed');
    logger.info('');
    logger.success(`Final document generated successfully ✓`);
    logger.info(`  Total sections: ${totalSections}`);
    logger.info(`  Combined: ${combinedCount}`);
    if (partial) {
      logger.warn(`  Missing: ${missingCount} (placeholders added)`);
    }
    logger.info('');
    logger.info(`Output: output/final-combined.md`);

    return result;

  } catch (error) {
    logger.error('Final combination failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');

    const result: FinalCombineRunResult = {
      success: false,
      checked_at: new Date().toISOString(),
      total_sections: 0,
      combined_count: 0,
      missing_count: 0,
      missing_sections: [],
      partial: false,
      output_file: '',
      mock_used: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };

    await writeJSONFile('logs/final-combine-run.json', result);
    throw error;
  }
}
