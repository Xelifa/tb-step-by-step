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
