import inquirer from 'inquirer';
import { logger } from '../utils/logger';
import { readJSONFile, readTextFile, writeJSONFile, writeTextFile } from '../utils/file';
import { loadEnvFile, getEnvVar } from '../utils/env';
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
