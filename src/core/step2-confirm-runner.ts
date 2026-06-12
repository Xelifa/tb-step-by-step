import inquirer from 'inquirer';
import { logger } from '../utils/logger';
import { readJSONFile, readTextFile, writeJSONFile } from '../utils/file';
import { loadEnvFile } from '../utils/env';
import { isModelGatePassed } from './state-manager';
import { Step2ConfirmRunResult } from '../types/step2-confirm';

/**
 * Verify Step 2 outline has been generated
 */
async function verifyStep2OutlineGenerated(): Promise<void> {
  logger.section('Verifying Step 2 Outline Generation');

  const state = await readJSONFile<{
    outline_generated: boolean;
  }>('logs/workflow-state.json');

  if (!state || !state.outline_generated) {
    throw new Error('Step 2 outline has not been generated. Please run: npm run step2:outline');
  }

  // Verify output/outline.md exists
  const outline = await readTextFile('output/outline.md');
  if (!outline) {
    throw new Error('output/outline.md not found. Please run: npm run step2:outline');
  }

  // Verify logs/step2-outline-run.json exists and has success: true
  const runLog = await readJSONFile<{ success: boolean }>('logs/step2-outline-run.json');
  if (!runLog || !runLog.success) {
    throw new Error('logs/step2-outline-run.json not found or unsuccessful. Please run: npm run step2:outline');
  }

  logger.success('Step 2 outline generation verified ✓');
}

/**
 * Main Step 2 confirm runner
 */
export async function runStep2Confirm(): Promise<Step2ConfirmRunResult> {
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
    await verifyStep2OutlineGenerated();

    // Step 4: Display outline information
    logger.section('Outline Confirmation');
    logger.info('');
    logger.info('Outline file: output/outline.md');
    logger.info('');
    logger.warn('Please ensure you have reviewed and approved the outline.');
    logger.warn('Future section writing will follow this outline structure.');
    logger.info('');

    // Step 5: Ask user for explicit confirmation
    const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([{
      type: 'confirm',
      name: 'confirmed',
      message: 'Have you reviewed and approved output/outline.md?',
      default: false
    }]);

    const checked_at = new Date().toISOString();

    if (confirmed) {
      // Step 6: User confirmed - update workflow state
      const { markStep2OutlineConfirmed } = await import('./state-manager');
      await markStep2OutlineConfirmed();

      // Step 7: Save success log
      const runResult: Step2ConfirmRunResult = {
        success: true,
        confirmed: true,
        checked_at,
        outline_file: 'output/outline.md',
        mock_used: false
      };

      await writeJSONFile('logs/step2-confirm-run.json', runResult);
      logger.success('Saved logs/step2-confirm-run.json');

      logger.section('Outline Confirmed');
      logger.info('');
      logger.success('Outline confirmed successfully ✓');
      logger.info('');
      logger.info('Next steps:');
      logger.info('  • Step 2 section writing: NOT implemented yet');
      logger.info('  • Next development stage will be section writing');

      return runResult;
    } else {
      // Step 8: User rejected - save rejection log
      const runResult: Step2ConfirmRunResult = {
        success: true,
        confirmed: false,
        checked_at,
        outline_file: 'output/outline.md',
        mock_used: false
      };

      await writeJSONFile('logs/step2-confirm-run.json', runResult);
      logger.success('Saved logs/step2-confirm-run.json');

      logger.info('');
      logger.warn('Outline confirmation rejected.');
      logger.info('You can revise or regenerate the outline later:');
      logger.info('  • Revise: Manually edit output/outline.md');
      logger.info('  • Regenerate: npm run step2:outline');
      logger.info('  • Re-confirm: npm run step2:confirm');

      return runResult;
    }

  } catch (error) {
    logger.error('Step 2 confirmation failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');

    const runResult: Step2ConfirmRunResult = {
      success: false,
      confirmed: false,
      checked_at: new Date().toISOString(),
      outline_file: 'output/outline.md',
      mock_used: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };

    await writeJSONFile('logs/step2-confirm-run.json', runResult);
    throw error;
  }
}
