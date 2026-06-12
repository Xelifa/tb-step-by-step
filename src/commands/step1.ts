import { logger } from '../utils/logger';
import { runStep1 } from '../core/step1-runner';

async function step1Command() {
  try {
    logger.section('Step 1: Old Prompt Adaptation Workflow');

    await runStep1();

  } catch (error) {
    logger.error('Step 1 command failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

step1Command();