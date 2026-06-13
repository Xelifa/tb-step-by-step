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
