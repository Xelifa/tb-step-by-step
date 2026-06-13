import { logger } from '../utils/logger';
import { readJSONFile } from '../utils/file';
import fs from 'fs';

async function workflowCommand() {
  try {
    logger.section('TB Step by Step Workflow');
    logger.info('');

    // Read workflow state
    const workflowState = await readJSONFile<{
      model_test_passed: boolean;
      new_prompt_generated: boolean;
      outline_generated: boolean;
      outline_confirmed: boolean;
      completed_sections: string[];
      final_combined: boolean;
    }>('logs/workflow-state.json');

    // Read outline to get total sections
    const outlineLog = await readJSONFile<{
      outline?: { sections: any[] };
    }>('logs/step2-outline-run.json');

    const totalSections = outlineLog?.outline?.sections?.length || 0;
    const completedCount = workflowState?.completed_sections?.length || 0;

    // Display status
    const modelGate = workflowState?.model_test_passed ? 'passed' : 'pending';
    const step1 = workflowState?.new_prompt_generated ? 'completed' : 'pending';
    const outline = workflowState?.outline_generated ? 'completed' : 'pending';
    const confirm = workflowState?.outline_confirmed ? 'completed' : 'pending';
    const final = workflowState?.final_combined ? 'completed' : 'pending';

    logger.info(`Model Gate: ${modelGate}`);
    logger.info(`Step 1 new-prompt: ${step1}`);
    logger.info(`Step 2 outline: ${outline}`);
    logger.info(`Step 2 confirm: ${confirm}`);
    logger.info(`Sections: completed ${completedCount} / total ${totalSections}`);
    logger.info(`Final combine: ${final}`);
    logger.info('');

    // Determine next command
    let nextCommand = '';

    if (!workflowState?.model_test_passed) {
      nextCommand = 'npm run config';
    } else if (!workflowState?.new_prompt_generated) {
      nextCommand = 'npm run step1';
    } else if (!workflowState?.outline_generated) {
      nextCommand = 'npm run step2:outline';
    } else if (!workflowState?.outline_confirmed) {
      nextCommand = 'npm run step2:confirm';
    } else if (completedCount < totalSections) {
      nextCommand = 'npm run step2:section';
    } else if (!workflowState?.final_combined) {
      nextCommand = 'npm run final:combine';
    } else {
      nextCommand = 'workflow_complete';
    }

    logger.info('Next command:');
    if (nextCommand === 'workflow_complete') {
      logger.success('Workflow complete.');
      logger.success('Final output: output/final-combined.md');
    } else {
      logger.info(`  ${nextCommand}`);
    }
    logger.info('');

  } catch (error) {
    logger.error('Workflow inspection failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

workflowCommand();