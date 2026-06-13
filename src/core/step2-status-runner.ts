import { logger } from '../utils/logger';
import { readJSONFile, readTextFile, writeJSONFile } from '../utils/file';
import { loadEnvFile } from '../utils/env';
import { isModelGatePassed } from './state-manager';
import { Step2StatusRunResult, SectionStatus } from '../types/step2-status';
import { Outline } from '../types/step2';
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

  logger.success('Step 2 outline confirmation verified ✓');
}

/**
 * Read required files for status check
 */
async function readStatusCheckFiles(): Promise<{
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
