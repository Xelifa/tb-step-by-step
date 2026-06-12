import { logger } from '../utils/logger';
import { runStep2Outline } from '../core/step2-outline-runner';

async function step2OutlineCommand() {
  try {
    logger.section('Step 2: Outline Generation');

    await runStep2Outline();

  } catch (error) {
    logger.error('Step 2 outline generation failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

step2OutlineCommand();
